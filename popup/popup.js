// Genji Image Translator - Popup Logic
// =====================================
// No login, no auth, no credits. Direct BYOK key storage in chrome.storage.
// reverse-engineered and open-sourced by dropxtor - MIT License

import { TranslationCache } from "../scripts/translationCache.js"

const translationCache = new TranslationCache();

const loader = document.getElementById("loader");
const content = document.getElementById("content");
const footer = document.getElementById("footer");
const header = document.getElementById("header");

const home = document.getElementById("home");
const homeButton = document.getElementById("home-button");
const settings = document.getElementById("settings");
const settingsButton = document.getElementById("settings-button");
const recent = document.getElementById("recent");
const recentButton = document.getElementById("recent-button");

const languageSelect = document.getElementById("language-select");
const modelSelect = document.getElementById("model-select");
const fontSelect = document.getElementById("font-select");
const minFontSizeInput = document.getElementById("min-font-size");
const textAlignmentSelect = document.getElementById("text-alignment-select");

const enabledCheckbox = document.getElementById("enabled");
const defaultEnabled = document.getElementById("default-enabled");
const textStroke = document.getElementById("text-stroke");
const bubblesOnly = document.getElementById("bubbles-only");
const legacyInpaint = document.getElementById("legacy-inpaint");
const contextSharing = document.getElementById("context-sharing");
const autocache = document.getElementById("autocache");
const minImageSizeInput = document.getElementById("min-image-size");
const minImageSizeValue = document.getElementById("min-image-size-value");

const genjiTL = document.getElementById("genji-tl");
const genjiTR = document.getElementById("genji-tr");

const customPromptBtn = document.getElementById("custom-prompt-btn");
const customPromptPage = document.getElementById("custom-prompt-page");
const closeCustomPromptBtn = document.getElementById("close-custom-prompt");
const customPromptInput = document.getElementById("custom-prompt-input");
const customPromptCounter = document.getElementById("custom-prompt-counter");

const byokBtn = document.getElementById("byok-btn");
const byokPage = document.getElementById("byok-page");
const closeByokBtn = document.getElementById("close-byok");
const byokProviders = ["openrouter", "google", "openai", "anthropic", "deepseek", "xai", "local"];

const retentionSelect = document.getElementById("retention-select");
const autoSaveToggle = document.getElementById("auto-save-toggle");
const autoSaveFolderInput = document.getElementById("auto-save-folder");

// Recent view elements
const recentGridView = document.getElementById("recent-grid-view");
const recentGrid = document.getElementById("recent-grid");
const recentEmpty = document.getElementById("recent-empty");
const recentDetailView = document.getElementById("recent-detail-view");
const recentImage = document.getElementById("recent-image");
const recentBackBtn = document.getElementById("recent-back");
const recentFlipBtn = document.getElementById("recent-flip");
const recentDownloadBtn = document.getElementById("recent-download");
const recentDeleteBtn = document.getElementById("recent-delete");
const paginationControls = document.getElementById("pagination-controls");
const prevPageBtn = document.getElementById("prev-page-btn");
const nextPageBtn = document.getElementById("next-page-btn");
const pageIndicator = document.getElementById("page-indicator");

let currentRecentItems = [];
let currentViewingItem = null;
let currentViewMode = "translated";
let currentPage = 1;
let hasNextPage = false;
const RECENT_LIMIT = 6;

// Models (no credits — BYOK only)
const defaultModels = [
    { value: "gemini-3.1-flash-lite", text: "Gemini 3.1 Flash Lite", provider: "google" },
    { value: "deepseek",             text: "DeepSeek V4 Flash",     provider: "deepseek" },
    { value: "grok-4.20",            text: "Grok 4.20",             provider: "xai" },
    { value: "kimi-k2.5",            text: "Kimi K2.5",             provider: "openrouter" },
    { value: "gpt-5.4",              text: "GPT-5.4",              provider: "openai" },
    { value: "gemini-3-flash",       text: "Gemini 3 Flash",        provider: "google" },
    { value: "claude-sonnet-4.6",    text: "Claude Sonnet 4.6",    provider: "anthropic" },
    { value: "gemini-3.5-flash",     text: "Gemini 3.5 Flash",      provider: "google" }
];

// Languages (same as Torii)
const languages = {
    af:"Afrikaans",sq:"Albanian",am:"Amharic",ar:"Arabic",hy:"Armenian",as:"Assamese",ay:"Aymara",az:"Azerbaijani",
    bm:"Bambara",eu:"Basque",be:"Belarusian",bn:"Bengali",bho:"Bhojpuri",bs:"Bosnian",bg:"Bulgarian",ca:"Catalan",
    ceb:"Cebuano",ny:"Chichewa","zh-cn":"Chinese (Simplified)","zh-tw":"Chinese (Traditional)",co:"Corsican",hr:"Croatian",
    cs:"Czech",da:"Danish",dv:"Divehi",doi:"Dogri",nl:"Dutch",en:"English",eo:"Esperanto",et:"Estonian",ee:"Ewe",
    fil:"Filipino",fi:"Finnish",fr:"French",fy:"Frisian",gl:"Galician",lg:"Ganda",ka:"Georgian",de:"German",
    el:"Greek",gn:"Guarani",gu:"Gujarati",ht:"Haitian",ha:"Hausa",haw:"Hawaiian",he:"Hebrew",hi:"Hindi",
    hmn:"Hmong",hu:"Hungarian",is:"Icelandic",ig:"Igbo",ilo:"Iloko",id:"Indonesian",ga:"Irish",it:"Italian",
    ja:"Japanese",jv:"Javanese",kn:"Kannada",kk:"Kazakh",km:"Khmer",rw:"Kinyarwanda",gom:"Konkani",ko:"Korean",
    kri:"Krio",ku:"Kurmanji",ckb:"Sorani",ky:"Kyrgyz",lo:"Lao",la:"Latin",lv:"Latvian",ln:"Lingala",
    lt:"Lithuanian",lb:"Luxembourgish",mk:"Macedonian",mai:"Maithili",mg:"Malagasy",ms:"Malay",ml:"Malayalam",
    mt:"Maltese",mi:"Maori",mr:"Marathi",lus:"Mizo",mn:"Mongolian",my:"Burmese",ne:"Nepali",nso:"Sotho",
    no:"Norwegian",or:"Odia",om:"Oromo",ps:"Pashto",fa:"Persian",pl:"Polish","pt-pt":"Portuguese (Portugal)",
    "pt-br":"Portuguese (Brazilian)",pa:"Punjabi",qu:"Quechua",ro:"Romanian",ru:"Russian",sm:"Samoan",
    sa:"Sanskrit",gd:"Scottish",sr:"Serbian",st:"Sesotho",sn:"Shona",sd:"Sindhi",si:"Sinhala",sk:"Slovak",
    sl:"Slovenian",so:"Somali",es:"Spanish",su:"Sundanese",sw:"Swahili",sv:"Swedish",tg:"Tajik",ta:"Tamil",
    tt:"Tatar",te:"Telugu",th:"Thai",ti:"Tigrinya",ts:"Tsonga",tr:"Turkish",tk:"Turkmen",ak:"Twi",
    uk:"Ukrainian",ur:"Urdu",ug:"Uyghur",uz:"Uzbek",vi:"Vietnamese",cy:"Welsh",xh:"Xhosa",yi:"Yiddish",
    yo:"Yoruba",zu:"Zulu"
};

// ─── Model dropdown ──────────────────────────────────────────────────────────
function updateModelSelectDropdown() {
    return new Promise((resolve) => {
        browser.storage.sync.get({
            translation_model: "gemini-3.1-flash-lite",
            genji_byok_openrouter: "",
            genji_byok_google: "",
            genji_byok_openai: "",
            genji_byok_anthropic: "",
            genji_byok_deepseek: "",
            genji_byok_xai: "",
            genji_byok_local_url: "",
            genji_byok_local_model: ""
        }, (result) => {
            const currentSelectedValue = modelSelect.value || result.translation_model || "gemini-3.1-flash-lite";
            modelSelect.innerHTML = "";

            const localUrlClean = result.genji_byok_local_url ? result.genji_byok_local_url.trim() : "";
            const localModelClean = result.genji_byok_local_model ? result.genji_byok_local_model.trim() : "";
            const localIsValid = localUrlClean !== "" && localModelClean !== "";

            const isBYOKAvailable = (provider) => {
                if (!!result.genji_byok_openrouter) return true;
                if (!provider) return false;
                return !!result[`genji_byok_${provider}`];
            };

            const optionsToRender = [];
            defaultModels.forEach(m => {
                if (localIsValid && m.value === localModelClean) return;
                optionsToRender.push({ value: m.value, originalText: m.text, isBYOK: isBYOKAvailable(m.provider), byokAvailable: isBYOKAvailable(m.provider) });
            });
            if (localIsValid) {
                optionsToRender.push({ value: localModelClean, originalText: localModelClean, isBYOK: true, byokAvailable: true });
            }

            // Sort: BYOK-available first
            optionsToRender.sort((a, b) => (b.byokAvailable ? 1 : 0) - (a.byokAvailable ? 1 : 0));

            optionsToRender.forEach(opt => {
                const optionEl = document.createElement("option");
                optionEl.value = opt.value;
                if (opt.isBYOK) {
                    optionEl.text = `(BYOK) ${opt.originalText}`;
                    optionEl.style.color = "#3fb950";
                } else {
                    optionEl.text = opt.originalText;
                }
                modelSelect.appendChild(optionEl);
            });

            const optionExists = Array.from(modelSelect.options).some(opt => opt.value === currentSelectedValue);
            if (optionExists) {
                modelSelect.value = currentSelectedValue;
            } else if (modelSelect.options.length > 0) {
                modelSelect.selectedIndex = 0;
                browser.storage.sync.set({ translation_model: modelSelect.value });
            }
            resolve();
        });
    });
}

// ─── Init ────────────────────────────────────────────────────────────────────
browser.storage.sync.get({ genji_target_lang: "en", genji_auto_save: false }, (result) => {
    const targetLanguage = result.genji_target_lang;
    const autoSave = result.genji_auto_save;

    for (const [key, value] of Object.entries(languages)) {
        const opt = document.createElement("option");
        opt.value = key;
        opt.text = value;
        if (key === targetLanguage) opt.selected = true;
        languageSelect.appendChild(opt);
    }

    if (isMobile() || isSafari()) {
        browser.storage.sync.set({ genji_auto_save: false });
        autoSaveToggle.checked = false;
        document.getElementById("auto-save-container").style.display = "none";
    } else if (autoSave) {
        browser.permissions.contains({ permissions: ["downloads"] }, (hasPermission) => {
            if (hasPermission) autoSaveToggle.checked = true;
            else { browser.storage.sync.set({ genji_auto_save: false }); autoSaveToggle.checked = false; }
        });
    }
});

// Event listeners for settings
fontSelect.addEventListener("change", (e) => browser.storage.sync.set({ genji_font: e.target.value }));
languageSelect.addEventListener("change", (e) => browser.storage.sync.set({ genji_target_lang: e.target.value }));
modelSelect.addEventListener("change", (e) => browser.storage.sync.set({ translation_model: e.target.value }));
minFontSizeInput.addEventListener("change", (e) => {
    if (minFontSizeInput.value < 6) minFontSizeInput.value = 6;
    else if (minFontSizeInput.value > 100) minFontSizeInput.value = 100;
    browser.storage.sync.set({ genji_min_font_size: parseInt(minFontSizeInput.value) });
});
textAlignmentSelect.addEventListener("change", (e) => browser.storage.sync.set({ genji_text_alignment: e.target.value }));

// ─── No auth needed! Show extension immediately ─────────────────────────────
showExtension();
initialize();

function showExtension() {
    content.classList.add("flex");
    header.classList.add("flex");
    footer.classList.add("flex");
    loader.classList.add("hidden");
    loader.classList.remove("flex");
}

// ─── Toggle buttons (stroke, bubbles, legacy, context) ────────────────────────
textStroke.addEventListener("click", async () => {
    const setting = await browser.storage.sync.get({ genji_stroke_enabled: true });
    browser.storage.sync.set({ genji_stroke_enabled: !setting.genji_stroke_enabled });
    updateStrokeBtnState(!setting.genji_stroke_enabled);
});
bubblesOnly.addEventListener("click", async () => {
    const setting = await browser.storage.sync.get({ genji_bubbles_only: false });
    browser.storage.sync.set({ genji_bubbles_only: !setting.genji_bubbles_only });
    updateBubblesOnlyBtnState(!setting.genji_bubbles_only);
});
legacyInpaint.addEventListener("click", async () => {
    const setting = await browser.storage.sync.get({ genji_legacy_inpaint: false });
    browser.storage.sync.set({ genji_legacy_inpaint: !setting.genji_legacy_inpaint });
    updateLegacyBtnState(!setting.genji_legacy_inpaint);
});
contextSharing.addEventListener("click", async () => {
    const setting = await browser.storage.sync.get({ genji_context_sharing: false });
    browser.storage.sync.set({ genji_context_sharing: !setting.genji_context_sharing });
    updateContextSharingBtnState(!setting.genji_context_sharing);
});
autocache.addEventListener("change", (e) => browser.storage.sync.set({ autocache: autocache.checked }));
minImageSizeInput.addEventListener("input", (e) => {
    minImageSizeValue.textContent = parseInt(e.target.value) + "px";
});
minImageSizeInput.addEventListener("change", (e) => {
    browser.storage.sync.set({ genji_min_image_size: parseInt(e.target.value) });
});

genjiTL.addEventListener("click", () => { setGenjiLocation("tl"); browser.storage.sync.set({ genji_location: "tl" }); });
genjiTR.addEventListener("click", () => { setGenjiLocation("tr"); browser.storage.sync.set({ genji_location: "tr" }); });

// Custom prompt
customPromptBtn.addEventListener("click", () => {
    content.classList.remove("flex");
    content.classList.add("hidden");
    footer.classList.remove("flex");
    footer.classList.add("hidden");
    customPromptPage.classList.remove("hidden");
    customPromptPage.classList.add("flex");
});
closeCustomPromptBtn.addEventListener("click", () => {
    customPromptPage.classList.remove("flex");
    customPromptPage.classList.add("hidden");
    content.classList.remove("hidden");
    content.classList.add("flex");
    footer.classList.remove("hidden");
    footer.classList.add("flex");
});
customPromptInput.addEventListener("input", (e) => {
    customPromptCounter.textContent = `${e.target.value.length}/1000`;
    clearTimeout(customPromptInput._timeout);
    customPromptInput._timeout = setTimeout(() => {
        browser.storage.sync.set({ genji_custom_prompt: e.target.value });
    }, 500);
});

// ─── BYOK key management ─────────────────────────────────────────────────────
byokBtn.addEventListener("click", () => {
    content.classList.remove("flex");
    content.classList.add("hidden");
    footer.classList.remove("flex");
    footer.classList.add("hidden");
    byokPage.classList.remove("hidden");
    byokPage.classList.add("flex");
});
closeByokBtn.addEventListener("click", () => {
    byokPage.classList.remove("flex");
    byokPage.classList.add("hidden");
    content.classList.remove("hidden");
    content.classList.add("flex");
    footer.classList.remove("hidden");
    footer.classList.add("flex");
});

function maskApiKey(key) {
    if (!key) return "";
    if (key.length <= 10) return key.length >= 3 ? "..." + key.slice(-3) : "...";
    return key.slice(0, 8) + "..." + key.slice(-4);
}

function updateBYOKIndicator(provider, isActive) {
    const input = document.getElementById(`byok-${provider}-input`);
    if (!input) return;
    const container = input.parentElement;
    let indicator = container.querySelector(".byok-status-indicator");
    if (isActive) {
        if (!indicator) {
            indicator = document.createElement("span");
            indicator.className = "byok-status-indicator";
            indicator.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="#3fb950"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>`;
            container.style.position = "relative";
            container.appendChild(indicator);
        }
    } else {
        if (indicator) indicator.remove();
    }
}

byokProviders.forEach(provider => {
    const input = document.getElementById(`byok-${provider}-input`);
    if (!input) return;

    input.addEventListener("click", () => input.select());
    input.addEventListener("focus", () => input.select());

    input.addEventListener("change", async (e) => {
        const rawKey = e.target.value.trim();

        browser.storage.sync.get({ [`genji_byok_${provider}`]: "" }, (result) => {
            const savedKey = result[`genji_byok_${provider}`];
            // If user clicks without changing the masked value, do nothing
            if (savedKey && rawKey === maskApiKey(savedKey)) return;

            if (!rawKey) {
                // Clear the key
                browser.storage.sync.set({ [`genji_byok_${provider}`]: "" });
                updateBYOKIndicator(provider, false);
                updateModelSelectDropdown();
                return;
            }

            // Genji: store the key directly — NO encryption, NO server call
            browser.storage.sync.set({ [`genji_byok_${provider}`]: rawKey }, () => {
                input.value = maskApiKey(rawKey);
                updateBYOKIndicator(provider, true);

                // Auto-select a model for this provider
                const topModel = defaultModels.find(m => m.provider === provider);
                if (topModel) {
                    modelSelect.value = topModel.value;
                    browser.storage.sync.set({ translation_model: topModel.value });
                }
                updateModelSelectDropdown();
            });
        });
    });
});

// Local LLM URL/Model listeners
const localUrlInput = document.getElementById("byok-local-url-input");
const localModelInput = document.getElementById("byok-local-model-input");
if (localUrlInput) {
    localUrlInput.addEventListener("change", (e) => {
        browser.storage.sync.set({ genji_byok_local_url: e.target.value.trim() }, () => updateModelSelectDropdown());
    });
}
if (localModelInput) {
    localModelInput.addEventListener("change", (e) => {
        const val = e.target.value.trim();
        browser.storage.sync.set({ genji_byok_local_model: val }, () => {
            if (localUrlInput && localUrlInput.value.trim() && val) {
                modelSelect.value = val;
                browser.storage.sync.set({ translation_model: val });
            }
            updateModelSelectDropdown();
        });
    });
}

// ─── Page navigation ──────────────────────────────────────────────────────────
homeButton.addEventListener("click", () => setPage("home"));
recentButton.addEventListener("click", () => { setPage("recent"); currentPage = 1; loadRecent(); });
settingsButton.addEventListener("click", () => setPage("settings"));

function setPage(page) {
    home.classList.remove("flex"); home.classList.add("hidden");
    recent.classList.remove("flex"); recent.classList.add("hidden");
    settings.classList.remove("flex"); settings.classList.add("hidden");

    [homeButton, recentButton, settingsButton].forEach(btn => {
        const span = btn.querySelector("span");
        const svg = btn.querySelector("svg");
        if (span) span.style.color = "#8b949e";
        if (svg) svg.setAttribute("fill", "#8b949e");
    });

    if (page === "home") {
        home.classList.remove("hidden"); home.classList.add("flex");
        homeButton.querySelector("span").style.color = "#00d9ff";
        homeButton.querySelector("svg").setAttribute("fill", "#00d9ff");
    } else if (page === "recent") {
        recent.classList.remove("hidden"); recent.classList.add("flex");
        recentButton.querySelector("span").style.color = "#00d9ff";
        recentButton.querySelector("svg").setAttribute("fill", "#00d9ff");
    } else if (page === "settings") {
        settings.classList.remove("hidden"); settings.classList.add("flex");
        settingsButton.querySelector("span").style.color = "#00d9ff";
        settingsButton.querySelector("svg").setAttribute("fill", "#00d9ff");
    }
}

// ─── Recent translations ──────────────────────────────────────────────────────
async function loadRecent() {
    try {
        const savedTTL = localStorage.getItem("recent_ttl") || "604800000";
        retentionSelect.value = savedTTL;

        if (currentPage === 1) {
            try {
                await translationCache.cleanup(parseInt(savedTTL));
            } catch (e) {
                await new Promise(resolve => {
                    browser.runtime.sendMessage({ type: "cleanup_cache", ttl: parseInt(savedTTL) }, () => resolve());
                });
            }
        }

        const offset = (currentPage - 1) * RECENT_LIMIT;
        let items;
        try {
            items = await translationCache.getRecent(RECENT_LIMIT + 1, offset);
        } catch (e) {
            items = await new Promise((resolve) => {
                browser.runtime.sendMessage({ type: "get_recent", limit: RECENT_LIMIT + 1, offset }, (response) => {
                    resolve(response?.content || []);
                });
            });
        }

        if (items.length === 0 && currentPage > 1) {
            currentPage--;
            await loadRecent();
            return;
        }

        hasNextPage = items.length > RECENT_LIMIT;
        const itemsToDisplay = items.slice(0, RECENT_LIMIT);
        currentRecentItems = itemsToDisplay;
        recentGrid.innerHTML = "";
        recentEmpty.classList.remove("flex"); recentEmpty.classList.add("hidden");

        if (itemsToDisplay.length === 0) {
            recentEmpty.classList.remove("hidden"); recentEmpty.classList.add("flex");
        } else {
            itemsToDisplay.forEach(item => {
                if (item.isCorrupted) return;
                const div = document.createElement("div");
                div.style.cssText = "aspect-ratio: 3/4; border-radius: 8px; overflow: hidden; cursor: pointer; border: 1px solid #30363d; position: relative;";
                const img = document.createElement("img");
                img.src = item.image;
                img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
                div.appendChild(img);
                div.addEventListener("click", () => openRecentImage(item));
                recentGrid.appendChild(div);
            });
        }

        if (hasNextPage || currentPage > 1) {
            paginationControls.classList.remove("hidden"); paginationControls.classList.add("flex");
            pageIndicator.textContent = `Page ${currentPage}`;
            prevPageBtn.disabled = currentPage <= 1;
            nextPageBtn.disabled = !hasNextPage;
        } else {
            paginationControls.classList.add("hidden"); paginationControls.classList.remove("flex");
        }
    } catch (error) {
        console.error("[Genji] Failed to load recent", error);
    }
}

prevPageBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadRecent(); } });
nextPageBtn.addEventListener("click", () => { currentPage++; loadRecent(); });

function openRecentImage(item) {
    currentViewingItem = item;
    currentViewMode = "translated";
    recentImage.src = item.image || item.translated;
    recentGridView.classList.add("hidden");
    recentDetailView.classList.remove("hidden");
    recentDetailView.classList.add("flex");
}

recentBackBtn.addEventListener("click", () => {
    recentDetailView.classList.add("hidden"); recentDetailView.classList.remove("flex");
    recentGridView.classList.remove("hidden");
    currentViewingItem = null;
});
recentFlipBtn.addEventListener("click", () => {
    if (currentViewMode === "translated") currentViewMode = "original";
    else if (currentViewMode === "original" && currentViewingItem.inpainted) currentViewMode = "inpainted";
    else currentViewMode = "translated";
    if (currentViewMode === "original") recentImage.src = currentViewingItem.original;
    else if (currentViewMode === "inpainted") recentImage.src = currentViewingItem.inpainted;
    else recentImage.src = currentViewingItem.image;
});
recentDownloadBtn.addEventListener("click", () => {
    if (!currentViewingItem) return;
    const link = document.createElement("a");
    link.href = recentImage.src;
    link.download = `genji_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
recentDeleteBtn.addEventListener("click", async () => {
    if (!currentViewingItem) return;
    try { await translationCache.delete(currentViewingItem.key); } catch (e) {
        await new Promise(resolve => browser.runtime.sendMessage({ type: "delete_recent", key: currentViewingItem.key }, resolve));
    }
    recentBackBtn.click();
    loadRecent();
});

retentionSelect.addEventListener("change", async () => {
    localStorage.setItem("recent_ttl", retentionSelect.value);
    try { await translationCache.cleanup(parseInt(retentionSelect.value)); } catch (e) {}
    loadRecent();
});

autoSaveToggle.addEventListener("change", (e) => {
    if (e.target.checked) {
        browser.permissions.request({ permissions: ["downloads"] }, (granted) => {
            if (granted) browser.storage.sync.set({ genji_auto_save: true });
            else { e.target.checked = false; browser.storage.sync.set({ genji_auto_save: false }); }
        });
    } else {
        browser.storage.sync.set({ genji_auto_save: false });
    }
});
autoSaveFolderInput.addEventListener("change", (e) => {
    let value = e.target.value.trim().replace(/^\/+|\/+$/g, "").replace(/[<>:"|?*]/g, "");
    if (!value) value = "GenjiTranslations";
    e.target.value = value;
    browser.storage.sync.set({ genji_auto_save_folder: value });
});

enabledCheckbox.addEventListener("change", () => {
    browser.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        try { browser.storage.sync.set({ ["genji_" + tabs[0].url.split("/")[2]]: enabledCheckbox.checked }); } catch (e) {}
    });
});

// ─── Initialize all settings from storage ────────────────────────────────────
function initialize() {
    browser.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        let stored_url = "genji_extension";
        try { stored_url = "genji_" + tabs[0].url.split("/")[2]; } catch (e) {}

        browser.storage.sync.get({
            [stored_url]: "na",
            genji_default_enabled: true,
            translation_model: "gemini-3.1-flash-lite",
            genji_target_lang: "en",
            genji_font: "wildwords",
            genji_stroke_enabled: true,
            genji_bubbles_only: false,
            genji_context_sharing: false,
            genji_legacy_inpaint: false,
            genji_location: "tl",
            genji_custom_prompt: "",
            genji_min_font_size: 6,
            genji_text_alignment: "auto",
            autocache: false,
            genji_min_image_size: 200,
            genji_auto_save_folder: "GenjiTranslations",
            genji_byok_openrouter: "", genji_byok_google: "",
            genji_byok_openai: "", genji_byok_anthropic: "",
            genji_byok_deepseek: "", genji_byok_xai: "",
            genji_byok_local: "", genji_byok_local_url: "", genji_byok_local_model: ""
        }, (result) => {
            setPage("home");

            // BYOK inputs
            if (document.getElementById("byok-local-url-input"))
                document.getElementById("byok-local-url-input").value = result.genji_byok_local_url || "";
            if (document.getElementById("byok-local-model-input"))
                document.getElementById("byok-local-model-input").value = result.genji_byok_local_model || "";

            updateModelSelectDropdown().then(() => {
                modelSelect.value = result.translation_model;
            });

            languageSelect.value = result.genji_target_lang;
            fontSelect.value = result.genji_font;
            minFontSizeInput.value = result.genji_min_font_size;
            textAlignmentSelect.value = result.genji_text_alignment;
            defaultEnabled.checked = result.genji_default_enabled;
            updateStrokeBtnState(result.genji_stroke_enabled);
            updateBubblesOnlyBtnState(result.genji_bubbles_only);
            updateLegacyBtnState(result.genji_legacy_inpaint);
            updateContextSharingBtnState(result.genji_context_sharing);
            autocache.checked = result.autocache;
            minImageSizeInput.value = result.genji_min_image_size;
            minImageSizeValue.textContent = result.genji_min_image_size + "px";
            setGenjiLocation(result.genji_location);
            customPromptInput.value = result.genji_custom_prompt;
            customPromptCounter.textContent = `${result.genji_custom_prompt.length}/1000`;
            autoSaveFolderInput.value = result.genji_auto_save_folder;

            byokProviders.forEach(provider => {
                const input = document.getElementById(`byok-${provider}-input`);
                if (input) {
                    const savedVal = result[`genji_byok_${provider}`];
                    if (savedVal) {
                        input.value = maskApiKey(savedVal);
                        updateBYOKIndicator(provider, true);
                    } else {
                        input.value = "";
                    }
                }
            });

            if (result[stored_url] == "na") {
                enabledCheckbox.checked = result.genji_default_enabled;
            } else {
                enabledCheckbox.checked = result[stored_url];
            }
        });
    });
}

// ─── UI state update helpers ─────────────────────────────────────────────────
function updateStrokeBtnState(checked) {
    textStroke.style.background = checked ? "#00d9ff" : "#161b22";
    textStroke.style.color = checked ? "#0d1117" : "#e6edf3";
}
function updateBubblesOnlyBtnState(checked) {
    bubblesOnly.style.background = checked ? "#00d9ff" : "#161b22";
    bubblesOnly.style.color = checked ? "#0d1117" : "#e6edf3";
}
function updateLegacyBtnState(checked) {
    legacyInpaint.style.background = checked ? "#00d9ff" : "#161b22";
    legacyInpaint.style.color = checked ? "#0d1117" : "#e6edf3";
}
function updateContextSharingBtnState(checked) {
    contextSharing.style.background = checked ? "#d29922" : "#161b22";
    contextSharing.style.color = checked ? "#0d1117" : "#e6edf3";
}
function setGenjiLocation(location) {
    if (location === "tl") {
        genjiTL.style.background = "#00d9ff";
        genjiTR.style.background = "#30363d";
    } else {
        genjiTL.style.background = "#30363d";
        genjiTR.style.background = "#00d9ff";
    }
}

function isMobile() {
    const ua = navigator?.userAgentData?.mobile;
    if (ua === undefined) return navigator.userAgent.toLowerCase().includes("mobile");
    return ua;
}
function isSafari() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium");
}

// Error handling (logs to console only — no server reporting in Genji)
function sendError(error, loc) {
    console.error(`[Genji Popup] Error in ${loc}:`, error);
}
