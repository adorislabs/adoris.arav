/**
 * Module-level in-memory cache for PDF buffers.
 * Persists across requests within the same Node.js process (dev server or
 * a persistent Edge/Node runtime). Cold-starts still hit Supabase Storage once.
 *
 * Max 8 PDFs, 15-minute TTL — evicts LRU on overflow.
 */

const MAX_ENTRIES = 8;
const TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  buffer: Buffer;
  ts: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedPdfBuffer(chapterId: string): Buffer | null {
  const entry = cache.get(chapterId);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(chapterId);
    return null;
  }
  // Refresh timestamp on hit (LRU-style)
  entry.ts = Date.now();
  return entry.buffer;
}

export function setCachedPdfBuffer(chapterId: string, buffer: Buffer): void {
  if (cache.size >= MAX_ENTRIES) {
    // Evict oldest entry
    let oldestKey = '';
    let oldestTs = Infinity;
    for (const [key, val] of cache) {
      if (val.ts < oldestTs) { oldestTs = val.ts; oldestKey = key; }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(chapterId, { buffer, ts: Date.now() });
}
