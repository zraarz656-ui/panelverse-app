'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Sparkles,
  Save,
  Trash2,
  Lock,
  KeyRound,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Layers,
  Languages,
  RotateCcw,
  Cpu,
  Sliders,
  X,
  HelpCircle,
  Check,
} from 'lucide-react';
import { useIdentity } from '@/hooks/useIdentity';
import {
  getChapterEdits,
  saveChapterEdits,
  subscribeLibrarySeriesFromFirestore,
  subscribeLibraryChaptersFromFirestore,
  mergeSeriesWithFirestore,
  mergeChaptersWithFirestore,
  PersistedSeriesRecord,
  PersistedChapterRecord,
} from '@/lib/supabase-sync';
import { compressImageFileToDataUrl } from '@/lib/image-upload';
import {
  Series,
  Chapter,
  PageImage,
  ChapterEditsData,
  PageEditData,
  SpeechBubbleOverlay,
} from '@/lib/types';

const STUDIO_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ml', label: 'Malayalam (മലയാളം)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
];

import {
  ensureProxiedSrc,
  sampleBubbleColors,
  renderCleanTranslatedPageToDataUrl,
  createHighContrastTextOnlyCanvasDataUrl,
} from '@/lib/canvas-bubble-renderer';

function StudioContent() {
  const searchParams = useSearchParams();
  const initialSeriesId = searchParams.get('seriesId') || '';
  const initialChapterId = searchParams.get('chapterId') || '';
  const initialLang = searchParams.get('lang') || 'en';

  const {
    email,
    isAdmin: isFirestoreAdmin,
    isAuthReady,
    signInWithGoogle,
  } = useIdentity();

  // Admin gate state
  const [isPinAuthed, setIsPinAuthed] = useState(false);
  const [savedPin, setSavedPin] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (sessionStorage.getItem('panelverse_admin_auth') === 'true') {
        const pin = sessionStorage.getItem('panelverse_admin_pin') || '';
        Promise.resolve().then(() => {
          setIsPinAuthed(true);
          setSavedPin(pin);
        });
      }
    }
  }, []);

  const isAuthorizedAdmin = isFirestoreAdmin || isPinAuthed;

  // Catalog & chapter selection state
  const [baseSeries, setBaseSeries] = useState<Series[]>([]);
  const [fsSeries, setFsSeries] = useState<PersistedSeriesRecord[]>([]);
  const [fsChapters, setFsChapters] = useState<PersistedChapterRecord[]>([]);

  const [selectedSeriesId, setSelectedSeriesId] = useState(initialSeriesId);
  const [selectedChapterId, setSelectedChapterId] = useState(initialChapterId);
  const [languageCode, setLanguageCode] = useState(
    ['en', 'ml', 'hi', 'ta'].includes(initialLang) ? initialLang : 'en'
  );

  const [chaptersList, setChaptersList] = useState<Chapter[]>([]);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [originalPages, setOriginalPages] = useState<PageImage[]>([]);
  const [renderedPreviewUrls, setRenderedPreviewUrls] = useState<
    Record<number, string>
  >({});
  const [isLoadingChapter, setIsLoadingChapter] = useState(false);

  // Auto-Translate & Save state
  const [editsData, setEditsData] = useState<ChapterEditsData>({
    version: 1,
    pages: [],
  });
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);

  const [isAutoTranslatingEpisode, setIsAutoTranslatingEpisode] =
    useState(false);
  const [translatingPageIdx, setTranslatingPageIdx] = useState<number | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // AI Translation Engine & OpenRouter API key state
  const [selectedEngine, setSelectedEngine] = useState<
    'auto' | 'gemini' | 'openrouter'
  >('auto');
  const [openRouterApiKey, setOpenRouterApiKey] = useState('');
  const [tempApiKeyInput, setTempApiKeyInput] = useState('');
  const [showEngineModal, setShowEngineModal] = useState(false);
  const [engineKeySavedNotice, setEngineKeySavedNotice] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedKey =
        localStorage.getItem('panelverse_openrouter_key') || '';
      const storedEngine =
        (localStorage.getItem('panelverse_ocr_engine') as
          | 'auto'
          | 'gemini'
          | 'openrouter') || 'auto';
      setOpenRouterApiKey(storedKey);
      setTempApiKeyInput(storedKey);
      setSelectedEngine(storedEngine);
    }
  }, []);

  const handleSaveEngineSettings = (
    engine: 'auto' | 'gemini' | 'openrouter',
    key: string
  ) => {
    setSelectedEngine(engine);
    setOpenRouterApiKey(key.trim());
    if (typeof window !== 'undefined') {
      localStorage.setItem('panelverse_ocr_engine', engine);
      if (key.trim()) {
        localStorage.setItem('panelverse_openrouter_key', key.trim());
      } else {
        localStorage.removeItem('panelverse_openrouter_key');
      }
    }
    setEngineKeySavedNotice(true);
    setTimeout(() => setEngineKeySavedNotice(false), 3000);
    setShowEngineModal(false);
  };

  const originalImageRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const idCounterRef = useRef<number>(1);

  // Load series list
  useEffect(() => {
    if (!isAuthorizedAdmin) return;
    fetch('/api/series')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Series[]) => {
        if (Array.isArray(list)) {
          setBaseSeries(list);
          if (!selectedSeriesId && list.length > 0 && !initialChapterId) {
            setSelectedSeriesId(list[0].id);
          }
        }
      })
      .catch(() => {});
  }, [isAuthorizedAdmin, selectedSeriesId, initialChapterId]);

  useEffect(() => {
    if (!isAuthReady || !isAuthorizedAdmin) return;
    const unsubSeries = subscribeLibrarySeriesFromFirestore(setFsSeries);
    const unsubChapters = subscribeLibraryChaptersFromFirestore(setFsChapters);
    return () => {
      unsubSeries();
      unsubChapters();
    };
  }, [isAuthReady, isAuthorizedAdmin]);

  const allSeries = React.useMemo(
    () => mergeSeriesWithFirestore(baseSeries, fsSeries),
    [baseSeries, fsSeries]
  );

  // Load chapters when series changes
  useEffect(() => {
    if (!isAuthorizedAdmin || !selectedSeriesId) return;
    let isMounted = true;
    const targetSeries = allSeries.find(
      (s) => s.id === selectedSeriesId || s.slug === selectedSeriesId
    );
    const slugOrId = targetSeries?.slug || selectedSeriesId;
    const resolvedSeriesId = targetSeries?.id || selectedSeriesId;

    fetch(`/api/series/${encodeURIComponent(slugOrId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!isMounted) return;
        const apiChapters: Chapter[] = Array.isArray(data?.chapters)
          ? data.chapters
          : [];
        const merged = mergeChaptersWithFirestore(
          apiChapters,
          fsChapters,
          resolvedSeriesId
        );
        setChaptersList(merged);
        if (
          merged.length > 0 &&
          (!selectedChapterId ||
            (!merged.some((c) => c.id === selectedChapterId) &&
              selectedChapterId !== initialChapterId))
        ) {
          setSelectedChapterId(merged[0].id);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        const merged = mergeChaptersWithFirestore(
          [],
          fsChapters,
          resolvedSeriesId
        );
        setChaptersList(merged);
        if (!selectedChapterId && merged.length > 0) {
          setSelectedChapterId(merged[0].id);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    isAuthorizedAdmin,
    selectedSeriesId,
    allSeries,
    fsChapters,
    selectedChapterId,
    initialChapterId,
  ]);

  // Load active chapter pages + existing chapter_edits
  useEffect(() => {
    if (!isAuthorizedAdmin || !selectedChapterId) return;
    let isMounted = true;

    async function loadChapterAndEdits() {
      await Promise.resolve();
      if (!isMounted) return;
      setIsLoadingChapter(true);
      setStatusMessage(null);
      try {
        const res = await fetch(
          `/api/chapters/${encodeURIComponent(selectedChapterId)}`
        );
        let baseChapter: (Chapter & { series?: Series }) | null = null;
        if (res.ok) {
          baseChapter = await res.json();
        }
        const fsOverride = fsChapters.find((c) => c.id === selectedChapterId);

        let loadedChapter: (Chapter & { series?: Series }) | null =
          baseChapter || fsOverride || null;

        if (baseChapter && fsOverride && !fsOverride.isDeleted) {
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

          loadedChapter = {
            ...baseChapter,
            chapterNumber:
              fsOverride.chapterNumber || baseChapter.chapterNumber,
            title: fsOverride.title || baseChapter.title,
            releaseDate: fsOverride.releaseDate || baseChapter.releaseDate,
            pages: selectedPages,
            pagesCount: selectedPages.length,
          };
        }

        if (!isMounted || !loadedChapter) return;
        setActiveChapter(loadedChapter);
        setOriginalPages(
          Array.isArray(loadedChapter.pages) ? loadedChapter.pages : []
        );
        setRenderedPreviewUrls({});

        const resolvedSeriesId =
          loadedChapter.seriesId ||
          loadedChapter.series?.id ||
          selectedSeriesId;
        if (resolvedSeriesId && resolvedSeriesId !== selectedSeriesId) {
          setSelectedSeriesId(resolvedSeriesId);
        }

        const existingEdits = await getChapterEdits(
          resolvedSeriesId || 'unknown-series',
          selectedChapterId,
          languageCode
        );

        if (!isMounted) return;
        if (existingEdits && Array.isArray(existingEdits.pages)) {
          setEditsData(existingEdits);
        } else {
          setEditsData({ version: 1, pages: [] });
        }
        setSelectedBubbleId(null);
      } catch (err) {
        console.error('Failed to load chapter in Studio:', err);
      } finally {
        if (isMounted) setIsLoadingChapter(false);
      }
    }

    void loadChapterAndEdits();
    return () => {
      isMounted = false;
    };
  }, [
    isAuthorizedAdmin,
    selectedChapterId,
    languageCode,
    fsChapters,
    selectedSeriesId,
  ]);

  // Re-bake clean canvas preview whenever editsData or languageCode changes
  const refreshBakedPagePreview = useCallback(
    (pageIdx: number, currentEdits: ChapterEditsData) => {
      const imgEl = originalImageRefs.current[pageIdx];
      if (!imgEl || !imgEl.naturalWidth) return;
      const pageEdit = currentEdits.pages.find((p) => p.pageIndex === pageIdx);
      const bubbles = pageEdit?.speechBubbles || [];
      if (bubbles.length === 0) {
        setRenderedPreviewUrls((prev) => {
          const next = { ...prev };
          delete next[pageIdx];
          return next;
        });
        return;
      }
      const bakedUrl = renderCleanTranslatedPageToDataUrl(
        imgEl,
        bubbles,
        languageCode
      );
      setRenderedPreviewUrls((prev) => ({
        ...prev,
        [pageIdx]: bakedUrl,
      }));
    },
    [languageCode]
  );

  useEffect(() => {
    originalPages.forEach((_, idx) => {
      refreshBakedPagePreview(idx, editsData);
    });
  }, [editsData, originalPages, refreshBakedPagePreview]);

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setIsVerifyingPin(true);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_pin', pin: pinInput }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPinError(data.error || 'Invalid Admin PIN');
        return;
      }
      sessionStorage.setItem('panelverse_admin_auth', 'true');
      sessionStorage.setItem('panelverse_admin_pin', pinInput);
      setSavedPin(pinInput);
      setIsPinAuthed(true);
    } catch {
      setPinError('Failed to verify Admin PIN');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  /**
   * Automatically scans a full comic page (splitting into vertical slices if it's a tall webtoon strip),
   * detects every speech bubble, samples the exact bubble colors, and bakes the translated text cleanly.
   */
  const autoTranslateSinglePage = useCallback(
    async (pageIdx: number): Promise<SpeechBubbleOverlay[]> => {
      const imgEl = originalImageRefs.current[pageIdx];
      if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) {
        throw new Error(
          `Page ${pageIdx + 1} is still loading. Please wait a moment and try again.`
        );
      }

      const natW = imgEl.naturalWidth;
      const natH = imgEl.naturalHeight;

      // Full-resolution canvas for accurate bubble interior color sampling
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = natW;
      fullCanvas.height = natH;
      const fullCtx = fullCanvas.getContext('2d');
      if (!fullCtx) throw new Error('Canvas 2D context unavailable');
      fullCtx.drawImage(imgEl, 0, 0, natW, natH);

      // Use 5.5x width per slice so virtually all webtoon pages scan in 1 single high-accuracy API call (minimizing rate limit pressure)
      const maxSliceHeight = Math.round(natW * 5.5);
      const numSlices = Math.max(1, Math.ceil(natH / maxSliceHeight));
      const detectedOverlays: SpeechBubbleOverlay[] = [];

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-studio-authorized': 'true',
        'x-admin-pin': savedPin || '1234',
      };

      const callOcrEndpoint = async (imageBase64: string) => {
        for (let attempt = 0; attempt < 4; attempt++) {
          const res = await fetch('/api/ocr-translate', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              mode: 'full-page',
              imageBase64,
              mimeType: 'image/jpeg',
              targetLanguage: languageCode,
              adminEmail: email,
              engine: selectedEngine,
              openRouterKey: openRouterApiKey || undefined,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) return data;

          const isRateLimit =
            res.status === 429 ||
            res.status === 503 ||
            data.isRateLimit ||
            (typeof data.error === 'string' &&
              (data.error.includes('demand') ||
                data.error.includes('15 RPM') ||
                data.error.includes('limit') ||
                data.error.includes('Cooling')));

          if (isRateLimit && attempt < 3) {
            const waitSec = data.retryAfterSeconds || (20 + attempt * 6);
            for (let s = waitSec; s > 0; s--) {
              setStatusMessage({
                type: 'info',
                text: `Free tier rate limit reached (15 RPM limit). Pausing for ${s}s to cool down before resuming Page ${pageIdx + 1} automatically...`,
              });
              await new Promise((r) => setTimeout(r, 1000));
            }
            continue;
          }

          throw new Error(data.error || 'Auto-translation failed');
        }
        return { bubbles: [] };
      };

      for (let s = 0; s < numSlices; s++) {
        const sliceY = s * maxSliceHeight;
        const sliceH = Math.min(maxSliceHeight, natH - sliceY);
        if (sliceH <= 20) continue;

        // Downscale slice to max 1100px width for fast, low-latency Gemini Vision inference
        const scale = Math.min(1, 1100 / natW);
        const sendW = Math.max(1, Math.round(natW * scale));
        const sendH = Math.max(1, Math.round(sliceH * scale));

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = sendW;
        sliceCanvas.height = sendH;
        const sliceCtx = sliceCanvas.getContext('2d');
        if (!sliceCtx) continue;

        sliceCtx.drawImage(
          imgEl,
          0,
          sliceY,
          natW,
          sliceH,
          0,
          0,
          sendW,
          sendH
        );
        const sliceBase64 = sliceCanvas.toDataURL('image/jpeg', 0.85);

        let result = await callOcrEndpoint(sliceBase64);

        // If mature artwork triggered Gemini's image safety filter despite BLOCK_NONE,
        // automatically retry using a high-contrast B&W text-isolated canvas (bleaches skin tones/art while keeping bubble text crisp)
        if (
          result.blockedBySafety ||
          (!Array.isArray(result.bubbles) || result.bubbles.length === 0)
        ) {
          if (result.blockedBySafety) {
            const bwTextOnlyBase64 =
              createHighContrastTextOnlyCanvasDataUrl(sliceCanvas);
            result = await callOcrEndpoint(bwTextOnlyBase64);
          }
        }

        const rawBubbles: Array<{
          ymin: number;
          xmin: number;
          ymax: number;
          xmax: number;
          originalText: string;
          translatedText: string;
          isDarkBubble?: boolean;
          style?: string;
        }> = Array.isArray(result.bubbles) ? result.bubbles : [];

        for (const b of rawBubbles) {
          // Convert slice 0..1000 coordinates to full-page pixel coordinates
          const pxX = (b.xmin / 1000) * natW;
          const pxW = ((b.xmax - b.xmin) / 1000) * natW;
          const pxY = sliceY + (b.ymin / 1000) * sliceH;
          const pxH = ((b.ymax - b.ymin) / 1000) * sliceH;

          // Sample the actual speech bubble interior color from the original image
          const sampled = sampleBubbleColors(
            fullCtx,
            pxX,
            pxY,
            pxW,
            pxH,
            natW,
            natH
          );

          const bgHex = b.isDarkBubble ? '#111115' : sampled.bgHex;
          const textHex = b.isDarkBubble ? '#ffffff' : sampled.textHex;

          const xPercent = Number(((pxX / natW) * 100).toFixed(2));
          const yPercent = Number(((pxY / natH) * 100).toFixed(2));
          const wPercent = Number(((pxW / natW) * 100).toFixed(2));
          const hPercent = Number(((pxH / natH) * 100).toFixed(2));

          const nextId = idCounterRef.current++;
          detectedOverlays.push({
            id: `b_${pageIdx}_${nextId}`,
            box: { xPercent, yPercent, wPercent, hPercent },
            originalText: b.originalText,
            translatedText: b.translatedText,
            backgroundColor: bgHex,
            textColor: textHex,
            fontSize: b.style === 'shout' ? 16 : 14,
          });
        }
      }

      return detectedOverlays;
    },
    [languageCode, savedPin, email, selectedEngine, openRouterApiKey]
  );

  // Trigger 1-Click Auto-Translate for a single page
  const handleAutoTranslatePage = async (pageIdx: number) => {
    setTranslatingPageIdx(pageIdx);
    setSelectedPageIndex(pageIdx);
    setStatusMessage({
      type: 'info',
      text: `Scanning & translating Page ${pageIdx + 1} in original bubble styles...`,
    });

    try {
      const bubbles = await autoTranslateSinglePage(pageIdx);
      setEditsData((prev) => {
        const otherPages = prev.pages.filter((p) => p.pageIndex !== pageIdx);
        const nextData: ChapterEditsData = {
          ...prev,
          pages: [
            ...otherPages,
            {
              pageIndex: pageIdx,
              speechBubbles: bubbles,
              panelCuts: [],
            },
          ],
        };
        refreshBakedPagePreview(pageIdx, nextData);
        return nextData;
      });

      setStatusMessage({
        type: 'success',
        text:
          bubbles.length > 0
            ? `Translated ${bubbles.length} speech bubble(s) on Page ${pageIdx + 1}! Click "Save to Reader" when ready.`
            : `No foreign speech bubbles detected on Page ${pageIdx + 1}.`,
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : `Failed to auto-translate Page ${pageIdx + 1}`,
      });
    } finally {
      setTranslatingPageIdx(null);
    }
  };

  // Trigger 1-Click Auto-Translate for the entire Episode
  const handleAutoTranslateEpisode = async () => {
    if (originalPages.length === 0) return;
    setIsAutoTranslatingEpisode(true);
    let totalTranslated = 0;
    const updatedPageEdits: PageEditData[] = [];

    try {
      for (let idx = 0; idx < originalPages.length; idx++) {
        setTranslatingPageIdx(idx);
        setSelectedPageIndex(idx);
        setStatusMessage({
          type: 'info',
          text: `Auto-translating Episode Page ${idx + 1} of ${originalPages.length} in original bubble styles...`,
        });

        const bubbles = await autoTranslateSinglePage(idx);
        totalTranslated += bubbles.length;
        updatedPageEdits.push({
          pageIndex: idx,
          speechBubbles: bubbles,
          panelCuts: [],
        });

        const partialEdits: ChapterEditsData = {
          version: 1,
          pages: [...updatedPageEdits],
        };
        setEditsData(partialEdits);
        refreshBakedPagePreview(idx, partialEdits);

        // 2.2s gentle pacing delay between pages so multi-page episodes comfortably stay under free-tier 15 RPM limits
        if (idx < originalPages.length - 1) {
          await new Promise((r) => setTimeout(r, 2200));
        }
      }

      setStatusMessage({
        type: 'success',
        text: `Episode Auto-Translation complete (${totalTranslated} speech bubbles cleanly typeset)! Tap "Save to Reader" to publish.`,
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Auto-translation interrupted. You can retry on individual pages.',
      });
    } finally {
      setTranslatingPageIdx(null);
      setIsAutoTranslatingEpisode(false);
    }
  };

  // Reset a page back to its untouched original image
  const handleResetPage = (pageIdx: number) => {
    setEditsData((prev) => ({
      ...prev,
      pages: prev.pages.filter((p) => p.pageIndex !== pageIdx),
    }));
    setRenderedPreviewUrls((prev) => {
      const next = { ...prev };
      delete next[pageIdx];
      return next;
    });
    setSelectedBubbleId(null);
    setStatusMessage({
      type: 'info',
      text: `Reset Page ${pageIdx + 1} to original artwork.`,
    });
  };

  const updateBubbleField = (
    pageIdx: number,
    bubbleId: string,
    patch: Partial<SpeechBubbleOverlay>
  ) => {
    setEditsData((prev) => {
      const nextData: ChapterEditsData = {
        ...prev,
        pages: prev.pages.map((p) =>
          p.pageIndex !== pageIdx
            ? p
            : {
                ...p,
                speechBubbles: p.speechBubbles.map((b) =>
                  b.id === bubbleId ? { ...b, ...patch } : b
                ),
              }
        ),
      };
      refreshBakedPagePreview(pageIdx, nextData);
      return nextData;
    });
  };

  const deleteBubble = (pageIdx: number, bubbleId: string) => {
    setEditsData((prev) => {
      const nextData: ChapterEditsData = {
        ...prev,
        pages: prev.pages.map((p) =>
          p.pageIndex !== pageIdx
            ? p
            : {
                ...p,
                speechBubbles: p.speechBubbles.filter((b) => b.id !== bubbleId),
              }
        ),
      };
      refreshBakedPagePreview(pageIdx, nextData);
      return nextData;
    });
    if (selectedBubbleId === bubbleId) setSelectedBubbleId(null);
  };

  // Publish translated bubbles for the selected language to the Reader (Server + Supabase + Firestore)
  const handleSaveToReader = async () => {
    if (!selectedSeriesId || !selectedChapterId || !activeChapter) return;
    setIsSaving(true);
    const langLabel =
      STUDIO_LANGUAGES.find((l) => l.code === languageCode)?.label ||
      languageCode.toUpperCase();
    setStatusMessage({
      type: 'info',
      text: `Publishing ${langLabel} translation for Episode ${activeChapter.chapterNumber} to Reader...`,
    });

    try {
      const resolvedSeriesId =
        activeChapter.seriesId || selectedSeriesId || 'series-solo-leveling';

      await saveChapterEdits(
        resolvedSeriesId,
        selectedChapterId,
        languageCode,
        editsData,
        { adminPin: savedPin, adminEmail: email }
      );

      setStatusMessage({
        type: 'success',
        text: `Saved ${langLabel} translation for Episode ${activeChapter.chapterNumber}! Users can now select ${langLabel} in the Reader.`,
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to publish translated episode',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Strict Admin Lock Screen
  if (!isAuthorizedAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#07070A] px-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-center text-lg font-bold text-white">
            PanelVerse AI Translation Studio
          </h1>
          <p className="mt-1 text-center text-xs text-slate-400">
            Owner-only automatic episode translator.
          </p>

          <button
            onClick={() => signInWithGoogle()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-500 transition-colors cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            Sign in as Owner (Google)
          </button>

          <div className="my-4 flex items-center gap-3 text-[11px] text-zinc-500">
            <div className="h-px flex-1 bg-zinc-800" />
            <span>OR MASTER PIN</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          <form onSubmit={handleVerifyPin} className="space-y-3">
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter Master Admin PIN"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-rose-500 focus:outline-none"
              />
            </div>
            {pinError && <p className="text-xs text-rose-400">{pinError}</p>}
            <button
              type="submit"
              disabled={isVerifyingPin}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2 text-xs font-semibold text-slate-200 hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              {isVerifyingPin ? 'Verifying...' : 'Unlock Studio'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Return to Reader
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentPageEdit: PageEditData = editsData.pages.find(
    (p) => p.pageIndex === selectedPageIndex
  ) || {
    pageIndex: selectedPageIndex,
    speechBubbles: [],
    panelCuts: [],
  };

  const selectedBubble =
    currentPageEdit.speechBubbles.find((b) => b.id === selectedBubbleId) ||
    null;

  return (
    <div className="flex min-h-screen flex-col bg-[#07070A] text-slate-100">
      {/* Streamlined Top Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href={selectedChapterId ? `/read/${selectedChapterId}` : '/admin'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-slate-300 hover:text-white"
              title="Back to Reader"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-400">
                  AI STUDIO
                </span>
                <h1 className="text-sm font-bold text-white">
                  1-Click Episode Auto-Translator
                </h1>
              </div>
              <p className="text-[11px] text-slate-400">
                Automatically detects speech bubbles, erases original text cleanly, and typesets translations in matching bubble style.
              </p>
            </div>
          </div>

          {/* Series, Episode, Target Language & 1-Click Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSeriesId}
              onChange={(e) => {
                setSelectedSeriesId(e.target.value);
                setSelectedChapterId('');
              }}
              className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-white focus:border-rose-500 focus:outline-none max-w-[180px]"
            >
              <option value="">Select Series...</option>
              {allSeries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>

            <select
              value={selectedChapterId}
              onChange={(e) => setSelectedChapterId(e.target.value)}
              className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-white focus:border-rose-500 focus:outline-none max-w-[190px]"
            >
              <option value="">Select Episode...</option>
              {chaptersList.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  Ep. {ch.chapterNumber} — {ch.title}
                </option>
              ))}
              {selectedChapterId &&
                !chaptersList.some((c) => c.id === selectedChapterId) && (
                  <option value={selectedChapterId}>
                    Active Chapter ({selectedChapterId.slice(0, 14)})
                  </option>
                )}
            </select>

            <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 h-9">
              <Languages className="h-3.5 w-3.5 text-rose-400" />
              <select
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                className="bg-transparent text-xs font-semibold text-white focus:outline-none"
              >
                {STUDIO_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-zinc-900">
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* AI Engine & OpenRouter button */}
            <button
              type="button"
              onClick={() => {
                setTempApiKeyInput(openRouterApiKey);
                setShowEngineModal(true);
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 h-9 text-xs font-semibold transition-all cursor-pointer ${
                selectedEngine === 'openrouter' || openRouterApiKey
                  ? 'border-indigo-500/50 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/60'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
              }`}
              title="Configure AI Translation Engine & OpenRouter API key"
            >
              <Cpu className="h-3.5 w-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Engine:</span>
              <span className="capitalize">
                {selectedEngine === 'openrouter'
                  ? 'OpenRouter'
                  : selectedEngine === 'gemini'
                  ? 'Gemini'
                  : 'Auto AI'}
              </span>
              {openRouterApiKey ? (
                <span
                  className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"
                  title="OpenRouter key is active"
                />
              ) : (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-zinc-600"
                  title="OpenRouter key optional"
                />
              )}
            </button>

            <button
              onClick={handleAutoTranslateEpisode}
              disabled={
                isAutoTranslatingEpisode ||
                translatingPageIdx !== null ||
                originalPages.length === 0
              }
              className="flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-amber-600 px-4 text-xs font-bold text-white hover:from-rose-500 hover:to-amber-500 disabled:opacity-50 cursor-pointer shadow-lg shadow-rose-600/20"
            >
              {isAutoTranslatingEpisode ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>Auto-Translate Episode</span>
            </button>

            <button
              onClick={handleSaveToReader}
              disabled={
                isSaving ||
                isAutoTranslatingEpisode ||
                !selectedChapterId ||
                originalPages.length === 0
              }
              className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-600/20"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>Save to Reader</span>
            </button>

            {selectedChapterId && (
              <Link
                href={`/read/${selectedChapterId}`}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-slate-200 hover:bg-zinc-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Reader</span>
              </Link>
            )}
          </div>
        </div>

        {/* Status Banner */}
        {statusMessage && (
          <div className="border-t border-zinc-800/80 bg-zinc-900/80 px-4 py-2">
            <div
              className={`mx-auto flex max-w-7xl items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusMessage.type === 'success' && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                )}
                {statusMessage.type === 'info' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
              <button
                onClick={() => setStatusMessage(null)}
                className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Split Workspace */}
      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 gap-6 p-4 lg:grid-cols-12">
        {/* Left Column: Clean Baked Comic Pages */}
        <div className="lg:col-span-8 flex flex-col items-center">
          {isLoadingChapter ? (
            <div className="flex h-96 w-full flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-rose-500" />
              <p className="mt-2 text-xs font-mono">
                Loading episode pages...
              </p>
            </div>
          ) : originalPages.length === 0 ? (
            <div className="flex h-96 w-full flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-slate-400">
              <Layers className="h-8 w-8 text-zinc-600" />
              <p className="mt-2 text-sm font-semibold text-white">
                Select a Series & Episode above to begin
              </p>
              <p className="mt-1 text-xs text-slate-400 max-w-md">
                Then tap &ldquo;Auto-Translate Episode&rdquo; to automatically translate all speech bubbles in their original styles.
              </p>
            </div>
          ) : (
            <div className="w-full max-w-[720px] space-y-6">
              {originalPages.map((page, pageIdx) => {
                const pageEdit = editsData.pages.find(
                  (p) => p.pageIndex === pageIdx
                );
                const bubbles = pageEdit?.speechBubbles || [];
                const proxiedOrigUrl = ensureProxiedSrc(page.imageUrl);
                const displayUrl =
                  renderedPreviewUrls[pageIdx] || proxiedOrigUrl;
                const isPageBusy = translatingPageIdx === pageIdx;

                return (
                  <div
                    key={page.pageNumber || pageIdx}
                    onClick={() => setSelectedPageIndex(pageIdx)}
                    className={`rounded-xl border transition-colors ${
                      selectedPageIndex === pageIdx
                        ? 'border-rose-500/60 bg-zinc-900/60'
                        : 'border-zinc-800 bg-zinc-900/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2 text-xs font-mono text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          PAGE {pageIdx + 1} / {originalPages.length}
                        </span>
                        {bubbles.length > 0 && (
                          <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-sans text-[11px] font-semibold text-emerald-300">
                            {bubbles.length} Translated
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-sans">
                        {bubbles.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetPage(pageIdx);
                            }}
                            className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-zinc-800 cursor-pointer"
                            title="Restore untouched original page"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Original</span>
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleAutoTranslatePage(pageIdx);
                          }}
                          disabled={isPageBusy || isAutoTranslatingEpisode}
                          className="flex items-center gap-1.5 rounded-lg bg-rose-600/90 px-3 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                        >
                          {isPageBusy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          <span>
                            {bubbles.length > 0
                              ? 'Re-Translate Page'
                              : 'Auto-Translate Page'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Hidden pristine original image used as clean source for canvas baking */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      ref={(el) => {
                        originalImageRefs.current[pageIdx] = el;
                      }}
                      src={proxiedOrigUrl}
                      alt=""
                      crossOrigin="anonymous"
                      onLoad={() => refreshBakedPagePreview(pageIdx, editsData)}
                      className="hidden"
                    />

                    {/* Clean Baked Comic Page Surface */}
                    <div className="relative w-full overflow-hidden bg-zinc-950 select-none">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={displayUrl}
                        alt={`Page ${pageIdx + 1}`}
                        draggable={false}
                        className="block w-full h-auto select-none"
                      />

                      {/* Invisible tap targets over detected bubbles so admin can tap any bubble to fine-tune text */}
                      {bubbles.map((bubble) => {
                        const isSelected = selectedBubbleId === bubble.id;
                        return (
                          <div
                            key={bubble.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPageIndex(pageIdx);
                              setSelectedBubbleId(bubble.id);
                            }}
                            style={{
                              left: `${bubble.box.xPercent}%`,
                              top: `${bubble.box.yPercent}%`,
                              width: `${bubble.box.wPercent}%`,
                              height: `${bubble.box.hPercent}%`,
                            }}
                            title="Tap to edit this translated bubble"
                            className={`absolute z-10 rounded-full cursor-pointer transition-all ${
                              isSelected
                                ? 'ring-2 ring-rose-500/80 bg-rose-500/10'
                                : 'hover:ring-1 hover:ring-rose-400/50'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Fine-Tune Bubble Text Inspector */}
        <div className="lg:col-span-4">
          <div className="sticky top-24 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Page {selectedPageIndex + 1} Bubbles
                </h2>
                <p className="text-[11px] text-slate-400">
                  Tap any translated bubble on the page to tweak wording or text size.
                </p>
              </div>
              <span className="rounded-md bg-zinc-800 px-2 py-1 font-mono text-[11px] text-slate-300">
                {currentPageEdit.speechBubbles.length} Bubbles
              </span>
            </div>

            {selectedBubble ? (
              <div className="space-y-3 rounded-xl border border-rose-500/30 bg-zinc-950/80 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-400">
                    Edit Bubble Text
                  </span>
                  <button
                    onClick={() =>
                      deleteBubble(selectedPageIndex, selectedBubble.id)
                    }
                    className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                    title="Restore original bubble"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Remove</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Translated Text ({languageCode.toUpperCase()})
                  </label>
                  <textarea
                    rows={3}
                    value={selectedBubble.translatedText}
                    onChange={(e) =>
                      updateBubbleField(selectedPageIndex, selectedBubble.id, {
                        translatedText: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs font-semibold text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Text Scale ({selectedBubble.fontSize || 14})
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={24}
                    value={selectedBubble.fontSize || 14}
                    onChange={(e) =>
                      updateBubbleField(selectedPageIndex, selectedBubble.id, {
                        fontSize: Number(e.target.value),
                      })
                    }
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>
              </div>
            ) : null}

            {/* Detected Bubbles List */}
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {currentPageEdit.speechBubbles.length === 0 ? (
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3 text-center text-xs text-slate-400">
                  No translated bubbles on Page {selectedPageIndex + 1} yet. Tap{' '}
                  <strong className="text-white">Auto-Translate Page</strong> or{' '}
                  <strong className="text-white">Auto-Translate Episode</strong>.
                </div>
              ) : (
                currentPageEdit.speechBubbles.map((b, idx) => (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBubbleId(b.id)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs cursor-pointer ${
                      selectedBubbleId === b.id
                        ? 'border-rose-500/60 bg-rose-500/10 text-white'
                        : 'border-zinc-800 bg-zinc-950/60 text-slate-300 hover:border-zinc-700'
                    }`}
                  >
                    <span className="truncate">
                      #{idx + 1}: {b.translatedText || b.originalText}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteBubble(selectedPageIndex, b.id);
                      }}
                      className="text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Translation Engine & OpenRouter Setup Modal */}
      {showEngineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Cpu className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    AI Translation Engine & OpenRouter
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Bypass Google 15 RPM rate limits using free vision models
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEngineModal(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-900 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Engine Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-300">
                Choose Translation Engine:
              </label>
              <div className="grid gap-2">
                {[
                  {
                    id: 'auto' as const,
                    title: 'Auto (Gemini + OpenRouter Fallback)',
                    tag: 'Recommended',
                    desc: 'Uses Gemini by default. If rate limit (15 RPM) is reached, seamlessly switches to OpenRouter without pauses.',
                  },
                  {
                    id: 'openrouter' as const,
                    title: 'OpenRouter Direct (Unlimited Free Models)',
                    tag: 'Fastest for full chapters',
                    desc: 'Bypasses Gemini completely. Uses free vision models (Gemini Flash Exp, Qwen 2.5-VL 72B, Llama 3.2 11B Vision).',
                  },
                  {
                    id: 'gemini' as const,
                    title: 'Gemini Direct (Standard)',
                    tag: '15 RPM free tier limit',
                    desc: 'Direct calls to Google Gemini. Features built-in automatic cooldown countdown if throttled.',
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedEngine(item.id)}
                    className={`flex flex-col text-left rounded-xl border p-3 transition-all cursor-pointer ${
                      selectedEngine === item.id
                        ? 'border-indigo-500 bg-indigo-950/30 shadow-md shadow-indigo-500/10'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        {item.title}
                      </span>
                      <span className="rounded bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 text-[9px] font-medium text-indigo-300">
                        {item.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
                      {item.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* OpenRouter API Key Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
                  <span>OpenRouter API Key:</span>
                </label>
                {openRouterApiKey ? (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <Check className="h-3 w-3" /> Key saved in browser
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-400/90">
                    Optional (uses free models)
                  </span>
                )}
              </div>
              <input
                type="password"
                value={tempApiKeyInput}
                onChange={(e) => setTempApiKeyInput(e.target.value)}
                placeholder="sk-or-v1-xxxxxxxxxxxxxxxx..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-zinc-500">
                Your key is stored securely in your browser&apos;s local storage and sent only to your own proxy endpoint.
              </p>
            </div>

            {/* How to get a free OpenRouter key */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <HelpCircle className="h-3.5 w-3.5 text-rose-400" />
                <span>How to get your free key (Takes 30 seconds):</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-400 leading-relaxed">
                <li>
                  Open{' '}
                  <a
                    href="https://openrouter.ai"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 underline hover:text-indigo-300 inline-flex items-center gap-0.5"
                  >
                    openrouter.ai <ExternalLink className="h-2.5 w-2.5 inline" />
                  </a>{' '}
                  and sign in (with Google or email).
                </li>
                <li>
                  Go to{' '}
                  <a
                    href="https://openrouter.ai/settings/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 underline hover:text-indigo-300 inline-flex items-center gap-0.5"
                  >
                    Keys Settings <ExternalLink className="h-2.5 w-2.5 inline" />
                  </a>{' '}
                  and click <strong>&quot;Create Key&quot;</strong>.
                </li>
                <li>
                  Copy the generated key (starts with <code className="text-zinc-300">sk-or-v1-</code>) and paste it in the box above.
                </li>
                <li>
                  Tap <strong>&quot;Save Settings&quot;</strong> below to translate without 15 RPM interruptions!
                </li>
              </ol>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
              {openRouterApiKey && (
                <button
                  type="button"
                  onClick={() => {
                    handleSaveEngineSettings(selectedEngine, '');
                    setTempApiKeyInput('');
                  }}
                  className="rounded-xl border border-zinc-800 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors mr-auto"
                >
                  Clear Key
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowEngineModal(false)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSaveEngineSettings(selectedEngine, tempApiKeyInput)
                }
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition-colors cursor-pointer shadow-lg shadow-indigo-600/20"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Engine Settings Saved Notification */}
      {engineKeySavedNotice && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-zinc-950/95 px-4 py-3 text-xs font-semibold text-emerald-400 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>Translation Engine settings saved successfully!</span>
        </div>
      )}
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#07070A] text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
        </div>
      }
    >
      <StudioContent />
    </Suspense>
  );
}
