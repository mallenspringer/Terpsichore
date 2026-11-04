/**
 * ImageCueManager
 * Manages image decoding and bounded LRU texture caching for the ImageCue module.
 * Designed to keep VRAM usage low (<80MB) on budget machines by maintaining at most
 * 24 decoded ImageBitmaps in memory and disposing older textures with .close().
 */
export class ImageCueManager {
  private static instance: ImageCueManager | null = null;
  private maxCacheSize = 24;
  private maxBitmapDim = 3840; // Cap decoded bitmap dimensions at 4K to protect VRAM and WebGPU 2D texture limits

  // Cache: url -> { bitmap: ImageBitmap; lastUsed: number }
  private cache = new Map<string, { bitmap: ImageBitmap; lastUsed: number }>();
  private loading = new Set<string>();
  private listeners = new Set<() => void>();

  public static getInstance(): ImageCueManager {
    if (!ImageCueManager.instance) {
      ImageCueManager.instance = new ImageCueManager();
    }
    return ImageCueManager.instance;
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach(fn => {
      try {
        fn();
      } catch (e) {
        console.error('[ImageCueManager] listener error:', e);
      }
    });
  }

  /**
   * Retrieves an ImageBitmap if already cached and updates LRU timestamp.
   * If not cached, triggers background loading.
   */
  public getBitmap(url: string | undefined): ImageBitmap | null {
    if (!url) return null;

    const entry = this.cache.get(url);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.bitmap;
    }

    // Trigger load if not already loading
    this.preloadImage(url);
    return null;
  }

  /**
   * Background preloads an image URL into the LRU cache.
   */
  public preloadImage(url: string | undefined): Promise<ImageBitmap | null> {
    if (!url) return Promise.resolve(null);
    if (this.cache.has(url)) {
      const entry = this.cache.get(url)!;
      entry.lastUsed = Date.now();
      return Promise.resolve(entry.bitmap);
    }
    if (this.loading.has(url)) return Promise.resolve(null);

    this.loading.add(url);

    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;

      img.onload = async () => {
        try {
          const nw = img.naturalWidth || img.width || 0;
          const nh = img.naturalHeight || img.height || 0;
          const options: ImageBitmapOptions = {
            imageOrientation: 'from-image',
            premultiplyAlpha: 'default'
          };

          // Downscale ultra-high-res images (>4K) proportionally during decode
          if (nw > this.maxBitmapDim || nh > this.maxBitmapDim) {
            const scale = this.maxBitmapDim / Math.max(nw, nh);
            options.resizeWidth = Math.max(1, Math.round(nw * scale));
            options.resizeHeight = Math.max(1, Math.round(nh * scale));
            options.resizeQuality = 'medium';
          }

          const bmp = await createImageBitmap(img, options);
          this.setInCache(url, bmp);
          this.loading.delete(url);
          this.notify();
          resolve(bmp);
        } catch (e) {
          console.warn(`[ImageCueManager] Failed to create ImageBitmap for ${url}:`, e);
          this.loading.delete(url);
          resolve(null);
        }
      };

      img.onerror = () => {
        console.warn(`[ImageCueManager] Failed to load image: ${url}`);
        this.loading.delete(url);
        resolve(null);
      };
    });
  }

  private setInCache(url: string, bitmap: ImageBitmap) {
    // If cache is full, evict the least-recently used entry
    if (this.cache.size >= this.maxCacheSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, val] of this.cache.entries()) {
        if (val.lastUsed < oldestTime) {
          oldestTime = val.lastUsed;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const evicted = this.cache.get(oldestKey);
        try {
          evicted?.bitmap.close();
        } catch {
          // ignore if already closed
        }
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(url, { bitmap, lastUsed: Date.now() });
  }

  /**
   * Preloads a set of neighboring/candidate image URLs.
   */
  public prefetchBatch(urls: string[]) {
    urls.forEach(u => {
      if (u && !this.cache.has(u)) {
        this.preloadImage(u);
      }
    });
  }

  /**
   * Clears the entire cache, disposing all native GPU bitmaps.
   */
  public clear() {
    for (const val of this.cache.values()) {
      try {
        val.bitmap.close();
      } catch {
        // ignore
      }
    }
    this.cache.clear();
    this.loading.clear();
  }
}
