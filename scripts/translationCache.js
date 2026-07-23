// TranslationCache - IndexedDB-backed translation cache
// IndexedDB translation cache
// Uses SHA-256 hashing to generate cache keys from image data + settings.

async function sha256(buffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

class TranslationCache {
    constructor() {
        this.dbName = 'GenjiTranslationCacheDB';
        this.storeName = 'translations';
        this.version = 1;
        this.db = null;
        this.initPromise = null;
    }

    async init() {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                this.initPromise = null;
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.initPromise = null;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                let store;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    store = db.createObjectStore(this.storeName);
                } else {
                    store = request.transaction.objectStore(this.storeName);
                }

                if (!store.indexNames.contains('timestamp')) {
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });

        return this.initPromise;
    }

    /**
     * Generate a cache key from image data + translation settings.
     * @param {string|Blob} input - Image URL string or Blob
     * @param {object} headers - Translation settings (language, model, font, etc.)
     */
    async generateKey(input, headers) {
        let buffer;
        if (typeof input === 'string') {
            buffer = new TextEncoder().encode(input);
        } else {
            buffer = await input.arrayBuffer();
        }

        const blobHash = await sha256(buffer);

        const headerKey = JSON.stringify({
            target_lang: headers.target_lang,
            translator: headers.translator,
            font: headers.font,
            min_font_size: headers.min_font_size,
            stroke_enabled: !headers.stroke_disabled,
            legacy_inpaint: headers.legacy_inpaint,
            bubbles_only: headers.bubbles_only,
            inpaint_only: headers.inpaint_only,
            text_align: headers.text_align,
            context: headers.context !== "false",
            custom_prompt: headers.custom_prompt
        });

        const headerBuffer = new TextEncoder().encode(headerKey);
        const headerHash = await sha256(headerBuffer);

        return `${headerHash}-${blobHash}`;
    }

    async get(key) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async put(key, data, preserveTimestamp = false) {
        await this.init();
        if (!preserveTimestamp) {
            data.timestamp = Date.now();
        }

        const attemptPut = () => {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                const request = store.put(data, key);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        };

        try {
            await attemptPut();
        } catch (error) {
            const isQuotaError =
                error.name === 'QuotaExceededError' ||
                error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                error.message?.includes("quota limitations") ||
                error.message?.includes("QuotaExceededError") ||
                error.message?.includes("not enough space") ||
                error.message?.includes("operation failed for reasons unrelated");

            if (isQuotaError) {
                console.warn("[Genji] Storage quota exceeded. Attempting to free space...");

                let retryCount = 0;
                let success = false;

                while (retryCount < 3 && !success) {
                    retryCount++;
                    const pruneCount = retryCount * 50;
                    const deleted = await this.pruneOldest(pruneCount);

                    if (deleted === 0) {
                        console.error("[Genji] Storage quota exceeded and no items left to prune.");
                        throw error;
                    }

                    try {
                        await attemptPut();
                        success = true;
                        console.log(`[Genji] Stored item after pruning ${deleted} items (retry ${retryCount}).`);
                    } catch (retryError) {
                        if (retryCount === 3) throw retryError;
                        console.warn(`[Genji] Retry ${retryCount} failed, pruning more...`);
                    }
                }
            } else {
                throw error;
            }
        }
    }

    async pruneOldest(count = 10) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            const request = index.openCursor();

            let deleted = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && deleted < count) {
                    cursor.delete();
                    deleted++;
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => {
                if (deleted > 0) console.log(`[Genji] Cache pruning: deleted ${deleted} oldest items.`);
                resolve(deleted);
            };
            transaction.onerror = (event) => reject(event.target.error);
            transaction.onabort = () => reject(new Error("Prune transaction aborted"));
        });
    }

    async delete(key) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async getRecent(limit = 10, offset = 0) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            const request = index.openCursor(null, 'prev');

            const results = [];
            let hasAdvanced = false;

            request.onsuccess = (event) => {
                const cursor = event.target.result;

                if (!cursor) {
                    resolve(results);
                    return;
                }

                if (offset > 0 && !hasAdvanced) {
                    hasAdvanced = true;
                    cursor.advance(offset);
                    return;
                }

                try {
                    const item = cursor.value;
                    item.key = cursor.primaryKey;
                    results.push(item);
                } catch (e) {
                    console.warn("[Genji] Failed to read IndexedDB value:", e);
                    results.push({
                        key: cursor.primaryKey,
                        isCorrupted: true,
                        error: e
                    });
                }

                if (results.length < limit) {
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    async cleanup(ttlMilliseconds = 604800000) {
        if (ttlMilliseconds === -1) return;

        await this.init();
        const cutoff = Date.now() - ttlMilliseconds;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            const range = IDBKeyRange.upperBound(cutoff);
            const request = index.openCursor(range);

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
            transaction.onabort = () => reject(new Error("Cleanup transaction aborted"));
        });
    }

    async getAll() {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.openCursor();
            const results = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const item = cursor.value;
                    item.key = cursor.primaryKey;
                    results.push(item);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }
}

// No export in classic script (importScripts loaded)
