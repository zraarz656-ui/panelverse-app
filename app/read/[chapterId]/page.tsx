'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { WebtoonReader } from '@/components/WebtoonReader';
import { MangaReader } from '@/components/MangaReader';
import { useIdentity } from '@/hooks/useIdentity';
import {
  subscribeLibraryChaptersFromFirestore,
  PersistedChapterRecord,
} from '@/lib/supabase-sync';
import { Chapter, Series } from '@/lib/types';

export default function ReaderPage() {
  const params = useParams();
  const chapterId = params?.chapterId as string;

  const { id: userId, username, isAuthReady, isAdmin } = useIdentity();
  const [baseChapter, setBaseChapter] = useState<
    (Chapter & { series?: Series; prevChapterId?: string; nextChapterId?: string }) | null
  >(null);
  const [firestoreChapters, setFirestoreChapters] = useState<PersistedChapterRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chapterId) return;
    let isMounted = true;

    async function loadChapter() {
      try {
        const res = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}`);
        if (!res.ok) {
          throw new Error('Chapter not found or failed to load');
        }
        const data = await res.json();
        if (isMounted) {
          setBaseChapter(data);
        }
      } catch (err: unknown) {
        const e = err as Error;
        if (isMounted) {
          setError(e.message || 'Failed to load chapter');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadChapter();
    return () => {
      isMounted = false;
    };
  }, [chapterId]);

  useEffect(() => {
    if (!isAuthReady) return;
    const unsubscribe = subscribeLibraryChaptersFromFirestore((records) => {
      setFirestoreChapters(records);
    });
    return () => unsubscribe();
  }, [isAuthReady]);

  const chapter = useMemo(() => {
    const fsOverride = firestoreChapters.find((r) => r.id === chapterId);
    if (fsOverride?.isDeleted) return null;
    if (!baseChapter) return fsOverride || null;
    if (!fsOverride) return baseChapter;

    // Preserve real chapter pages from API if Firestore only has placeholder SVGs
    const fsHasRealPages =
      Array.isArray(fsOverride.pages) &&
      fsOverride.pages.length > 0 &&
      !fsOverride.pages[0]?.imageUrl?.startsWith('data:image/svg+xml');

    const baseHasRealPages =
      Array.isArray(baseChapter.pages) &&
      baseChapter.pages.length > 0 &&
      !baseChapter.pages[0]?.imageUrl?.startsWith('data:image/svg+xml');

    const selectedPages = fsHasRealPages
      ? fsOverride.pages
      : baseHasRealPages
      ? baseChapter.pages
      : fsOverride.pages && fsOverride.pages.length > 0
      ? fsOverride.pages
      : baseChapter.pages;

    return {
      ...baseChapter,
      chapterNumber: fsOverride.chapterNumber || baseChapter.chapterNumber,
      title: fsOverride.title || baseChapter.title,
      releaseDate: fsOverride.releaseDate || baseChapter.releaseDate,
      pages: selectedPages,
      pagesCount: selectedPages.length,
    };
  }, [baseChapter, firestoreChapters, chapterId]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
          <p className="text-xs font-mono">Loading chapter panels...</p>
        </div>
      </div>
    );
  }

  if (error || !chapter) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black p-6 text-center text-slate-300">
        <h2 className="text-base font-bold text-white">Chapter Unavailable</h2>
        <p className="mt-1 text-xs text-slate-400 max-w-sm">
          {error || 'The requested chapter could not be found.'}
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Library</span>
        </Link>
      </div>
    );
  }

  // Branch reader based on series type
  const isManga = chapter.series?.type === 'manga';

  if (isManga) {
    return (
      <MangaReader
        chapter={chapter}
        userId={userId || 'guest'}
        username={username || 'GuestReader'}
        isAdmin={isAdmin}
      />
    );
  }

  return (
    <WebtoonReader
      chapter={chapter}
      userId={userId || 'guest'}
      username={username || 'GuestReader'}
      isAdmin={isAdmin}
    />
  );
}
