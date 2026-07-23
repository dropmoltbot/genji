# Genji Image Translator

**Open-source AI manga & image translator for Chrome/Firefox. Bring Your Own Keys (BYOK) — no accounts, no credits, no server.**

Genji translates any image on any website using AI providers you control directly: OpenAI (GPT), Google Gemini, Anthropic Claude, OpenRouter, DeepSeek, xAI (Grok), or your own local LLM. Your API key never leaves your browser — there is no intermediate server, no authentication wall, and no credit system.

Reverse-engineered from the Torii Image Translator browser extension, with the entire Firebase auth/credit/subscription layer **removed** and replaced with direct BYOK API calls.

## Features

- 🖼️ **Detect and translate images on any webpage** — manga, manhwa, manhua, screenshots, or any image element
- 🔑 **BYOK (Bring Your Own Key)** — use your own API keys for every supported provider
- 🚫 **No auth, no credits, no subscription** — unlimited translations, you pay your provider directly
- 🤖 **Multiple AI providers** — Google Gemini, OpenAI GPT, Anthropic Claude, OpenRouter, DeepSeek, xAI Grok, local LLM
- 🎨 **Warp filters** — perspective, arc, bulge, squeeze, twist, fisheye, wave, arch for fitting text to speech bubbles
- 📝 **Edit mode** — erase, paint, inpaint, OCR, add text, and warp text directly on the canvas
- 🔤 **17 bundled manga fonts** — WildWords, Bangers, KomikaJam, Edo, Shonen, Heroika, and more
- 🌍 **130+ target languages**
- 💾 **Translation cache** (IndexedDB) — avoid re-translating the same images
- 📸 **Screenshot & Screen Crop** — capture and translate any part of the viewport
- 🖥️ **Dark geek theme** popup UI

## Installation

### Chrome / Edge / Brave

1. Download or clone this repository
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `genji/` folder
6. Pin the Genji extension to your toolbar

### Firefox

1. Download or clone this repository
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select the `manifest.json` file inside the `genji/` folder

## Configuration

1. Click the Genji icon in your toolbar
2. Go to **BYOK** (Bring Your Own Keys)
3. Enter your API key for at least one provider:
   - **Google Gemini**: [Get key](https://aistudio.google.com/api-keys)
   - **OpenAI (GPT)**: [Get key](https://platform.openai.com/api-keys)
   - **Anthropic (Claude)**: [Get key](https://platform.anthropic.com/)
   - **OpenRouter (Kimi, etc.)**: [Get key](https://openrouter.ai/keys)
   - **DeepSeek**: [Get key](https://platform.deepseek.com/api_keys)
   - **xAI (Grok)**: [Get key](https://console.x.ai/)
   - **Local LLM**: Set Base URL + Model Name (OpenAI-compatible API)
4. Select your preferred translation model
5. Choose your target language and font
6. Done! Navigate to any page with images and use Alt+Shift+Z or the Genji overlay icon to translate

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+Z` | Translate image under cursor |
| `Alt+Shift+X` | Screen crop (drag to select area) |
| `Alt+Shift+C` | Screenshot full page |
| `Alt+Shift+D` | Open context menu |

## Supported Models

| Model | Provider | Notes |
|-------|----------|-------|
| Gemini 3.1 Flash Lite | Google | Fast, economical |
| Gemini 3 Flash | Google | Higher quality |
| Gemini 3.5 Flash | Google | Best Google quality |
| GPT-5.4 | OpenAI | High quality OCR + translation |
| Claude Sonnet 4.6 | Anthropic | Excellent for manga context |
| Kimi K2.5 | OpenRouter | Good for CJK languages |
| DeepSeek V4 Flash | DeepSeek | Economical |
| Grok 4.20 | xAI | |
| Any local model | Self-hosted | OpenAI-compatible API (LM Studio, Ollama, etc.) |

## How It Works

```
Image detected on page
        │
        ▼
User clicks Genji icon or Alt+Shift+Z
        │
        ▼
Image fetched → compressed → sent to AI provider (BYOK key)
        │
        ▼
AI returns: OCR text + bounding boxes + translations
        │
        ▼
Canvas inpainting (removes original text)
        │
        ▼
Translated text rendered on inpainted image
with font + warp filters + stroke
        │
        ▼
Result displayed on page + cached (IndexedDB)
```

**No server in the middle.** The extension talks directly to your AI provider's API using your own key. The background service worker handles:

- Translate requests (→ AI provider)
- Screenshot capture
- Screen crop
- Context menu registration
- Download management
- Translation caching

The content script handles:

- Image detection on pages
- Overlay with Genji icon
- Translation rendering (canvas-based)
- Edit mode (erase, paint, inpaint, OCR, add text, warp)
- Warp filters (perspective, arc, bulge, squeeze, twist, fisheye, wave, arch)

## Architecture

```
genji/
├── manifest.json              # Manifest V3, no Firebase
├── scripts/
│   ├── background.js          # Service worker: BYOK API calls, screenshot, downloads
│   ├── content.js             # Image detection, overlay, OCR, translation, warp, edit
│   ├── translationCache.js    # IndexedDB translation cache
│   └── zip.js                 # JSZip utility (bundled)
├── popup/
│   ├── popup.html             # BYOK key inputs, settings UI
│   ├── popup.js               # Settings logic, key storage
│   └── popup.css             # Dark geek theme
├── css/
│   ├── main.css               # Main styles
│   └── content.css            # Content overlay styles
├── html/
│   └── edit.html              # Edit mode page
├── images/                    # Icons, SVGs, warp preview images
├── fonts/                     # 17 manga fonts
├── README.md
└── LICENSE
```

## Privacy

- Your API keys are stored in `chrome.storage.local` — never sent to any server other than the AI provider you chose
- No analytics, no error reporting to external servers
- Translation cache is stored locally in IndexedDB
- No accounts, no tracking, no telemetry

## Comparison with Torii

| Feature | Torii | Genji |
|---------|-------|-------|
| Authentication | Firebase (Google/Apple/email) | None — open source |
| Credits system | Yes (free trial + paid plans) | None — unlimited with your keys |
| API server | api.toriitranslate.com (intermediate) | Direct to AI provider |
| Key storage | Encrypted via server | Stored in browser storage |
| Error reporting | Sent to server | Local console only |
| Inpainting | Server-side GPU model | Client-side canvas |
| Cost | Credits per translation | You pay your API provider directly |

## Bundled Fonts

KomikaJam, Bangers, NotoSans, WildWords, Figtree, Edo, RIDIBatang, Bushidoo, Hayah, Itim, MogulIrina, BadComic, MaShanZheng, Kalam, HindSiliguri, Heroika, Shonen

## License

MIT License — see [LICENSE](LICENSE).

Reverse-engineered and open-sourced by **dropxtor**.

## Disclaimer

This is an independent open-source project not affiliated with Torii. The original Torii extension is a commercial product. Genji is provided as-is under the MIT license. You are responsible for the cost of your own API calls to your chosen AI provider.
