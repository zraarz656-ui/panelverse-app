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
} from 'lucide-react';
import { useIdentity } from '@/hooks/useIdentity';
import {
  getChapterEdits,
  saveChapterEdits,
  saveChapterToFirestore,
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

function ensureProxiedSrc(src: string): string {
  if (!src) return '';
  if (
    src.startsWith('data:') ||
    src.startsWith('/') ||
    src.includes('/api/image-proxy')
  ) {
    return src;
  }
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

/**
 * Samples the dominant interior background color of a speech bubble around the text box
 * so erasing the original foreign text blends seamlessly into the original bubble.
 */
function sampleBubbleColors(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  canvasW: number,
  canvasH: number
): { bgHex: string; textHex: string } {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(4, Math.min(canvasW - sx, Math.ceil(w)));
  const sh = Math.max(4, Math.min(canvasH - sy, Math.ceil(h)));

  try {
    const imgData = ctx.getImageData(sx, sy, sw, sh).data;
    let lightCount = 0;
    let darkCount = 0;
    let rLight = 0,
      gLight = 0,
      bLight = 0;
    let rDark = 0,
      gDark = 0,
      bDark = 0;

    // Sample perimeter + grid points inside the text box
    const step = Math.max(4, Math.floor((sw * sh) / 250) * 4);
    for (let i = 0; i < imgData.length; i += step) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum >= 145) {
        lightCount++;
        rLight += r;
        gLight += g;
        bLight += b;
      } else if (lum <= 95) {
        darkCount++;
        rDark += r;
        gDark += g;
        bDark += b;
      }
    }

    const toHex = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0');

    // If predominantly dark bubble (e.g. Solo Leveling system window or dark narration)
    if (darkCount > lightCount * 1.35 && darkCount > 0) {
      const rAvg = rDark / darkCount;
      const gAvg = gDark / darkCount;
      const bAvg = bDark / darkCount;
      return {
        bgHex: `#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`,
        textHex: '#ffffff',
      };
    }

    if (lightCount > 0) {
      const rAvg = rLight / lightCount;
      const gAvg = gLight / lightCount;
      const bAvg = bLight / lightCount;
      // Snap near-white comic bubbles to crisp white
      if (rAvg > 235 && gAvg > 235 && bAvg > 235) {
        return { bgHex: '#ffffff', textHex: '#09090b' };
      }
      return {
        bgHex: `#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`,
        textHex: '#09090b',
      };
    }
  } catch {
    // Fallback if getImageData fails
  }

  return { bgHex: '#ffffff', textHex: '#09090b' };
}

/**
 * Word-wraps text to fit inside maxWidth on the given Canvas 2D context.
 */
function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split(/\n+/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = `${currentLine} ${word}`;
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text];
}

/**
 * Renders the original page image + clean, borderless inpainted speech bubbles
 * in authentic comic typography directly onto a canvas and returns a data URL.
 */
function renderCleanTranslatedPageToDataUrl(
  imgEl: HTMLImageElement,
  bubbles: SpeechBubbleOverlay[],
  languageCode: string
): string {
  const w = imgEl.naturalWidth || imgEl.width || 800;
  const h = imgEl.naturalHeight || imgEl.height || 1200;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imgEl.src;

  // 1. Draw the pristine original comic page
  ctx.drawImage(imgEl, 0, 0, w, h);

  if (!bubbles || bubbles.length === 0) {
    return canvas.toDataURL('image/webp', 0.92);
  }

  const isEnglish = languageCode === 'en';
  const fontFamily = isEnglish
    ? '"Comic Sans MS", "Chalkboard SE", "Bangers", system-ui, sans-serif'
    : '"Noto Sans Malayalam", "Manjari", system-ui, sans-serif';

  for (const bubble of bubbles) {
    const rawText = (bubble.translatedText || '').trim();
    if (!rawText || rawText === 'Translating...') continue;

    // Convert 0..100 percentages to pixel coordinates
    const bx = (bubble.box.xPercent / 100) * w;
    const by = (bubble.box.yPercent / 100) * h;
    const bw = Math.max(24, (bubble.box.wPercent / 100) * w);
    const bh = Math.max(20, (bubble.box.hPercent / 100) * h);

    const bgFill = bubble.backgroundColor || '#ffffff';
    const textFill = bubble.textColor || '#09090b';

    // 2. Softly erase ONLY the original foreign letters inside the bubble
    // using a feathered capsule/ellipse mask so the bubble's black outline is never touched
    ctx.save();
    const padX = Math.min(bw * 0.08, 10);
    const padY = Math.min(bh * 0.08, 10);
    const rx = bx - padX * 0.5;
    const ry = by - padY * 0.5;
    const rw = bw + padX;
    const rh = bh + padY;
    const radius = Math.min(rw, rh) * 0.35;

    ctx.filter = 'blur(4px)';
    ctx.fillStyle = bgFill;
    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, radius);
    ctx.fill();
    ctx.filter = 'none';

    // Solid inner core fill to ensure 100% of old text strokes are covered
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, Math.min(bw, bh) * 0.28);
    ctx.fill();
    ctx.restore();

    // 3. Auto-fit and render comic-styled translated text centered inside the bubble
    const displayText = isEnglish ? rawText.toUpperCase() : rawText;
    const userScale = (bubble.fontSize || 14) / 14;

    const maxTextWidth = bw * 0.92;
    const maxTextHeight = bh * 0.92;

    let bestFontSize = Math.max(11, Math.min(Math.round(w * 0.022), 34));
    let wrappedLines: string[] = [displayText];

    // Find the largest comfortable font size that fits inside the original text bounds
    for (let testSize = Math.min(38, Math.round(bh * 0.55)); testSize >= 10; testSize -= 1) {
      ctx.font = `800 ${testSize}px ${fontFamily}`;
      const candidateLines = wrapCanvasText(ctx, displayText, maxTextWidth);
      const lineHeight = testSize * 1.18;
      const totalH = candidateLines.length * lineHeight;
      const widestLine = Math.max(
        ...candidateLines.map((l) => ctx.measureText(l).width)
      );
      if (totalH <= maxTextHeight && widestLine <= maxTextWidth) {
        bestFontSize = testSize;
        wrappedLines = candidateLines;
        break;
      }
      wrappedLines = candidateLines;
      bestFontSize = testSize;
    }

    const finalFontSize = Math.max(9, Math.round(bestFontSize * userScale));
    ctx.save();
    ctx.font = `800 ${finalFontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    wrappedLines = wrapCanvasText(ctx, displayText, maxTextWidth);
    const lineHeight = finalFontSize * 1.18;
    const totalBlockHeight = wrappedLines.length * lineHeight;
    const centerX = bx + bw / 2;
    const startY = by + bh / 2 - totalBlockHeight / 2 + lineHeight / 2;

    // Subtle halo in bubble background color so text stays ultra-crisp
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, Math.round(finalFontSize * 0.22));
    ctx.strokeStyle = bgFill;
    ctx.fillStyle = textFill;

    wrappedLines.forEach((line, idx) => {
      const ly = startY + idx * lineHeight;
      ctx.strokeText(line, centerX, ly);
      ctx.fillText(line, centerX, ly);
    });
    ctx.restore();
  }

  return canvas.toDataURL('image/webp', 0.92);
}

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

      // Slice tall webtoon strips into ~1800px vertical segments so Gemini detects small text accurately
      const maxSliceHeight = Math.round(natW * 2.2);
      const numSlices = Math.max(1, Math.ceil(natH / maxSliceHeight));
      const detectedOverlays: SpeechBubbleOverlay[] = [];

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (savedPin) {
        headers['x-admin-pin'] = savedPin;
      }

      for (let s = 0; s < numSlices; s++) {
        const sliceY = s * maxSliceHeight;
        const sliceH = Math.min(maxSliceHeight, natH - sliceY);
        if (sliceH <= 20) continue;

        // Downscale slice to max 1200px width for fast, low-latency Gemini Vision inference
        const scale = Math.min(1, 1200 / natW);
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
        const sliceBase64 = sliceCanvas.toDataURL('image/jpeg', 0.86);

        const res = await fetch('/api/ocr-translate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode: 'full-page',
            imageBase64: sliceBase64,
            mimeType: 'image/jpeg',
            targetLanguage: languageCode,
            adminEmail: email,
          }),
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || 'Auto-translation failed');
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
    [languageCode, savedPin, email]
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

  // Bake translated pages into clean WebP images and publish directly to the Reader
  const handleSaveToReader = async () => {
    if (!selectedSeriesId || !selectedChapterId || !activeChapter) return;
    setIsSaving(true);
    setStatusMessage({
      type: 'info',
      text: 'Baking translated bubbles into episode pages & publishing to Reader...',
    });

    try {
      const finalPages: PageImage[] = [];

      for (let idx = 0; idx < originalPages.length; idx++) {
        const origPage = originalPages[idx];
        const pageEdit = editsData.pages.find((p) => p.pageIndex === idx);
        const bubbles = pageEdit?.speechBubbles || [];
        const imgEl = originalImageRefs.current[idx];

        if (bubbles.length > 0 && imgEl && imgEl.naturalWidth > 0) {
          const bakedDataUrl = renderCleanTranslatedPageToDataUrl(
            imgEl,
            bubbles,
            languageCode
          );
          // Upload baked WebP to server processor so payload stays compact & fast
          const blob = await (await fetch(bakedDataUrl)).blob();
          const file = new File([blob], `page-${idx + 1}.webp`, {
            type: 'image/webp',
          });
          const uploadedUrl = await compressImageFileToDataUrl(file, {
            maxWidth: 1400,
            maxHeight: 8000,
          });
          finalPages.push({
            ...origPage,
            pageNumber: idx + 1,
            imageUrl: uploadedUrl,
          });
        } else {
          finalPages.push({
            ...origPage,
            pageNumber: idx + 1,
          });
        }
      }

      const resolvedSeriesId =
        activeChapter.seriesId || selectedSeriesId || 'series-solo-leveling';

      const updatedChapterObj: Chapter = {
        ...activeChapter,
        seriesId: resolvedSeriesId,
        pages: finalPages,
        pagesCount: finalPages.length,
        hasCustomPages: true,
        isCustomEdited: true,
      };

      // 1. Save baked pages to server store (/api/admin edit_chapter)
      await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_chapter',
          chapterId: updatedChapterObj.id,
          seriesId: resolvedSeriesId,
          chapterNumber: updatedChapterObj.chapterNumber,
          title: updatedChapterObj.title,
          releaseDate: updatedChapterObj.releaseDate,
          customPages: finalPages,
          panelUrls: finalPages.map((p) => p.imageUrl),
        }),
      });

      // 2. Save baked pages to Supabase & Firebase Firestore
      await saveChapterToFirestore(updatedChapterObj, false);

      // 3. Clear rectangular HTML overlay records so Reader displays the clean baked pages directly
      await saveChapterEdits(
        resolvedSeriesId,
        selectedChapterId,
        languageCode,
        { version: 1, pages: [] },
        { adminPin: savedPin, adminEmail: email }
      );

      setStatusMessage({
        type: 'success',
        text: `Published cleanly translated Episode ${updatedChapterObj.chapterNumber} to Reader!`,
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
