'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Columns,
  Square,
  Repeat,
  CheckCircle,
} from 'lucide-react';
import { Chapter, Series } from '@/lib/types';
import { CommentsSheet } from './CommentsSheet';
import { useLanguage } from '@/context/LanguageContext';
import { syncReadingProgressToFirestore } from '@/lib/supabase-sync';

interface MangaReaderProps {
  chapter: Chapter & {
    series?: Series;
    prevChapterId?: string;
    nextChapterId?: string;
  };
  userId: string;
  username: string;
}

export function MangaReader({ chapter, userId, username }: MangaReaderProps) {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [currentPage, setCurrentPage] = useState(0);
  const [direction, setDirection] = useState<'rtl' | 'ltr'>('rtl');
  const [spreadMode, setSpreadMode] = useState<'single' | 'double'>('single');
  const [showControls, setShowControls] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [failedPages, setFailedPages] = useState<Record<number, boolean>>({});
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const totalPages = chapter.pages.length;

  const recordProgress = useCallback(
    (pageIdx: number) => {
      if (!chapter.series) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        const pct = Math.round(((pageIdx + 1) / totalPages) * 100);
        const payload = {
          seriesId: chapter.seriesId,
          chapterId: chapter.id,
          chapterNumber: chapter.chapterNumber,
          seriesTitle: chapter.series?.title || 'Manga',
          seriesSlug: chapter.series?.slug || chapter.seriesId,
          seriesType: 'manga' as const,
          coverImage: chapter.series?.coverImage || '/placeholder.jpg',
          pageIndex: pageIdx,
          totalPages,
          scrollPercentage: pct,
          isCompleted: pageIdx >= totalPages - 1,
        };

        try {
          await syncReadingProgressToFirestore(payload);
        } catch (fsErr) {
          console.error('Failed to sync manga progress to Firestore:', fsErr);
        }

        try {
          await fetch('/api/progress', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              ...payload,
            }),
          });
        } catch (err) {
          console.error('Failed to update manga progress:', err);
        }
      }, 400);
    },
    [chapter, totalPages, userId]
  );

  const advancePage = useCallback(() => {
    setCurrentPage((prev) => {
      const step = spreadMode === 'double' ? 2 : 1;
      const next = Math.min(totalPages - 1, prev + step);
      recordProgress(next);
      return next;
    });
  }, [recordProgress, spreadMode, totalPages]);

  const retreatPage = useCallback(() => {
    setCurrentPage((prev) => {
      const step = spreadMode === 'double' ? 2 : 1;
      const next = Math.max(0, prev - step);
      recordProgress(next);
      return next;
    });
  }, [recordProgress, spreadMode]);

  const handleLeftTap = useCallback(() => {
    if (direction === 'rtl') {
      advancePage();
    } else {
      retreatPage();
    }
  }, [advancePage, direction, retreatPage]);

  const handleRightTap = useCallback(() => {
    if (direction === 'rtl') {
      retreatPage();
    } else {
      advancePage();
    }
  }, [advancePage, direction, retreatPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleLeftTap();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleRightTap();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        advancePage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [advancePage, handleLeftTap, handleRightTap]);

  const [proxyRetries, setProxyRetries] = useState<Record<number, boolean>>({});

  const activePage1 = chapter.pages[currentPage];
  const activePage2 =
    spreadMode === 'double' && currentPage + 1 < totalPages
      ? chapter.pages[currentPage + 1]
      : null;

  const handlePageError = (pageNum: number, originalUrl: string) => {
    if (!proxyRetries[pageNum] && originalUrl.startsWith('http')) {
      setProxyRetries((prev) => ({ ...prev, [pageNum]: true }));
    } else {
      setFailedPages((prev) => ({ ...prev, [pageNum]: true }));
    }
  };

  const getPageSrc = (page: { pageNumber: number; imageUrl: string }) => {
    const pageNum = page.pageNumber;
    if (failedPages[pageNum]) {
      return null;
    }
    if (proxyRetries[pageNum] && page.imageUrl.startsWith('http')) {
      return `/api/image-proxy?url=${encodeURIComponent(page.imageUrl)}&title=${encodeURIComponent(
        chapter.series?.title || 'Manga'
      )}&type=manga&mode=page&chapter=${chapter.chapterNumber}&page=${pageNum}`;
    }
    return page.imageUrl;
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-neutral-950 text-slate-100 select-none">
      {/* Top Floating Control Bar */}
      <header
        className={`absolute top-0 left-0 right-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md transition-all duration-200 ${
          showControls
            ? 'translate-y-0 opacity-100'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              href={chapter.series ? `/series/${chapter.series.slug}` : '/'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              aria-label="Back to series"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white truncate max-w-[180px] sm:max-w-xs">
                {language === 'ml' && chapter.series?.malayalamTitle
                  ? chapter.series.malayalamTitle
                  : chapter.series?.title || 'Manga'}
              </span>
              <span className="text-[11px] text-slate-400 truncate max-w-[210px] sm:max-w-md">
                {t.chapter} {chapter.chapterNumber} · {chapter.title}
                {chapter.language ? ` · ${chapter.language}` : ''}
                {chapter.isLiveStreamed ? ' · Live Stream' : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* RTL / LTR Toggle */}
            <button
              type="button"
              onClick={() => setDirection((prev) => (prev === 'rtl' ? 'ltr' : 'rtl'))}
              title={`Reading Direction: ${direction.toUpperCase()}`}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            >
              <Repeat className="h-3.5 w-3.5 text-rose-400" />
              <span className="uppercase text-[11px] font-bold leading-none">{direction}</span>
            </button>

            {/* Spread Toggle */}
            <button
              type="button"
              onClick={() => setSpreadMode((prev) => (prev === 'single' ? 'double' : 'single'))}
              title={`Page Mode: ${spreadMode}`}
              className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            >
              {spreadMode === 'single' ? (
                <Square className="h-4 w-4" />
              ) : (
                <Columns className="h-4 w-4" />
              )}
            </button>

            {/* Comments Drawer Button */}
            <button
              type="button"
              onClick={() => setCommentsOpen(true)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5 text-rose-400" />
              <span className="hidden sm:inline leading-none">{t.comments}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Paged Stage */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-4">
        {/* Left Touch Zone (35%) */}
        <div
          onClick={handleLeftTap}
          title={direction === 'rtl' ? 'Next Page' : 'Previous Page'}
          className="absolute inset-y-0 left-0 w-[35%] z-20 cursor-w-resize"
        />

        {/* Center Touch Zone (30% - toggles toolbar) */}
        <div
          onClick={() => setShowControls((prev) => !prev)}
          title="Toggle Controls"
          className="absolute inset-y-0 left-[35%] w-[30%] z-20 cursor-pointer"
        />

        {/* Right Touch Zone (35%) */}
        <div
          onClick={handleRightTap}
          title={direction === 'rtl' ? 'Previous Page' : 'Next Page'}
          className="absolute inset-y-0 right-0 w-[35%] z-20 cursor-e-resize"
        />

        {/* Canvas Render Area */}
        <div
          className={`flex h-full w-full max-w-5xl items-center justify-center gap-2 select-none ${
            direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'
          }`}
        >
          {activePage1 && (
            <div className="relative flex h-full w-full max-h-[86vh] items-center justify-center overflow-hidden rounded-lg bg-neutral-900 shadow-2xl border border-neutral-800">
              {getPageSrc(activePage1) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={getPageSrc(activePage1)!}
                  alt={`Page ${activePage1.pageNumber}`}
                  referrerPolicy="no-referrer"
                  onError={() => handlePageError(activePage1.pageNumber, activePage1.imageUrl)}
                  className="max-h-[86vh] w-auto object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <p className="text-xs text-slate-400 font-mono">Page {activePage1.pageNumber}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFailedPages((prev) => {
                        const next = { ...prev };
                        delete next[activePage1.pageNumber];
                        return next;
                      });
                      setProxyRetries((prev) => {
                        const next = { ...prev };
                        delete next[activePage1.pageNumber];
                        return next;
                      });
                    }}
                    className="mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    Reload Page
                  </button>
                </div>
              )}
            </div>
          )}

          {activePage2 && (
            <div className="relative hidden md:flex h-full w-full max-h-[86vh] items-center justify-center overflow-hidden rounded-lg bg-neutral-900 shadow-2xl border border-neutral-800">
              {getPageSrc(activePage2) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={getPageSrc(activePage2)!}
                  alt={`Page ${activePage2.pageNumber}`}
                  referrerPolicy="no-referrer"
                  onError={() => handlePageError(activePage2.pageNumber, activePage2.imageUrl)}
                  className="max-h-[86vh] w-auto object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <p className="text-xs text-slate-400 font-mono">Page {activePage2.pageNumber}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFailedPages((prev) => {
                        const next = { ...prev };
                        delete next[activePage2.pageNumber];
                        return next;
                      });
                      setProxyRetries((prev) => {
                        const next = { ...prev };
                        delete next[activePage2.pageNumber];
                        return next;
                      });
                    }}
                    className="mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    Reload Page
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Floating Bar */}
      <footer
        className={`absolute bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/90 backdrop-blur-md transition-all duration-200 ${
          showControls
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4">
          <button
            type="button"
            onClick={retreatPage}
            disabled={currentPage === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-medium text-slate-300 disabled:opacity-30 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Prev Page</span>
          </button>

          <div className="flex flex-1 items-center justify-center gap-3 max-w-sm">
            <span className="text-xs font-mono tabular-nums text-slate-300 whitespace-nowrap">
              {currentPage + 1} / {totalPages}
            </span>
            <input
              type="range"
              min="0"
              max={Math.max(0, totalPages - 1)}
              value={currentPage}
              onChange={(e) => {
                const val = Number(e.target.value);
                setCurrentPage(val);
                recordProgress(val);
              }}
              className="w-full accent-rose-500 cursor-pointer"
            />
          </div>

          {currentPage >= totalPages - 1 ? (
            chapter.nextChapterId ? (
              <button
                type="button"
                onClick={() => router.push(`/read/${chapter.nextChapterId}`)}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-500 transition-colors cursor-pointer"
              >
                <span>Next Ch.</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <Link
                href={chapter.series ? `/series/${chapter.series.slug}` : '/'}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
              >
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span>Finished</span>
              </Link>
            )
          ) : (
            <button
              type="button"
              onClick={advancePage}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <span className="hidden sm:inline">Next Page</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </footer>

      <CommentsSheet
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        chapterId={chapter.id}
        seriesId={chapter.seriesId}
        currentUserId={userId}
        currentUsername={username}
      />
    </div>
  );
}
