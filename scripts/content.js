// ============================================================================
// Genji Image Translator - Content Script
// ============================================================================
// Open-source AI image translator.
// NO Firebase, NO auth, NO credits. Direct BYOK API calls.
// Image detection → overlay → OCR → translate → inpaint → render text.
//
// built by dropxtor - MIT License
// ============================================================================

let enabled = true
let auto = false
let autocache = false
let autoError = false
let minImageSize = 200
let contextMenuPos = null
let takeScreenshot = false
let screencropping = false
let hasContextMenu = true
let contextMenuTargetElement = null
let isEditing = false
let genjiLocation = "tl"
let lastScreencropRect = null
let contextEnabled = false
let lastTranslationContext = null
const executingPromises = new Set()
const cursorPos = { x: 0, y: 0 }
const genjiTargets = new Map()
const currentURL = "genji_" + window.location.host

// ─── Overlay setup ──────────────────────────────────────────────────────────
const genjiStyle = document.createElement("link")
genjiStyle.rel = "stylesheet"
genjiStyle.href = browser.runtime.getURL("css/content.css")

const genjiOverlay = document.createElement("div")
genjiOverlay.id = "genji-extension-overlay"
genjiOverlay.style.setProperty("display", "block", "important")
genjiOverlay.style.setProperty("position", "static", "important")
genjiOverlay.style.setProperty("visibility", "visible", "important")
genjiOverlay.style.setProperty("opacity", "1", "important")
genjiOverlay.style.setProperty("z-index", "2147483647", "important")

const genjiDOM = genjiOverlay.attachShadow({ mode: "open" })
genjiDOM.appendChild(genjiStyle)

function injectOverlay() {
    const parent = document.documentElement || document.body
    if (parent && !parent.contains(genjiOverlay)) {
        parent.appendChild(genjiOverlay)
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectOverlay)
} else {
    injectOverlay()
}

const genjiObserver = new MutationObserver(() => {
    const parent = document.documentElement || document.body
    if (parent && !parent.contains(genjiOverlay)) {
        parent.appendChild(genjiOverlay)
    }
})
if (document.documentElement) {
    genjiObserver.observe(document.documentElement, { childList: true })
}

// ─── Font injection ─────────────────────────────────────────────────────────
function injectGenjiFonts() {
    const fontRegistry = [
        { name: "KomikaJam", file: "KomikaJam.ttf" },
        { name: "Bangers", file: "Bangers.ttf" },
        { name: "NotoSans", file: "NotoSans.ttf" },
        { name: "WildWords", file: "WildWords.otf" },
        { name: "Figtree", file: "Figtree.ttf" },
        { name: "Edo", file: "Edo.ttf" },
        { name: "RIDIBatang", file: "RIDIBatang.otf" },
        { name: "Bushidoo", file: "Bushidoo.ttf" },
        { name: "Hayah", file: "Hayah.otf" },
        { name: "Itim", file: "Itim.ttf" },
        { name: "MogulIrina", file: "MogulIrina.ttf" },
        { name: "BadComic", file: "BadComic.ttf" },
        { name: "MaShanZheng", file: "MaShanZheng.ttf" },
        { name: "Kalam", file: "Kalam.ttf" },
        { name: "HindSiliguri", file: "HindSiliguri.ttf" },
        { name: "Heroika", file: "Heroika.otf" },
        { name: "Shonen", file: "Shonen.otf" }
    ];

    let css = "";
    fontRegistry.forEach(font => {
        css += `@font-face { font-family: "${font.name}"; src: url("${browser.runtime.getURL(`fonts/${font.file}`)}"); }`;
    });

    const stylePage = document.createElement("style");
    stylePage.textContent = css;
    (document.head || document.documentElement).appendChild(stylePage);

    const styleShadow = document.createElement("style");
    styleShadow.textContent = css;
    genjiDOM.appendChild(styleShadow);
}

injectGenjiFonts();

// ─── Keyboard handling ─────────────────────────────────────────────────────
let globalKeyCallbacks = new Map()
for (const type of ["keydown", "keyup", "keypress"]) {
    window.addEventListener(type, (e) => {
        if (isEditing) {
            for (const callback of globalKeyCallbacks.values()) {
                if (type === "keydown") callback(e)
            }
            if (e.target?.id != "genji-hidden-input") e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
        } else {
            if (type === "keydown" && e.altKey && e.shiftKey) {
                contextMenuPos = structuredClone(cursorPos)
            }
        }
    }, { capture: true })
}

function handleScrollDuringEdit(e) {
    if (!isEditing) return
    const el = genjiDOM.getElementById("working-canvas")?.parentElement
    if (!el) return
    const deltaY = e.deltaY
    const tryingToScrollDown = deltaY > 0
    const tryingToScrollUp = deltaY < 0
    const canScrollDown = el.scrollTop < el.scrollHeight - el.clientHeight
    const canScrollUp = el.scrollTop > 0
    if ((tryingToScrollDown && !canScrollDown) || (tryingToScrollUp && !canScrollUp)) {
        e.preventDefault()
    }
}

document.addEventListener('wheel', handleScrollDuringEdit, { passive: false, capture: true })
document.addEventListener('touchmove', handleScrollDuringEdit, { passive: false, capture: true })

// ─── Keep-alive and element hash checking ───────────────────────────────────
setInterval(() => {
    browser.runtime.sendMessage({ type: "keep-alive" }).then(() => {}).catch(() => {})
}, 2000)

setInterval(async () => {
    for (const [targetElement, genjiData] of genjiTargets) {
        if (genjiData.genjiHash) {
            const hash = await hashElement(targetElement)
            if (hash !== genjiData.genjiHash) {
                removeGenjiFromTarget(targetElement, true)
            }
        }
    }
}, 1000)

// ─── Auto-translate and auto-cache intervals ─────────────────────────────────
setInterval(() => {
    try {
        if (autocache) {
            const images = document.getElementsByTagName("img")
            const canvases = document.getElementsByTagName("canvas")
            const process = async (targetElement) => {
                if ((genjiTargets.has(targetElement) && genjiTargets.get(targetElement).genjiState !== "original") || targetElement?.classList?.contains("genji-original")) return
                if (!((targetElement.clientHeight > 400 || targetElement.clientHeight > window.innerHeight / 2) && (targetElement.clientWidth > 400 || targetElement.clientWidth > window.innerWidth / 2))) return
                if (targetElement.tagName === "IMG" && !(targetElement.src || targetElement.currentSrc)) return
                executePromise(async () => {
                    const url = await getTargetUrl(targetElement)
                    const arrayBuffer = await getImageBlob(url, targetElement)
                    const context = contextEnabled ? (lastTranslationContext === null ? "None" : lastTranslationContext) : null
                    sendChunkedMessage({ type: "translate", url, site: window.location.href, actionType: "auto_cache", download: false, buffer: arrayBuffer, context, checkCacheOnly: true }).then((response) => {
                        if (response.success && !response.content.isCacheMiss) {
                            if (!genjiTargets.has(targetElement)) createGenji(targetElement, false)
                            const data = genjiTargets.get(targetElement)
                            if (data) {
                                data.originalURL = url
                                data.original = response.content.original
                                data.inpaintedImage = response.content.inpainted
                                data.textObjects = response.content.text
                                data.textObjectsTemp = response.content.text
                                removeExtraSources(targetElement)
                                if (targetElement.nodeName.toLowerCase() == "img") {
                                    targetElement.src = response.content.translated
                                    if (targetElement.srcset) targetElement.srcset = response.content.translated
                                    hashElement(targetElement).then(h => data.genjiHash = h)
                                } else if (targetElement.nodeName.toLowerCase() == "canvas") {
                                    const newImg = new Image()
                                    const ctx = targetElement.getContext("2d")
                                    newImg.onload = () => { ctx.drawImage(newImg, 0, 0, targetElement.width, targetElement.height); hashElement(targetElement).then(h => data.genjiHash = h) }
                                    newImg.src = response.content.translated
                                }
                                targetElement.style.opacity = "1"
                                data.genjiState = "translated"
                                data.genjiDownload.style.display = "flex"
                                data.genjiEdit.style.display = "flex"
                                data.genjiIcon.classList.add("genji-pulsing")
                                data.genjiIcon.classList.remove("genji-loading")
                            }
                        }
                    })
                }, 1)
            }
            for (const img of images) process(img)
            for (const canvas of canvases) process(canvas)
        }
    } catch (error) { sendError(error, "cache interval") }
}, 1000)

setInterval(() => {
    try {
        if (auto && !autoError) {
            const images = document.getElementsByTagName("img")
            const canvases = document.getElementsByTagName("canvas")
            for (const image of images) {
                if (image?.classList?.contains("genji-original")) continue
                if (genjiTargets.has(image)) {
                    const data = genjiTargets.get(image)
                    if (data.genjiState == "original") click(data.genjiIcon)
                } else if ((image.clientHeight > 400 || image.clientHeight > window.innerHeight / 2) && (image.clientWidth > 400 || image.clientWidth > window.innerWidth / 2) && (image.src || image.currentSrc)) {
                    if (enabled) createGenji(image, true)
                    else contextMenuClick(image)
                }
            }
            for (const canvas of canvases) {
                if (canvas?.classList?.contains("genji-original")) continue
                if (genjiTargets.has(canvas)) {
                    const data = genjiTargets.get(canvas)
                    if (data.genjiState == "original") click(data.genjiIcon)
                } else if ((canvas.clientHeight > 400 || canvas.clientHeight > window.innerHeight / 2) && (canvas.clientWidth > 400 || canvas.clientWidth > window.innerWidth / 2)) {
                    if (enabled) createGenji(canvas, true)
                    else contextMenuClick(canvas)
                }
            }
        }
    } catch (error) { sendError(error, "auto interval"); turnOffAuto() }
}, 1000)

// ─── Settings from storage ──────────────────────────────────────────────────
browser.storage.sync.get({ [currentURL]: "na", genji_default_enabled: true, genji_contextmenu: true, genji_location: "tl", autocache: false, genji_context_sharing: false, genji_min_image_size: 200 }, (result) => {
    if (result[currentURL] == "na") enabled = result.genji_default_enabled
    else enabled = result[currentURL]
    hasContextMenu = result.genji_contextmenu
    genjiLocation = result.genji_location
    autocache = result.autocache
    contextEnabled = result.genji_context_sharing
    minImageSize = result.genji_min_image_size || 200
})

browser.storage.onChanged.addListener((changes) => {
    for (let [key, { newValue }] of Object.entries(changes)) {
        if (key == currentURL) {
            enabled = newValue
            if (!enabled) for (const [el, data] of genjiTargets) { if (data.active) removeGenjiFromTarget(el) }
        }
        if (key == "genji_location") genjiLocation = newValue
        if (key == "autocache") autocache = newValue
        if (key == "genji_context_sharing") contextEnabled = newValue
        if (key == "genji_min_image_size") minImageSize = newValue
    }
})

// ─── Message listener (commands from background) ────────────────────────────
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
        if (msg.type == "command_contextmenu" || msg.type == "contextmenu_screenshot") contextMenuImage(contextMenuPos)
        else if (msg.type == "command_screenshot" || msg.type == "contextmenu_screenshot") contextMenuScreenshot()
        else if (msg.type == "command_screencrop" || msg.type == "contextmenu_screencrop") contextMenuScreencrop("shortcut")
        else if (msg.type == "command_repeatscreencrop" || msg.type == "contextmenu_repeatscreencrop") repeatScreencrop()
        else if (msg.type == "command_translate" || msg.type == "contextmenu_translate") contextMenuTranslate()
        else if (msg.type == "command_edit" || msg.type == "contextmenu_edit") contextMenuEdit()
        else if (msg.type == "command_download" || msg.type == "contextmenu_download") contextMenuDownload()
        else if (msg.type == "command_screencrop" || msg.type == "contextmenu_screencrop") contextMenuScreencrop("contextmenu")
        else if (msg.type == "contextmenu_auto") auto = !auto
    } catch (error) { sendError(error, "message listener") }
})

// ─── Context menu actions ───────────────────────────────────────────────────
function contextMenuImage(pos) {
    try {
        let targetElement = null
        const element = document.elementFromPoint(pos.x, pos.y)
        if (element?.nodeName?.toLowerCase() == "img" || element?.nodeName?.toLowerCase() == "canvas") targetElement = element
        if (!targetElement) {
            const subimage = getSubimage(element, pos)
            if (subimage?.nodeName?.toLowerCase() == "img" || subimage?.nodeName?.toLowerCase() == "canvas") targetElement = subimage
        }
        if (!targetElement) {
            for (const el of document.elementsFromPoint(pos.x, pos.y)) {
                if (el?.nodeName?.toLowerCase() == "img" || el?.nodeName?.toLowerCase() == "canvas") { targetElement = el; break }
            }
        }
        if (!targetElement) return
        if (genjiTargets.has(targetElement) && ["original", "translated", "error"].includes(genjiTargets.get(targetElement).genjiState)) {
            click(genjiTargets.get(targetElement).genjiIcon)
        } else if (!genjiTargets.has(targetElement) && enabled) {
            createGenji(targetElement, true)
        } else if (!enabled) {
            contextMenuClick(targetElement)
        }
    } catch (error) { sendError(error, "contextMenuImage") }
}

function contextMenuTranslate() {
    try {
        let targetElement = contextMenuTargetElement
        if (!targetElement) {
            const el = document.elementFromPoint(cursorPos.x, cursorPos.y)
            if (el?.nodeName?.toLowerCase() == "img" || el?.nodeName?.toLowerCase() == "canvas") targetElement = el
        }
        if (!targetElement) return
        contextMenuClick(targetElement)
    } catch (error) { sendError(error, "contextMenuTranslate") }
}

function contextMenuClick(targetElement) {
    try {
        const el = document.createElement("img")
        el.classList.add("genji-original")
        contextMenuTranslateImage(null, targetElement, "contextmenu", null)
    } catch (error) { sendError(error, "contextMenuClick") }
}

function contextMenuScreenshot() {
    browser.runtime.sendMessage({ type: "screenshot" }).then((response) => {
        if (response.success) {
            executePromise(async () => {
                displayImage(response.content.dataURL, "Screenshot")
            }, 1)
        }
    })
}

function contextMenuScreencrop(from) {
    screencropping = true
    browser.runtime.sendMessage({ type: "screenshot" }).then((response) => {
        if (response.success) {
            try {
                const screenImage = document.createElement("img")
                screenImage.classList.add("genji-screen-image")
                screenImage.src = response.content.dataURL
                screenImage.draggable = false

                const instructions = document.createElement("div")
                instructions.innerHTML = "Drag the area you want to translate or hit ESC to cancel"
                instructions.classList.add("genji-screen-instructions")

                const cropRect = document.createElement("div")
                cropRect.classList.add("genji-crop-rect")

                const MIN_W = 50, MIN_H = 70
                let startX, startY

                const startRect = (e) => {
                    if (e.target === screenImage) {
                        instructions.style.display = "none"
                        screenImage.setPointerCapture(e.pointerId)
                        startX = e.clientX; startY = e.clientY
                        cropRect.style.cssText = `left:${startX}px;top:${startY}px;width:0;height:0;border:2px dashed #00d9ff;`
                    }
                }
                const moveRect = (e) => {
                    if (screenImage.hasPointerCapture(e.pointerId)) {
                        let w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY)
                        if (w < MIN_W) w = MIN_W
                        if (h < MIN_H) h = MIN_H
                        const left = startX < e.clientX ? startX : startX - w
                        const top = startY < e.clientY ? startY : startY - h
                        cropRect.style.width = `${w}px`; cropRect.style.height = `${h}px`
                        cropRect.style.left = `${left}px`; cropRect.style.top = `${top}px`
                    }
                }
                const endRect = (e) => {
                    if (!screenImage.hasPointerCapture(e.pointerId)) return
                    screenImage.releasePointerCapture(e.pointerId)
                    if (cropRect.style.width == "0px" || cropRect.style.height == "0px") {
                        cropRect.style.width = `${MIN_W}px`; cropRect.style.height = `${MIN_H}px`
                    }

                    const cropTranslate = document.createElement("div")
                    cropTranslate.classList.add("genji-crop-translate")
                    cropTranslate.innerHTML = '<img class="genji-crop-translate-icon" src="' + browser.runtime.getURL("images/genji.png") + '">'
                    cropTranslate.addEventListener("pointerup", () => {
                        const rect = cropRect.getBoundingClientRect()
                        lastScreencropRect = rect
                        const canvas = document.createElement("canvas")
                        canvas.width = rect.width; canvas.height = rect.height
                        const ctx = canvas.getContext("2d")
                        const sx = rect.left, sy = rect.top
                        const tempImg = new Image()
                        tempImg.onload = () => { ctx.drawImage(tempImg, sx, sy, rect.width, rect.height, 0, 0, rect.width, rect.height); displayImage(canvas.toDataURL("image/png"), "ScreenCrop") }
                        tempImg.src = screenImage.src
                        cleanup()
                    })

                    const cropCancel = document.createElement("div")
                    cropCancel.classList.add("genji-crop-cancel")
                    cropCancel.innerHTML = '✕'
                    cropCancel.addEventListener("pointerup", () => { cleanup(); screencropping = false })

                    const resize = document.createElement("div")
                    resize.classList.add("genji-resize-element")
                    let resizing = false, rw, rh
                    resize.addEventListener("pointerdown", (e) => { e.stopPropagation(); resize.setPointerCapture(e.pointerId); resizing = true; rw = parseFloat(cropRect.style.width); rh = parseFloat(cropRect.style.height) })
                    resize.addEventListener("pointermove", (e) => {
                        if (resizing) {
                            const nw = Math.max(MIN_W, rw + e.movementX)
                            const nh = Math.max(MIN_H, rh + e.movementY)
                            cropRect.style.width = `${nw}px`; cropRect.style.height = `${nh}px`
                        }
                    })
                    resize.addEventListener("pointerup", (e) => { resizing = false; resize.releasePointerCapture(e.pointerId) })

                    cropRect.appendChild(cropTranslate)
                    cropRect.appendChild(cropCancel)
                    cropRect.appendChild(resize)
                }

                function cleanup() {
                    screenImage.remove(); instructions.remove(); cropRect.remove()
                }
                document.addEventListener("keydown", function escHandler(e) {
                    if (e.key === "Escape") { cleanup(); screencropping = false; document.removeEventListener("keydown", escHandler) }
                })

                screenImage.addEventListener("pointerdown", startRect)
                screenImage.addEventListener("pointermove", moveRect)
                screenImage.addEventListener("pointerup", endRect)

                genjiDOM.appendChild(screenImage)
                genjiDOM.appendChild(instructions)
                genjiDOM.appendChild(cropRect)
            } catch (error) { sendError(error, "contextMenuScreencrop") }
        }
    })
}

function repeatScreencrop() {
    if (lastScreencropRect) {
        browser.runtime.sendMessage({ type: "screenshot" }).then((response) => {
            if (response.success) {
                const rect = lastScreencropRect
                const canvas = document.createElement("canvas")
                canvas.width = rect.width; canvas.height = rect.height
                const ctx = canvas.getContext("2d")
                const tempImg = new Image()
                tempImg.onload = () => { ctx.drawImage(tempImg, rect.left, rect.top, rect.width, rect.height, 0, 0, rect.width, rect.height); displayImage(canvas.toDataURL("image/png"), "ScreenCrop") }
                tempImg.src = response.content.dataURL
            }
        })
    }
}

function contextMenuEdit() {
    let targetElement = contextMenuTargetElement
    if (!targetElement) {
        const el = document.elementFromPoint(cursorPos.x, cursorPos.y)
        if (el?.nodeName?.toLowerCase() == "img" || el?.nodeName?.toLowerCase() == "canvas") targetElement = el
    }
    if (targetElement) editImage(targetElement)
}

function contextMenuDownload() {
    let targetElement = contextMenuTargetElement
    if (!targetElement) {
        const el = document.elementFromPoint(cursorPos.x, cursorPos.y)
        if (el?.nodeName?.toLowerCase() == "img" || el?.nodeName?.toLowerCase() == "canvas") targetElement = el
    }
    if (targetElement) downloadImages(targetElement)
}

// ─── Display image (screenshot/screenCrop) ──────────────────────────────────
async function displayImage(dataUrl, source) {
    try {
        const img = new Image()
        img.src = dataUrl
        img.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);max-width:90vw;max-height:90vh;z-index:2147483647;box-shadow:0 0 30px rgba(0,217,255,0.5);"
        img.classList.add("genji-cropped-image-wrapper")

        const genjiData = { active: false, original: dataUrl, inpaintedImage: dataUrl, textObjects: [], textObjectsTemp: [], download: false, genjiState: "original" }
        genjiTargets.set(img, genjiData)
        genjiDOM.appendChild(img)

        createGenji(img, true)
    } catch (error) { sendError(error, "displayImage") }
}

// ─── Create Genji overlay icon on image ─────────────────────────────────────
function createGenji(targetElement, withClick) {
    try {
        const rect = targetElement.getBoundingClientRect()
        const size = 55

        const genji = document.createElement("div")
        genji.classList.add("genji")

        const icon = document.createElement("img")
        icon.title = "Translate image"
        icon.src = browser.runtime.getURL("images/genji.png")
        icon.classList.add("genji-icon")
        icon.style.width = `${size}px`
        icon.style.height = `${size}px`

        const notification = document.createElement("div")
        notification.classList.add("genji-notification")
        const notifClose = document.createElement("div")
        notifClose.classList.add("genji-notification-close")
        notifClose.innerText = "✖"
        notification.appendChild(notifClose)

        const autoIcon = document.createElement("img")
        autoIcon.src = browser.runtime.getURL("images/auto.svg")
        autoIcon.classList.add("genji-auto-icon")
        const autoBtn = document.createElement("div")
        autoBtn.classList.add("genji-auto")
        autoBtn.title = "Toggle auto translation"
        autoBtn.appendChild(autoIcon)
        autoBtn.addEventListener("pointerup", () => {
            auto = !auto; autoError = false
            for (const [, data] of genjiTargets) {
                if (!data.active) continue
                if (auto) data.genjiAutoIcon.classList.add("genji-rotating")
                else data.genjiAutoIcon.classList.remove("genji-rotating")
            }
        })
        if (auto) autoIcon.classList.add("genji-rotating")

        const downloadIcon = document.createElement("img")
        downloadIcon.src = browser.runtime.getURL("images/download.svg")
        downloadIcon.classList.add("genji-download-icon")
        const downloadBtn = document.createElement("div")
        downloadBtn.classList.add("genji-download")
        downloadBtn.title = "Download"
        downloadBtn.appendChild(downloadIcon)
        downloadBtn.addEventListener("pointerup", () => downloadImages(targetElement))

        const editIcon = document.createElement("img")
        editIcon.src = browser.runtime.getURL("images/edit.svg")
        editIcon.classList.add("genji-edit-icon")
        const editBtn = document.createElement("div")
        editBtn.classList.add("genji-edit")
        editBtn.title = "Edit the image"
        editBtn.appendChild(editIcon)
        editBtn.addEventListener("pointerup", () => { editImage(targetElement); editIcon.classList.add("genji-rotating") })

        const subUtility = document.createElement("div")
        subUtility.classList.add("genji-sub-utility")
        subUtility.appendChild(autoBtn)
        subUtility.appendChild(downloadBtn)
        subUtility.appendChild(editBtn)

        const utility = document.createElement("div")
        utility.classList.add("genji-utility")
        utility.appendChild(subUtility)
        utility.style.left = `${size / 1.4}px`

        genji.appendChild(icon)
        genji.appendChild(utility)
        genji.appendChild(notification)
        genjiDOM.appendChild(genji)

        placeGenji(genji, rect, size)

        icon.addEventListener("pointerup", (e) => {
            e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault()
            autoError = false
            genjiClick(targetElement)
        }, true)

        addHoverListener(icon, utility)
        addHoverListener(utility, icon)
        addScaleListener(autoBtn)
        addScaleListener(downloadBtn)
        addScaleListener(editBtn)

        const observer = observeRect(targetElement, (r) => {
            placeGenji(genji, r, size)
            if (cursorPos.x < r.left || cursorPos.x > r.right || cursorPos.y < r.top || cursorPos.y > r.bottom) {
                removeGenjiFromTarget(targetElement)
            }
        })

        genjiTargets.set(targetElement, {
            active: true, genji, genjiIcon: icon, genjiAuto: autoBtn, genjiAutoIcon: autoIcon,
            genjiUtility: utility, genjiNotification: notification, genjiDownload: downloadBtn,
            genjiDownloadIcon: downloadIcon, genjiEdit: editBtn, genjiEditIcon: editIcon,
            genjiObserver: observer, genjiSize: size, genjiState: "original", genjiHash: null,
            originalURL: null, inpaintedImage: null, original: null, textObjects: null,
            textObjectsTemp: null, download: false
        })

        if (withClick && !autoError) click(icon)
        observer.observe()
    } catch (error) { sendError(error, "createGenji") }
}

function placeGenji(genji, rect, size) {
    if (genjiLocation == "tl") {
        genji.style.left = `${rect.left + window.scrollX}px`
        genji.style.top = `${Math.min(Math.max(rect.top + window.scrollY, window.scrollY), rect.top + window.scrollY + rect.height - size)}px`
    } else if (genjiLocation == "tr") {
        genji.style.right = `${window.innerWidth - rect.right + window.scrollX}px`
        genji.style.top = `${Math.min(Math.max(rect.top + window.scrollY, window.scrollY), rect.top + window.scrollY + rect.height - size)}px`
    }
}

function addScaleListener(el) {
    el.addEventListener("mouseenter", () => el.classList.add("genji-scaling"))
    el.addEventListener("mouseleave", () => el.classList.remove("genji-scaling"))
}

function addHoverListener(el, ...attached) {
    el.addEventListener("mouseenter", () => { el.classList.add("genji-hover"); attached.forEach(a => a.classList.add("genji-hover")) })
    el.addEventListener("mouseleave", () => { el.classList.remove("genji-hover"); attached.forEach(a => a.classList.remove("genji-hover")) })
}

// ─── Genji click → translate ────────────────────────────────────────────────
function genjiClick(targetElement) {
    const data = genjiTargets.get(targetElement)
    if (!data) return

    if (data.genjiState == "translated" || data.genjiState == "error") {
        // Toggle back to original
        if (data.originalURL) {
            if (targetElement.nodeName.toLowerCase() == "img") {
                targetElement.src = data.originalURL
                if (targetElement.srcset) targetElement.srcset = data.originalURL
            }
            targetElement.classList.add("genji-original")
            data.genjiState = "original"
            data.genjiIcon.classList.remove("genji-pulsing")
        }
    } else if (data.genjiState == "original") {
        // Start translating
        data.genjiIcon.classList.add("genji-loading")
        data.genjiState = "translating"
        translateImage(data.originalURL || targetElement.src, targetElement, "click", null)
    }
}

// ─── Translate image ────────────────────────────────────────────────────────
function translateImage(url, targetElement, actionType, buffer) {
    return new Promise((resolve) => {
        try {
            const data = genjiTargets.get(targetElement)
            if (!data) { resolve(); return }

            data.genjiState = "translating"
            let targetUrl = url
            if (targetUrl?.startsWith("data") && buffer) targetUrl = null

            const context = contextEnabled ? (lastTranslationContext === null ? "None" : lastTranslationContext) : null

            sendChunkedMessage({ type: "translate", url: targetUrl, site: window.location.href, actionType, buffer, download: data.download, context, checkCacheOnly: false }).then((response) => {
                if (response.success) {
                    data.originalURL = url
                    data.original = response.content.original
                    data.inpaintedImage = response.content.inpainted
                    data.textObjects = response.content.text
                    data.textObjectsTemp = response.content.text

                    if (contextEnabled && response.content.context) lastTranslationContext = response.content.context

                    if (targetElement.nodeName.toLowerCase() == "img") {
                        targetElement.src = response.content.translated
                        if (targetElement.srcset) targetElement.srcset = response.content.translated
                        hashElement(targetElement).then(h => data.genjiHash = h)
                    } else if (targetElement.nodeName.toLowerCase() == "canvas") {
                        const newImg = new Image()
                        const ctx = targetElement.getContext("2d")
                        newImg.onload = () => { ctx.drawImage(newImg, 0, 0, targetElement.width, targetElement.height); hashElement(targetElement).then(h => data.genjiHash = h) }
                        newImg.src = response.content.translated
                    }

                    targetElement.style.opacity = "1"

                    if (data.genjiNotification?.style?.display == "flex") data.genjiNotification.style.display = "none"

                    data.genjiState = "translated"
                    data.genjiDownload.style.display = "flex"
                    data.genjiEdit.style.display = "flex"
                    data.genjiIcon.classList.add("genji-pulsing")
                } else {
                    showError(response.content.error, targetElement)
                    data.genjiIcon.classList.add("genji-scaling")
                }

                data.genjiIcon.classList.remove("genji-loading")
                if (data.download) downloadImages(targetElement)
                resolve()
            }).catch((error) => {
                showError("Failed to process image.", targetElement)
                sendError(error, "translate")
                data.genjiIcon.classList.remove("genji-loading")
                resolve()
            })
        } catch (error) {
            showError("Failed to process image.", targetElement)
            sendError(error, "translateImage")
            resolve()
        }
    })
}

function contextMenuTranslateImage(url, targetElement, actionType, buffer) {
    return new Promise((resolve) => {
        try {
            const removeSpinner = addSpinnerToImage(targetElement)
            let targetUrl = url
            if (targetUrl?.startsWith("data") && buffer) targetUrl = null
            const context = contextEnabled ? (lastTranslationContext === null ? "None" : lastTranslationContext) : null

            sendChunkedMessage({ type: "translate", url: targetUrl, site: window.location.href, actionType, buffer, download: false, context, checkCacheOnly: false }).then((response) => {
                genjiTargets.set(targetElement, { active: false, originalURL: url, original: response.content.original, inpaintedImage: response.content.inpainted, textObjects: response.content.text, textObjectsTemp: response.content.text })
                if (contextEnabled && response.content.context) lastTranslationContext = response.content.context
                const data = genjiTargets.get(targetElement)
                if (response.success) {
                    if (targetElement.nodeName.toLowerCase() == "img") {
                        targetElement.src = response.content.translated
                        if (targetElement.srcset) targetElement.srcset = response.content.translated
                        hashElement(targetElement).then(h => data.genjiHash = h)
                    } else if (targetElement.nodeName.toLowerCase() == "canvas") {
                        const newImg = new Image()
                        const ctx = targetElement.getContext("2d")
                        newImg.onload = () => { ctx.drawImage(newImg, 0, 0, targetElement.width, targetElement.height); hashElement(targetElement).then(h => data.genjiHash = h) }
                        newImg.src = response.content.translated
                    }
                    targetElement.style.opacity = "1"
                } else {
                    showError(response.content.error, targetElement)
                }
                contextMenuTargetElement = null
                removeSpinner()
                resolve()
            }).catch((error) => {
                showError("Failed to process image.", targetElement)
                sendError(error, "contextMenu translate")
                removeSpinner()
                resolve()
            })
        } catch (error) {
            showError("Failed to process image.", targetElement)
            sendError(error, "contextMenuTranslateImage")
            removeSpinner()
            resolve()
        }
    })
}

// ─── Spinner overlay on image ───────────────────────────────────────────────
function addSpinnerToImage(imgElement) {
    const parentStyle = getComputedStyle(imgElement.parentNode)
    if (parentStyle.position === "static") imgElement.parentNode.style.position = "relative"
    const rect = imgElement.getBoundingClientRect()
    const parentRect = imgElement.parentNode.getBoundingClientRect()

    const overlay = document.createElement("div")
    overlay.style.cssText = `position:absolute;top:${rect.top - parentRect.top}px;left:${rect.left - parentRect.left}px;width:${rect.width}px;height:${rect.height}px;display:flex;justify-content:center;align-items:center;background:rgba(0,0,0,0.7);z-index:9999;`
    const spinner = document.createElement("img")
    spinner.src = browser.runtime.getURL("images/genji.png")
    spinner.style.cssText = "width:60px;height:60px;animation:genji-spinning-anim 1s linear infinite;"
    overlay.appendChild(spinner)
    imgElement.parentNode.appendChild(overlay)

    const ro = new ResizeObserver(() => {
        const nr = imgElement.getBoundingClientRect()
        const npr = imgElement.parentNode.getBoundingClientRect()
        overlay.style.top = `${nr.top - npr.top}px`; overlay.style.left = `${nr.left - npr.left}px`
        overlay.style.width = `${nr.width}px`; overlay.style.height = `${nr.height}px`
    })
    ro.observe(imgElement)

    return () => { ro.disconnect(); overlay.remove() }
}

// ─── Download images ────────────────────────────────────────────────────────
async function downloadImages(targetElement) {
    try {
        const data = genjiTargets.get(targetElement)
        if (!data) return

        const allImages = [data.original, data.inpaintedImage, data.originalURL].filter(Boolean)
        const translations = data.textObjects || []

        // If we have a translated image, download it
        if (data.original && targetElement.src) {
            const link = document.createElement("a")
            link.href = targetElement.src
            link.download = `genji_${Date.now()}.jpg`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        }
    } catch (error) { sendError(error, "downloadImages") }
}

// ─── Edit image (edit mode) ─────────────────────────────────────────────────
async function editImage(targetElement) {
    let data = genjiTargets.get(targetElement)

    try {
        isEditing = true

        if (!data) {
            if (targetElement.nodeName.toLowerCase() == "img" || targetElement.nodeName.toLowerCase() == "canvas") {
                createGenji(targetElement, false)
                data = genjiTargets.get(targetElement)
            } else {
                isEditing = false
                return
            }
        }

        let originalSrc = data.original || targetElement.src
        let inpaintedSrc = data.inpaintedImage || originalSrc
        let textObjects = data.textObjects || []

        if (!data.original) {
            const targetUrl = await getTargetUrl(targetElement)
            try {
                if (targetUrl) {
                    const response = await fetch(targetUrl)
                    if (response?.ok) {
                        const blob = await response.blob()
                        originalSrc = await blobToImage(blob)
                    }
                }
            } catch (e) { originalSrc = targetElement.src }

            if (!originalSrc) {
                const response = await sendChunkedMessage({ type: "translate", url: targetUrl, site: window.location.href, actionType: "edit", buffer: null, download: true, context: null, checkCacheOnly: false })
                originalSrc = response.success ? response.content.translated : null
            }
            if (!originalSrc) { isEditing = false; showError("Failed to edit image.", targetElement, false); return }

            inpaintedSrc = originalSrc
            textObjects = []
        }

        data.genjiEditIcon?.classList?.remove?.("genji-rotating")
        data.textObjects = structuredClone(data.textObjectsTemp) || textObjects

        // Build edit page
        const editHTML = await fetch(browser.runtime.getURL("html/edit.html")).then(r => r.text())
        const editContainer = document.createElement("div")
        editContainer.innerHTML = editHTML
        genjiDOM.appendChild(editContainer)

        const canvas = editContainer.querySelector("#working-canvas")
        const ctx = canvas.getContext("2d")

        const originalImage = new Image()
        originalImage.crossOrigin = "anonymous"
        originalImage.src = originalSrc

        await new Promise(resolve => {
            if (originalImage.complete && originalImage.naturalWidth) resolve()
            else { originalImage.onload = resolve; originalImage.onerror = resolve }
        })

        canvas.width = originalImage.naturalWidth
        canvas.height = originalImage.naturalHeight
        ctx.drawImage(originalImage, 0, 0)

        // Setup edit mode controls
        let imageMode = "erase"
        let isActive = false
        let isDrawing = false
        let brushSize = 90
        let brushColor = "#ffffff"
        let activeText = null

        const modeButtons = {
            erase: editContainer.querySelector("#erase-mode"),
            paint: editContainer.querySelector("#paint-mode"),
            inpaint: editContainer.querySelector("#inpaint-mode"),
            ocr: editContainer.querySelector("#ocr-mode"),
            add: editContainer.querySelector("#add-mode"),
            warp: editContainer.querySelector("#warp-mode")
        }
        const settingsPanels = {
            erase: editContainer.querySelector("#erase-settings"),
            paint: editContainer.querySelector("#paint-settings"),
            inpaint: editContainer.querySelector("#inpaint-settings"),
            ocr: editContainer.querySelector("#ocr-settings"),
            add: editContainer.querySelector("#add-settings"),
            warp: editContainer.querySelector("#warp-settings")
        }

        function setMode(mode) {
            imageMode = mode
            Object.values(modeButtons).forEach(btn => btn?.classList?.remove("bg-blue-200"))
            Object.values(settingsPanels).forEach(panel => panel?.classList?.add("hidden"))
            if (modeButtons[mode]) modeButtons[mode].classList.add("bg-blue-200")
            if (settingsPanels[mode]) settingsPanels[mode].classList.remove("hidden")

            const titles = {
                erase: "Erase text regions",
                paint: "Paint over areas",
                inpaint: "Run AI inpainting",
                ocr: "Detect and extract text",
                add: "Add text to image",
                warp: "Warp text into shapes"
            }
            editContainer.querySelector("#mode-title").textContent = titles[mode] || "Edit mode"
        }

        Object.entries(modeButtons).forEach(([mode, btn]) => {
            if (btn) btn.addEventListener("click", () => setMode(mode))
        })
        setMode("erase")

        // Brush size
        const brushSizeInput = editContainer.querySelector("#erase-brush-size")
        const brushSizeValue = editContainer.querySelector("#erase-brush-size-value")
        if (brushSizeInput) {
            brushSizeInput.addEventListener("input", (e) => {
                brushSize = parseInt(e.target.value)
                brushSizeValue.textContent = `${brushSize}px`
            })
        }

        // Paint settings
        const paintBrushSize = editContainer.querySelector("#paint-brush-size")
        const paintColor = editContainer.querySelector("#paint-color")
        if (paintBrushSize) paintBrushSize.addEventListener("input", (e) => brushSize = parseInt(e.target.value))
        if (paintColor) paintColor.addEventListener("input", (e) => brushColor = e.target.value)

        // Inpaint button
        const runInpaint = editContainer.querySelector("#run-inpaint")
        if (runInpaint) {
            runInpaint.addEventListener("click", async () => {
                const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
                const response = await sendChunkedMessage({ type: "inpaint", image: dataUrl, textObjects: data.textObjects || [] })
                if (response.success) {
                    const inpaintedImg = new Image()
                    inpaintedImg.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(inpaintedImg, 0, 0) }
                    inpaintedImg.src = response.content.inpaintedImageSrc
                }
            })
        }

        // OCR button → re-run translation on the current canvas
        const runOcr = editContainer.querySelector("#run-ocr")
        if (runOcr) {
            runOcr.addEventListener("click", async () => {
                const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
                const response = await sendChunkedMessage({ type: "translate", url: null, site: window.location.href, actionType: "ocr", buffer: dataUrl, download: false, context: null, checkCacheOnly: false })
                if (response.success && response.content.text) {
                    data.textObjects = response.content.text
                    data.textObjectsTemp = response.content.text
                    // Redraw with new text
                    const baseImg = new Image()
                    baseImg.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(baseImg, 0, 0) }
                    baseImg.src = response.content.inpainted
                }
            })
        }

        // Canvas drawing
        let lastX = 0, lastY = 0
        canvas.addEventListener("pointerdown", (e) => {
            isDrawing = true
            const rect = canvas.getBoundingClientRect()
            const scaleX = canvas.width / rect.width
            const scaleY = canvas.height / rect.height
            lastX = (e.clientX - rect.left) * scaleX
            lastY = (e.clientY - rect.top) * scaleY
            drawAt(lastX, lastY)
        })
        canvas.addEventListener("pointermove", (e) => {
            if (!isDrawing) return
            const rect = canvas.getBoundingClientRect()
            const scaleX = canvas.width / rect.width
            const scaleY = canvas.height / rect.height
            const x = (e.clientX - rect.left) * scaleX
            const y = (e.clientY - rect.top) * scaleY
            drawLine(lastX, lastY, x, y)
            lastX = x; lastY = y
        })
        canvas.addEventListener("pointerup", () => isDrawing = false)
        canvas.addEventListener("pointerleave", () => isDrawing = false)

        function drawAt(x, y) {
            if (imageMode == "erase" || imageMode == "paint") {
                ctx.beginPath()
                ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
                ctx.fillStyle = imageMode == "erase" ? "#ffffff" : brushColor
                ctx.fill()
            }
        }

        function drawLine(x1, y1, x2, y2) {
            ctx.lineWidth = brushSize
            ctx.lineCap = "round"
            ctx.strokeStyle = imageMode == "erase" ? "#ffffff" : brushColor
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()
        }

        // Alt+scroll to change brush size
        canvas.addEventListener("wheel", (e) => {
            if (e.altKey) {
                e.preventDefault()
                brushSize = Math.max(5, Math.min(300, brushSize + (e.deltaY > 0 ? -5 : 5)))
                if (brushSizeInput) brushSizeInput.value = brushSize
                if (brushSizeValue) brushSizeValue.textContent = `${brushSize}px`
            }
        })

        // Toggle settings
        const toggleSettings = editContainer.querySelector("#toggle-settings")
        const settingsPanel = editContainer.querySelector("#settings")
        settingsPanel.classList.add("open")
        if (toggleSettings) {
            toggleSettings.addEventListener("click", () => {
                if (settingsPanel.classList.contains("open")) {
                    settingsPanel.classList.remove("open")
                } else {
                    settingsPanel.classList.add("open")
                }
            })
        }

        // Warp presets
        const warpPresets = editContainer.querySelectorAll(".warp-preset-btn")
        warpPresets.forEach(btn => {
            btn.addEventListener("click", () => {
                if (activeText !== null && data.textObjects) {
                    const warpType = btn.dataset.warp
                    const textObj = data.textObjects[activeText]
                    if (textObj) {
                        textObj.warp = warpType
                        const bend = parseInt(editContainer.querySelector("#warp-bend")?.value || "50")
                        textObj.warpBend = bend
                        renderTextWithWarp(ctx, textObj)
                    }
                }
            })
        })

        // Warp sliders
        const warpBend = editContainer.querySelector("#warp-bend")
        const warpBendValue = editContainer.querySelector("#warp-bend-value")
        if (warpBend) {
            warpBend.addEventListener("input", (e) => {
                warpBendValue.textContent = e.target.value
                if (activeText !== null && data.textObjects) {
                    const textObj = data.textObjects[activeText]
                    if (textObj) { textObj.warpBend = parseInt(e.target.value) }
                }
            })
        }

        // Reset
        editContainer.querySelector("#reset-btn")?.addEventListener("click", () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(originalImage, 0, 0)
            data.textObjects = structuredClone(data.textObjectsTemp) || []
        })

        // Save & Apply
        editContainer.querySelector("#save-btn")?.addEventListener("click", () => {
            const resultImage = canvas.toDataURL("image/jpeg", 0.92)
            if (targetElement.nodeName.toLowerCase() == "img") {
                targetElement.src = resultImage
                if (targetElement.srcset) targetElement.srcset = resultImage
            }
            cleanupEdit()
        })

        // Exit
        editContainer.querySelector("#exit-btn")?.addEventListener("click", cleanupEdit)

        function cleanupEdit() {
            editContainer.remove()
            isEditing = false
        }

    } catch (error) {
        sendError(error, "editImage")
        isEditing = false
    }
}

// ─── Warp text rendering ────────────────────────────────────────────────────
// Warp filters: perspective, arc, bulge, squeeze, twist, fisheye, wave, arch
function renderTextWithWarp(ctx, textObj) {
    if (!textObj.translated || !textObj.bbox) return
    const [x, y, w, h] = textObj.bbox
    const warpType = textObj.warp || "arc"
    const bend = textObj.warpBend || 50

    // Save context state
    ctx.save()

    // Create a temporary canvas for the text, then warp it
    const tempCanvas = document.createElement("canvas")
    tempCanvas.width = w
    tempCanvas.height = h
    const tempCtx = tempCanvas.getContext("2d")

    // Draw text onto temp canvas
    const fontSize = Math.max(6, Math.min(h * 0.85, w * 0.8))
    const fontFamily = textObj.font || "WildWords"
    tempCtx.font = `${fontSize}px ${fontFamily}`
    tempCtx.fillStyle = textObj.color || "#000000"
    tempCtx.textBaseline = "top"
    tempCtx.textAlign = "center"
    tempCtx.strokeStyle = getContrastColor(textObj.color || "#000000")
    tempCtx.lineWidth = Math.max(1, fontSize * 0.12)
    tempCtx.lineJoin = "round"

    const lines = wrapText(tempCtx, textObj.translated, w)
    const lineHeight = fontSize * 1.15
    lines.forEach((line, i) => {
        tempCtx.strokeText(line, w / 2, i * lineHeight)
        tempCtx.fillText(line, w / 2, i * lineHeight)
    })

    // Apply warp transformation
    applyWarp(ctx, tempCanvas, x, y, w, h, warpType, bend)

    ctx.restore()
}

function applyWarp(ctx, srcCanvas, x, y, w, h, warpType, bend) {
    const strength = bend / 100

    switch (warpType) {
        case "arc":
        case "arch":
            warpArc(ctx, srcCanvas, x, y, w, h, strength)
            break
        case "bulge":
            warpBulge(ctx, srcCanvas, x, y, w, h, strength)
            break
        case "squeeze":
            warpSqueeze(ctx, srcCanvas, x, y, w, h, strength)
            break
        case "twist":
            warpTwist(ctx, srcCanvas, x, y, w, h, strength)
            break
        case "fisheye":
        case "fish":
            warpFisheye(ctx, srcCanvas, x, y, w, h, strength)
            break
        case "wave":
            warpWave(ctx, srcCanvas, x, y, w, h, strength)
            break
        case "perspective":
            warpPerspective(ctx, srcCanvas, x, y, w, h, strength)
            break
        default:
            ctx.drawImage(srcCanvas, x, y)
    }
}

// Arc/Arch warp
function warpArc(ctx, src, x, y, w, h, strength) {
    const steps = 20
    const sliceH = h / steps
    for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps
        const offset = Math.sin(t * Math.PI) * strength * h * 0.3
        ctx.drawImage(src, 0, i * (h / steps), w, h / steps, x, y + i * sliceH - offset, w, sliceH)
    }
}

// Bulge warp
function warpBulge(ctx, src, x, y, w, h, strength) {
    const cx = x + w / 2, cy = y + h / 2
    const maxR = Math.min(w, h) / 2
    const steps = 16
    for (let i = 0; i < steps; i++) {
        const r = (i / steps) * maxR
        const scale = 1 + strength * (1 - i / steps) * 0.3
        const sw = w * scale, sh = h * scale
        ctx.drawImage(src, 0, 0, w, h, x - (sw - w) / 2, y - (sh - h) / 2, sw, sh)
    }
}

// Squeeze warp
function warpSqueeze(ctx, src, x, y, w, h, strength) {
    const steps = 10
    for (let i = 0; i < steps; i++) {
        const t = i / steps
        const scale = 1 - strength * Math.abs(0.5 - t) * 0.5
        const sw = w * scale
        ctx.drawImage(src, t * w * 0.1, 0, w * 0.9, h, x + (w - sw) / 2, y, sw, h)
    }
}

// Twist warp
function warpTwist(ctx, src, x, y, w, h, strength) {
    const steps = 16
    const sliceH = h / steps
    for (let i = 0; i < steps; i++) {
        const angle = strength * (i / steps - 0.5) * Math.PI * 0.5
        ctx.save()
        ctx.translate(x + w / 2, y + i * sliceH + sliceH / 2)
        ctx.rotate(angle)
        ctx.drawImage(src, 0, i * (h / steps), w, h / steps, -w / 2, -sliceH / 2, w, sliceH)
        ctx.restore()
    }
}

// Fisheye warp
function warpFisheye(ctx, src, x, y, w, h, strength) {
    const cx = w / 2, cy = h / 2
    const radius = Math.min(w, h) / 2
    const steps = 20
    for (let i = 0; i < steps; i++) {
        const r = (i / steps) * radius
        const distortion = strength * (1 - (r / radius) * (r / radius)) * 0.4
        const scale = 1 + distortion
        ctx.drawImage(src, cx - r, cy - r, r * 2, r * 2, x + (w - w * scale) / 2, y + (h - h * scale) / 2, w * scale, h * scale)
    }
}

// Wave warp
function warpWave(ctx, src, x, y, w, h, strength) {
    const steps = 16
    const sliceW = w / steps
    for (let i = 0; i < steps; i++) {
        const offset = Math.sin((i / steps) * Math.PI * 2) * strength * w * 0.1
        ctx.drawImage(src, i * (w / steps), 0, w / steps, h, x + i * sliceW + offset, y, sliceW, h)
    }
}

// Perspective warp
function warpPerspective(ctx, src, x, y, w, h, strength) {
    const steps = 16
    for (let i = 0; i < steps; i++) {
        const t = i / steps
        const scaleTop = 1 - strength * 0.5 * (1 - t)
        const scaleBot = 1 - strength * 0.5 * t
        const sliceH = h / steps
        const sliceW = w * (scaleTop + (scaleBot - scaleTop) * t)
        const xOffset = (w - sliceW) / 2
        ctx.drawImage(src, 0, i * (h / steps), w, h / steps, x + xOffset, y + i * sliceH, sliceW, sliceH)
    }
}

function getContrastColor(hexColor) {
    const hex = (hexColor || "#000000").replace("#", "")
    if (hex.length !== 6) return "#ffffff"
    const r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16)
    return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? "#ffffff" : "#000000"
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(" ")
    const lines = []
    let current = ""
    for (const word of words) {
        const test = current ? current + " " + word : word
        if (ctx.measureText(test).width <= maxWidth || !current) current = test
        else { lines.push(current); current = word }
    }
    if (current) lines.push(current)
    return lines.length > 0 ? lines : [text]
}

// ─── Get target URL from element ────────────────────────────────────────────
function getTargetUrl(targetElement) {
    if (takeScreenshot && !auto) return screenshot(targetElement)
    if (takeScreenshot && auto) return Promise.reject("Auto and screenshot are not supported at the same time.")

    return new Promise((resolve, reject) => {
        if (targetElement.nodeName.toLowerCase() == "img") {
            let url = null
            if (targetElement.srcset) {
                const parsed = getHighestResFromSrcset(targetElement)
                if (parsed) { try { url = new URL(parsed, document.baseURI).href } catch { url = parsed } }
            }
            if (!url) url = targetElement.currentSrc
            if (!url) url = targetElement.src
            if (url?.startsWith("blob:")) {
                const fromBlob = getImageFromBlob(targetElement)
                if (fromBlob) return resolve(fromBlob)
                return reject("Failed to get image from blob.")
            }
            if (!url) {
                const correct = getCorrectImage(targetElement)
                if (correct) return resolve(correct)
                return reject("Failed to get correct image.")
            }
            return resolve(url)
        } else if (targetElement.nodeName.toLowerCase() == "canvas") {
            try { return resolve(targetElement.toDataURL()) } catch { return reject("Failed to get canvas data URL.") }
        }
        return reject("Failed to get target URL.")
    })
}

function getHighestResFromSrcset(el) {
    try {
        const srcset = el.srcset
        if (!srcset) return null
        const entries = srcset.split(",").map(s => s.trim().split(/\s+/))
        let best = null, bestW = 0
        for (const [url, desc] of entries) {
            const w = desc ? parseInt(desc.replace("w", "")) : 0
            if (w > bestW) { bestW = w; best = url }
        }
        return best || entries[0]?.[0] || null
    } catch { return null }
}

function getImageFromBlob(targetElement) {
    try {
        const canvas = document.createElement("canvas")
        canvas.width = targetElement.naturalWidth || targetElement.width
        canvas.height = targetElement.naturalHeight || targetElement.height
        const ctx = canvas.getContext("2d")
        ctx.drawImage(targetElement, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL()
    } catch (error) { sendError(error, "getImageFromBlob"); return null }
}

function getCorrectImage(targetElement) {
    try {
        for (const el of document.elementsFromPoint(cursorPos.x, cursorPos.y)) {
            if (el?.nodeName?.toLowerCase() == "img" && el.src && el.clientWidth == targetElement.clientWidth && el.clientHeight == targetElement.clientHeight && !targetElement.isEqualNode(el)) return el.src
        }
    } catch (error) { sendError(error, "getCorrectImage") }
    return null
}

function getSubimage(element, pos) {
    try {
        if (!element) return null
        return element.querySelector("img") || element.querySelector("canvas") || element
    } catch { return element }
}

// ─── Screenshot ──────────────────────────────────────────────────────────────
async function screenshot(targetElement) {
    const response = await browser.runtime.sendMessage({ type: "screenshot" })
    if (response.success) {
        const img = new Image()
        img.src = response.content.dataURL
        await new Promise(r => { img.onload = r; img.onerror = r })
        const rect = targetElement.getBoundingClientRect()
        const canvas = document.createElement("canvas")
        canvas.width = rect.width; canvas.height = rect.height
        canvas.getContext("2d").drawImage(img, rect.left + window.scrollX, rect.top + window.scrollY, rect.width, rect.height, 0, 0, rect.width, rect.height)
        return canvas.toDataURL("image/png")
    }
    return null
}

// ─── Image blob helper ──────────────────────────────────────────────────────
async function getImageBlob(url, targetElement) {
    try {
        if (!url) return null
        if (url.startsWith("data:") || url.startsWith("blob:")) return null
        const response = await fetch(url)
        if (response?.ok) return await response.arrayBuffer()
    } catch (error) { sendError(error, "getImageBlob") }
    return null
}

async function blobToImage(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
    })
}

// ─── Remove utility functions ───────────────────────────────────────────────
function removeExtraSources(targetElement) {
    try {
        if (targetElement.parentNode?.nodeName?.toLowerCase() == "picture") {
            for (const s of targetElement.parentNode.getElementsByTagName("source")) targetElement.parentNode.removeChild(s)
        }
    } catch (error) { sendError(error, "removeExtraSources") }
}

function removeGenjiFromTarget(targetElement, force = false) {
    const data = genjiTargets.get(targetElement)
    if (data) {
        if (data.genjiState == "original" || force) {
            data.genji?.remove?.()
            data.genjiObserver?.unobserve?.()
            genjiTargets.delete(targetElement)
        }
    }
}

function turnOffAuto() {
    auto = false
    for (const [, data] of genjiTargets) {
        if (data.active) data.genjiAutoIcon?.classList?.remove("genji-rotating")
    }
}

// ─── Error display ──────────────────────────────────────────────────────────
function showError(errorMsg, targetElement, shouldChangeState = true) {
    try {
        // Genji-specific error messages (no Torii links)
        if (errorMsg?.includes("Failed to process image.")) {
            if (hasContextMenu && !isMobile()) {
                errorMsg = "Failed to process image. Try using <span style='background:#00d9ff;color:#000;border-radius:5px;padding:2px 5px'>Alt+Shift+D</span> or screenshot/screen crop."
            }
        }

        if (auto) { autoError = true; turnOffAuto() }

        const p = document.createElement("p")
        p.innerHTML = errorMsg

        const data = genjiTargets.get(targetElement)
        if (data?.genjiNotification) {
            data.genjiNotification.querySelectorAll("p").forEach(el => el.remove())
            data.genjiNotification.appendChild(p)
            data.genjiNotification.style.display = "flex"
            data.genjiNotification.style.maxWidth = `${Math.max(targetElement?.clientWidth || 0, 300)}px`
            data.genjiNotification.addEventListener("pointerup", (e) => {
                if (e.target?.tagName != "A") clearError(targetElement, shouldChangeState)
            })
            if (shouldChangeState) {
                data.genjiState = "error"
                data.genjiIcon.classList.remove("genji-loading")
            }
        } else {
            const notif = document.createElement("div")
            notif.classList.add("genji-notification")
            notif.innerHTML = errorMsg
            notif.style.display = "flex"
            notif.style.position = "absolute"
            notif.style.maxWidth = `${Math.max(targetElement?.clientWidth || 0, 300)}px`
            if (targetElement) placeGenji(notif, targetElement.getBoundingClientRect(), 200)
            genjiDOM.appendChild(notif)
        }
    } catch (error) { sendError(error, "showError") }
}

function clearError(targetElement, shouldChangeState = true) {
    const data = genjiTargets.get(targetElement)
    if (data?.genjiNotification) {
        data.genjiNotification.querySelectorAll("p").forEach(el => el.remove())
        data.genjiNotification.style.display = "none"
        if (shouldChangeState) {
            targetElement?.classList?.add("genji-original")
            data.genjiState = "original"
        }
    }
}

// ─── Element hashing (change detection) ────────────────────────────────────
async function hashElement(el) {
    if (el instanceof HTMLCanvasElement) {
        try {
            const ctx = el.getContext('2d')
            const data = ctx.getImageData(0, 0, el.width, el.height)
            return await hashData(data.data.buffer)
        } catch { return null }
    } else if (el instanceof HTMLImageElement) {
        try { return await hashData(new TextEncoder().encode(el.src)) } catch { return null }
    }
    return null
}

async function hashData(data) {
    let view = data instanceof ArrayBuffer ? new Uint8Array(data) : data
    let hash = 2166136261
    const len = view.length
    const maxSamples = 2048
    const step = len > maxSamples ? Math.ceil(len / maxSamples) : 1
    for (let i = 0; i < len; i += step) { hash ^= view[i]; hash = Math.imul(hash, 16777619) }
    return (hash >>> 0).toString(16).padStart(8, '0')
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function isMobile() {
    const ua = navigator?.userAgentData?.mobile
    if (ua === undefined) return navigator.userAgent.toLowerCase().includes("mobile")
    return ua
}

function isRTL(text) {
    return /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u08A0-\u08FF\u07C0-\u07FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)
}

function throttle(fn, limit) {
    let t
    return (...args) => { if (!t) { fn(...args); t = setTimeout(() => t = false, limit) } }
}

function click(el) {
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }))
}

function executePromise(fn, limit) {
    const key = Symbol()
    executingPromises.add(key)
    return fn().finally(() => executingPromises.delete(key))
}

function sendError(error, loc) {
    console.error(`[Genji Content] ${loc}:`, error)
    browser.runtime.sendMessage({ type: "error", message: error?.message || String(error), stack: error?.stack || "", loc }).catch(() => {})
}

// ─── Chunked messaging for large images ──────────────────────────────────────
async function sendChunkedMessage(message) {
    try {
        const transferId = "tr_" + Date.now() + "_" + Math.random()
        let hasLarge = false
        const propsToCheck = ["buffer", "url", "image", "mask"]

        for (const prop of propsToCheck) {
            let data = message[prop]
            if (!data) continue

            if (Array.isArray(data) || ArrayBuffer.isView(data) || data instanceof ArrayBuffer) data = new Blob([data])
            if (data instanceof Blob) data = await readChunkAsBase64(data)

            let isLarge = false, size = 0
            if (typeof data === 'string') {
                if (data.startsWith('data:') && prop !== "url") {
                    const commaIndex = data.indexOf(',')
                    if (commaIndex !== -1) data = data.substring(commaIndex + 1)
                }
                size = data.length
                isLarge = size > 10 * 1024 * 1024
            }

            if (isLarge) {
                hasLarge = true
                const CHUNK_SIZE = 10485759
                const totalChunks = Math.ceil(size / CHUNK_SIZE)
                for (let i = 0; i < totalChunks; i++) {
                    const chunkData = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
                    await browser.runtime.sendMessage({ type: "chunk", transferId, property: prop, index: i, total: totalChunks, data: chunkData })
                    await new Promise(r => setTimeout(r, 50))
                }
                message[prop] = null
                message.transferId = transferId
            } else {
                message[prop] = data
            }
        }
        return browser.runtime.sendMessage(message)
    } catch (error) {
        sendError(error, "sendChunkedMessage")
        throw error
    }
}

function readChunkAsBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => { resolve(reader.result?.split(',')?.[1] || "") }
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
    })
}

// ─── Rect observation ───────────────────────────────────────────────────────
let rafId = null
let observedNodes = new Map()
let rectProps = ["left", "top", "height"]
let rectChanged = (a, b) => rectProps.some(p => a[p] !== b[p])

function runObserver() {
    const changed = []
    observedNodes.forEach((state, node) => {
        const newRect = node.getBoundingClientRect()
        if (rectChanged(newRect, state.rect)) { state.rect = newRect; changed.push(state) }
    })
    changed.forEach(s => s.callbacks.forEach(cb => cb(s.rect)))
    rafId = requestAnimationFrame(runObserver)
}

function observeRect(node, cb) {
    return {
        observe() {
            let wasEmpty = observedNodes.size === 0
            if (observedNodes.has(node)) observedNodes.get(node).callbacks.push(cb)
            else observedNodes.set(node, { rect: node.getBoundingClientRect(), callbacks: [cb] })
            if (wasEmpty) runObserver()
        },
        unobserve() {
            const state = observedNodes.get(node)
            if (state) {
                const idx = state.callbacks.indexOf(cb)
                if (idx >= 0) state.callbacks.splice(idx, 1)
                if (!state.callbacks.length) observedNodes.delete(node)
                if (!observedNodes.size) cancelAnimationFrame(rafId)
            }
        }
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Vertical text support ──────────────────────────────────────────────────
const VERTICAL_PUNCT_MAP = {
    '\u2014': '\ufe31', '\u2015': '\ufe31', '\u2013': '\ufe32', '\u2012': '\ufe32',
    '\u30fc': '\ufe31', '\uff0d': '\ufe31', '\uff5e': '\ufe31', '\u2500': '\ufe31',
    '\u002d': '\ufe32', '\u2026': '\ufe19', '\u2025': '\ufe19',
    '\uff08': '\ufe35', '\uff09': '\ufe36', '\u300c': '\ufe41', '\u300d': '\ufe42',
    '\u300e': '\ufe43', '\u300f': '\ufe44', '\u3010': '\ufe3b', '\u3011': '\ufe3c',
    '\u300a': '\ufe3d', '\u300b': '\ufe3e', '\u3008': '\ufe3f', '\u3009': '\ufe40',
    '\uff0c': '\ufe10', '\u3001': '\ufe11', '\u3002': '\ufe12', '\uff1a': '\ufe13',
    '\uff1b': '\ufe14', '\uff01': '\ufe15', '\uff1f': '\ufe16'
}

function wrapTextVertical(text, maxHeight, charAdv) {
    if (!text) return [""]
    const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/
    const isCJK = cjkRegex.test(text)
    if (isCJK) {
        let processed = text.replace(/ /g, "")
        let mapped = ""
        for (const c of processed) mapped += VERTICAL_PUNCT_MAP[c] || c
        if (!mapped) return [""]
        const charsPerCol = Math.max(1, Math.floor(maxHeight / charAdv))
        const cols = []
        for (let i = 0; i < mapped.length; i += charsPerCol) cols.push(mapped.substring(i, i + charsPerCol))
        return cols
    }
    return [text]
}

// ─── Cursor tracking ────────────────────────────────────────────────────────
document.addEventListener("mousemove", (e) => {
    cursorPos.x = e.clientX
    cursorPos.y = e.clientY
}, { passive: true })

document.addEventListener("contextmenu", (e) => {
    contextMenuTargetElement = document.elementFromPoint(e.clientX, e.clientY)
    contextMenuPos = { x: e.clientX, y: e.clientY }
    cursorPos.x = e.clientX
    cursorPos.y = e.clientY
}, { passive: true })
