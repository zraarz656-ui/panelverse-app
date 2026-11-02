'use client';

import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';
import { db, auth, sanitizeFirestoreId, VALIDATION_RULES } from './firebase';
import {
  syncReadingProgressToFirestore as fallbackSyncProgress,
  subscribeReadingProgressFromFirestore as fallbackSubscribeProgress,
  subscribeChapterComments as fallbackSubscribeComments,
  createFirestoreComment as fallbackCreateComment,
  upvoteFirestoreComment as fallbackUpvoteComment,
  subscribeSeriesRequests as fallbackSubscribeRequests,
  createFirestoreRequest as fallbackCreateRequest,
  upvoteFirestoreRequest as fallbackUpvoteRequest,
  saveSeriesToFirestore as fallbackSaveSeries,
  saveChapterToFirestore as fallbackSaveChapter,
  subscribeLibrarySeriesFromFirestore as fallbackSubscribeSeries,
  subscribeLibraryChaptersFromFirestore as fallbackSubscribeChapters,
  mergeSeriesWithFirestore,
  mergeChaptersWithFirestore,
  getChapterEditsFromFirestore as fallbackGetChapterEdits,
  saveChapterEditsToFirestore as fallbackSaveChapterEdits,
  PersistedSeriesRecord,
  PersistedChapterRecord,
} from './firebase-sync';
import {
  Comment,
  ReadingProgress,
  SeriesRequest,
  Series,
  Chapter,
  ChapterEditsData,
} from './types';

export type { PersistedSeriesRecord, PersistedChapterRecord };

function formatIsoDate(val: unknown): string {
  if (typeof val === 'string' && val.length > 0) {
    return val.split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

function isTableMissingError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    Boolean(error.message && error.message.includes('schema cache'))
  );
}

/**
 * 1. Reading Progress Supabase Sync (public.reading_progress)
 */
export async function syncReadingProgressToSupabase(progress: {
  seriesId: string;
  chapterId: string;
  chapterNumber: number;
  seriesTitle: string;
  seriesSlug: string;
  seriesType: 'webtoon' | 'manga';
  coverImage: string;
  pageIndex: number;
  totalPages: number;
  scrollPercentage: number;
  isCompleted: boolean;
  userId?: string;
}) {
  const currentUser = auth.currentUser;
  const rawUid = progress.userId || currentUser?.uid || 'guest';
  const safeUid = sanitizeFirestoreId(rawUid);
  const safeSeriesId = sanitizeFirestoreId(progress.seriesId);
  const safeChapterId = sanitizeFirestoreId(progress.chapterId);
  const safeSlug = sanitizeFirestoreId(progress.seriesSlug || progress.seriesId);
  const rowId = `${safeUid}__${safeSeriesId}`;

  const safeTitle = (progress.seriesTitle || 'Series').slice(0, VALIDATION_RULES.MAX_SERIES_TITLE_LENGTH);
  const safeCover = (progress.coverImage || '/placeholder.jpg').slice(0, VALIDATION_RULES.MAX_COVER_URL_LENGTH);
  const safeChapterNumber = Math.max(0, Math.min(100000, Math.round(progress.chapterNumber || 1)));
  const safeTotalPages = Math.max(1, Math.min(10000, Math.round(progress.totalPages || 1)));
  const safePageIndex = Math.max(0, Math.min(safeTotalPages, Math.round(progress.pageIndex || 0)));
  const safeScrollPct = Math.max(0, Math.min(100, Math.round(progress.scrollPercentage || 0)));

  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from('reading_progress').upsert(
      {
        id: rowId,
        user_id: safeUid,
        series_id: safeSeriesId,
        chapter_id: safeChapterId,
        chapter_number: safeChapterNumber,
        series_title: safeTitle,
        series_slug: safeSlug,
        series_type: progress.seriesType === 'manga' ? 'manga' : 'webtoon',
        cover_image: safeCover,
        page_index: safePageIndex,
        total_pages: safeTotalPages,
        scroll_percentage: safeScrollPct,
        is_completed: Boolean(progress.isCompleted),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error && isTableMissingError(error)) {
      await fallbackSyncProgress(progress);
      return;
    }
  } catch {
    // Fallback to Firestore if offline or table not yet created
  }

  // Also keep Firestore synced if user is signed in with Firebase Auth
  if (currentUser?.emailVerified) {
    await fallbackSyncProgress(progress).catch(() => {});
  }
}

export function subscribeReadingProgressFromSupabase(
  uid: string,
  onData: (items: ReadingProgress[]) => void
) {
  const safeUid = sanitizeFirestoreId(uid);
  const supabase = createSupabaseBrowserClient();
  let fallbackUnsub: (() => void) | null = null;
  let isActive = true;

  const mapRow = (row: Record<string, unknown>): ReadingProgress => ({
    seriesId: String(row.series_id || ''),
    chapterId: String(row.chapter_id || ''),
    chapterNumber: Number(row.chapter_number ?? 1),
    seriesTitle: String(row.series_title || 'Series'),
    seriesSlug: String(row.series_slug || row.series_id || ''),
    seriesType: row.series_type === 'manga' ? 'manga' : 'webtoon',
    coverImage: String(row.cover_image || '/placeholder.jpg'),
    pageIndex: Number(row.page_index ?? 0),
    totalPages: Number(row.total_pages ?? 1),
    scrollPercentage: Number(row.scroll_percentage ?? 0),
    isCompleted: Boolean(row.is_completed),
    updatedAt: formatIsoDate(row.updated_at),
  });

  const fetchLatest = async () => {
    const { data, error } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('user_id', safeUid)
      .order('updated_at', { ascending: false });

    if (!isActive) return;

    if (error) {
      if (isTableMissingError(error) && !fallbackUnsub) {
        fallbackUnsub = fallbackSubscribeProgress(uid, onData);
      }
      return;
    }

    if (Array.isArray(data) && data.length > 0) {
      onData(data.map(mapRow));
    } else if (!fallbackUnsub) {
      fallbackUnsub = fallbackSubscribeProgress(uid, onData);
    }
  };

  void fetchLatest();

  const channel = supabase
    .channel(`reading_progress_${safeUid}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reading_progress',
        filter: `user_id=eq.${safeUid}`,
      },
      () => {
        void fetchLatest();
      }
    )
    .subscribe();

  return () => {
    isActive = false;
    void supabase.removeChannel(channel);
    if (fallbackUnsub) fallbackUnsub();
  };
}

/**
 * 2. Episode Comments Supabase Sync (public.comments)
 */
export function subscribeChapterComments(
  chapterId: string,
  onData: (comments: Comment[]) => void
) {
  const safeChapterId = sanitizeFirestoreId(chapterId);
  const supabase = createSupabaseBrowserClient();
  let fallbackUnsub: (() => void) | null = null;
  let isActive = true;

  const mapComment = (row: Record<string, unknown>): Comment => ({
    id: String(row.id || ''),
    chapterId: String(row.chapter_id || safeChapterId),
    seriesId: String(row.series_id || ''),
    userId: String(row.author_id || 'reader'),
    username: String(row.username || 'Reader'),
    content: String(row.content || ''),
    spoiler: Boolean(row.spoiler),
    upvotes: Number(row.upvotes ?? 0),
    createdAt: formatIsoDate(row.created_at),
  });

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('chapter_id', safeChapterId)
      .order('created_at', { ascending: false });

    if (!isActive) return;

    if (error) {
      if (isTableMissingError(error) && !fallbackUnsub) {
        fallbackUnsub = fallbackSubscribeComments(chapterId, onData);
      }
      return;
    }

    if (Array.isArray(data) && data.length > 0) {
      onData(data.map(mapComment));
    } else if (!fallbackUnsub) {
      fallbackUnsub = fallbackSubscribeComments(chapterId, onData);
    }
  };

  void fetchComments();

  const channel = supabase
    .channel(`comments_${safeChapterId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'comments',
        filter: `chapter_id=eq.${safeChapterId}`,
      },
      () => {
        void fetchComments();
      }
    )
    .subscribe();

  return () => {
    isActive = false;
    void supabase.removeChannel(channel);
    if (fallbackUnsub) fallbackUnsub();
  };
}

export async function createSupabaseComment(params: {
  chapterId: string;
  seriesId: string;
  username: string;
  content: string;
  spoiler: boolean;
}): Promise<string | null> {
  const currentUser = auth.currentUser;
  const safeUid = sanitizeFirestoreId(currentUser?.uid || 'reader');
  const commentId = sanitizeFirestoreId(`cmt_${Date.now()}_${safeUid.slice(0, 8)}`);

  const safeChapterId = sanitizeFirestoreId(params.chapterId);
  const safeSeriesId = sanitizeFirestoreId(params.seriesId);
  const rawUsername = (params.username || currentUser?.displayName || 'Reader').trim();
  const safeUsername =
    rawUsername.length >= VALIDATION_RULES.MIN_USERNAME_LENGTH
      ? rawUsername.slice(0, VALIDATION_RULES.MAX_USERNAME_LENGTH)
      : 'Reader';
  const safeContent = params.content.trim().slice(0, VALIDATION_RULES.MAX_COMMENT_LENGTH);
  if (!safeContent) return null;

  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from('comments').upsert(
      {
        id: commentId,
        chapter_id: safeChapterId,
        series_id: safeSeriesId,
        author_id: safeUid,
        username: safeUsername,
        content: safeContent,
        spoiler: Boolean(params.spoiler),
        upvotes: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (!error) {
      if (currentUser?.emailVerified) {
        await fallbackCreateComment(params).catch(() => {});
      }
      return commentId;
    }
  } catch {
    // Fallback below
  }

  return fallbackCreateComment(params);
}

export async function upvoteSupabaseComment(commentId: string, currentUpvotes: number) {
  const safeId = sanitizeFirestoreId(commentId);

  try {
    const supabase = createSupabaseBrowserClient();
    const { data: existing } = await supabase
      .from('comments')
      .select('upvotes')
      .eq('id', safeId)
      .maybeSingle();

    const nextVotes = Number(existing?.upvotes ?? currentUpvotes) + 1;
    const { error } = await supabase
      .from('comments')
      .update({
        upvotes: nextVotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', safeId);

    if (!error) {
      await fallbackUpvoteComment(commentId, currentUpvotes).catch(() => {});
      return;
    }
  } catch {
    // Fallback below
  }

  await fallbackUpvoteComment(commentId, currentUpvotes);
}

/**
 * 3. Community Series Requests Supabase Sync (public.requests)
 */
export function subscribeSeriesRequests(onData: (requests: SeriesRequest[]) => void) {
  const supabase = createSupabaseBrowserClient();
  let fallbackUnsub: (() => void) | null = null;
  let isActive = true;

  const mapRequest = (row: Record<string, unknown>): SeriesRequest => ({
    id: String(row.id || ''),
    title: String(row.title || 'Untitled'),
    type: row.type === 'manga' ? 'manga' : 'webtoon',
    author: String(row.author || 'Unknown Studio'),
    reason: String(row.reason || ''),
    requestedBy: String(row.requested_by || 'Reader'),
    votes: Number(row.votes ?? 1),
    status: (row.status as SeriesRequest['status']) || 'Pending',
    createdAt: formatIsoDate(row.created_at),
  });

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('votes', { ascending: false });

    if (!isActive) return;

    if (error) {
      if (isTableMissingError(error) && !fallbackUnsub) {
        fallbackUnsub = fallbackSubscribeRequests(onData);
      }
      return;
    }

    if (Array.isArray(data) && data.length > 0) {
      onData(data.map(mapRequest));
    } else if (!fallbackUnsub) {
      fallbackUnsub = fallbackSubscribeRequests(onData);
    }
  };

  void fetchRequests();

  const channel = supabase
    .channel('requests_realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'requests',
      },
      () => {
        void fetchRequests();
      }
    )
    .subscribe();

  return () => {
    isActive = false;
    void supabase.removeChannel(channel);
    if (fallbackUnsub) fallbackUnsub();
  };
}

export async function createSupabaseRequest(params: {
  title: string;
  type: 'webtoon' | 'manga';
  author?: string;
  reason: string;
  requestedBy: string;
}): Promise<string | null> {
  const currentUser = auth.currentUser;
  const safeUid = sanitizeFirestoreId(currentUser?.uid || 'reader');
  const requestId = sanitizeFirestoreId(`req_${Date.now()}_${safeUid.slice(0, 8)}`);

  const safeTitle = params.title.trim().slice(0, VALIDATION_RULES.MAX_REQUEST_TITLE_LENGTH);
  const safeAuthor = (params.author?.trim() || 'Unknown Studio').slice(
    0,
    VALIDATION_RULES.MAX_REQUEST_AUTHOR_LENGTH
  );
  const rawReason = params.reason.trim();
  const safeReason =
    rawReason.length >= VALIDATION_RULES.MIN_REQUEST_REASON_LENGTH
      ? rawReason.slice(0, VALIDATION_RULES.MAX_REQUEST_REASON_LENGTH)
      : `${rawReason} (Requested by community)`.slice(0, VALIDATION_RULES.MAX_REQUEST_REASON_LENGTH);

  const rawRequester = (params.requestedBy || currentUser?.displayName || 'Reader').trim();
  const safeRequester =
    rawRequester.length >= VALIDATION_RULES.MIN_USERNAME_LENGTH
      ? rawRequester.slice(0, VALIDATION_RULES.MAX_USERNAME_LENGTH)
      : 'Reader';

  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from('requests').upsert(
      {
        id: requestId,
        title: safeTitle,
        type: params.type === 'manga' ? 'manga' : 'webtoon',
        author: safeAuthor,
        reason: safeReason,
        requested_by: safeRequester,
        author_id: safeUid,
        votes: 1,
        status: 'Pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (!error) {
      if (currentUser?.emailVerified) {
        await fallbackCreateRequest(params).catch(() => {});
      }
      return requestId;
    }
  } catch {
    // Fallback below
  }

  return fallbackCreateRequest(params);
}

export async function upvoteSupabaseRequest(requestId: string, currentVotes: number) {
  const safeId = sanitizeFirestoreId(requestId);

  try {
    const supabase = createSupabaseBrowserClient();
    const { data: existing } = await supabase
      .from('requests')
      .select('votes, status')
      .eq('id', safeId)
      .maybeSingle();

    if (existing?.status === 'Acquired') return;
    const nextVotes = Number(existing?.votes ?? currentVotes) + 1;
    const { error } = await supabase
      .from('requests')
      .update({
        votes: nextVotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', safeId);

    if (!error) {
      await fallbackUpvoteRequest(requestId, currentVotes).catch(() => {});
      return;
    }
  } catch {
    // Fallback below
  }

  await fallbackUpvoteRequest(requestId, currentVotes);
}

/**
 * 4. Series & Chapter Library Supabase Sync (public.series & public.chapters)
 */
export async function saveSeriesToSupabase(series: Series, isDeleted = false): Promise<boolean> {
  const safeId = sanitizeFirestoreId(series.id);
  const safeSlug = sanitizeFirestoreId(series.slug || series.id).slice(0, 160);
  const safeTitle = (series.title || 'Untitled Series').trim().slice(0, VALIDATION_RULES.MAX_SERIES_TITLE_LENGTH);
  const safeOrigin =
    series.origin === 'manga' || series.origin === 'manhua' || series.origin === 'manhwa'
      ? series.origin
      : series.type === 'manga'
      ? 'manga'
      : 'manhwa';
  const safeType = series.type === 'manga' ? 'manga' : 'webtoon';
  const safeAuthor = (series.author || 'Unknown Author').trim().slice(0, 120);
  const safeArtist = (series.artist || safeAuthor).trim().slice(0, 120);
  const safeStatus = series.status === 'Completed' ? 'Completed' : 'Ongoing';
  const safeReleaseDay = (series.releaseDay || 'Friday').trim().slice(0, 20);
  const safeSynopsis = (series.synopsis || 'Now serializing on PanelVerse.')
    .trim()
    .slice(0, VALIDATION_RULES.MAX_SERIES_SYNOPSIS_LENGTH);
  const safeCover = (series.coverImage || '/placeholder.jpg').slice(
    0,
    VALIDATION_RULES.MAX_SERIES_COVER_LENGTH
  );
  const safeGenres = (Array.isArray(series.genres) ? series.genres : ['Action'])
    .map((g) => String(g).trim().slice(0, 40))
    .filter((g) => g.length > 0)
    .slice(0, VALIDATION_RULES.MAX_SERIES_GENRES);
  const safeRating = Math.max(0, Math.min(5, Number(series.rating ?? 4.9)));
  const safeViews = Math.max(0, Math.min(1000000000, Math.round(Number(series.totalViews ?? 100))));
  const safeChaptersCount = Math.max(0, Math.min(100000, Math.round(Number(series.chaptersCount ?? 0))));
  const safeMlTitle = (series.malayalamTitle || '').trim().slice(0, 200);
  const safeMlSynopsis = (series.malayalamSynopsis || '').trim().slice(0, 2000);

  let savedInSupabase = false;
  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from('series').upsert(
      {
        id: safeId,
        slug: safeSlug,
        title: safeTitle,
        origin: safeOrigin,
        type: safeType,
        author: safeAuthor,
        artist: safeArtist,
        status: safeStatus,
        release_day: safeReleaseDay,
        synopsis: safeSynopsis,
        cover_image: safeCover,
        genres: safeGenres.length > 0 ? safeGenres : ['Action'],
        rating: safeRating,
        total_views: safeViews,
        chapters_count: safeChaptersCount,
        featured: Boolean(series.featured),
        is_deleted: Boolean(isDeleted),
        malayalam_title: safeMlTitle || null,
        malayalam_synopsis: safeMlSynopsis || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (!error) {
      savedInSupabase = true;
    }
  } catch {
    // Continue to Firestore fallback
  }

  const savedInFirestore = await fallbackSaveSeries(series, isDeleted).catch(() => false);
  return savedInSupabase || savedInFirestore;
}

export async function saveChapterToSupabase(chapter: Chapter, isDeleted = false): Promise<boolean> {
  const safeId = sanitizeFirestoreId(chapter.id);
  const safeSeriesId = sanitizeFirestoreId(chapter.seriesId);
  const safeChapterNum = Math.max(0, Math.min(100000, Number(chapter.chapterNumber ?? 1)));
  const safeTitle = (chapter.title || `Chapter ${safeChapterNum}`)
    .trim()
    .slice(0, VALIDATION_RULES.MAX_CHAPTER_TITLE_LENGTH);
  const safeReleaseDate = (chapter.releaseDate || 'Recent').trim().slice(0, 60);
  const safeViews = Math.max(0, Math.min(1000000000, Math.round(Number(chapter.views ?? 1))));
  const safePageUrls = (Array.isArray(chapter.pages) ? chapter.pages : [])
    .map((p) => String(p.imageUrl || '').trim().slice(0, 100000))
    .filter((u) => u.length > 0)
    .slice(0, VALIDATION_RULES.MAX_CHAPTER_PAGES);

  let savedInSupabase = false;
  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from('chapters').upsert(
      {
        id: safeId,
        series_id: safeSeriesId,
        chapter_number: safeChapterNum,
        title: safeTitle,
        release_date: safeReleaseDate,
        views: safeViews,
        page_urls: safePageUrls,
        pages: safePageUrls.map((url, idx) => ({
          pageNumber: idx + 1,
          imageUrl: url,
          caption: `Panel ${idx + 1}`,
        })),
        pages_count: safePageUrls.length,
        is_deleted: Boolean(isDeleted),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (!error) {
      savedInSupabase = true;
    }
  } catch {
    // Continue to Firestore fallback
  }

  const savedInFirestore = await fallbackSaveChapter(chapter, isDeleted).catch(() => false);
  return savedInSupabase || savedInFirestore;
}

export function subscribeLibrarySeriesFromSupabase(
  onData: (records: PersistedSeriesRecord[]) => void
) {
  const supabase = createSupabaseBrowserClient();
  let firestoreItems: PersistedSeriesRecord[] = [];
  let supabaseItems: PersistedSeriesRecord[] = [];
  let isActive = true;

  const emitCombined = () => {
    if (!isActive) return;
    const mergedMap = new Map<string, PersistedSeriesRecord>();
    for (const item of firestoreItems) mergedMap.set(item.id, item);
    for (const item of supabaseItems) mergedMap.set(item.id, item);
    onData(Array.from(mergedMap.values()));
  };

  const firestoreUnsub = fallbackSubscribeSeries((items) => {
    firestoreItems = items;
    emitCombined();
  });

  const mapSeriesRow = (row: Record<string, unknown>): PersistedSeriesRecord => ({
    id: String(row.id || ''),
    slug: String(row.slug || row.id || ''),
    title: String(row.title || 'Untitled'),
    origin:
      row.origin === 'manga' || row.origin === 'manhua' || row.origin === 'manhwa'
        ? row.origin
        : row.type === 'manga'
        ? 'manga'
        : 'manhwa',
    type: row.type === 'manga' ? 'manga' : 'webtoon',
    author: String(row.author || 'Unknown'),
    artist: String(row.artist || row.author || 'Unknown'),
    status: row.status === 'Completed' ? 'Completed' : 'Ongoing',
    releaseDay: String(row.release_day || 'Friday'),
    synopsis: String(row.synopsis || ''),
    coverImage: String(row.cover_image || '/placeholder.jpg'),
    genres: Array.isArray(row.genres) ? (row.genres as string[]) : ['Action'],
    rating: Number(row.rating ?? 4.9),
    totalViews: Number(row.total_views ?? 100),
    chaptersCount: Number(row.chapters_count ?? 0),
    featured: Boolean(row.featured),
    isDeleted: Boolean(row.is_deleted),
    malayalamTitle: row.malayalam_title ? String(row.malayalam_title) : undefined,
    malayalamSynopsis: row.malayalam_synopsis ? String(row.malayalam_synopsis) : undefined,
  });

  const fetchSeries = async () => {
    const { data, error } = await supabase.from('series').select('*');
    if (!isActive || error || !Array.isArray(data)) return;
    supabaseItems = data.map(mapSeriesRow);
    emitCombined();
  };

  void fetchSeries();

  const channel = supabase
    .channel('library_series_realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'series',
      },
      () => {
        void fetchSeries();
      }
    )
    .subscribe();

  return () => {
    isActive = false;
    void supabase.removeChannel(channel);
    firestoreUnsub();
  };
}

export function subscribeLibraryChaptersFromSupabase(
  onData: (records: PersistedChapterRecord[]) => void
) {
  const supabase = createSupabaseBrowserClient();
  let firestoreItems: PersistedChapterRecord[] = [];
  let supabaseItems: PersistedChapterRecord[] = [];
  let isActive = true;

  const emitCombined = () => {
    if (!isActive) return;
    const mergedMap = new Map<string, PersistedChapterRecord>();
    for (const item of firestoreItems) mergedMap.set(item.id, item);
    for (const item of supabaseItems) mergedMap.set(item.id, item);
    onData(Array.from(mergedMap.values()));
  };

  const firestoreUnsub = fallbackSubscribeChapters((items) => {
    firestoreItems = items;
    emitCombined();
  });

  const mapChapterRow = (row: Record<string, unknown>): PersistedChapterRecord => {
    const pageUrls: string[] = Array.isArray(row.page_urls) ? (row.page_urls as string[]) : [];
    const jsonPages = Array.isArray(row.pages)
      ? (row.pages as { pageNumber: number; imageUrl: string; caption?: string }[])
      : [];
    const pages =
      pageUrls.length > 0
        ? pageUrls.map((url, idx) => ({
            pageNumber: idx + 1,
            imageUrl: url,
            caption: `Panel ${idx + 1}`,
          }))
        : jsonPages;

    return {
      id: String(row.id || ''),
      seriesId: String(row.series_id || ''),
      chapterNumber: Number(row.chapter_number ?? 1),
      title: String(row.title || 'Episode'),
      releaseDate: String(row.release_date || 'Recent'),
      views: Number(row.views ?? 1),
      pages,
      pagesCount: pages.length,
      isDeleted: Boolean(row.is_deleted),
    };
  };

  const fetchChapters = async () => {
    const { data, error } = await supabase.from('chapters').select('*');
    if (!isActive || error || !Array.isArray(data)) return;
    supabaseItems = data.map(mapChapterRow);
    emitCombined();
  };

  void fetchChapters();

  const channel = supabase
    .channel('library_chapters_realtime')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'chapters',
      },
      () => {
        void fetchChapters();
      }
    )
    .subscribe();

  return () => {
    isActive = false;
    void supabase.removeChannel(channel);
    firestoreUnsub();
  };
}

/**
 * 5. Full Firestore + Local Catalog -> Supabase Postgres Migration Helper
 */
export interface SupabaseMigrationSummary {
  ok: boolean;
  tablesReady: boolean;
  migrated: {
    series: number;
    chapters: number;
    progress: number;
    comments: number;
    requests: number;
  };
  sqlEditorUrl?: string;
  message: string;
}

export async function migrateFirestoreToSupabase(): Promise<SupabaseMigrationSummary> {
  const firestoreSeries: Record<string, unknown>[] = [];
  const firestoreChapters: Record<string, unknown>[] = [];
  const firestoreProgress: Record<string, unknown>[] = [];
  const firestoreComments: Record<string, unknown>[] = [];
  const firestoreRequests: Record<string, unknown>[] = [];

  // 1. Collect Firestore documents if accessible from client
  try {
    const seriesSnap = await getDocs(
      query(collection(db, 'series'), where('totalViews', '>=', 0))
    );
    seriesSnap.forEach((docSnap) => {
      firestoreSeries.push({ id: docSnap.id, ...docSnap.data() });
    });
  } catch {
    // Ignore if empty or unauthenticated
  }

  try {
    const chaptersSnap = await getDocs(
      query(collection(db, 'chapters'), where('views', '>=', 0))
    );
    chaptersSnap.forEach((docSnap) => {
      firestoreChapters.push({ id: docSnap.id, ...docSnap.data() });
    });
  } catch {
    // Ignore
  }

  try {
    const commentsSnap = await getDocs(
      query(collection(db, 'comments'), where('upvotes', '>=', 0))
    );
    commentsSnap.forEach((docSnap) => {
      firestoreComments.push({ id: docSnap.id, ...docSnap.data() });
    });
  } catch {
    // Ignore
  }

  try {
    const requestsSnap = await getDocs(
      query(collection(db, 'requests'), where('votes', '>=', 0))
    );
    requestsSnap.forEach((docSnap) => {
      firestoreRequests.push({ id: docSnap.id, ...docSnap.data() });
    });
  } catch {
    // Ignore
  }

  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const safeUid = sanitizeFirestoreId(currentUser.uid);
      const progressSnap = await getDocs(
        query(collection(db, 'users', safeUid, 'progress'), where('userId', '==', safeUid))
      );
      progressSnap.forEach((docSnap) => {
        firestoreProgress.push({ id: docSnap.id, userId: safeUid, ...docSnap.data() });
      });
    }
  } catch {
    // Ignore
  }

  // 2. Send collected Firestore records to server migration endpoint (which also merges server dataStore)
  const response = await fetch('/api/admin/migrate-supabase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      series: firestoreSeries,
      chapters: firestoreChapters,
      progress: firestoreProgress,
      comments: firestoreComments,
      requests: firestoreRequests,
    }),
  });

  const result = (await response.json()) as SupabaseMigrationSummary;
  return result;
}

// Drop-in compatible aliases for seamless replacement of lib/firebase-sync.ts
export const syncReadingProgressToFirestore = syncReadingProgressToSupabase;
export const subscribeReadingProgressFromFirestore = subscribeReadingProgressFromSupabase;
export const createFirestoreComment = createSupabaseComment;
export const upvoteFirestoreComment = upvoteSupabaseComment;
export const createFirestoreRequest = createSupabaseRequest;
export const upvoteFirestoreRequest = upvoteSupabaseRequest;
export const saveSeriesToFirestore = saveSeriesToSupabase;
export const saveChapterToFirestore = saveChapterToSupabase;
export const subscribeLibrarySeriesFromFirestore = subscribeLibrarySeriesFromSupabase;
export const subscribeLibraryChaptersFromFirestore = subscribeLibraryChaptersFromSupabase;
export const mergeSeriesWithSupabase = mergeSeriesWithFirestore;
export const mergeChaptersWithSupabase = mergeChaptersWithFirestore;
export { mergeSeriesWithFirestore, mergeChaptersWithFirestore };

/**
 * 6. Studio Pre-Translated Speech Bubble Overlays & Panel Cuts (chapter_edits)
 * Shared Data Contract: ID = "{seriesId}_{chapterId}_{languageCode}"
 */
export async function getChapterEdits(
  seriesId: string,
  chapterId: string,
  languageCode = 'en'
): Promise<ChapterEditsData | null> {
  const safeSeriesId = sanitizeFirestoreId(seriesId);
  const safeChapterId = sanitizeFirestoreId(chapterId);
  const safeLang = ['en', 'ml', 'hi', 'ta'].includes(languageCode) ? languageCode : 'en';
  const editId = sanitizeFirestoreId(`${safeSeriesId}_${safeChapterId}_${safeLang}`);

  // 1. Check fast server store first (/api/chapter-edits)
  try {
    const res = await fetch(
      `/api/chapter-edits?seriesId=${encodeURIComponent(safeSeriesId)}&chapterId=${encodeURIComponent(safeChapterId)}&lang=${encodeURIComponent(safeLang)}`
    );
    if (res.ok) {
      const json = await res.json();
      if (json?.record?.data && Array.isArray(json.record.data.pages)) {
        return json.record.data as ChapterEditsData;
      }
    }
  } catch {
    // Continue to cloud stores
  }

  // 2. Check Supabase chapter_edits table
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('chapter_edits')
      .select('data')
      .eq('id', editId)
      .maybeSingle();

    if (!error && data?.data && typeof data.data === 'object') {
      const parsed = data.data as ChapterEditsData;
      if (Array.isArray(parsed.pages)) {
        return parsed;
      }
    }
  } catch {
    // Fallback to Firestore
  }

  // 3. Fallback to Firebase Firestore chapter_edits collection
  try {
    const fsData = await fallbackGetChapterEdits(safeSeriesId, safeChapterId, safeLang);
    if (fsData && Array.isArray(fsData.pages)) {
      return fsData;
    }
  } catch {
    // Ignore if unavailable
  }

  return null;
}

export async function saveChapterEdits(
  seriesId: string,
  chapterId: string,
  languageCode: string,
  data: ChapterEditsData,
  options?: { adminPin?: string; adminEmail?: string | null }
): Promise<boolean> {
  const safeSeriesId = sanitizeFirestoreId(seriesId);
  const safeChapterId = sanitizeFirestoreId(chapterId);
  const safeLang = ['en', 'ml', 'hi', 'ta'].includes(languageCode) ? languageCode : 'en';
  const editId = sanitizeFirestoreId(`${safeSeriesId}_${safeChapterId}_${safeLang}`);

  let savedAny = false;

  // 1. Save to server store (/api/chapter-edits -> /tmp/panelverse-library-state-v4.json)
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.adminPin) {
      headers['x-admin-pin'] = options.adminPin;
    }
    const res = await fetch('/api/chapter-edits', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        seriesId: safeSeriesId,
        chapterId: safeChapterId,
        languageCode: safeLang,
        data,
        adminEmail: options?.adminEmail || auth.currentUser?.email || undefined,
      }),
    });
    if (res.ok) {
      savedAny = true;
    }
  } catch (err) {
    console.warn('Server chapter-edits cache save warning:', err);
  }

  // 2. Upsert to Supabase chapter_edits table
  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from('chapter_edits').upsert(
      {
        id: editId,
        series_id: safeSeriesId,
        chapter_id: safeChapterId,
        language_code: safeLang,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (!error) {
      savedAny = true;
    }
  } catch {
    // Fallback to Firestore
  }

  // 3. Save to Firebase Firestore chapter_edits collection (when signed in as verified admin)
  try {
    const fsSaved = await fallbackSaveChapterEdits(
      safeSeriesId,
      safeChapterId,
      safeLang,
      data
    );
    if (fsSaved) {
      savedAny = true;
    }
  } catch (err) {
    console.warn('Firestore chapter_edits save fallback warning:', err);
  }

  return savedAny;
}

