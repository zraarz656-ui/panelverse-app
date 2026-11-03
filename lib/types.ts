export type SeriesType = 'webtoon' | 'manga';

export type SeriesOrigin = 'manhwa' | 'manga' | 'manhua';

export type SeriesStatus = 'Ongoing' | 'Completed';

export interface PageImage {
  pageNumber: number;
  imageUrl: string;
  caption?: string;
  aspectRatio?: string;
}

export interface Chapter {
  id: string;
  seriesId: string;
  chapterNumber: number;
  title: string;
  releaseDate: string;
  views: number;
  pages: PageImage[];
  mangadexChapterId?: string;
  language?: string;
  pagesCount?: number;
  isLiveStreamed?: boolean;
  hasCustomPages?: boolean;
  isCustomEdited?: boolean;
}

export interface Series {
  id: string;
  slug: string;
  title: string;
  origin?: SeriesOrigin;
  japaneseTitle?: string;
  koreanTitle?: string;
  chineseTitle?: string;
  malayalamTitle?: string;
  malayalamSynopsis?: string;
  author: string;
  artist: string;
  type: SeriesType;
  genres: string[];
  status: SeriesStatus;
  synopsis: string;
  coverImage: string;
  rating: number;
  totalViews: number;
  releaseDay: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  chaptersCount: number;
  latestChapterId?: string;
  featured?: boolean;
  mangadexId?: string;
  malId?: number;
}

export interface Comment {
  id: string;
  chapterId: string;
  seriesId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
  upvotes: number;
  userUpvoted?: boolean;
  replyCount?: number;
  spoiler?: boolean;
}

export interface SeriesRequest {
  id: string;
  title: string;
  type: SeriesType;
  author?: string;
  requestedBy: string;
  votes: number;
  userVoted?: boolean;
  sourceUrl?: string;
  reason: string;
  status: 'Pending' | 'Acquired' | 'In Review';
  createdAt: string;
}

export interface ReadingProgress {
  seriesId: string;
  chapterId: string;
  chapterNumber: number;
  seriesTitle: string;
  seriesSlug: string;
  seriesType: SeriesType;
  coverImage: string;
  pageIndex: number;
  totalPages: number;
  scrollPercentage: number;
  updatedAt: string;
  isCompleted: boolean;
}

export interface UserSession {
  id: string;
  username: string;
  recoveryKey?: string;
  createdAt: string;
  bookmarks: string[]; // series IDs
}

export interface ModerationReport {
  id: string;
  targetType: 'comment' | 'request' | 'series';
  targetId: string;
  reason: string;
  reportedBy: string;
  reportedAt: string;
  status: 'Pending' | 'Resolved' | 'Dismissed';
}

export interface NormalizedBox {
  xPercent: number;
  yPercent: number;
  wPercent: number;
  hPercent: number;
}

export interface SpeechBubbleOverlay {
  id: string;
  box: NormalizedBox;
  originalText: string;
  translatedText: string;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
}

export interface PanelCutBox {
  id: string;
  order: number;
  box: NormalizedBox;
}

export interface PageEditData {
  pageIndex: number;
  speechBubbles: SpeechBubbleOverlay[];
  panelCuts: PanelCutBox[];
  bakedImageUrl?: string;
}

export interface ChapterEditsData {
  version: number;
  pages: PageEditData[];
}

export interface ChapterEditRecord {
  id: string; // format: "{seriesId}_{chapterId}_{languageCode}"
  seriesId: string;
  chapterId: string;
  languageCode: string;
  data: ChapterEditsData;
  updatedAt: string;
}

