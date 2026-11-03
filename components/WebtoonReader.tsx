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
  Sparkles,
  Layers,
  Languages,
} from 'lucide-react';
import { CommentsSheet } from './CommentsSheet';
import { ResilientImage } from './ResilientImage';
import { TranslatedPanelImage } from './TranslatedPanelImage';
import { OfflineSaveButton } from './OfflineManager';
import { getChapterEdits } from '@/lib/supabase-sync';
import { getOfflineChapter } from '@/lib/offline-cache';
import {
  Chapter,
  Series,
  PageImage,
  ChapterEditsData,
  PanelCutBox,
} from '@/lib/types';

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
  isAdmin?: boolean;
}

const EDIT_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ml', label: 'Malayalam (മലയാളം)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
];

export function WebtoonReader({
  chapter,
  series: seriesProp,
  prevChapterId: prevChapterIdProp,
  nextChapterId: nextChapterIdProp,
  userId = 'guest',
  username = 'GuestReader',
  isAdmin = false,
}: WebtoonReaderProps) {
  const [hudVisible, setHudVisible] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [isPinAdmin, setIsPinAdmin] = useState(false);

  // Pre-saved Studio Chapter Edits state (Zero-lag reader translations)
  const [editsByLang, setEditsByLang] = useState<Record<string, ChapterEditsData>>({});
  const [activeEditLang, setActiveEditLang] = useState<string>('en');
  const [showTranslatedOverlay, setShowTranslatedOverlay] = useState(true);
  const [guidedPanelMode, setGuidedPanelMode] = useState(false);
  const [activeGuidedIndex, setActiveGuidedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastSavedPage = useRef<number>(1);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (sessionStorage.getItem('panelverse_admin_auth') === 'true') {
        Promise.resolve().then(() => setIsPinAdmin(true));
      }
    }
  }, []);

  const canAccessStudio = isAdmin || isPinAdmin;

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

  // Fetch published chapter_edits across supported languages on mount
  useEffect(() => {
    let isMounted = true;
    async function loadSavedEdits() {
      const found: Record<string, ChapterEditsData> = {};
      await Promise.all(
        EDIT_LANGUAGES.map(async ({ code }) => {
          const data = await getChapterEdits(seriesId, chapter.id, code);
          if (data && Array.isArray(data.pages) && data.pages.length > 0) {
            const hasContent = data.pages.some(
              (p) =>
                Boolean(p.bakedImageUrl) ||
                (Array.isArray(p.speechBubbles) && p.speechBubbles.length > 0) ||
                (Array.isArray(p.panelCuts) && p.panelCuts.length > 0)
            );
            if (hasContent) {
              found[code] = data;
            }
          }
        })
      );
      if (Object.keys(found).length === 0) {
        const offlineRecord = await getOfflineChapter(chapter.id);
        if (offlineRecord?.editsByLang) {
          Object.assign(found, offlineRecord.editsByLang);
        }
      }
      if (!isMounted) return;
      setEditsByLang(found);
      const availableCodes = Object.keys(found);
      if (availableCodes.length > 0 && !found[activeEditLang]) {
        setActiveEditLang(availableCodes[0]);
      }
    }
    void loadSavedEdits();
    return () => {
      isMounted = false;
    };
  }, [seriesId, chapter.id, activeEditLang]);

  const activeEdits: ChapterEditsData | null = editsByLang[activeEditLang] || null;
  const availableLangCodes = useMemo(() => Object.keys(editsByLang), [editsByLang]);

  const hasSpeechBubbles = useMemo(() => {
    return availableLangCodes.length > 0;
  }, [availableLangCodes]);

  const orderedGuidedPanels = useMemo(() => {
    if (!activeEdits) return [];
    const list: { pageIndex: number; pageUrl: string; cut: PanelCutBox }[] = [];
    activeEdits.pages.forEach((p) => {
      const pageObj = pages[p.pageIndex];
      if (!pageObj || !Array.isArray(p.panelCuts)) return;
      const sorted = [...p.panelCuts].sort((a, b) => a.order - b.order);
      sorted.forEach((cut) => {
        list.push({
          pageIndex: p.pageIndex,
          pageUrl: pageObj.imageUrl,
          cut,
        });
      });
    });
    return list;
  }, [activeEdits, pages]);

  const hasPanelCuts = orderedGuidedPanels.length > 0;

  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  // requestAnimationFrame-throttled scroll listener for 60fps/120fps smooth mobile scrolling
  useEffect(() => {
    let rafId: number | null = null;

    const updateActivePage = () => {
      const container = containerRef.current;
      const panels = (container || document).querySelectorAll<HTMLElement>('[data-page-number]');
      if (!panels.length) {
        rafId = null;
        return;
      }

      const viewportCenter = window.innerHeight * 0.5;
      let active = 1;

      // Sequential early-exit: once a panel top is below the viewport center,
      // all subsequent panels in continuous vertical scroll are lower down
      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        const rect = panel.getBoundingClientRect();

        if (rect.top <= viewportCenter) {
          active = Number(panel.getAttribute('data-page-number') || (i + 1));
        } else {
          break;
        }
      }

      // Avoid unnecessary re-renders while scrolling inside the same panel
      if (active !== currentPageRef.current) {
        currentPageRef.current = active;
        setCurrentPage(active);
      }

      rafId = null;
    };

    const handleScroll = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(updateActivePage);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
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

  const activeGuidedPanel = orderedGuidedPanels[activeGuidedIndex] || null;

  return (
    <div ref={containerRef} className="min-h-screen bg-[#07070A] text-slate-100 select-none">
      {/* Top Floating HUD */}
      <header
        className={`fixed top-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 transition-transform duration-300 ${
          hudVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="mx-auto flex h-13 sm:h-14 max-w-4xl items-center justify-between px-2.5 sm:px-4 gap-1.5 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Link
              href={`/series/${seriesSlug}`}
              className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-slate-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] sm:text-xs text-slate-400 leading-tight">
                {seriesTitle}
              </p>
              <h1 className="truncate text-xs sm:text-sm font-bold text-white leading-tight">
                {displayHeading}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Language Switcher for Ordinary Users */}
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-1.5 sm:px-2.5 h-8 sm:h-9 text-xs">
              <Languages className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              <select
                value={showTranslatedOverlay && hasSpeechBubbles ? activeEditLang : 'original'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'original') {
                    setShowTranslatedOverlay(false);
                  } else {
                    setActiveEditLang(val);
                    setShowTranslatedOverlay(true);
                  }
                }}
                aria-label="Select Reading Language"
                className="w-[74px] sm:w-auto max-w-[82px] sm:max-w-[150px] truncate bg-transparent text-[11px] sm:text-xs font-semibold text-white focus:outline-none cursor-pointer"
              >
                <option value="original" className="bg-zinc-900 text-white">
                  Original
                </option>
                {EDIT_LANGUAGES.map((lang) => {
                  const isReady = Boolean(editsByLang[lang.code]);
                  return (
                    <option
                      key={lang.code}
                      value={lang.code}
                      disabled={!isReady}
                      className="bg-zinc-900 text-white"
                    >
                      {lang.label} {isReady ? '✓' : '—'}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Automatic 5-Chapter LRU Cache + Manual Save Offline Button */}
            <OfflineSaveButton
              chapter={chapter}
              series={series}
              editsByLang={editsByLang}
              autoCacheOnMount
            />

            {/* Guided Panel-by-Panel Mode Toggle (Only shown when panelCuts exist) */}
            {hasPanelCuts && (
              <button
                onClick={() => {
                  setGuidedPanelMode((prev) => !prev);
                  setActiveGuidedIndex(0);
                }}
                className={`flex h-8 sm:h-9 items-center gap-1.5 rounded-lg border px-2 sm:px-2.5 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                  guidedPanelMode
                    ? 'border-indigo-500/50 bg-indigo-600 text-white'
                    : 'border-zinc-800 bg-zinc-900 text-slate-300 hover:text-white'
                }`}
                title="Toggle Guided Panel-by-Panel View"
              >
                <Layers className="h-3.5 w-3.5" />
                <span className="hidden md:inline">
                  {guidedPanelMode ? 'Panel View' : 'Full Strip'}
                </span>
              </button>
            )}

            {/* Strictly Owner-Only Studio Deep-Link Button */}
            {canAccessStudio && (
              <Link
                href={`/studio?seriesId=${encodeURIComponent(seriesId)}&chapterId=${encodeURIComponent(chapter.id)}`}
                className="flex h-8 sm:h-9 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2 sm:px-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/25 transition-colors shrink-0"
                title="Open in Admin Translation Studio"
              >
                <Sparkles className="h-3.5 w-3.5 text-rose-400" />
                <span className="hidden md:inline">Studio</span>
              </Link>
            )}

            <button
              onClick={() => setCommentsOpen(true)}
              className="flex h-8 sm:h-9 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 sm:px-3 text-xs font-medium text-slate-200 hover:border-zinc-700 cursor-pointer shrink-0"
              title="Comments"
            >
              <MessageSquare className="h-3.5 w-3.5 text-rose-500" />
              <span className="hidden md:inline">Comments</span>
            </button>
          </div>
        </div>
      </header>

      {/* Guided Panel-by-Panel Step View OR Seamless Vertical Webtoon Canvas */}
      {guidedPanelMode && activeGuidedPanel ? (
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4 pt-16 pb-20">
          <div className="mb-3 flex w-full items-center justify-between text-xs font-mono text-slate-400">
            <span>
              GUIDED PANEL {activeGuidedIndex + 1} / {orderedGuidedPanels.length}
            </span>
            <span>PAGE {activeGuidedPanel.pageIndex + 1}</span>
          </div>

          <div className="relative w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
            <div
              style={{
                width: `${(100 / Math.max(1, activeGuidedPanel.cut.box.wPercent)) * 100}%`,
                marginLeft: `-${
                  (activeGuidedPanel.cut.box.xPercent /
                    Math.max(1, activeGuidedPanel.cut.box.wPercent)) *
                  100
                }%`,
                marginTop: `-${
                  (activeGuidedPanel.cut.box.yPercent /
                    Math.max(1, activeGuidedPanel.cut.box.wPercent)) *
                  100
                }%`,
              }}
              className="relative"
            >
              <ResilientImage
                src={activeGuidedPanel.pageUrl}
                alt={`Guided Panel ${activeGuidedIndex + 1}`}
                className="w-full h-auto block"
                fallbackTitle={seriesTitle}
                fallbackType="webtoon"
                fallbackMode="page"
                chapterNumber={chapterNumber}
                pageNumber={activeGuidedPanel.pageIndex + 1}
                priority
              />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={() => setActiveGuidedIndex((i) => Math.max(0, i - 1))}
              disabled={activeGuidedIndex <= 0}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" /> Prev Panel
            </button>
            <button
              onClick={() => setGuidedPanelMode(false)}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
            >
              Exit Guided View
            </button>
            <button
              onClick={() =>
                setActiveGuidedIndex((i) =>
                  Math.min(orderedGuidedPanels.length - 1, i + 1)
                )
              }
              disabled={activeGuidedIndex >= orderedGuidedPanels.length - 1}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer"
            >
              Next Panel <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setHudVisible((prev) => !prev)}
          className="mx-auto max-w-[800px] pt-14 pb-20 cursor-pointer"
        >
          <div className="flex flex-col leading-none">
            {pages.map((page, idx) => {
              const pageEdits = activeEdits?.pages.find(
                (p) => p.pageIndex === idx
              );
              const bubbles = pageEdits?.speechBubbles || [];

              return (
                <div
                  key={page.pageNumber || idx}
                  data-page-number={page.pageNumber}
                  className="relative w-full bg-zinc-950"
                >
                  <TranslatedPanelImage
                    src={page.imageUrl}
                    alt={page.caption || `Page ${page.pageNumber}`}
                    className="w-full h-auto block"
                    fallbackTitle={seriesTitle}
                    fallbackType="webtoon"
                    fallbackMode="page"
                    chapterNumber={chapterNumber}
                    pageNumber={page.pageNumber}
                    priority={idx < 2}
                    bubbles={bubbles}
                    languageCode={activeEditLang}
                    showTranslated={showTranslatedOverlay}
                    preBakedUrl={pageEdits?.bakedImageUrl}
                  />
                </div>
              );
            })}
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
      )}

      {/* Bottom Floating HUD — docked flush to bottom of viewport */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 pb-safe transition-transform duration-300 ${
          hudVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto flex h-12 max-w-4xl items-center justify-between px-3 sm:px-4 gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-mono text-slate-400 whitespace-nowrap shrink-0">
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

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
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
              className="flex h-8 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 sm:px-2.5 text-[11px] sm:text-xs text-slate-400 hover:text-white cursor-pointer whitespace-nowrap"
            >
              <EyeOff className="h-3.5 w-3.5 shrink-0" />
              <span>Hide HUD</span>
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
