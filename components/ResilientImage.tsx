'use client';

import { useState } from 'react';
import { createCoverSvg, createReaderPanelSvg } from '@/lib/svg-covers';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  fallbackType?: 'webtoon' | 'manga';
  fallbackMode?: 'cover' | 'page';
  chapterNumber?: number;
  pageNumber?: number;
  dialogue?: string;
  priority?: boolean;
}

export function ResilientImage({
  src,
  alt,
  className = '',
  fallbackTitle,
  fallbackType = 'webtoon',
  fallbackMode = 'cover',
  chapterNumber = 1,
  pageNumber = 1,
  dialogue,
  priority = false,
}: ResilientImageProps) {
  const [failedStage, setFailedStage] = useState<{ src: string; stage: number }>({
    src: '',
    stage: 0,
  });

  const currentStage = failedStage.src === src ? failedStage.stage : 0;

  const fallbackSrc =
    fallbackMode === 'page'
      ? createReaderPanelSvg(
          fallbackTitle || alt || 'PanelVerse',
          chapterNumber,
          pageNumber,
          fallbackType,
          dialogue
        )
      : createCoverSvg(
          (fallbackTitle || alt || 'PANELVERSE').slice(0, 22).toUpperCase(),
          fallbackType === 'manga' ? 'cyberpunk' : 'shadow',
          fallbackType
        );

  const canTryProxy =
    Boolean(src) &&
    src.startsWith('http') &&
    !src.startsWith('/api/image-proxy');

  let activeSrc = src || fallbackSrc;
  if (!src) {
    activeSrc = fallbackSrc;
  } else if (currentStage === 1 && canTryProxy) {
    activeSrc = `/api/image-proxy?url=${encodeURIComponent(
      src
    )}&title=${encodeURIComponent(
      fallbackTitle || alt || 'PanelVerse'
    )}&type=${fallbackType}&mode=${fallbackMode}&chapter=${chapterNumber}&page=${pageNumber}`;
  } else if (currentStage >= 1) {
    activeSrc = fallbackSrc;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={activeSrc}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!src) return;
        setFailedStage((prev) => {
          const prevStage = prev.src === src ? prev.stage : 0;
          if (prevStage >= 2) return prev;
          return { src, stage: prevStage + 1 };
        });
      }}
      className={`h-full w-full ${className}`}
    />
  );
}
