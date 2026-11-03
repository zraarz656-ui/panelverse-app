import { Chapter, Series, ChapterEditsData } from './types';

export const CHAPTER_ASSET_CACHE_NAME = 'panelverse-chapter-assets-v1';
const SHELL_CACHE_NAME = 'panelverse-shell-v1';
const IDB_NAME = 'panelverse-offline-db';
const IDB_VERSION = 1;
const IDB_STORE = 'offline_chapters';
const LOCAL_INDEX_KEY = 'panelverse_offline_index_v1';
export const MAX_AUTO_LRU_CHAPTERS = 5;

export interface OfflineChapterSummary {
  chapterId: string;
  seriesId: string;
  seriesSlug: string;
  seriesTitle: string;
  seriesType: 'webtoon' | 'manga';
  coverImage: string;
  chapterNumber: number;
  chapterTitle: string;
  pagesCount: number;
  cachedLanguages: string[];
  isPinned: boolean;
  cachedAt: number;
  lastAccessedAt: number;
}

export interface OfflineChapterRecord extends OfflineChapterSummary {
  chapter: Chapter & {
    series?: Series;
    prevChapterId?: string | null;
    nextChapterId?: string | null;
  };
  editsByLang: Record<string, ChapterEditsData>;
  cachedImageUrls: string[];
}

function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this browser'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'chapterId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

function toCachedImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (
    rawUrl.startsWith('data:') ||
    rawUrl.startsWith('/') ||
    rawUrl.includes('/api/image-proxy')
  ) {
    return rawUrl;
  }
  return `/api/image-proxy?url=${encodeURIComponent(rawUrl)}`;
}

export function getOfflineIndexSync(): OfflineChapterSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOfflineIndexSync(items: OfflineChapterSummary[]) {
  if (typeof window === 'undefined') return;
  try {
    const sorted = [...items].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
    localStorage.setItem(LOCAL_INDEX_KEY, JSON.stringify(sorted));
    window.dispatchEvent(new CustomEvent('panelverse-offline-updated'));
  } catch {
    // Ignore storage quota warnings on index
  }
}

export function isChapterCachedSync(chapterId: string): {
  isCached: boolean;
  isPinned: boolean;
} {
  const list = getOfflineIndexSync();
  const found = list.find((item) => item.chapterId === chapterId);
  return {
    isCached: Boolean(found),
    isPinned: Boolean(found?.isPinned),
  };
}

export async function getOfflineChapter(
  chapterId: string
): Promise<OfflineChapterRecord | null> {
  try {
    const db = await openOfflineDB();
    return await new Promise<OfflineChapterRecord | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(chapterId);
      req.onsuccess = () => {
        const result = (req.result as OfflineChapterRecord) || null;
        resolve(result);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAllOfflineChapters(): Promise<OfflineChapterSummary[]> {
  try {
    const db = await openOfflineDB();
    const records = await new Promise<OfflineChapterRecord[]>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as OfflineChapterRecord[]) || []);
      req.onerror = () => resolve([]);
    });

    const summaries: OfflineChapterSummary[] = records
      .map((r) => ({
        chapterId: r.chapterId,
        seriesId: r.seriesId,
        seriesSlug: r.seriesSlug,
        seriesTitle: r.seriesTitle,
        seriesType: r.seriesType,
        coverImage: r.coverImage,
        chapterNumber: r.chapterNumber,
        chapterTitle: r.chapterTitle,
        pagesCount: r.pagesCount,
        cachedLanguages: r.cachedLanguages || [],
        isPinned: Boolean(r.isPinned),
        cachedAt: r.cachedAt,
        lastAccessedAt: r.lastAccessedAt,
      }))
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

    saveOfflineIndexSync(summaries);
    return summaries;
  } catch {
    return getOfflineIndexSync();
  }
}

export async function removeOfflineChapter(chapterId: string): Promise<void> {
  try {
    const existing = await getOfflineChapter(chapterId);
    const db = await openOfflineDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(chapterId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });

    if (typeof window !== 'undefined' && 'caches' in window && existing) {
      const cache = await caches.open(CHAPTER_ASSET_CACHE_NAME);
      await cache.delete(`/api/chapters/${encodeURIComponent(chapterId)}`);
      for (const imgUrl of existing.cachedImageUrls || []) {
        if (!imgUrl.startsWith('data:')) {
          await cache.delete(imgUrl).catch(() => {});
        }
      }
    }

    const nextIndex = getOfflineIndexSync().filter((c) => c.chapterId !== chapterId);
    saveOfflineIndexSync(nextIndex);
  } catch {
    // Ignore errors during cleanup
  }
}

export async function clearAllOfflineChapters(): Promise<void> {
  try {
    const db = await openOfflineDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    if (typeof window !== 'undefined' && 'caches' in window) {
      await caches.delete(CHAPTER_ASSET_CACHE_NAME);
    }
    saveOfflineIndexSync([]);
  } catch {
    // Ignore
  }
}

/**
 * Evicts the oldest unpinned chapters when automatic background caching exceeds MAX_AUTO_LRU_CHAPTERS (5).
 */
async function enforceLruLimit(): Promise<void> {
  const summaries = await getAllOfflineChapters();
  const unpinned = summaries
    .filter((item) => !item.isPinned)
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

  if (unpinned.length <= MAX_AUTO_LRU_CHAPTERS) return;

  const toEvict = unpinned.slice(MAX_AUTO_LRU_CHAPTERS);
  for (const oldItem of toEvict) {
    await removeOfflineChapter(oldItem.chapterId);
  }
}

/**
 * Caches a chapter (metadata, page images, and published multi-language translations)
 * into IndexedDB + CacheStorage.
 */
export async function cacheChapterForOffline(params: {
  chapter: Chapter & {
    series?: Series;
    prevChapterId?: string | null;
    nextChapterId?: string | null;
  };
  series?: Series;
  editsByLang?: Record<string, ChapterEditsData>;
  pin?: boolean;
  prefetchImages?: boolean;
  onProgress?: (percent: number) => void;
}): Promise<OfflineChapterSummary> {
  const {
    chapter,
    series: seriesProp,
    editsByLang = {},
    pin,
    prefetchImages = false,
    onProgress,
  } = params;
  const existing = await getOfflineChapter(chapter.id);

  const series = seriesProp || chapter.series;
  const seriesId = series?.id || chapter.seriesId || 'unknown-series';
  const seriesSlug = series?.slug || seriesId;
  const seriesTitle = series?.title || 'Webtoon Series';
  const seriesType: 'webtoon' | 'manga' =
    series?.type === 'manga' ? 'manga' : 'webtoon';
  const coverImage = series?.coverImage || '';
  const chapterNumber = chapter.chapterNumber ?? 1;
  const chapterTitle = chapter.title || `Episode ${chapterNumber}`;
  const pages = Array.isArray(chapter.pages) ? chapter.pages : [];

  const mergedEdits: Record<string, ChapterEditsData> = {
    ...(existing?.editsByLang || {}),
    ...editsByLang,
  };

  const isPinned = pin !== undefined ? pin : Boolean(existing?.isPinned);
  const now = Date.now();

  // Gather image URLs to cache in CacheStorage
  const rawUrls: string[] = [];
  if (coverImage && !coverImage.startsWith('data:')) {
    rawUrls.push(coverImage);
    rawUrls.push(toCachedImageUrl(coverImage));
  }
  for (const page of pages) {
    if (page?.imageUrl && !page.imageUrl.startsWith('data:')) {
      rawUrls.push(page.imageUrl);
      const proxied = toCachedImageUrl(page.imageUrl);
      if (proxied !== page.imageUrl) {
        rawUrls.push(proxied);
      }
    }
  }

  const uniqueUrls = Array.from(new Set(rawUrls.filter(Boolean)));

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const assetCache = await caches.open(CHAPTER_ASSET_CACHE_NAME);

      // Store chapter API JSON response in cache so it loads instantly offline
      const apiUrl = `/api/chapters/${encodeURIComponent(chapter.id)}`;
      await assetCache
        .put(
          apiUrl,
          new Response(JSON.stringify(chapter), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
        .catch(() => {});

      // Only perform active downloads if explicitly requested (e.g. user tapped "Saved Offline")
      // For automatic reading history, the browser + reader naturally loads & caches panels as they scroll
      if (prefetchImages) {
        let completed = 0;
        const total = Math.max(1, uniqueUrls.length);
        onProgress?.(10);

        // Fetch gently one-by-one with a 150ms delay so we never trip gateway rate limits
        for (let i = 0; i < uniqueUrls.length; i++) {
          const url = uniqueUrls[i];
          try {
            const already = await assetCache.match(url);
            if (!already) {
              const res = await fetch(url, { mode: 'cors' }).catch(() => null);
              if (res && (res.status === 200 || res.type === 'opaque')) {
                await assetCache.put(url, res);
              }
              await new Promise((r) => setTimeout(r, 150));
            }
          } catch {
            // Ignore single panel failure
          } finally {
            completed++;
            onProgress?.(Math.min(95, Math.round((completed / total) * 90) + 5));
          }
        }
      }
    } catch {
      // Ignore CacheStorage errors if in private browsing
    }
  }

  const record: OfflineChapterRecord = {
    chapterId: chapter.id,
    seriesId,
    seriesSlug,
    seriesTitle,
    seriesType,
    coverImage,
    chapterNumber,
    chapterTitle,
    pagesCount: pages.length,
    cachedLanguages: Object.keys(mergedEdits),
    isPinned,
    cachedAt: existing?.cachedAt || now,
    lastAccessedAt: now,
    chapter: {
      ...chapter,
      series: series || chapter.series,
    },
    editsByLang: mergedEdits,
    cachedImageUrls: uniqueUrls,
  };

  try {
    const db = await openOfflineDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB write error
  }

  await enforceLruLimit();
  const updatedList = await getAllOfflineChapters();
  onProgress?.(100);

  return (
    updatedList.find((item) => item.chapterId === chapter.id) || {
      chapterId: record.chapterId,
      seriesId: record.seriesId,
      seriesSlug: record.seriesSlug,
      seriesTitle: record.seriesTitle,
      seriesType: record.seriesType,
      coverImage: record.coverImage,
      chapterNumber: record.chapterNumber,
      chapterTitle: record.chapterTitle,
      pagesCount: record.pagesCount,
      cachedLanguages: record.cachedLanguages,
      isPinned: record.isPinned,
      cachedAt: record.cachedAt,
      lastAccessedAt: record.lastAccessedAt,
    }
  );
}
