// Genji Image Translator - Background Service Worker
// ===================================================
// Open-source AI image translator.
// NO Firebase, NO authentication, NO credits, NO server.
// Direct BYOK (Bring Your Own Key) API calls to AI providers.
//
// Supported providers: Google (Gemini), OpenAI (GPT), Anthropic (Claude),
//   OpenRouter (all providers), DeepSeek, xAI (Grok), local LLM (OpenAI-compatible).
//
// built by dropxtor
// MIT License

import { TranslationCache } from "./translationCache.js"

const translationCache = new TranslationCache();

const downloadFilenames = new Map();
const chunkStore = new Map();

// ─── Provider configuration ──────────────────────────────────────────────────
// Maps model name -> { provider, apiModel, endpoint }
const MODEL_CONFIG = {
    "gemini-3.1-flash-lite": { provider: "google",   apiModel: "gemini-3.1-flash-lite" },
    "gemini-3-flash":        { provider: "google",   apiModel: "gemini-3-flash" },
    "gemini-3.5-flash":      { provider: "google",   apiModel: "gemini-3.5-flash" },
    "gpt-5.4":               { provider: "openai",   apiModel: "gpt-5.4" },
    "claude-sonnet-4.6":     { provider: "anthropic", apiModel: "claude-sonnet-4-6" },
    "kimi-k2.5":             { provider: "openrouter", apiModel: "moonshotai/kimi-k2.5" },
    "deepseek":              { provider: "deepseek", apiModel: "deepseek-chat" },
    "grok-4.20":             { provider: "xai",      apiModel: "grok-4-20" },
};

const PROVIDER_ENDPOINTS = {
    google:    "https://generativelanguage.googleapis.com/v1beta",
    openai:    "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    openrouter:"https://openrouter.ai/api/v1",
    deepseek:  "https://api.deepseek.com/v1",
    xai:       "https://api.x.ai/v1",
};

// ─── DeclarativeNetRequest for referer handling (anti-hotlink bypass) ────────
if (browser.declarativeNetRequest) {
    browser.declarativeNetRequest.getSessionRules().then(rules => {
        const ids = rules.map(r => r.id);
        if (ids.length > 0) {
            browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
        }
    }).catch(err => console.error("[Genji] Error clearing session rules", err));
}

async function getUniqueRuleId() {
    let rules = [];
    try {
        rules = await browser.declarativeNetRequest.getSessionRules();
    } catch (e) {
        console.error("[Genji] Failed to get session rules", e);
    }
    const occupiedIds = new Set(rules.map(r => r.id));
    let ruleId;
    do {
        ruleId = Math.floor(Math.random() * 2000000000) + 1;
    } while (occupiedIds.has(ruleId));
    return ruleId;
}

async function fetchWithReferer(url, referer) {
    let cleanReferer = referer;
    if (cleanReferer) {
        try {
            const refUrl = new URL(cleanReferer);
            cleanReferer = refUrl.origin;
        } catch (e) {
            cleanReferer = cleanReferer.split(/[?#]/)[0];
        }
    }

    if (!browser.declarativeNetRequest) {
        return await fetch(url, {
            referrer: cleanReferer,
            referrerPolicy: "no-referrer-when-downgrade",
            headers: { "Referer": cleanReferer }
        });
    }

    let ruleId = null;
    let response = null;
    let fetchError = null;

    try {
        ruleId = await getUniqueRuleId();
        let urlFilterHost;
        try {
            urlFilterHost = new URL(url).hostname;
        } catch (e) {
            urlFilterHost = url.split('?')[0];
        }

        const rule = {
            id: ruleId,
            priority: 1,
            action: {
                type: "modifyHeaders",
                requestHeaders: [{ header: "referer", operation: "set", value: cleanReferer }]
            },
            condition: { urlFilter: urlFilterHost, resourceTypes: ["xmlhttprequest"] }
        };

        await browser.declarativeNetRequest.updateSessionRules({ addRules: [rule] });
        response = await fetch(url);
    } catch (error) {
        fetchError = error;
    } finally {
        if (ruleId !== null) {
            try {
                await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
            } catch (e) {
                console.warn("[Genji] DNR cleanup failed", e);
            }
        }
    }

    if (!fetchError && response && response.ok) {
        return response;
    }

    // Fallback fetch without referer modification
    try {
        return await fetch(url, {
            referrer: cleanReferer,
            referrerPolicy: "no-referrer-when-downgrade",
            headers: { "Referer": cleanReferer }
        });
    } catch (fallbackError) {
        console.warn("[Genji] Fallback fetch failed", fallbackError);
        return null;
    }
}

// ─── Download helpers ────────────────────────────────────────────────────────
const downloadListener = (item, suggest) => {
    if (item.byExtensionId === browser.runtime.id || downloadFilenames.has(item.url)) {
        const suggestedFilename = downloadFilenames.get(item.url);
        if (suggestedFilename) {
            suggest({ filename: suggestedFilename, conflictAction: 'uniquify' });
            downloadFilenames.delete(item.url);
        }
    }
};

function setupDownloadListener() {
    if (browser.downloads && browser.downloads.onDeterminingFilename) {
        if (!browser.downloads.onDeterminingFilename.hasListener(downloadListener)) {
            browser.downloads.onDeterminingFilename.addListener(downloadListener);
            console.log("[Genji] Download listener added");
        }
    }
}

setupDownloadListener();

if (browser.permissions && browser.permissions.onAdded) {
    browser.permissions.onAdded.addListener(async (permissions) => {
        if (permissions.permissions && permissions.permissions.includes('downloads')) {
            setupDownloadListener();
            await browser.storage.sync.set({ genji_auto_save: true });
        }
    });
}

// ─── Image compression (≤4MB for API limits) ────────────────────────────────
async function compressImage(blob, maxSizeMB = 4) {
    if (!blob || blob.size <= maxSizeMB * 1024 * 1024) return blob;

    try {
        const imageBitmap = await createImageBitmap(blob);
        let width = imageBitmap.width;
        let height = imageBitmap.height;
        const targetSize = maxSizeMB * 1024 * 1024;

        const MAX_PIXELS = 50 * 1000 * 1000;
        const currentPixels = width * height;
        if (currentPixels > MAX_PIXELS) {
            const scale = Math.sqrt(MAX_PIXELS / currentPixels);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }

        let quality = 0.85;
        let compressedBlob = null;
        let attempts = 0;

        while (attempts < 3) {
            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(imageBitmap, 0, 0, width, height);

            compressedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
            if (compressedBlob.size <= targetSize) break;

            if (attempts === 0) quality = 0.80;
            else if (attempts === 1) { quality = 0.75; width = Math.round(width * 0.9); height = Math.round(height * 0.9); }
            attempts++;
        }

        imageBitmap.close();
        return (compressedBlob && compressedBlob.size < blob.size) ? compressedBlob : blob;
    } catch (e) {
        console.warn("[Genji] Compression failed", e);
        return blob;
    }
}

function dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

async function blobToImage(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.replace("application/octet-stream", "image/jpeg"));
        reader.readAsDataURL(blob);
    });
}

// ─── BYOK: Get API keys from storage ─────────────────────────────────────────
async function getByokKeys() {
    return await browser.storage.sync.get({
        genji_byok_openrouter: "",
        genji_byok_google: "",
        genji_byok_openai: "",
        genji_byok_anthropic: "",
        genji_byok_deepseek: "",
        genji_byok_xai: "",
        genji_byok_local: "",
        genji_byok_local_url: "",
        genji_byok_local_model: ""
    });
}

async function getSettings() {
    return await browser.storage.sync.get({
        genji_target_lang: "en",
        genji_font: "wildwords",
        translation_model: "gemini-3.1-flash-lite",
        genji_min_font_size: 6,
        genji_stroke_enabled: true,
        genji_bubbles_only: false,
        genji_legacy_inpaint: false,
        genji_custom_prompt: "",
        genji_text_alignment: "auto",
        genji_auto_save: false,
        genji_auto_save_folder: "GenjiTranslations",
        genji_context_sharing: false,
        ...Object.fromEntries(
            ["openrouter", "google", "openai", "anthropic", "deepseek", "xai", "local", "local_url", "local_model"]
                .map(k => [`genji_byok_${k}`, ""])
        )
    });
}

// ─── AI Provider: Build translation prompt ────────────────────────────────────
function buildTranslationPrompt(settings) {
    const lang = settings.genji_target_lang || "en";
    const customPrompt = settings.genji_custom_prompt || "";

    let prompt = `You are an expert manga and image translator. Analyze the provided image and:
1. Detect ALL text in the image (speech bubbles, narration, sound effects, signs, etc.)
2. Translate all detected text to ${lang}
3. Return a JSON array where each element contains:
   - "original": the original text as detected
   - "translated": the translated text in ${lang}
   - "bbox": [x, y, width, height] — bounding box of the text region in pixels, relative to the image dimensions
   - "confidence": float 0-1
   - "is_vertical": boolean — whether the text is written vertically (e.g. Japanese manga)
   - "color": the dominant text color as a hex color string (e.g. "#000000")
   - "font_size": estimated font size in pixels

Return ONLY the JSON array, no markdown, no explanation. If no text is found, return [].`;

    if (customPrompt) {
        prompt += `\n\nAdditional instructions from user: ${customPrompt}`;
    }

    return prompt;
}

// ─── AI Provider: Call the right API for the selected model ───────────────────
async function callAIProvider(imageBase64, settings, byokKeys) {
    const model = settings.translation_model || "gemini-3.1-flash-lite";
    let config = MODEL_CONFIG[model];

    // Check if it's a local model
    const localUrl = (byokKeys.genji_byok_local_url || "").trim();
    const localModel = (byokKeys.genji_byok_local_model || "").trim();
    const isLocal = localUrl && localModel && model === localModel;

    if (isLocal) {
        config = { provider: "local", apiModel: localModel };
    }

    if (!config) {
        throw new Error(`Unknown model: ${model}`);
    }

    const prompt = buildTranslationPrompt(settings);

    // Route to provider-specific handler
    switch (config.provider) {
        case "google":
            return await callGoogle(imageBase64, prompt, config.apiModel, byokKeys.genji_byok_google);
        case "openai":
            return await callOpenAI(imageBase64, prompt, config.apiModel, byokKeys.genji_byok_openai);
        case "anthropic":
            return await callAnthropic(imageBase64, prompt, config.apiModel, byokKeys.genji_byok_anthropic);
        case "openrouter":
            return await callOpenRouter(imageBase64, prompt, config.apiModel, byokKeys.genji_byok_openrouter);
        case "deepseek":
            return await callOpenAICompatible(imageBase64, prompt, config.apiModel, byokKeys.genji_byok_deepseek, PROVIDER_ENDPOINTS.deepseek);
        case "xai":
            return await callOpenAICompatible(imageBase64, prompt, config.apiModel, byokKeys.genji_byok_xai, PROVIDER_ENDPOINTS.xai);
        case "local":
            return await callOpenAICompatible(imageBase64, prompt, config.apiModel, byokKeys.genji_byok_local, localUrl);
        default:
            throw new Error(`Unsupported provider: ${config.provider}`);
    }
}

// Google Gemini API
async function callGoogle(imageBase64, prompt, model, apiKey) {
    if (!apiKey) throw new Error("No Google (Gemini) API key configured. Add your key in the Genji popup → BYOK.");
    const base = PROVIDER_ENDPOINTS.google;
    const url = `${base}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const mimeMatch = imageBase64.match(/^data:(image\/\w+);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const rawBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;

    const body = {
        contents: [{
            parts: [
                { text: prompt },
                { inline_data: { mime_type: mime, data: rawBase64 } }
            ]
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(100000)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Google API error (${response.status}): ${errText.substring(0, 300)}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";

    return parseAIResponse(text);
}

// OpenAI API (GPT-4o, GPT-5, etc.)
async function callOpenAI(imageBase64, prompt, model, apiKey) {
    if (!apiKey) throw new Error("No OpenAI API key configured. Add your key in the Genji popup → BYOK.");
    const url = `${PROVIDER_ENDPOINTS.openai}/chat/completions`;
    const rawBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;

    const body = {
        model: model,
        messages: [{
            role: "user",
            content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:image/png;base64,${rawBase64}` } }
            ]
        }],
        max_tokens: 8192,
        temperature: 0.2
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(100000)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errText.substring(0, 300)}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";

    return parseAIResponse(text);
}

// Anthropic Claude API
async function callAnthropic(imageBase64, prompt, model, apiKey) {
    if (!apiKey) throw new Error("No Anthropic (Claude) API key configured. Add your key in the Genji popup → BYOK.");
    const url = `${PROVIDER_ENDPOINTS.anthropic}/messages`;
    const rawBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;

    const body = {
        model: model,
        max_tokens: 8192,
        messages: [{
            role: "user",
            content: [
                { type: "image", source: { type: "base64", media_type: "image/png", data: rawBase64 } },
                { type: "text", text: prompt }
            ]
        }]
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(100000)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errText.substring(0, 300)}`);
    }

    const data = await response.json();
    const text = data?.content?.map(c => c.text || "").join("") || "";

    return parseAIResponse(text);
}

// OpenRouter API (Kimi, and 100+ other models)
async function callOpenRouter(imageBase64, prompt, model, apiKey) {
    if (!apiKey) throw new Error("No OpenRouter API key configured. Add your key in the Genji popup → BYOK.");
    const url = `${PROVIDER_ENDPOINTS.openrouter}/chat/completions`;
    const rawBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;

    const body = {
        model: model,
        messages: [{
            role: "user",
            content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:image/png;base64,${rawBase64}` } }
            ]
        }],
        max_tokens: 8192,
        temperature: 0.2
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://github.com/dropxtor/genji",
            "X-Title": "Genji Image Translator"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(100000)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errText.substring(0, 300)}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";

    return parseAIResponse(text);
}

// Generic OpenAI-compatible API (DeepSeek, xAI, local LLM)
async function callOpenAICompatible(imageBase64, prompt, model, apiKey, baseUrl) {
    if (!apiKey && !baseUrl) throw new Error("No local LLM configured. Set your Base URL and Model in the Genji popup → BYOK.");
    const url = `${baseUrl}/chat/completions`;
    const rawBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;

    const body = {
        model: model,
        messages: [{
            role: "user",
            content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:image/png;base64,${rawBase64}` } }
            ]
        }],
        max_tokens: 8192,
        temperature: 0.2
    };

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(100000)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error (${response.status}): ${errText.substring(0, 300)}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "";

    return parseAIResponse(text);
}

// Parse AI response – extract JSON array of text objects
function parseAIResponse(text) {
    if (!text) return [];

    // Strip markdown code fences if present
    text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    // Try to find JSON array in the response
    const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
        try {
            const parsed = JSON.parse(jsonArrayMatch[0]);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            console.warn("[Genji] Failed to parse JSON array", e);
        }
    }

    // Try parsing the whole text
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (parsed.textObjects && Array.isArray(parsed.textObjects)) return parsed.textObjects;
    } catch (e) {
        console.warn("[Genji] Failed to parse AI response as JSON", e);
    }

    console.warn("[Genji] Could not parse AI response, returning empty array");
    return [];
}

// ─── Canvas-based inpainting (remove original text) ─────────────────────────
// Since Genji has no server-side inpainting, we do client-side canvas inpainting:
// Fill text regions with the surrounding average color.
async function inpaintCanvas(imageBase64, textObjects) {
    if (!textObjects || textObjects.length === 0) return imageBase64;

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            for (const textObj of textObjects) {
                if (!textObj.bbox || textObj.bbox.length < 4) continue;

                const [x, y, w, h] = textObj.bbox;
                // Sample surrounding pixels for average color
                const padding = Math.max(w, h) * 0.3;
                const sampleX = Math.max(0, Math.floor(x - padding));
                const sampleY = Math.max(0, Math.floor(y - padding));
                const sampleW = Math.min(canvas.width - sampleX, Math.ceil(w + padding * 2));
                const sampleH = Math.min(canvas.height - sampleY, Math.ceil(h + padding * 2));

                try {
                    const sampleData = ctx.getImageData(
                        Math.max(0, sampleX),
                        Math.max(0, sampleY - padding - h),
                        Math.min(canvas.width, sampleW),
                        Math.max(1, Math.floor(h * 0.3))
                    );
                    const pixels = sampleData.data;
                    let r = 0, g = 0, b = 0, count = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; count++;
                    }
                    if (count > 0) {
                        r = Math.round(r / count);
                        g = Math.round(g / count);
                        b = Math.round(b / count);
                    }

                    // Fill the text region with average color
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
                } catch (e) {
                    // If getImageData fails (CORS), fill with white
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
                }
            }

            resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = () => resolve(imageBase64);
        img.src = imageBase64;
    });
}

// ─── Render translated text onto the inpainted image ─────────────────────────
async function renderTranslatedImage(inpaintedBase64, textObjects, settings, imageWidth, imageHeight) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const font = mapFontName(settings.genji_font || "wildwords");
            const minFontSize = parseInt(settings.genji_min_font_size) || 6;
            const strokeEnabled = settings.genji_stroke_enabled !== false;
            const textAlign = settings.genji_text_alignment || "auto";

            for (const textObj of textObjects) {
                if (!textObj.translated || !textObj.bbox || textObj.bbox.length < 4) continue;

                const [x, y, w, h] = textObj.bbox;
                const color = textObj.color || "#000000";
                const isVertical = textObj.is_vertical || false;

                // Auto-fit font size to bounding box
                let fontSize = Math.max(minFontSize, Math.min(h * 0.85, w * 0.8));
                ctx.font = `${fontSize}px ${font}`;
                ctx.textBaseline = "top";
                ctx.fillStyle = color;

                if (strokeEnabled) {
                    ctx.strokeStyle = getContrastColor(color);
                    ctx.lineWidth = Math.max(1, fontSize * 0.12);
                    ctx.lineJoin = "round";
                    ctx.miterLimit = 2;
                }

                const align = textAlign === "auto" ? (isVertical ? "right" : "center") : textAlign;
                ctx.textAlign = align;

                let textX = x;
                if (align === "center") textX = x + w / 2;
                else if (align === "right") textX = x + w;

                // Wrap text to fit width
                const maxWidth = w;
                const lines = wrapText(ctx, textObj.translated, maxWidth);

                const lineHeight = fontSize * 1.15;
                let textY = y;

                for (const line of lines) {
                    if (strokeEnabled) {
                        ctx.strokeText(line, textX, textY);
                    }
                    ctx.fillText(line, textX, textY);
                    textY += lineHeight;
                }
            }

            resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = () => resolve(inpaintedBase64);
        img.src = inpaintedBase64;
    });
}

function mapFontName(fontKey) {
    const map = {
        noto: "NotoSans",
        wildwords: "WildWords",
        heroika: "Heroika",
        shonen: "Shonen",
        badcomic: "BadComic",
        mashanzheng: "MaShanZheng",
        komika: "KomikaJam",
        bangers: "Bangers",
        edo: "Edo",
        ridi: "RIDIBatang",
        bushidoo: "Bushidoo",
        hayah: "Hayah",
        itim: "Itim",
        mogul: "MogulIrina",
        kalam: "Kalam",
        hindsiliguri: "HindSiliguri",
        figtree: "Figtree"
    };
    return map[fontKey] || "WildWords";
}

function getContrastColor(hexColor) {
    const hex = hexColor.replace("#", "");
    if (hex.length !== 6) return "#ffffff";
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? "#ffffff" : "#000000";
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";

    for (const word of words) {
        const testLine = currentLine ? currentLine + " " + word : word;
        if (ctx.measureText(testLine).width <= maxWidth || !currentLine) {
            currentLine = testLine;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [text];
}

// ─── Main translate pipeline ─────────────────────────────────────────────────
async function sendImage(url, site, blob, actionType, download, context, checkCacheOnly = false) {
    try {
        const settings = await getSettings();
        const byokKeys = await getByokKeys();

        // Build cache headers
        const cacheHeaders = {
            target_lang: settings.genji_target_lang,
            translator: settings.translation_model,
            font: settings.genji_font,
            min_font_size: settings.genji_min_font_size,
            stroke_disabled: !settings.genji_stroke_enabled,
            legacy_inpaint: settings.genji_legacy_inpaint,
            bubbles_only: settings.genji_bubbles_only,
            text_align: settings.genji_text_alignment,
            context: context !== undefined && context !== null ? context : "false",
            custom_prompt: settings.genji_custom_prompt
        };

        // Check cache BEFORE making any API call
        let cacheKey;
        try {
            if (!download) {
                if (blob) {
                    cacheKey = await translationCache.generateKey(blob, cacheHeaders);
                } else if (url && !url.startsWith("blob:")) {
                    cacheKey = await translationCache.generateKey(url, cacheHeaders);
                }

                if (cacheKey) {
                    const cached = await translationCache.get(cacheKey);
                    if (cached) {
                        console.log("[Genji] Translation served from cache");
                        return { success: true, content: cached };
                    } else if (checkCacheOnly) {
                        return { success: false, content: { isCacheMiss: true } };
                    }
                }
            }
        } catch (e) {
            console.warn("[Genji] Cache lookup failed", e);
        }

        if (checkCacheOnly) {
            return { success: false, content: { isCacheMiss: true } };
        }

        // Fetch the image
        let imageBlob = blob;
        if (!imageBlob && url && !url.startsWith("data:") && !url.startsWith("blob:")) {
            try {
                const image = await fetchWithReferer(url, site);
                if (image && image.ok) {
                    imageBlob = await image.blob();
                }
            } catch (e) {
                imageBlob = null;
            }
        }

        if (!imageBlob && url && url.startsWith("data:")) {
            imageBlob = dataUrlToBlob(url);
        }

        if (!imageBlob) {
            return { success: false, content: { error: "Failed to fetch image." } };
        }

        // Compress image
        imageBlob = await compressImage(imageBlob);

        // Convert to base64 for AI API call
        const imageBase64 = await blobToImage(imageBlob);

        // Call AI provider for OCR + translation
        let textObjects = [];
        try {
            textObjects = await callAIProvider(imageBase64, settings, byokKeys);
        } catch (error) {
            console.error("[Genji] AI provider error:", error);
            return { success: false, content: { error: error.message } };
        }

        // Inpaint (remove original text) — canvas-based, client-side
        let inpaintedImage = imageBase64;
        try {
            inpaintedImage = await inpaintCanvas(imageBase64, textObjects);
        } catch (e) {
            console.warn("[Genji] Inpainting failed, using original", e);
            inpaintedImage = imageBase64;
        }

        // Render translated text onto inpainted image — client-side canvas
        let translatedImage = inpaintedImage;
        try {
            translatedImage = await renderTranslatedImage(inpaintedImage, textObjects, settings);
        } catch (e) {
            console.warn("[Genji] Text rendering failed, using inpainted", e);
            translatedImage = inpaintedImage;
        }

        // Build result
        const result = {
            image: translatedImage,
            original: imageBase64,
            inpainted: inpaintedImage,
            text: textObjects,
            filename: null,
            context: null,
            settings: {
                language: settings.genji_target_lang,
                min_font_size: settings.genji_min_font_size,
                translator: settings.translation_model,
                font: settings.genji_font,
                text_align: settings.genji_text_alignment,
                stroke_enabled: settings.genji_stroke_enabled,
                bubbles_only: settings.genji_bubbles_only,
                legacy_inpaint: settings.genji_legacy_inpaint,
                custom_prompt: settings.genji_custom_prompt
            }
        };

        // Extract filename from URL
        if (url && !url.startsWith("data:") && !url.startsWith("blob:")) {
            try {
                const cleanUrl = url.split(/[?#]/)[0];
                let filename = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
                filename = decodeURIComponent(filename);
                filename = filename.replace(/[^a-zA-Z0-9\-_.\s]/g, "_");
                if (filename && filename.length > 0 && filename.length < 200) {
                    result.filename = filename;
                }
            } catch (e) { }
        }

        // Auto-save
        if (settings.genji_auto_save && browser.downloads && browser.downloads.download) {
            try {
                let filename = result.filename || `genji_${Date.now()}.jpg`;
                if (!filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) filename += ".jpg";
                const folder = settings.genji_auto_save_folder || "GenjiTranslations";
                filename = `${folder}/${filename}`;
                downloadFilenames.set(result.image, filename);
                const downloadUrl = result.image.startsWith("data:") ? URL.createObjectURL(dataUrlToBlob(result.image)) : result.image;
                const downloadId = await browser.downloads.download({ url: downloadUrl, filename, conflictAction: 'uniquify', saveAs: false });
                result.downloaded = true;
                if (result.image.startsWith("data:")) {
                    const handler = (delta) => {
                        if (delta.id === downloadId && (delta.state?.current === "complete" || delta.state?.current === "interrupted")) {
                            browser.downloads.onChanged.removeListener(handler);
                            URL.revokeObjectURL(downloadUrl);
                        }
                    };
                    browser.downloads.onChanged.addListener(handler);
                }
            } catch (e) {
                console.warn("[Genji] Auto-save failed", e);
            }
        }

        // Store in cache
        if (cacheKey) {
            try {
                await translationCache.put(cacheKey, result);
            } catch (error) {
                console.warn("[Genji] Cache put failed", error);
            }
        }

        return { success: true, content: result };
    } catch (error) {
        console.error("[Genji] Translation error:", error);
        if (error.name === "AbortError") {
            return { success: false, content: { error: "The request timed out. Try a smaller image or a different provider." } };
        }
        return { success: false, content: { error: "Failed to process image: " + (error.message || "Unknown error") } };
    }
}

// ─── Download all cached translations ────────────────────────────────────────
async function performDownloadAllCached() {
    try {
        const allItems = await translationCache.getAll();
        const settings = await browser.storage.sync.get({ genji_auto_save: false, genji_auto_save_folder: "GenjiTranslations" });

        if (!settings.genji_auto_save) return { success: true, count: 0 };
        if (!browser.downloads || !browser.downloads.download) return { success: false, error: "Auto-save not supported." };

        let downloadCount = 0;
        for (const item of allItems) {
            if (item.downloaded) continue;
            try {
                let filename = item.filename || `genji_${item.timestamp || Date.now()}.jpg`;
                if (!filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) filename += ".jpg";
                const folder = settings.genji_auto_save_folder || "GenjiTranslations";
                filename = `${folder}/${filename}`;
                downloadFilenames.set(item.image, filename);

                let downloadUrl = item.image;
                let isBlobUrl = false;
                if (downloadUrl.startsWith("data:")) {
                    const blob = dataUrlToBlob(downloadUrl);
                    downloadUrl = URL.createObjectURL(blob);
                    isBlobUrl = true;
                }

                const downloadId = await browser.downloads.download({ url: downloadUrl, filename, conflictAction: 'uniquify', saveAs: false });

                if (isBlobUrl) {
                    const handler = (delta) => {
                        if (delta.id === downloadId && (delta.state?.current === "complete" || delta.state?.current === "interrupted")) {
                            browser.downloads.onChanged.removeListener(handler);
                            URL.revokeObjectURL(downloadUrl);
                        }
                    };
                    browser.downloads.onChanged.addListener(handler);
                }

                item.downloaded = true;
                await translationCache.put(item.key, item, true);
                downloadCount++;
            } catch (e) {
                console.warn("[Genji] Failed to auto-download cached item", e);
            }
        }
        return { success: true, count: downloadCount };
    } catch (error) {
        console.warn("[Genji] Failed to download cached items", error);
        return { success: false, error: "Failed to download cached items." };
    }
}

// ─── Message handler ─────────────────────────────────────────────────────────
async function handleMessage(msg) {
    // Reconstruct chunked messages
    if (msg.transferId && msg.type !== "chunk") {
        const transfer = chunkStore.get(msg.transferId);
        if (transfer) {
            for (const [prop, chunks] of Object.entries(transfer)) {
                msg[prop] = chunks.join("");
            }
            chunkStore.delete(msg.transferId);
        }
    }

    if (msg.type == "translate") {
        let response = null;

        try {
            let imageBlob = null;
            let fetchedSuccess = false;

            if (msg.url && !msg.url.startsWith("data:") && !msg.url.startsWith("blob:")) {
                try {
                    const image = await fetchWithReferer(msg.url, msg.site);
                    if (image && image.ok) {
                        const blob = await image.blob();
                        if (blob && blob.size > 1024) {
                            imageBlob = blob;
                            fetchedSuccess = true;
                        }
                    }
                } catch (error) {
                    imageBlob = null;
                }
            }

            if (!fetchedSuccess && msg.buffer) {
                try {
                    if (typeof msg.buffer === 'string') {
                        const byteCharacters = atob(msg.buffer);
                        const byteArray = new Uint8Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteArray[i] = byteCharacters.charCodeAt(i);
                        }
                        imageBlob = new Blob([byteArray]);
                    } else {
                        const uint8Array = new Uint8Array(msg.buffer);
                        imageBlob = new Blob([uint8Array]);
                    }
                } catch (e) {
                    imageBlob = null;
                }
            }

            response = await sendImage(msg.url, msg.site, imageBlob, msg.actionType, msg.download, msg.context, msg.checkCacheOnly);
        } catch (error) {
            response = await sendImage(msg.url, msg.site, null, msg.actionType, msg.download, msg.context, msg.checkCacheOnly);
        }

        if (!response.success) {
            return { success: false, content: { error: response.content.error } };
        }

        return {
            success: true,
            content: {
                translated: response.content.image,
                original: response.content.original,
                inpainted: response.content.inpainted,
                text: response.content.text,
                context: response.content.context
            }
        };
    } else if (msg.type == "inpaint") {
        // Client-side inpainting only (no server)
        try {
            const getImageBlob = (data) => {
                if (typeof data === 'string') {
                    const byteCharacters = atob(data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    return new Blob([new Uint8Array(byteNumbers)]);
                }
                return new Blob([new Uint8Array(data)]);
            };

            const settings = await getSettings();
            const imageBase64 = msg.image;
            const textObjects = msg.textObjects || [];

            const inpaintedImage = await inpaintCanvas(imageBase64, textObjects);
            const translatedImage = await renderTranslatedImage(inpaintedImage, textObjects, settings);

            return { success: true, content: { inpaintedImageSrc: inpaintedImage, textObjects: textObjects, translatedImageSrc: translatedImage } };
        } catch (error) {
            console.error("[Genji] Inpaint error:", error);
            return { success: false, content: { error: "Failed to inpaint image." } };
        }
    } else if (msg.type == "keep-alive") {
        return { success: true };
    } else if (msg.type == "error") {
        console.log("[Genji] Error report:", msg.message, msg.loc);
        return { success: true };
    } else if (msg.type == "screenshot") {
        while (true) {
            try {
                const dataURL = await browser.tabs.captureVisibleTab(null, { format: "png" });
                return { success: true, content: { dataURL: dataURL } };
            } catch (error) {
                if (error.message.includes("exceeds")) {
                    await new Promise(r => setTimeout(r, 200));
                } else {
                    console.log("[Genji] Failed to capture screenshot:", error);
                    return { success: false, content: { error: "Failed to capture screenshot." } };
                }
            }
        }
    } else if (msg.type == "chunk") {
        let transfer = chunkStore.get(msg.transferId);
        if (!transfer) {
            transfer = {};
            chunkStore.set(msg.transferId, transfer);
        }
        const prop = msg.property || "buffer";
        if (!transfer[prop]) {
            transfer[prop] = new Array(msg.total);
        }
        transfer[prop][msg.index] = msg.data;
        return { success: true };
    } else if (msg.type === "get_recent") {
        try {
            const items = await translationCache.getRecent(msg.limit, msg.offset);
            return { success: true, content: items };
        } catch (error) {
            console.warn("[Genji] Failed to get recent from background", error);
            return { success: false, content: { error: error.message } };
        }
    } else if (msg.type === "cleanup_cache") {
        try {
            await translationCache.cleanup(msg.ttl);
            return { success: true };
        } catch (error) {
            console.warn("[Genji] Failed to cleanup cache", error);
            return { success: false, content: { error: error.message } };
        }
    } else if (msg.type === "delete_recent") {
        try {
            await translationCache.delete(msg.key);
            return { success: true };
        } catch (error) {
            console.warn("[Genji] Failed to delete from background", error);
            return { success: false, content: { error: error.message } };
        }
    } else if (msg.type === "open-popup") {
        try {
            if (typeof browser.action?.openPopup === "function") {
                await browser.action.openPopup();
                return { success: true };
            }
            return { success: false, error: "openPopup not supported" };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    console.warn("[Genji] Unknown message:", msg.type);
    return { success: false, content: { error: "Unknown request type." } };
}

// ─── Message listener ────────────────────────────────────────────────────────
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg).then(sendResponse).catch(error => {
        console.error("[Genji] Message handler error:", error);
        sendResponse({ success: false, content: { error: error.message || "Something went wrong." } });
    });

    // Return true for async response
    if (["translate", "inpaint", "error", "screenshot", "chunk", "cleanup_cache", "get_recent", "delete_recent", "open-popup", "keep-alive"].includes(msg.type)) {
        return true;
    }
});

// ─── Context menu setup ──────────────────────────────────────────────────────
browser.runtime.onInstalled.addListener(async (details) => {
    try {
        browser.contextMenus.create({ id: "genji_contextmenu", title: "Genji (Alt+Shift+D)", contexts: ["all"] });
        browser.contextMenus.create({ id: "genji_screenshot", title: "Screenshot Image (Alt+Shift+C)", contexts: ["all"], parentId: "genji_contextmenu" });
        browser.contextMenus.create({ id: "genji_translate", title: "Translate Image (Alt+Shift+Z)", contexts: ["all"], parentId: "genji_contextmenu" });
        browser.contextMenus.create({ id: "genji_screencrop", title: "Screen Crop Image (Alt+Shift+X)", contexts: ["all"], parentId: "genji_contextmenu" });
        browser.contextMenus.create({ id: "genji_repeatscreencrop", title: "Repeat Last Screen Crop", contexts: ["all"], parentId: "genji_contextmenu" });
        browser.contextMenus.create({ id: "genji_edit", title: "Edit Image", contexts: ["all"], parentId: "genji_contextmenu" });
        browser.contextMenus.create({ id: "genji_download", title: "Download Image", contexts: ["all"], parentId: "genji_contextmenu" });
        browser.contextMenus.create({ id: "genji_auto", title: "Toggle Auto Translate", contexts: ["all"], parentId: "genji_contextmenu" });
    } catch (error) {
        console.log("[Genji] Failed to create context menus:", error);
    }
});

// ─── Keyboard shortcut commands ──────────────────────────────────────────────
try {
    browser.commands.onCommand.addListener(async (command, tab) => {
        const messages = {
            genji_contextmenu: "command_contextmenu",
            genji_screencrop: "command_screencrop",
            genji_repeatscreencrop: "command_repeatscreencrop",
            genji_translate: "command_translate",
            genji_screenshot: "command_screenshot",
            genji_edit: "command_edit",
            genji_download: "command_download"
        };
        const msgType = messages[command];
        if (tab && msgType) {
            browser.tabs.sendMessage(tab.id, { type: msgType }).catch(() => {});
        }
    });
} catch (error) {
    console.log("[Genji] Failed to create command listener:", error);
}

// ─── Context menu click listener ─────────────────────────────────────────────
try {
    browser.contextMenus.onClicked.addListener(async (info, tab) => {
        const menuMap = {
            genji_screenshot: "contextmenu_screenshot",
            genji_translate: "contextmenu_translate",
            genji_screencrop: "contextmenu_screencrop",
            genji_repeatscreencrop: "contextmenu_repeatscreencrop",
            genji_edit: "contextmenu_edit",
            genji_download: "contextmenu_download",
            genji_auto: "contextmenu_auto"
        };
        const msgType = menuMap[info.menuItemId];
        if (msgType) {
            browser.tabs.sendMessage(tab.id, { type: msgType }).catch(() => {});
        }
    });
    browser.storage.sync.set({ genji_contextmenu: true });
} catch (error) {
    browser.storage.sync.set({ genji_contextmenu: false });
}
