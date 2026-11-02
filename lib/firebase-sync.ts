'use client';

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  db,
  auth,
  OperationType,
  handleFirestoreError,
  sanitizeFirestoreId,
  VALIDATION_RULES,
} from './firebase';
import {
  Comment,
  ReadingProgress,
  SeriesRequest,
  Series,
  Chapter,
  ChapterEditsData,
  PageEditData,
} from './types';

function formatTimestamp(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString().split('T')[0];
  }
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Reading Progress Firestore Sync (/users/{userId}/progress/{seriesId})
 */
export async function syncReadingProgressToFirestore(progress: {
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
}) {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;

  const safeUid = sanitizeFirestoreId(currentUser.uid);
  const safeSeriesId = sanitizeFirestoreId(progress.seriesId);
  const safeChapterId = sanitizeFirestoreId(progress.chapterId);
  const safeSlug = sanitizeFirestoreId(progress.seriesSlug || progress.seriesId);
  const path = `users/${safeUid}/progress/${safeSeriesId}`;
  const progressRef = doc(db, 'users', safeUid, 'progress', safeSeriesId);

  const safeTitle = (progress.seriesTitle || 'Series').slice(0, VALIDATION_RULES.MAX_SERIES_TITLE_LENGTH);
  const safeCover = (progress.coverImage || '/placeholder.jpg').slice(0, VALIDATION_RULES.MAX_COVER_URL_LENGTH);
  const safeChapterNumber = Math.max(0, Math.min(100000, Math.round(progress.chapterNumber || 1)));
  const safeTotalPages = Math.max(1, Math.min(10000, Math.round(progress.totalPages || 1)));
  const safePageIndex = Math.max(0, Math.min(safeTotalPages, Math.round(progress.pageIndex || 0)));
  const safeScrollPct = Math.max(0, Math.min(100, Math.round(progress.scrollPercentage || 0)));

  try {
    const existingSnap = await getDoc(progressRef);
    if (!existingSnap.exists()) {
      try {
        await setDoc(progressRef, {
          userId: safeUid,
          seriesId: safeSeriesId,
          chapterId: safeChapterId,
          chapterNumber: safeChapterNumber,
          seriesTitle: safeTitle,
          seriesSlug: safeSlug,
          seriesType: progress.seriesType === 'manga' ? 'manga' : 'webtoon',
          coverImage: safeCover,
          pageIndex: safePageIndex,
          totalPages: safeTotalPages,
          scrollPercentage: safeScrollPct,
          isCompleted: Boolean(progress.isCompleted),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (createErr) {
        handleFirestoreError(createErr, OperationType.CREATE, path);
      }
    } else {
      try {
        await updateDoc(progressRef, {
          chapterId: safeChapterId,
          chapterNumber: safeChapterNumber,
          seriesTitle: safeTitle,
          seriesSlug: safeSlug,
          seriesType: progress.seriesType === 'manga' ? 'manga' : 'webtoon',
          coverImage: safeCover,
          pageIndex: safePageIndex,
          totalPages: safeTotalPages,
          scrollPercentage: safeScrollPct,
          isCompleted: Boolean(progress.isCompleted),
          updatedAt: serverTimestamp(),
        });
      } catch (updateErr) {
        handleFirestoreError(updateErr, OperationType.UPDATE, path);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('{"error":')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeReadingProgressFromFirestore(
  uid: string,
  onData: (items: ReadingProgress[]) => void
) {
  const safeUid = sanitizeFirestoreId(uid);
  const path = `users/${safeUid}/progress`;
  const q = query(collection(db, 'users', safeUid, 'progress'), where('userId', '==', safeUid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ReadingProgress[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          seriesId: data.seriesId,
          chapterId: data.chapterId,
          chapterNumber: data.chapterNumber,
          seriesTitle: data.seriesTitle,
          seriesSlug: data.seriesSlug,
          seriesType: data.seriesType,
          coverImage: data.coverImage,
          pageIndex: data.pageIndex,
          totalPages: data.totalPages,
          scrollPercentage: data.scrollPercentage,
          isCompleted: Boolean(data.isCompleted),
          updatedAt: formatTimestamp(data.updatedAt),
        };
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Episode Comments Firestore Sync (/comments/{commentId})
 */
export function subscribeChapterComments(
  chapterId: string,
  onData: (comments: Comment[]) => void
) {
  const safeChapterId = sanitizeFirestoreId(chapterId);
  const path = 'comments';
  const q = query(
    collection(db, 'comments'),
    where('upvotes', '>=', 0)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Comment[] = snapshot.docs
        .filter((d) => d.data().chapterId === safeChapterId)
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            chapterId: data.chapterId,
            seriesId: data.seriesId,
            userId: data.authorId,
            username: data.username,
            content: data.content,
            spoiler: Boolean(data.spoiler),
            upvotes: Number(data.upvotes || 0),
            createdAt: formatTimestamp(data.createdAt),
          };
        });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createFirestoreComment(params: {
  chapterId: string;
  seriesId: string;
  username: string;
  content: string;
  spoiler: boolean;
}): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return null;

  const safeUid = sanitizeFirestoreId(currentUser.uid);
  const commentId = sanitizeFirestoreId(`cmt_${Date.now()}_${safeUid.slice(0, 8)}`);
  const path = `comments/${commentId}`;

  const safeChapterId = sanitizeFirestoreId(params.chapterId);
  const safeSeriesId = sanitizeFirestoreId(params.seriesId);
  const rawUsername = (params.username || currentUser.displayName || 'Reader').trim();
  const safeUsername =
    rawUsername.length >= VALIDATION_RULES.MIN_USERNAME_LENGTH
      ? rawUsername.slice(0, VALIDATION_RULES.MAX_USERNAME_LENGTH)
      : 'Reader';
  const safeContent = params.content.trim().slice(0, VALIDATION_RULES.MAX_COMMENT_LENGTH);
  if (!safeContent) return null;

  try {
    await setDoc(doc(db, 'comments', commentId), {
      chapterId: safeChapterId,
      seriesId: safeSeriesId,
      authorId: safeUid,
      username: safeUsername,
      content: safeContent,
      spoiler: Boolean(params.spoiler),
      upvotes: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return commentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function upvoteFirestoreComment(commentId: string, currentUpvotes: number) {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;

  const safeId = sanitizeFirestoreId(commentId);
  const path = `comments/${safeId}`;
  const ref = doc(db, 'comments', safeId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const existingVotes = Number(snap.data().upvotes ?? currentUpvotes);
    await updateDoc(ref, {
      upvotes: existingVotes + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Community Series Requests Firestore Sync (/requests/{requestId})
 */
export function subscribeSeriesRequests(onData: (requests: SeriesRequest[]) => void) {
  const path = 'requests';
  const q = query(collection(db, 'requests'), where('votes', '>=', 0));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: SeriesRequest[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title,
          type: data.type === 'manga' ? 'manga' : 'webtoon',
          author: data.author,
          reason: data.reason,
          requestedBy: data.requestedBy,
          votes: Number(data.votes || 1),
          status: data.status || 'Pending',
          createdAt: formatTimestamp(data.createdAt),
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createFirestoreRequest(params: {
  title: string;
  type: 'webtoon' | 'manga';
  author?: string;
  reason: string;
  requestedBy: string;
}): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return null;

  const safeUid = sanitizeFirestoreId(currentUser.uid);
  const requestId = sanitizeFirestoreId(`req_${Date.now()}_${safeUid.slice(0, 8)}`);
  const path = `requests/${requestId}`;

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

  const rawRequester = (params.requestedBy || currentUser.displayName || 'Reader').trim();
  const safeRequester =
    rawRequester.length >= VALIDATION_RULES.MIN_USERNAME_LENGTH
      ? rawRequester.slice(0, VALIDATION_RULES.MAX_USERNAME_LENGTH)
      : 'Reader';

  try {
    await setDoc(doc(db, 'requests', requestId), {
      title: safeTitle,
      type: params.type === 'manga' ? 'manga' : 'webtoon',
      author: safeAuthor,
      reason: safeReason,
      requestedBy: safeRequester,
      authorId: safeUid,
      votes: 1,
      status: 'Pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return requestId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function upvoteFirestoreRequest(requestId: string, currentVotes: number) {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;

  const safeId = sanitizeFirestoreId(requestId);
  const path = `requests/${safeId}`;
  const ref = doc(db, 'requests', safeId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    if (snap.data().status === 'Acquired') return;
    const existingVotes = Number(snap.data().votes ?? currentVotes);
    await updateDoc(ref, {
      votes: existingVotes + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Admin Library Series & Chapter Firestore Sync (/series/{seriesId} & /chapters/{chapterId})
 */
export interface PersistedSeriesRecord extends Series {
  isDeleted?: boolean;
}

export interface PersistedChapterRecord extends Chapter {
  isDeleted?: boolean;
}

export async function saveSeriesToFirestore(series: Series, isDeleted = false): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;

  const safeId = sanitizeFirestoreId(series.id);
  const safeSlug = sanitizeFirestoreId(series.slug || series.id).slice(0, 160);
  const path = `series/${safeId}`;
  const ref = doc(db, 'series', safeId);

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

  const payloadFields = {
    slug: safeSlug,
    title: safeTitle,
    origin: safeOrigin,
    type: safeType,
    author: safeAuthor,
    artist: safeArtist,
    status: safeStatus,
    releaseDay: safeReleaseDay,
    synopsis: safeSynopsis,
    coverImage: safeCover,
    genres: safeGenres.length > 0 ? safeGenres : ['Action'],
    rating: safeRating,
    totalViews: safeViews,
    chaptersCount: safeChaptersCount,
    featured: Boolean(series.featured),
    isDeleted: Boolean(isDeleted),
    malayalamTitle: safeMlTitle,
    malayalamSynopsis: safeMlSynopsis,
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      try {
        await setDoc(ref, {
          id: safeId,
          ...payloadFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (createErr) {
        handleFirestoreError(createErr, OperationType.CREATE, path);
      }
    } else {
      try {
        await updateDoc(ref, {
          ...payloadFields,
          updatedAt: serverTimestamp(),
        });
      } catch (updateErr) {
        handleFirestoreError(updateErr, OperationType.UPDATE, path);
      }
    }
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('{"error":')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveChapterToFirestore(chapter: Chapter, isDeleted = false): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;

  const safeId = sanitizeFirestoreId(chapter.id);
  const safeSeriesId = sanitizeFirestoreId(chapter.seriesId);
  const path = `chapters/${safeId}`;
  const ref = doc(db, 'chapters', safeId);

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

  const payloadFields = {
    chapterNumber: safeChapterNum,
    title: safeTitle,
    releaseDate: safeReleaseDate,
    views: safeViews,
    pageUrls: safePageUrls,
    isDeleted: Boolean(isDeleted),
  };

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      try {
        await setDoc(ref, {
          id: safeId,
          seriesId: safeSeriesId,
          ...payloadFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (createErr) {
        handleFirestoreError(createErr, OperationType.CREATE, path);
      }
    } else {
      try {
        await updateDoc(ref, {
          ...payloadFields,
          updatedAt: serverTimestamp(),
        });
      } catch (updateErr) {
        handleFirestoreError(updateErr, OperationType.UPDATE, path);
      }
    }
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('{"error":')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeLibrarySeriesFromFirestore(
  onData: (records: PersistedSeriesRecord[]) => void
) {
  const path = 'series';
  const q = query(collection(db, 'series'), where('totalViews', '>=', 0));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: PersistedSeriesRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          slug: data.slug || d.id,
          title: data.title || 'Untitled',
          origin: data.origin || (data.type === 'manga' ? 'manga' : 'manhwa'),
          type: data.type === 'manga' ? 'manga' : 'webtoon',
          author: data.author || 'Unknown',
          artist: data.artist || data.author || 'Unknown',
          status: data.status === 'Completed' ? 'Completed' : 'Ongoing',
          releaseDay: data.releaseDay || 'Friday',
          synopsis: data.synopsis || '',
          coverImage: data.coverImage || '/placeholder.jpg',
          genres: Array.isArray(data.genres) ? data.genres : ['Action'],
          rating: Number(data.rating ?? 4.9),
          totalViews: Number(data.totalViews ?? 100),
          chaptersCount: Number(data.chaptersCount ?? 0),
          featured: Boolean(data.featured),
          isDeleted: Boolean(data.isDeleted),
          malayalamTitle: data.malayalamTitle || undefined,
          malayalamSynopsis: data.malayalamSynopsis || undefined,
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeLibraryChaptersFromFirestore(
  onData: (records: PersistedChapterRecord[]) => void
) {
  const path = 'chapters';
  const q = query(collection(db, 'chapters'), where('views', '>=', 0));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: PersistedChapterRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        const pageUrls: string[] = Array.isArray(data.pageUrls) ? data.pageUrls : [];
        return {
          id: data.id || d.id,
          seriesId: data.seriesId,
          chapterNumber: Number(data.chapterNumber ?? 1),
          title: data.title || 'Episode',
          releaseDate: data.releaseDate || 'Recent',
          views: Number(data.views ?? 1),
          pages: pageUrls.map((url, idx) => ({
            pageNumber: idx + 1,
            imageUrl: url,
            caption: `Panel ${idx + 1}`,
          })),
          pagesCount: pageUrls.length,
          isDeleted: Boolean(data.isDeleted),
        };
      });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function mergeSeriesWithFirestore(
  baseList: Series[],
  firestoreRecords: PersistedSeriesRecord[]
): Series[] {
  if (!firestoreRecords || firestoreRecords.length === 0) return baseList;

  const map = new Map<string, Series>();
  baseList.forEach((s) => map.set(s.id, { ...s }));

  for (const rec of firestoreRecords) {
    if (rec.isDeleted) {
      map.delete(rec.id);
    } else {
      const existing = map.get(rec.id);
      if (existing) {
        map.set(rec.id, {
          ...existing,
          ...rec,
          chaptersCount: Math.max(existing.chaptersCount || 0, rec.chaptersCount || 0),
          mangadexId: existing.mangadexId,
          malId: existing.malId,
          koreanTitle: existing.koreanTitle,
          japaneseTitle: existing.japaneseTitle,
          chineseTitle: existing.chineseTitle,
        });
      } else {
        map.set(rec.id, rec);
      }
    }
  }

  return Array.from(map.values());
}

export function mergeChaptersWithFirestore(
  baseChapters: Chapter[],
  firestoreRecords: PersistedChapterRecord[],
  seriesId?: string
): Chapter[] {
  if (!firestoreRecords || firestoreRecords.length === 0) return baseChapters;

  const filteredRecords = seriesId
    ? firestoreRecords.filter((r) => r.seriesId === seriesId)
    : firestoreRecords;
  if (filteredRecords.length === 0) return baseChapters;

  const map = new Map<string, Chapter>();
  baseChapters.forEach((c) => map.set(c.id, { ...c }));

  for (const rec of filteredRecords) {
    if (rec.isDeleted) {
      map.delete(rec.id);
    } else {
      const existing = map.get(rec.id);
      if (existing) {
        map.set(rec.id, {
          ...existing,
          chapterNumber: rec.chapterNumber,
          title: rec.title,
          releaseDate: rec.releaseDate,
          views: Math.max(existing.views || 0, rec.views || 0),
          pages: rec.pages && rec.pages.length > 0 ? rec.pages : existing.pages,
          pagesCount: rec.pages && rec.pages.length > 0 ? rec.pages.length : existing.pagesCount,
        });
      } else {
        map.set(rec.id, rec);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.chapterNumber - b.chapterNumber);
}

/**
 * Chapter Edits Firestore Sync (/chapter_edits/{seriesId}_{chapterId}_{languageCode})
 */
export async function getChapterEditsFromFirestore(
  seriesId: string,
  chapterId: string,
  languageCode = 'en'
): Promise<ChapterEditsData | null> {
  const safeSeriesId = sanitizeFirestoreId(seriesId);
  const safeChapterId = sanitizeFirestoreId(chapterId);
  const safeLang = ['en', 'ml', 'hi', 'ta'].includes(languageCode) ? languageCode : 'en';
  const editId = sanitizeFirestoreId(`${safeSeriesId}_${safeChapterId}_${safeLang}`);
  const path = `chapter_edits/${editId}`;
  const ref = doc(db, 'chapter_edits', editId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const raw = snap.data();
    const pages: PageEditData[] = Array.isArray(raw.pages) ? (raw.pages as PageEditData[]) : [];
    return {
      version: Number(raw.version || 1),
      pages,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveChapterEditsToFirestore(
  seriesId: string,
  chapterId: string,
  languageCode: string,
  data: ChapterEditsData
): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;

  const safeSeriesId = sanitizeFirestoreId(seriesId);
  const safeChapterId = sanitizeFirestoreId(chapterId);
  const safeLang = ['en', 'ml', 'hi', 'ta'].includes(languageCode) ? languageCode : 'en';
  const editId = sanitizeFirestoreId(`${safeSeriesId}_${safeChapterId}_${safeLang}`);
  const path = `chapter_edits/${editId}`;
  const ref = doc(db, 'chapter_edits', editId);

  const safePages: PageEditData[] = (Array.isArray(data.pages) ? data.pages : [])
    .slice(0, 60)
    .map((p, idx) => ({
      pageIndex: typeof p.pageIndex === 'number' ? p.pageIndex : idx,
      speechBubbles: Array.isArray(p.speechBubbles)
        ? p.speechBubbles.map((b, bIdx) => ({
            id: String(b.id || `b_${bIdx}`),
            box: {
              xPercent: Number(b.box?.xPercent ?? 10),
              yPercent: Number(b.box?.yPercent ?? 10),
              wPercent: Number(b.box?.wPercent ?? 25),
              hPercent: Number(b.box?.hPercent ?? 15),
            },
            originalText: String(b.originalText || '').slice(0, 1000),
            translatedText: String(b.translatedText || '').slice(0, 1000),
            backgroundColor: String(b.backgroundColor || '#ffffff').slice(0, 32),
            textColor: String(b.textColor || '#000000').slice(0, 32),
            fontSize: Number(b.fontSize || 14),
          }))
        : [],
      panelCuts: Array.isArray(p.panelCuts)
        ? p.panelCuts.map((c, cIdx) => ({
            id: String(c.id || `p_${cIdx}`),
            order: Number(c.order ?? cIdx + 1),
            box: {
              xPercent: Number(c.box?.xPercent ?? 0),
              yPercent: Number(c.box?.yPercent ?? 0),
              wPercent: Number(c.box?.wPercent ?? 100),
              hPercent: Number(c.box?.hPercent ?? 50),
            },
          }))
        : [],
    }));

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      try {
        await setDoc(ref, {
          id: editId,
          seriesId: safeSeriesId,
          chapterId: safeChapterId,
          languageCode: safeLang,
          version: 1,
          pages: safePages,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (createErr) {
        handleFirestoreError(createErr, OperationType.CREATE, path);
      }
    } else {
      try {
        await updateDoc(ref, {
          version: 1,
          pages: safePages,
          updatedAt: serverTimestamp(),
        });
      } catch (updateErr) {
        handleFirestoreError(updateErr, OperationType.UPDATE, path);
      }
    }
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('{"error":')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.GET, path);
  }
}

