import { Chapter, PageImage, Series, SeriesOrigin, SeriesType } from './types';

// Server-side cache for resolved MangaDex streaming pages and chapter feeds (with TTL)
const chapterStreamCache = new Map<
  string,
  { pages: PageImage[]; language?: string; expiresAt: number }
>();
const seriesFeedCache = new Map<string, DiscoveredMangaDexChapter[]>();

export interface DiscoveredMangaDexChapter {
  mangadexChapterId: string;
  chapterNumber: number;
  title: string;
  language: string;
  pagesCount: number;
  releaseDate: string;
}

export function buildProxiedImageUrl(
  rawUrl: string,
  title: string,
  type: SeriesType = 'webtoon',
  theme: string = 'shadow',
  mode: 'cover' | 'page' = 'cover',
  chapterNum: number = 1,
  pageNum: number = 1,
  fallbackUrl?: string
): string {
  const base = `/api/image-proxy?url=${encodeURIComponent(rawUrl)}&title=${encodeURIComponent(
    title
  )}&type=${type}&theme=${theme}&mode=${mode}`;
  if (mode === 'page') {
    const withPage = `${base}&chapter=${chapterNum}&page=${pageNum}`;
    return fallbackUrl
      ? `${withPage}&fallbackUrl=${encodeURIComponent(fallbackUrl)}`
      : withPage;
  }
  return base;
}

const LANG_PRIORITY: Record<string, number> = {
  en: 100,
  ko: 90,
  ja: 90,
  zh: 90,
  'zh-hk': 88,
  'pt-br': 85,
  es: 84,
  'es-la': 83,
  fr: 82,
  id: 80,
  it: 78,
  ru: 76,
  vi: 75,
  de: 74,
  pl: 72,
  tr: 70,
  hi: 68,
};

interface RawMdFeedItem {
  id: string;
  attributes?: {
    chapter?: string | null;
    title?: string | null;
    translatedLanguage?: string;
    pages?: number;
    externalUrl?: string | null;
    publishAt?: string;
  };
}

/**
 * Dynamically fetches real hosted chapters (pages > 0 && !externalUrl) from MangaDex.
 * Checks English hosted chapters first; if English is locked to an external publisher,
 * automatically loads raw/multi-language hosted chapters on MangaDex.
 */
export async function fetchLiveChaptersForSeries(
  series: Series
): Promise<DiscoveredMangaDexChapter[]> {
  if (!series.mangadexId) return [];

  const cached = seriesFeedCache.get(series.mangadexId);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    const fetchFeed = async (query: string): Promise<RawMdFeedItem[]> => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 5500);
      const res = await fetch(
        `https://api.mangadex.org/manga/${series.mangadexId}/feed?${query}`,
        {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'PanelVerseReader/2.0 (Webtoon & Manga Reader)',
            Accept: 'application/json',
          },
        }
      );
      clearTimeout(timeout);
      if (!res.ok) return [];
      const json = await res.json();
      return (json?.data || []).filter(
        (item: RawMdFeedItem) =>
          item?.attributes &&
          (item.attributes.pages ?? 0) > 0 &&
          !item.attributes.externalUrl
      );
    };

    // Tier 1: Hosted English chapters
    let candidates = await fetchFeed(
      'translatedLanguage[]=en&order[chapter]=asc&limit=60&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic'
    );

    // Tier 2: When English is externally licensed, include all hosted raw/international chapters
    if (candidates.length < 3) {
      const allLangItems = await fetchFeed(
        'order[chapter]=asc&limit=100&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic'
      );
      candidates = [...candidates, ...allLangItems];
    }

    if (candidates.length === 0) return [];

    // Group and deduplicate by chapter number (or order index if chapter is null/oneshot)
    const byChapterKey = new Map<string, RawMdFeedItem>();

    candidates.forEach((item, idx) => {
      const rawCh = item.attributes?.chapter;
      const parsedNum =
        rawCh !== null && rawCh !== undefined && rawCh !== '' && !Number.isNaN(Number(rawCh))
          ? Number(rawCh)
          : idx + 1;
      const key = String(parsedNum);
      const existing = byChapterKey.get(key);

      if (!existing) {
        byChapterKey.set(key, item);
      } else {
        const curLang = (existing.attributes?.translatedLanguage || '').toLowerCase();
        const newLang = (item.attributes?.translatedLanguage || '').toLowerCase();
        const curScore =
          (LANG_PRIORITY[curLang] || 50) + Math.min(20, existing.attributes?.pages || 0);
        const newScore =
          (LANG_PRIORITY[newLang] || 50) + Math.min(20, item.attributes?.pages || 0);
        if (newScore > curScore) {
          byChapterKey.set(key, item);
        }
      }
    });

    const prefix = series.type === 'webtoon' ? 'Episode' : 'Chapter';
    const discovered: DiscoveredMangaDexChapter[] = Array.from(byChapterKey.entries())
      .map(([key, item], index) => {
        const rawNum = Number(key);
        const chapterNumber =
          Number.isFinite(rawNum) && rawNum > 0 ? rawNum : index + 1;
        const rawTitle = (item.attributes?.title || '').trim();
        const lang = (item.attributes?.translatedLanguage || 'en').toUpperCase();
        const publishDate = item.attributes?.publishAt
          ? item.attributes.publishAt.slice(0, 10)
          : 'Recent';

        return {
          mangadexChapterId: item.id,
          chapterNumber,
          title: rawTitle
            ? `${prefix} ${chapterNumber}: ${rawTitle}`
            : `${prefix} ${chapterNumber}`,
          language: lang,
          pagesCount: item.attributes?.pages || 18,
          releaseDate: publishDate,
        };
      })
      .sort((a, b) => a.chapterNumber - b.chapterNumber)
      .slice(0, 25);

    // Ensure sequential unique chapterNumbers if chapter 0 appeared alongside chapter 1
    const seenNums = new Set<number>();
    discovered.forEach((ch, idx) => {
      if (ch.chapterNumber <= 0 || seenNums.has(ch.chapterNumber)) {
        ch.chapterNumber = idx + 1;
      }
      seenNums.add(ch.chapterNumber);
    });

    if (discovered.length > 0) {
      seriesFeedCache.set(series.mangadexId, discovered);
    }

    return discovered;
  } catch (err) {
    console.error('Error fetching MangaDex chapter feed:', err);
    return [];
  }
}

/**
 * Resolves live readable chapter pages from the MangaDex At-Home streaming network
 * for a given series and chapter.
 */
export async function resolveLiveChapterPages(
  series: Series | undefined,
  chapter: Chapter
): Promise<{ pages: PageImage[]; isLiveStreamed: boolean; language?: string }> {
  if (!series || chapter.hasCustomPages) {
    return { pages: chapter.pages, isLiveStreamed: false };
  }

  const cacheKey = chapter.mangadexChapterId || chapter.id;
  const cached = chapterStreamCache.get(cacheKey);
  if (cached && cached.pages.length > 0 && cached.expiresAt > Date.now()) {
    return {
      pages: cached.pages,
      isLiveStreamed: true,
      language: cached.language || chapter.language,
    };
  }

  if (!series.mangadexId && !chapter.mangadexChapterId) {
    return { pages: chapter.pages, isLiveStreamed: false };
  }

  try {
    let targetMdChapterId = chapter.mangadexChapterId;
    let resolvedLang = chapter.language || 'EN';

    if (!targetMdChapterId && series.mangadexId) {
      const feedChapters = await fetchLiveChaptersForSeries(series);
      if (feedChapters.length > 0) {
        const exactMatch = feedChapters.find(
          (fc) => fc.chapterNumber === chapter.chapterNumber
        );
        const chosen =
          exactMatch ||
          feedChapters[Math.max(0, (chapter.chapterNumber - 1) % feedChapters.length)];
        if (chosen) {
          targetMdChapterId = chosen.mangadexChapterId;
          resolvedLang = chosen.language;
        }
      }
    }

    if (!targetMdChapterId) {
      return { pages: chapter.pages, isLiveStreamed: false };
    }

    // Fetch MangaDex At-Home streaming node URLs (forcePort443=true avoids blocked non-standard ports)
    const homeCtrl = new AbortController();
    const homeTimeout = setTimeout(() => homeCtrl.abort(), 6000);
    const homeRes = await fetch(
      `https://api.mangadex.org/at-home/server/${targetMdChapterId}?forcePort443=true`,
      {
        signal: homeCtrl.signal,
        headers: {
          'User-Agent': 'PanelVerseReader/2.0 (Webtoon & Manga Reader)',
          Accept: 'application/json',
        },
      }
    );
    clearTimeout(homeTimeout);

    if (!homeRes.ok) {
      return { pages: chapter.pages, isLiveStreamed: false };
    }

    const homeData = await homeRes.json();
    const baseUrl: string | undefined = homeData?.baseUrl;
    const hash: string | undefined = homeData?.chapter?.hash;
    const dataSaverFiles: string[] = homeData?.chapter?.dataSaver || [];
    const dataFiles: string[] = homeData?.chapter?.data || [];
    const useDataSaver = dataSaverFiles.length > 0;
    const files: string[] = useDataSaver ? dataSaverFiles : dataFiles;
    const folder = useDataSaver ? 'data-saver' : 'data';

    if (!baseUrl || !hash || files.length === 0) {
      return { pages: chapter.pages, isLiveStreamed: false };
    }

    const livePages: PageImage[] = files.slice(0, 36).map((fileName, idx) => {
      const pageNum = idx + 1;
      const rawPageUrl = `${baseUrl}/${folder}/${hash}/${fileName}`;
      const uploadOriginUrl = `https://uploads.mangadex.org/${folder}/${hash}/${fileName}`;
      const proxiedUrl = buildProxiedImageUrl(
        rawPageUrl,
        series.title,
        series.type,
        'shadow',
        'page',
        chapter.chapterNumber || 1,
        pageNum,
        uploadOriginUrl
      );
      return {
        pageNumber: pageNum,
        imageUrl: proxiedUrl,
        caption: `Page ${pageNum}`,
      };
    });

    const expiresAt = Date.now() + 10 * 60 * 1000;
    chapterStreamCache.set(cacheKey, {
      pages: livePages,
      language: resolvedLang,
      expiresAt,
    });
    chapterStreamCache.set(chapter.id, {
      pages: livePages,
      language: resolvedLang,
      expiresAt,
    });
    return { pages: livePages, isLiveStreamed: true, language: resolvedLang };
  } catch {
    return { pages: chapter.pages, isLiveStreamed: false };
  }
}

export interface InternetMangaSearchResult {
  externalId: string;
  mangadexId?: string;
  malId?: number;
  title: string;
  nativeTitle?: string;
  author: string;
  origin: SeriesOrigin;
  type: SeriesType;
  genres: string[];
  status: 'Ongoing' | 'Completed';
  rating: number;
  synopsis: string;
  coverImage: string;
}

/**
 * Live search across MangaDex and Jikan (MyAnimeList) public APIs
 */
export async function searchInternetCatalog(
  query: string
): Promise<InternetMangaSearchResult[]> {
  const results: InternetMangaSearchResult[] = [];
  const trimmed = query.trim();
  if (!trimmed) return results;

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5500);

    const [mdRes, jikanRes] = await Promise.allSettled([
      fetch(
        `https://api.mangadex.org/manga?title=${encodeURIComponent(
          trimmed
        )}&limit=8&includes[]=cover_art&includes[]=author&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`,
        {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'PanelVerseReader/2.0 (Webtoon & Manga Reader)',
            Accept: 'application/json',
          },
        }
      ),
      fetch(
        `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(trimmed)}&limit=6&sfw=true`,
        {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'PanelVerseReader/2.0 (Webtoon & Manga Reader)',
            Accept: 'application/json',
          },
        }
      ),
    ]);

    clearTimeout(timeout);

    if (mdRes.status === 'fulfilled' && mdRes.value.ok) {
      const mdJson = await mdRes.value.json();
      for (const item of mdJson?.data || []) {
        const attrs = item.attributes || {};
        const titleObj = attrs.title || {};
        const title =
          titleObj.en ||
          titleObj['ja-ro'] ||
          titleObj['ko-ro'] ||
          Object.values(titleObj)[0] ||
          'Untitled Series';

        const origLang = attrs.originalLanguage || 'ja';
        const origin: SeriesOrigin =
          origLang === 'ko'
            ? 'manhwa'
            : origLang === 'zh' || origLang === 'zh-hk'
            ? 'manhua'
            : 'manga';
        const type: SeriesType = origin === 'manga' ? 'manga' : 'webtoon';

        const coverRel = (item.relationships || []).find(
          (r: { type?: string; attributes?: { fileName?: string } }) =>
            r.type === 'cover_art' && r.attributes?.fileName
        );
        const authorRel = (item.relationships || []).find(
          (r: { type?: string; attributes?: { name?: string } }) =>
            r.type === 'author' && r.attributes?.name
        );

        const rawCoverUrl = coverRel?.attributes?.fileName
          ? `https://uploads.mangadex.org/covers/${item.id}/${coverRel.attributes.fileName}.512.jpg`
          : '';

        const tags = (attrs.tags || [])
          .map((t: { attributes?: { name?: { en?: string } } }) => t.attributes?.name?.en)
          .filter(Boolean)
          .slice(0, 3);

        results.push({
          externalId: `md-${item.id}`,
          mangadexId: item.id,
          title: String(title),
          author: authorRel?.attributes?.name || 'Original Creator',
          origin,
          type,
          genres: tags.length > 0 ? tags : ['Action', 'Fantasy'],
          status: attrs.status === 'completed' ? 'Completed' : 'Ongoing',
          rating: 4.85,
          synopsis:
            attrs.description?.en?.slice(0, 360) ||
            'Official serialization discovered via MangaDex global catalog.',
          coverImage: buildProxiedImageUrl(rawCoverUrl, String(title), type),
        });
      }
    }

    if (jikanRes.status === 'fulfilled' && jikanRes.value.ok) {
      const jikanJson = await jikanRes.value.json();
      for (const item of jikanJson?.data || []) {
        const malTitle: string = item.title_english || item.title || 'Untitled';
        if (
          results.some((r) => r.title.toLowerCase() === malTitle.toLowerCase())
        ) {
          continue;
        }

        const rawType = String(item.type || 'Manga').toLowerCase();
        const origin: SeriesOrigin =
          rawType === 'manhwa'
            ? 'manhwa'
            : rawType === 'manhua'
            ? 'manhua'
            : 'manga';
        const type: SeriesType = origin === 'manga' ? 'manga' : 'webtoon';
        const rawCover =
          item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '';

        const genres = (item.genres || [])
          .map((g: { name?: string }) => g.name)
          .filter(Boolean)
          .slice(0, 3);

        results.push({
          externalId: `mal-${item.mal_id}`,
          malId: item.mal_id,
          title: malTitle,
          nativeTitle: item.title_japanese || undefined,
          author: item.authors?.[0]?.name || 'Original Creator',
          origin,
          type,
          genres: genres.length > 0 ? genres : ['Action', 'Adventure'],
          status: item.status === 'Finished' ? 'Completed' : 'Ongoing',
          rating: item.score ? Math.min(5, Number((item.score / 2).toFixed(2))) : 4.8,
          synopsis:
            item.synopsis?.slice(0, 360) ||
            'Acclaimed series from the MyAnimeList international catalog.',
          coverImage: buildProxiedImageUrl(rawCover, malTitle, type),
        });
      }
    }
  } catch (err) {
    console.error('Internet catalog search error:', err);
  }

  return results;
}
