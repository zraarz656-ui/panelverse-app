'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Sliders,
  CheckCircle,
} from 'lucide-react';
import { Chapter, Series } from '@/lib/types';
import { CommentsSheet } from './CommentsSheet';
import { useLanguage } from '@/context/LanguageContext';
import { syncReadingProgressToFirestore } from '@/lib/supabase-sync';

interface WebtoonReaderProps {
  chapter: Chapter & {
    series?: Series;
    prevChapterId?: string;
    nextChapterId?: string;
  };
  userId: string;
  username: string;
}

export function WebtoonReader({ chapter, userId, username }: WebtoonReaderProps) {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [showControls, setShowControls] = useState(true);
  const [widthMode, setWidthMode] = useState<'standard' | 'wide' | 'fill'>('standard');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [failedPages, setFailedPages] = useState<Record<number, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const maxWidthClass =
    widthMode === 'fill' ? 'max-w-4xl' : widthMode === 'wide' ? 'max-w-2xl' : 'max-w-xl';

  const recordProgress = useCallback(
    (pct: number, completed: boolean) => {
      if (!chapter.series) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        const payload = {
          seriesId: chapter.seriesId,
          chapterId: chapter.id,
          chapterNumber: chapter.chapterNumber,
          seriesTitle: chapter.series?.title || 'Webtoon',
          seriesSlug: chapter.series?.slug || chapter.seriesId,
          seriesType: 'webtoon' as const,
          coverImage: chapter.series?.coverImage || '/placeholder.jpg',
          pageIndex: Math.floor((pct / 100) * chapter.pages.length),
          totalPages: chapter.pages.length,
          scrollPercentage: pct,
          isCompleted: completed,
        };

        try {
          await syncReadingProgressToFirestore(payload);
        } catch (fsErr) {
          console.error('Failed to sync webtoon progress to Firestore:', fsErr);
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
          console.error('Failed to update webtoon progress:', err);
        }
      }, 500);
    },
    [chapter, userId]
  );

  useEffect(() => {
    const handleScroll = () => {
      const el = document.documentElement;
      const totalHeight = el.scrollHeight - el.clientHeight;
      if (totalHeight <= 0) return;

      const currentScroll = el.scrollTop;
      const pct = Math.min(100, Math.round((currentScroll / totalHeight) * 100));
      setScrollPercent(pct);

      const completed = pct >= 95;
      if (completed && !isCompleted) {
        setIsCompleted(true);
      }
      recordProgress(pct, completed);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [recordProgress, isCompleted]);

  const [proxyRetries, setProxyRetries] = useState<Record<number, boolean>>({});

  const toggleControls = () => {
    setShowControls((prev) => !prev);
  };

  const handlePageError = (pageNum: number, originalUrl: string) => {
    // Tier 1 fallback: Try proxying via /api/image-proxy
    if (!proxyRetries[pageNum] && originalUrl.startsWith('http')) {
      setProxyRetries((prev) => ({ ...prev, [pageNum]: true }));
    } else {
      // Tier 2: Mark failed
      setFailedPages((prev) => ({ ...prev, [pageNum]: true }));
    }
  };

  const getPageUrl = (page: { pageNumber: number; imageUrl: string }) => {
    const pageNum = page.pageNumber;
    if (failedPages[pageNum]) {
      return null;
    }
    if (proxyRetries[pageNum] && page.imageUrl.startsWith('http')) {
      return `/api/image-proxy?url=${encodeURIComponent(page.imageUrl)}&title=${encodeURIComponent(
        chapter.series?.title || 'Webtoon'
      )}&type=webtoon&mode=page&chapter=${chapter.chapterNumber}&page=${pageNum}`;
    }
    return page.imageUrl;
  };

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col items-center">
      {/* Top Floating Control Bar */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md transition-all duration-200 ${
          showControls
            ? 'translate-y-0 opacity-100'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              href={chapter.series ? `/series/${chapter.series.slug}` : '/'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              aria-label="Back to series"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white truncate max-w-[200px] sm:max-w-xs">
                {language === 'ml' && chapter.series?.malayalamTitle
                  ? chapter.series.malayalamTitle
                  : chapter.series?.title || 'Webtoon'}
              </span>
              <span className="text-[11px] text-slate-400 truncate max-w-[230px] sm:max-w-md">
                {t.episode} {chapter.chapterNumber} · {chapter.title}
                {chapter.language ? ` · ${chapter.language}` : ''}
                {chapter.isLiveStreamed ? ' · Live Stream' : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Width Toggle */}
            <button
              type="button"
              onClick={() =>
                setWidthMode((prev) =>
                  prev === 'standard' ? 'wide' : prev === 'wide' ? 'fill' : 'standard'
                )
              }
              title={`Layout: ${widthMode}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
            >
              <Sliders className="h-4 w-4" />
            </button>

            {/* Comments Toggle */}
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

        {/* Scroll Progress Line */}
        <div className="h-0.5 w-full bg-slate-800">
          <div
            className="h-full bg-rose-500 transition-all duration-150"
            style={{ width: `${scrollPercent}%` }}
          />
        </div>
      </header>

      {/* Main Continuous Webtoon Strip */}
      <main
        ref={containerRef}
        onClick={toggleControls}
        className={`w-full ${maxWidthClass} transition-all duration-200 cursor-pointer pt-14 pb-24`}
      >
        <div className="flex flex-col gap-0 select-none bg-slate-950">
          {chapter.pages.map((page, idx) => {
            const pageNum = page.pageNumber || idx + 1;
            const currentSrc = getPageUrl({ pageNumber: pageNum, imageUrl: page.imageUrl });

            return (
              <div key={pageNum} className="relative w-full min-h-[300px] bg-slate-950 flex items-center justify-center">
                {currentSrc ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={currentSrc}
                    alt={`${chapter.title} - Panel ${pageNum}`}
                    loading={idx < 4 ? 'eager' : 'lazy'}
                    referrerPolicy="no-referrer"
                    onError={() => handlePageError(pageNum, page.imageUrl)}
                    className="block w-full h-auto object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 my-4 rounded-xl border border-slate-800 bg-slate-900/60 text-center max-w-sm mx-auto">
                    <p className="text-xs text-slate-400 font-mono">Panel {pageNum}</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFailedPages((prev) => {
                          const next = { ...prev };
                          delete next[pageNum];
                          return next;
                        });
                        setProxyRetries((prev) => {
                          const next = { ...prev };
                          delete next[pageNum];
                          return next;
                        });
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                    >
                      Reload Panel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* End of Episode Card */}
        <div className="mt-8 mx-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <div className="flex items-center justify-center gap-2 text-rose-400 text-sm font-semibold">
            <CheckCircle className="h-5 w-5" />
            <span>Episode {chapter.chapterNumber} Finished!</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            You completed {chapter.title}. Reading progress saved.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {chapter.prevChapterId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/read/${chapter.prevChapterId}`);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" /> Prev Episode
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCommentsOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-rose-900/80 bg-rose-950/40 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 transition-colors cursor-pointer"
            >
              <MessageSquare className="h-4 w-4" /> Discuss Episode
            </button>

            {chapter.nextChapterId ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/read/${chapter.nextChapterId}`);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors cursor-pointer"
              >
                Next Episode <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <Link
                href={chapter.series ? `/series/${chapter.series.slug}` : '/'}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
              >
                Series Details
              </Link>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Floating Bar */}
      <footer
        className={`fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/90 backdrop-blur-md transition-all duration-200 ${
          showControls
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!chapter.prevChapterId}
              onClick={() => chapter.prevChapterId && router.push(`/read/${chapter.prevChapterId}`)}
              className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 disabled:opacity-30 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Prev</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="font-mono tabular-nums text-slate-200">{scrollPercent}%</span>
            <span>·</span>
            <span className="font-mono tabular-nums">{chapter.pages.length} Panels</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!chapter.nextChapterId}
              onClick={() => chapter.nextChapterId && router.push(`/read/${chapter.nextChapterId}`)}
              className="flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-30 hover:bg-rose-500 transition-colors cursor-pointer"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </footer>

      {/* Comments Drawer */}
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
