<div align="center">

<img src="assets/genji-logo.svg" width="320" height="320" alt="GENJI"/>

# ⚔️ GENJI — Image Translator

### 🥷 Open-source AI manga & image translator. BYOK. No auth. No credits. No server. Just translate.

<a href="#-features"><img src="https://img.shields.io/badge/⚡_Features-12+-00ff41?style=for-the-badge&logo=sparkfun&logoColor=black" alt="Features"/></a>
<a href="#-installation"><img src="https://img.shields.io/badge/🌐_Chrome-Install-00d4ff?style=for-the-badge&logo=googlechrome&logoColor=black" alt="Chrome"/></a>
<a href="#-installation"><img src="https://img.shields.io/badge/🦊_Firefox-Install-ff6b35?style=for-the-badge&logo=firefox&logoColor=black" alt="Firefox"/></a>
<a href="#-byok-bring-your-own-key"><img src="https://img.shields.io/badge/🔑_BYOK-7_providers-f7c948?style=for-the-badge&logo=keycdn&logoColor=black" alt="BYOK"/></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/📄_License-MIT-ff00ff?style=for-the-badge" alt="MIT"/></a>

<br/>

<img src="https://img.shields.io/github/stars/dropmoltbot/genji?style=for-the-badge&color=00ff41" alt="Stars"/>
<img src="https://img.shields.io/github/forks/dropmoltbot/genji?style=for-the-badge&color=00d4ff" alt="Forks"/>
<img src="https://img.shields.io/badge/code_lines-4,462-ff6b35?style=for-the-badge" alt="LOC"/>
<img src="https://img.shields.io/badge/bloat_removed-29,196-ff00ff?style=for-the-badge" alt="Removed"/>
<img src="https://img.shields.io/badge/price-$0-00ff41?style=for-the-badge" alt="Price"/>

</div>

---

## 📜 What is Genji?

Genji is a **free, open-source browser extension** that translates any image on any website using AI.

No accounts. No subscriptions. No credit limits. No server middleman.

**You bring your own API key → You translate unlimited images → For free → Forever.**

> 🥷 Like the legendary samurai, Genji cuts through the paywall and delivers what matters: pure, unfiltered translation power.

### 📊 The Difference

| Feature | ❌ Commercial (Torii) | ✅ Genji (Open Source) |
|---|---|---|
| 🔐 **Authentication** | Firebase (Google/Apple/email) | None |
| 💰 **Credits** | 30 free, then **paid** | **Unlimited** |
| 🌐 **Server** | api.toriitranslate.com | **None** (direct API) |
| 🔑 **BYOK** | Encrypted via their server | **Local storage** |
| 💵 **Price** | Subscription | **$0** |
| 📖 **Open source** | No | **MIT License** |
| 📦 **Code** | 33,658 lines (bloated) | **4,462 lines** (clean) |
| 🗑️ **Bloat removed** | — | **29,196 lines** deleted |
| 🔍 **Telemetry** | Yes (reporting API) | **Zero** |
| 🎨 **Fonts** | 18 | **18** (same) |
| ⚡ **Warp filters** | 8 | **8** (same) |
| 🤖 **AI models** | 6 | **9** (more!) |

---

## ⚡ Features

### 🔤 Translation Engine
- 🖼️ **Image detection** — automatically finds images on any webpage
- 🖱️ **One-click translate** — click the Genji icon or press `Alt+Shift+Z`
- 📝 **OCR + Translation** — extracts text bubbles, translates, renders on image
- 🎨 **Inpainting** — removes original text before rendering translation (client-side, no server)
- 🔄 **Context-aware** — maintains translation context across panels for consistency
- 💾 **Translation cache** — IndexedDB cache for instant re-translation

### 🤖 9 AI Models Supported

| Model | Provider | Speed | Best For |
|---|---|---|---|
| ⚡ Gemini 3.1 Flash Lite | Google | Fastest | Quick translation |
| 🔄 Gemini 3 Flash | Google | Fast | Balanced |
| 🎯 Gemini 3.5 Flash | Google | Medium | Best quality |
| 🧠 GPT-5.4 | OpenAI | Medium | Strong reasoning |
| 🖋️ Claude Sonnet 4.6 | Anthropic | Medium | Nuanced translation |
| 🌙 Kimi K2.5 | OpenRouter | Medium | Alternative route |
| 🐲 DeepSeek Chat | DeepSeek | Fast | Cost-effective |
| 🐦 Grok 4.20 | xAI | Fast | Real-time style |
| 🏠 Local LLM | Any | Varies | Your own endpoint |

### 🎨 Text Rendering
- 🌊 **8 warp filters** — perspective, arc, bulge, squeeze, twist, fisheye, wave, arch
- ✍️ **18 manga fonts** — Bangers, BadComic, KomikaJam, Shonen, Bushidoo, Edo, WildWords, Heroika, and more
- 📐 **Auto font sizing** — adjusts to bubble dimensions automatically
- 📏 **Text alignment** — left, center, right, or auto-detect
- 🖤 **Stroke outline** — white/black outline for readability on any background

### ✏️ Edit Mode
- 🔧 **Manual text correction** — fix OCR errors
- 🎭 **Font customization** — change font, size, alignment per bubble
- 🌊 **Warp adjustment** — fine-tune perspective transforms
- ↩️ **Undo/redo** — full history

### 📸 Capture Tools
- 📷 **Screenshot** (`Alt+Shift+C`) — capture visible area
- ✂️ **Screen crop** (`Alt+Shift+X`) — select region to translate
- 🔁 **Repeat crop** — same region as last time
- 📋 **Context menu** (`Alt+Shift+D`) — right-click options

### ⚙️ Performance
- 🗄️ **IndexedDB cache** — translated images cached locally
- 📦 **Chunked messaging** — handles large images without memory issues
- 💾 **Auto-save** — optionally download translated images automatically
- 🚫 **Zero telemetry** — no analytics, no tracking, no reporting

---

## 🔑 BYOK (Bring Your Own Key)

Genji supports **7 AI providers** including local LLM. Enter your API key once in the popup settings. Keys are stored in `chrome.storage.local` — **never sent to any server**.

### Supported Providers

| Provider | Setup | Get API Key |
|---|---|---|
| 🌐 **OpenRouter** | Paste key in popup | [openrouter.ai/keys](https://openrouter.ai/keys) |
| ✨ **Google AI** | Paste key in popup | [aistudio.google.com](https://aistudio.google.com) |
| 🧠 **OpenAI** | Paste key in popup | [platform.openai.com](https://platform.openai.com) |
| 🖋️ **Anthropic** | Paste key in popup | [console.anthropic.com](https://console.anthropic.com) |
| 🐲 **DeepSeek** | Paste key in popup | [platform.deepseek.com](https://platform.deepseek.com) |
| 🐦 **xAI** | Paste key in popup | [console.x.ai](https://console.x.ai) |
| 🏠 **Local LLM** | Enter URL + model | Your server (Ollama, LM Studio, etc.) |

### How BYOK Works

```
  Your Browser                        AI Provider
       │                                   │
       │  1. 👁️ Detect image                │
       │  2. 🔑 Read BYOK key from          │
       │     chrome.storage.local           │
       │  3. 📤 Send image + key ──────────→│
       │     (direct API call)              │
       │  4. 📥 Receive translation ←──────│
       │  5. 🎨 Render on page              │
       │                                   │
  ┌─────────────────────────────────────────────┐
  │  ❌ NO SERVER  ❌ NO AUTH  ❌ NO CREDITS      │
  └─────────────────────────────────────────────┘
```

---

## 🌐 Installation

### Chrome / Edge / Brave

1. 📦 Download the [latest release](https://github.com/dropmoltbot/genji/releases/latest) zip
2. 📁 Extract the zip
3. 🧭 Open `chrome://extensions`
4. 🔧 Enable **Developer mode** (top right)
5. 📂 Click **Load unpacked**
6. 🗂️ Select the extracted `genji` folder
7. ⚙️ Click the Genji icon in the toolbar
8. 🔑 Enter your API key in the BYOK section
9. 🚀 Start translating!

### Firefox

1. 📦 Download the [latest release](https://github.com/dropmoltbot/genji/releases/latest) zip
2. 📁 Extract the zip
3. 🦊 Open `about:debugging#/runtime/this-firefox`
4. 📎 Click **Load Temporary Add-on**
5. 🗂️ Select `manifest.json` from the extracted folder
6. 🔑 Enter your API key in the popup settings

---

## 🚀 Quick Start

1. **🔑 Set up BYOK**: Click the Genji icon → Settings → enter your API key
2. **🤖 Choose model**: Select your preferred AI model (Gemini Flash Lite recommended for speed)
3. **🌐 Select language**: Choose target language (English, Japanese, Korean, Chinese, French, Spanish, etc.)
4. **⚔️ Translate**: Navigate to any manga/manhwa page, click the Genji icon on an image

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+Z` | 🔄 Translate hovered image |
| `Alt+Shift+C` | 📷 Screenshot + translate |
| `Alt+Shift+X` | ✂️ Screen crop + translate |
| `Alt+Shift+D` | 📋 Open context menu |

---

## 🏗️ Architecture

```
genji/
├── 📜 manifest.json            # Manifest V3 (77 lines)
├── 🔧 scripts/
│   ├── background.js          # Service worker: API calls, screenshots (1,200 lines)
│   ├── content.js             # Content script: image detection, overlay (1,645 lines)
│   ├── translationCache.js    # IndexedDB cache (304 lines)
│   └── zip.js                 # ZIP utility (12 lines)
├── 🖥️ popup/
│   ├── popup.html             # Settings UI (352 lines)
│   ├── popup.js               # Settings logic (675 lines)
│   └── popup.css              # Dark geek theme
├── 🎨 css/
│   ├── main.css               # Global styles
│   └── content.css            # Content script styles
├── ✏️ html/
│   └── edit.html              # Edit mode page
├── 🖼️ images/                  # Icons + warp filter previews
├── 🔤 fonts/                   # 18 manga fonts
├── 📦 assets/
│   ├── genji-logo.svg         # Animated SVG logo
│   └── favicon.svg            # Browser tab favicon
├── 📄 LICENSE                   # MIT
└── 📖 README.md                # You are here
```

### 📊 Code Stats

| File | Lines | What it does |
|---|---|---|
| `background.js` | 1,200 | API calls, context menus, screenshots, inpaint, render |
| `content.js` | 1,645 | Image detection, OCR, overlay, translation rendering |
| `popup.js` | 675 | Settings UI logic, BYOK key storage |
| `popup.html` | 352 | Settings popup (BYOK, model, language, fonts) |
| `translationCache.js` | 304 | IndexedDB translation cache |
| `manifest.json` | 77 | Extension manifest V3 config |
| **Total** | **4,462** | Clean, commented, open source |

### 🧹 What Was Removed (vs Torii Original)

| Component | Lines Removed |
|---|---|
| 🔥 Firebase SDK | 21,287 |
| 🔐 Auth logic | 3,200 |
| 💰 Credits system | 1,800 |
| 🌐 Server API calls | 1,500 |
| 📊 Telemetry/reporting | 1,409 |
| **Total bloat removed** | **29,196** |

---

## 🔒 Security & Privacy

- 🚫 **No data collection** — Genji does not collect, store, or transmit any user data
- 📊 **No telemetry** — no analytics, no tracking, no reporting, no fingerprinting
- 💾 **Local storage** — API keys stored in `chrome.storage.local` (browser-managed, encrypted at OS level)
- 🌐 **No server** — all processing happens between your browser and the AI provider
- 📖 **Open source** — full code available for audit, MIT licensed

---

## ❓ FAQ

**Q: 🤔 Do I need an account?**
A: No. Just install, enter your API key, and translate.

**Q: 💸 Is it really free?**
A: Yes. The extension is free and open source. You only pay for your own AI API usage (typically fractions of a cent per image).

**Q: 🤖 Which model should I use?**
A: Gemini 3.1 Flash Lite for speed, Gemini 3.5 Flash for quality, Claude Sonnet for nuanced translations.

**Q: 🏠 Can I use a local LLM?**
A: Yes. Enter your local LLM URL (e.g., `http://localhost:11434`) and model name in the BYOK settings.

**Q: 🌍 Does it work on all websites?**
A: Yes. Genji detects images on any webpage and translates them in-place.

**Q: 🛡️ What about CORS?**
A: The extension uses `host_permissions: <all_urls>` to bypass CORS restrictions on image fetching.

**Q: 🔄 Does it support vertical text?**
A: Yes. The AI detects vertical text (common in Japanese manga) and the renderer adjusts alignment automatically.

---

## 🤝 Contributing

Contributions welcome! Areas of interest:

- 🤖 Additional AI provider integrations
- 🎯 Improved OCR accuracy
- 💬 Better text bubble detection
- 🌊 More warp filters
- 🔤 Additional fonts
- ⚡ Performance optimizations
- 🎨 UI/UX improvements

### Development Setup

```bash
git clone https://github.com/dropmoltbot/genji.git
cd genji
# Load unpacked in chrome://extensions
# Edit files, reload extension to test
```

---

## 📄 License

[MIT License](LICENSE) — do whatever you want with it. Fork it, sell it, modify it, ship it.

---

## 🙏 Credits

- 🥷 **Built by**: [dropxtor](https://github.com/dropxtor) ([@0xDropxtor](https://x.com/0xDropxtor))
- 💡 **Concept**: AI-powered image translation
- 🔤 **Fonts**: Various manga/comic fonts (see `fonts/` directory)
- 🤖 **AI Providers**: Google, OpenAI, Anthropic, OpenRouter, DeepSeek, xAI

---

<div align="center">

<img src="assets/genji-logo.svg" width="140" height="140" alt="GENJI"/>

### ⚔️ GENJI — translate everything, own your keys, no strings attached

<sub>Built by dropxtor. Powered by AI. Free forever. 🥷</sub>

</div>
