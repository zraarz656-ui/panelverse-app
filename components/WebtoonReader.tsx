'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  ArrowUp,
} from 'lucide-react';
import { CommentsSheet } from './CommentsSheet';
import { ResilientImage } from './ResilientImage';
import { Chapter, Series, PageImage } from '@/lib/types';

interface WebtoonReaderProps {
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

export function WebtoonReader({
  chapter,
  series: seriesProp,
  prevChapterId: prevChapterIdProp,
  nextChapterId: nextChapterIdProp,
  userId = 'guest',
  username = 'GuestReader',
}: WebtoonReaderProps) {
  const [hudVisible, setHudVisible] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSavedPage = useRef<number>(1);

  const series = seriesProp || chapter?.series;
  const seriesId = series?.id || chapter?.seriesId || 'unknown-series';
  const seriesSlug = series?.slug || seriesId;
  const seriesTitle = series?.title || 'Webtoon Series';
  const coverImage = series?.coverImage || '';
  const chapterNumber = chapter?.chapterNumber ?? chapter?.number ?? 1;
  const rawChapterTitle = chapter?.title || `Episode ${chapterNumber}`;
  const cleanSubtitle = rawChapterTitle
    .replace(/^(?:Episode|Chapter|Ep\.?|Ch\.?)\s*\d+\s*[:\-—]?\s*/i, '')
    .trim();
  const displayHeading = cleanSubtitle
    ? `Ep. ${chapterNumber} — ${cleanSubtitle}`
    : `Episode ${chapterNumber}`;
  const pages: PageImage[] = useMemo(
    () => (Array.isArray(chapter.pages) ? chapter.pages : []),
    [chapter.pages]
  );
  const prevChapterId = prevChapterIdProp ?? chapter?.prevChapterId ?? null;
  const nextChapterId = nextChapterIdProp ?? chapter?.nextChapterId ?? null;

  useEffect(() => {
    const handleScroll = () => {
      const panels = document.querySelectorAll('[data-page-number]');
      let active = 1;
      panels.forEach((panel) => {
        const rect = panel.getBoundingClientRect();
        if (rect.top <= window.innerHeight * 0.5) {
          active = Number(panel.getAttribute('data-page-number') || 1);
        }
      });
      setCurrentPage(active);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const progressPercent = Math.round(
    (currentPage / Math.max(1, pages.length)) * 100
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (lastSavedPage.current !== currentPage && pages.length > 0) {
        lastSavedPage.current = currentPage;
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
            seriesType: 'webtoon',
            coverImage,
            pageIndex: Math.max(0, currentPage - 1),
            totalPages: pages.length,
            scrollPercentage: progressPercent,
            isCompleted: currentPage >= pages.length,
          }),
        }).catch(() => {});
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [
    currentPage,
    chapter.id,
    chapterNumber,
    pages.length,
    progressPercent,
    seriesId,
    seriesSlug,
    seriesTitle,
    coverImage,
    userId,
  ]);

  return (
    <div ref={containerRef} className="min-h-screen bg-[#07070A] text-slate-100 select-none">
      {/* Top Floating HUD */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 transition-transform duration-300 ${
          hudVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/series/${seriesSlug}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-slate-300 hover:text-white transition-colors"
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
            <span className="hidden sm:inline-block rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-400">
              WEBTOON
            </span>
            <button
              onClick={() => setCommentsOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-slate-200 hover:border-zinc-700 cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5 text-rose-500" />
              <span className="hidden md:inline">Comments</span>
            </button>
          </div>
        </div>
      </header>

      {/* Seamless Vertical Webtoon Canvas */}
      <div
        onClick={() => setHudVisible((prev) => !prev)}
        className="mx-auto max-w-[800px] pt-14 pb-20 cursor-pointer"
      >
        <div className="flex flex-col leading-none">
          {pages.map((page, idx) => (
            <div
              key={page.pageNumber || idx}
              data-page-number={page.pageNumber}
              className="relative w-full bg-zinc-950"
            >
              <ResilientImage
                src={page.imageUrl}
                alt={page.caption || `Page ${page.pageNumber}`}
                className="w-full h-auto block"
                fallbackTitle={seriesTitle}
                fallbackType="webtoon"
                fallbackMode="page"
                chapterNumber={chapterNumber}
                pageNumber={page.pageNumber}
                priority={idx < 2}
              />
            </div>
          ))}
        </div>

        {/* End of Episode Card */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="mx-4 mt-12 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-6 text-center cursor-default"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-rose-400">
            End of Episode {chapterNumber}
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">
            {cleanSubtitle || `Episode ${chapterNumber}`}
          </h2>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {prevChapterId ? (
              <Link
                href={`/read/${prevChapterId}`}
                className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Previous Episode
              </Link>
            ) : (
              <span className="flex items-center gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-5 py-3 text-sm font-medium text-slate-600">
                <ChevronLeft className="h-4 w-4" /> First Episode
              </span>
            )}

            <button
              onClick={() => setCommentsOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-medium text-slate-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <MessageSquare className="h-4 w-4 text-rose-500" /> Episode Comments
            </button>

            {nextChapterId ? (
              <Link
                href={`/read/${nextChapterId}`}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-6 py-3 text-sm font-semibold text-white hover:bg-rose-500 transition-colors shadow-lg shadow-rose-600/25"
              >
                Next Episode <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                href={`/series/${seriesSlug}`}
                className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-3 text-sm font-medium text-white"
              >
                Back to Series
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Floating HUD — docked flush to bottom of viewport */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 pb-safe transition-transform duration-300 ${
          hudVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto flex h-12 max-w-4xl items-center justify-between px-4 gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>
              PANEL {currentPage} / {pages.length}
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-rose-400 font-semibold">{progressPercent}%</span>
          </div>

          <div className="flex-1 max-w-xs hidden sm:block">
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-rose-500 transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {prevChapterId && (
              <Link
                href={`/read/${prevChapterId}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-slate-300 hover:text-white transition-colors"
                title="Previous Episode"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            )}
            {nextChapterId && (
              <Link
                href={`/read/${nextChapterId}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-slate-300 hover:text-white transition-colors"
                title="Next Episode"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-slate-400 hover:text-white cursor-pointer"
              title="Back to top"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => setHudVisible(false)}
              className="flex h-8 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              <EyeOff className="h-3.5 w-3.5" /> Hide HUD
            </button>
          </div>
        </div>
      </div>

      {!hudVisible && (
        <button
          onClick={() => setHudVisible(true)}
          className="fixed bottom-5 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/90 text-slate-300 shadow-lg backdrop-blur-md hover:text-white cursor-pointer"
          title="Show HUD"
        >
          <Eye className="h-4 w-4" />
        </button>
      )}

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
