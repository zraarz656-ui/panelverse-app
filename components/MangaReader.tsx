'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
} from 'lucide-react';
import { CommentsSheet } from './CommentsSheet';
import { ResilientImage } from './ResilientImage';
import { Chapter, Series, PageImage } from '@/lib/types';

interface MangaReaderProps {
  chapter: Chapter & {
    number?: number;
    series?: Series;
    prevChapterId?: string | null;
    nextChapterId?: string | null;
  };
  series?: Series;
  prevChapterId?: string | null;
  nextChapterId?: string | null;
  userId?: string;
  username?: string;
}

export function MangaReader({
  chapter,
  series: seriesProp,
  prevChapterId: prevChapterIdProp,
  nextChapterId: nextChapterIdProp,
  userId = 'guest',
  username = 'GuestReader',
}: MangaReaderProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rtl, setRtl] = useState(true);
  const [hudVisible, setHudVisible] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const series = seriesProp || chapter?.series;
  const seriesId = series?.id || chapter?.seriesId || 'unknown-series';
  const seriesSlug = series?.slug || seriesId;
  const seriesTitle = series?.title || 'Manga Series';
  const coverImage = series?.coverImage || '';
  const chapterNumber = chapter?.chapterNumber ?? chapter?.number ?? 1;
  const rawChapterTitle = chapter?.title || `Chapter ${chapterNumber}`;
  const cleanSubtitle = rawChapterTitle
    .replace(/^(?:Episode|Chapter|Ep\.?|Ch\.?)\s*\d+\s*[:\-—]?\s*/i, '')
    .trim();
  const displayHeading = cleanSubtitle
    ? `Ch. ${chapterNumber} — ${cleanSubtitle}`
    : `Chapter ${chapterNumber}`;
  const pages: PageImage[] = useMemo(
    () => (Array.isArray(chapter.pages) ? chapter.pages : []),
    [chapter.pages]
  );
  const prevChapterId = prevChapterIdProp ?? chapter?.prevChapterId ?? null;
  const nextChapterId = nextChapterIdProp ?? chapter?.nextChapterId ?? null;
  const totalPages = Math.max(1, pages.length);

  const goNext = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (commentsOpen) return;
      if (e.key === 'ArrowLeft') {
        if (rtl) goNext();
        else goPrev();
      } else if (e.key === 'ArrowRight') {
        if (rtl) goPrev();
        else goNext();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [rtl, goNext, goPrev, commentsOpen]);

  useEffect(() => {
    if (pages.length === 0) return;
    const scrollPercentage = Math.round((currentPage / totalPages) * 100);
    fetch('/api/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        seriesId,
        chapterId: chapter.id,
        chapterNumber,
        seriesTitle,
        seriesSlug,
        seriesType: 'manga',
        coverImage,
        pageIndex: Math.max(0, currentPage - 1),
        totalPages,
        scrollPercentage,
        isCompleted: currentPage >= totalPages,
      }),
    }).catch(() => {});
  }, [
    currentPage,
    chapter.id,
    chapterNumber,
    pages.length,
    seriesId,
    seriesSlug,
    seriesTitle,
    coverImage,
    totalPages,
    userId,
  ]);

  const activePage = pages[currentPage - 1] || pages[0];

  const handleZoneClick = (zone: 'left' | 'center' | 'right') => {
    if (zone === 'center') {
      setHudVisible((prev) => !prev);
      return;
    }
    if (zone === 'left') {
      if (rtl) goNext();
      else goPrev();
    } else {
      if (rtl) goPrev();
      else goNext();
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#07070A] text-slate-100 select-none">
      {/* Top HUD */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 transition-transform duration-300 ${
          hudVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/series/${seriesSlug}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-slate-300 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-400">{seriesTitle}</p>
              <h1 className="truncate text-sm font-bold text-white">
                {displayHeading}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setRtl((prev) => !prev)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 font-mono text-xs font-semibold text-amber-300 hover:bg-amber-500/20 cursor-pointer"
              title="Toggle Reading Direction"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>{rtl ? 'RTL (JP)' : 'LTR'}</span>
            </button>
            <button
              onClick={() => setCommentsOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-slate-200 hover:border-zinc-700 cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5 text-rose-500" />
              <span className="hidden sm:inline">Comments</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Paged Stage with 3-Zone Tap Overlay */}
      <div className="relative flex flex-1 items-center justify-center pt-14 pb-20">
        {activePage && (
          <div className="relative mx-auto max-h-[82vh] max-w-[92vw] md:max-w-[720px] overflow-hidden rounded-lg shadow-2xl border border-zinc-900">
            <ResilientImage
              src={activePage.imageUrl}
              alt={activePage.caption || `Page ${activePage.pageNumber}`}
              className="max-h-[82vh] w-auto object-contain mx-auto"
              fallbackTitle={seriesTitle}
              fallbackType="manga"
              fallbackMode="page"
              chapterNumber={chapterNumber}
              pageNumber={activePage.pageNumber}
              priority
            />

            {/* 3-Zone Tap Targets */}
            <div className="absolute inset-0 z-10 grid grid-cols-3">
              <div
                onClick={() => handleZoneClick('left')}
                className="cursor-pointer"
                title={rtl ? 'Next Page (RTL)' : 'Previous Page'}
              />
              <div
                onClick={() => handleZoneClick('center')}
                className="cursor-pointer"
                title="Toggle HUD"
              />
              <div
                onClick={() => handleZoneClick('right')}
                className="cursor-pointer"
                title={rtl ? 'Previous Page (RTL)' : 'Next Page'}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Scrubber HUD — docked flush to bottom of viewport */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 pb-safe transition-transform duration-300 ${
          hudVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>
              {rtl
                ? 'TAP LEFT FOR NEXT PAGE (RTL)'
                : 'TAP RIGHT FOR NEXT PAGE (LTR)'}
            </span>
            <span className="font-semibold text-white">
              PAGE {currentPage} / {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={rtl ? goNext : goPrev}
              disabled={rtl ? currentPage >= totalPages : currentPage <= 1}
              className="flex h-8 px-3 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-medium text-slate-200 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> {rtl ? 'Next' : 'Prev'}
            </button>

            <input
              type="range"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={(e) => setCurrentPage(Number(e.target.value))}
              dir={rtl ? 'rtl' : 'ltr'}
              className="flex-1 accent-rose-500 cursor-pointer"
            />

            <button
              onClick={rtl ? goPrev : goNext}
              disabled={rtl ? currentPage <= 1 : currentPage >= totalPages}
              className="flex h-8 px-3 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 text-xs font-medium text-slate-200 disabled:opacity-40 cursor-pointer"
            >
              {rtl ? 'Prev' : 'Next'} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {currentPage === totalPages && (
            <div className="mt-1 flex items-center justify-between border-t border-zinc-800/80 pt-2">
              <span className="text-xs text-rose-400 font-medium">
                Reached final page of Chapter {chapterNumber}
              </span>
              <div className="flex items-center gap-2">
                {prevChapterId && (
                  <Link
                    href={`/read/${prevChapterId}`}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-white"
                  >
                    Prev Ch.
                  </Link>
                )}
                {nextChapterId ? (
                  <Link
                    href={`/read/${nextChapterId}`}
                    className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    Next Chapter →
                  </Link>
                ) : (
                  <Link
                    href={`/series/${seriesSlug}`}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-white"
                  >
                    Series Home
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <CommentsSheet
        chapterId={chapter.id}
        seriesId={seriesId}
        currentUserId={userId}
        currentUsername={username}
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
    </div>
  );
}
