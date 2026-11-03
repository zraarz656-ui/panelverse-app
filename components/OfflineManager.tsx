'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { WifiOff, Download, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import {
  cacheChapterForOffline,
  removeOfflineChapter,
  isChapterCachedSync,
  getAllOfflineChapters,
} from '@/lib/offline-cache';
import { Chapter, Series, ChapterEditsData } from '@/lib/types';

export function ServiceWorkerAndOfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [cachedCount, setCachedCount] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const updateOnlineState = () => {
      setIsOffline(!navigator.onLine);
    };

    const updateCacheCount = () => {
      getAllOfflineChapters()
        .then((list) => setCachedCount(list.length))
        .catch(() => {});
    };

    updateOnlineState();
    updateCacheCount();

    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    window.addEventListener('panelverse-offline-updated', updateCacheCount);

    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
      window.removeEventListener('panelverse-offline-updated', updateCacheCount);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-zinc-950/95 px-4 py-2.5 text-xs text-amber-200 shadow-2xl backdrop-blur-md">
      <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
      <span>
        You&apos;re offline.{' '}
        {cachedCount > 0
          ? `${cachedCount} cached chapter${cachedCount === 1 ? '' : 's'} available.`
          : 'Recently read chapters will open from cache.'}
      </span>
      <Link
        href="/me"
        className="rounded-lg bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors whitespace-nowrap"
      >
        Offline Library
      </Link>
    </div>
  );
}

interface OfflineSaveButtonProps {
  chapter: Chapter & {
    series?: Series;
    prevChapterId?: string | null;
    nextChapterId?: string | null;
  };
  series?: Series;
  editsByLang?: Record<string, ChapterEditsData>;
  autoCacheOnMount?: boolean;
  compact?: boolean;
}

export function OfflineSaveButton({
  chapter,
  series,
  editsByLang = {},
  autoCacheOnMount = true,
  compact = false,
}: OfflineSaveButtonProps) {
  const [status, setStatus] = useState<{ isCached: boolean; isPinned: boolean }>({
    isCached: false,
    isPinned: false,
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  const syncStatus = useCallback(() => {
    if (!chapter?.id) return;
    setStatus(isChapterCachedSync(chapter.id));
  }, [chapter?.id]);

  useEffect(() => {
    syncStatus();
    if (typeof window === 'undefined') return;
    window.addEventListener('panelverse-offline-updated', syncStatus);
    return () => {
      window.removeEventListener('panelverse-offline-updated', syncStatus);
    };
  }, [syncStatus]);

  // Track cached chapter in ref to prevent duplicate triggers during re-renders
  const autoCachedRef = React.useRef<string | null>(null);

  // Automatically record recently read chapters in the background (LRU 5-chapter cap)
  // WITHOUT hammering the server with image requests (the reader loads & caches them naturally as they view)
  useEffect(() => {
    if (
      !autoCacheOnMount ||
      !chapter?.id ||
      !Array.isArray(chapter.pages) ||
      chapter.pages.length === 0
    ) {
      return;
    }
    if (autoCachedRef.current === chapter.id) {
      return;
    }
    autoCachedRef.current = chapter.id;

    cacheChapterForOffline({
      chapter,
      series,
      editsByLang,
      prefetchImages: false,
    })
      .then(() => syncStatus())
      .catch(() => {});
  }, [autoCacheOnMount, chapter?.id]);

  const handleTogglePin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDownloading) return;

    if (status.isPinned) {
      await removeOfflineChapter(chapter.id);
      syncStatus();
      return;
    }

    setIsDownloading(true);
    setProgress(5);
    try {
      await cacheChapterForOffline({
        chapter,
        series,
        editsByLang,
        pin: true,
        prefetchImages: true,
        onProgress: (p) => setProgress(p),
      });
      syncStatus();
    } finally {
      setIsDownloading(false);
      setProgress(0);
    }
  };

  if (isDownloading) {
    return (
      <button
        type="button"
        disabled
        className="flex h-8 sm:h-9 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2 sm:px-2.5 text-xs font-semibold text-emerald-300 whitespace-nowrap shrink-0"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400 shrink-0" />
        <span>{progress}%</span>
      </button>
    );
  }

  if (status.isPinned) {
    return (
      <button
        type="button"
        onClick={handleTogglePin}
        title="Saved for Offline Reading (Click to remove from offline downloads)"
        className="group flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2 sm:px-2.5 text-xs font-semibold text-emerald-300 hover:border-rose-500/50 hover:bg-rose-950/40 hover:text-rose-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 group-hover:hidden shrink-0" />
        <Trash2 className="h-3.5 w-3.5 text-rose-400 hidden group-hover:block shrink-0" />
        {!compact && <span className="hidden md:inline">Saved Offline</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleTogglePin}
      title={
        status.isCached
          ? 'Auto-cached in recent 5 chapters — Click to pin permanently for offline reading'
          : 'Download chapter panels & translations for offline reading'
      }
      className={`flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg border px-2 sm:px-2.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
        status.isCached
          ? 'border-sky-500/40 bg-sky-950/30 text-sky-300 hover:bg-sky-900/40'
          : 'border-zinc-800 bg-zinc-900 text-slate-300 hover:border-zinc-700 hover:text-white'
      }`}
    >
      <Download className="h-3.5 w-3.5 shrink-0" />
      {!compact && (
        <span className="hidden md:inline">
          {status.isCached ? 'Cached · Pin' : 'Offline'}
        </span>
      )}
    </button>
  );
}
