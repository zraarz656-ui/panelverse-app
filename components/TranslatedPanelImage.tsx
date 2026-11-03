'use client';

import { useState, useEffect, useRef } from 'react';
import { ResilientImage } from './ResilientImage';
import {
  ensureProxiedSrc,
  renderCleanTranslatedPageToDataUrl,
} from '@/lib/canvas-bubble-renderer';
import { SpeechBubbleOverlay, SeriesType } from '@/lib/types';

interface TranslatedPanelImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle: string;
  fallbackType: SeriesType;
  fallbackMode?: 'cover' | 'page';
  chapterNumber?: number;
  pageNumber?: number;
  priority?: boolean;
  bubbles: SpeechBubbleOverlay[];
  languageCode: string;
  showTranslated: boolean;
  preBakedUrl?: string | null;
}

export function TranslatedPanelImage({
  src,
  alt,
  className,
  fallbackTitle,
  fallbackType,
  fallbackMode = 'page',
  chapterNumber,
  pageNumber,
  priority,
  bubbles,
  languageCode,
  showTranslated,
  preBakedUrl,
}: TranslatedPanelImageProps) {
  const [canvasDataUrl, setCanvasDataUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const hasBubbles = showTranslated && Array.isArray(bubbles) && bubbles.length > 0;
  const proxiedSrc = ensureProxiedSrc(src);

  useEffect(() => {
    if (!hasBubbles || preBakedUrl) {
      Promise.resolve().then(() => setCanvasDataUrl(null));
      return;
    }
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      const rendered = renderCleanTranslatedPageToDataUrl(
        el,
        bubbles,
        languageCode
      );
      Promise.resolve().then(() => setCanvasDataUrl(rendered));
    }
  }, [hasBubbles, preBakedUrl, bubbles, languageCode, proxiedSrc]);

  const handleSourceLoad = () => {
    if (!hasBubbles || preBakedUrl) return;
    const el = imgRef.current;
    if (el && el.naturalWidth > 0) {
      const rendered = renderCleanTranslatedPageToDataUrl(
        el,
        bubbles,
        languageCode
      );
      setCanvasDataUrl(rendered);
    }
  };

  const finalSrc =
    showTranslated && (preBakedUrl || canvasDataUrl)
      ? (preBakedUrl || canvasDataUrl)!
      : src;

  return (
    <>
      {hasBubbles && !preBakedUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={imgRef}
          src={proxiedSrc}
          alt=""
          crossOrigin="anonymous"
          onLoad={handleSourceLoad}
          className="hidden"
        />
      )}
      <ResilientImage
        src={finalSrc}
        alt={alt}
        className={className}
        fallbackTitle={fallbackTitle}
        fallbackType={fallbackType}
        fallbackMode={fallbackMode}
        chapterNumber={chapterNumber}
        pageNumber={pageNumber}
        priority={priority}
      />
    </>
  );
}
