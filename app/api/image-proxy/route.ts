import { NextRequest, NextResponse } from 'next/server';
import { createCoverSvg, createReaderPanelSvg } from '@/lib/svg-covers';

async function tryFetchUpstreamImage(
  url: string,
  timeoutMs: number
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  if (!url || !url.startsWith('http')) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      'User-Agent': 'PanelVerseReader/2.0 (Webtoon & Manga Reader)',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };

    if (url.includes('mangadex')) {
      headers.Referer = 'https://mangadex.org/';
    } else if (url.includes('myanimelist')) {
      headers.Referer = 'https://myanimelist.net/';
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength < 100) return null;

    return { buffer: arrayBuffer, contentType };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');
  const fallbackUrl = searchParams.get('fallbackUrl');
  const title = searchParams.get('title') || 'PanelVerse';
  const mode = searchParams.get('mode') || 'cover';
  const chapterNum = Number(searchParams.get('chapter') || '1') || 1;
  const pageNum = Number(searchParams.get('page') || '1') || 1;
  const dialogue = searchParams.get('dialogue') || undefined;
  const theme = (searchParams.get('theme') || 'shadow') as
    | 'shadow'
    | 'cyberpunk'
    | 'celestial'
    | 'mecha'
    | 'cafe'
    | 'dungeon';
  const type = (searchParams.get('type') === 'manga' ? 'manga' : 'webtoon') as
    | 'webtoon'
    | 'manga';

  const sendFallbackSvg = () => {
    const dataUri =
      mode === 'page'
        ? createReaderPanelSvg(title, chapterNum, pageNum, type, dialogue)
        : createCoverSvg(title, theme, type);
    const svgXml = decodeURIComponent(dataUri.replace('data:image/svg+xml;utf8,', ''));
    return new NextResponse(svgXml, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=1800',
      },
    });
  };

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return sendFallbackSvg();
  }

  // Primary upstream attempt
  let fetched = await tryFetchUpstreamImage(targetUrl, 7500);

  // Secondary upstream attempt (e.g., official uploads.mangadex.org origin if an At-Home node failed)
  if (!fetched && fallbackUrl && fallbackUrl.startsWith('http') && fallbackUrl !== targetUrl) {
    fetched = await tryFetchUpstreamImage(fallbackUrl, 7000);
  }

  // Automatic MangaDex At-Home node recovery if URL was a raw mangadex.network node without fallbackUrl
  if (!fetched && targetUrl.includes('mangadex.network')) {
    const match = targetUrl.match(/\/(data(?:-saver)?\/[a-f0-9]+\/[^/?#]+)$/i);
    if (match?.[1]) {
      const autoOrigin = `https://uploads.mangadex.org/${match[1]}`;
      fetched = await tryFetchUpstreamImage(autoOrigin, 7000);
    }
  }

  if (!fetched) {
    return sendFallbackSvg();
  }

  return new NextResponse(fetched.buffer, {
    status: 200,
    headers: {
      'Content-Type': fetched.contentType,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
