'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Star,
  Eye,
  Calendar,
  Bookmark,
  BookOpen,
  ArrowLeft,
  ChevronRight,
  Share2,
} from 'lucide-react';
import { TopNavbar } from '@/components/TopNavbar';
import { BottomNav } from '@/components/BottomNav';
import { ResilientImage } from '@/components/ResilientImage';
import { useIdentity } from '@/hooks/useIdentity';
import { useLanguage } from '@/context/LanguageContext';
import {
  subscribeLibrarySeriesFromFirestore,
  subscribeLibraryChaptersFromFirestore,
  mergeSeriesWithFirestore,
  mergeChaptersWithFirestore,
  PersistedSeriesRecord,
  PersistedChapterRecord,
} from '@/lib/supabase-sync';
import { Series, Chapter } from '@/lib/types';

export default function SeriesDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const { username, bookmarks, toggleBookmark, isAuthReady } = useIdentity();
  const { language, t } = useLanguage();
  const [baseSeries, setBaseSeries] = useState<Series | null>(null);
  const [baseChapters, setBaseChapters] = useState<Chapter[]>([]);
  const [firestoreSeries, setFirestoreSeries] = useState<PersistedSeriesRecord[]>([]);
  const [firestoreChapters, setFirestoreChapters] = useState<PersistedChapterRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let isMounted = true;
    async function loadSeries() {
      try {
        const res = await fetch(`/api/series/${encodeURIComponent(slug)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setBaseSeries(data);
            setBaseChapters(Array.isArray(data.chapters) ? data.chapters : []);
          }
        }
      } catch (err) {
        console.error('Failed to load series details:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadSeries();
    return () => {
      isMounted = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!isAuthReady) return;
    const unsubSeries = subscribeLibrarySeriesFromFirestore((records) => {
      setFirestoreSeries(records);
    });
    const unsubChapters = subscribeLibraryChaptersFromFirestore((records) => {
      setFirestoreChapters(records);
    });
    return () => {
      unsubSeries();
      unsubChapters();
    };
  }, [isAuthReady]);

  const series = useMemo(() => {
    if (!baseSeries) {
      const fromFs = firestoreSeries.find((r) => !r.isDeleted && (r.slug === slug || r.id === slug));
      return fromFs || null;
    }
    const merged = mergeSeriesWithFirestore([baseSeries], firestoreSeries);
    return merged.find((s) => s.id === baseSeries.id) || null;
  }, [baseSeries, firestoreSeries, slug]);

  const chapters = useMemo(() => {
    if (!series) return baseChapters;
    return mergeChaptersWithFirestore(baseChapters, firestoreChapters, series.id);
  }, [baseChapters, firestoreChapters, series]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <TopNavbar username={username} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-xs text-slate-400">Loading series details...</div>
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <TopNavbar username={username} />
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <h2 className="text-lg font-bold text-white">Series Not Found</h2>
          <p className="mt-1 text-xs text-slate-400">
            The requested manga, manhwa, or manhua could not be located.
          </p>
          <Link
            href="/"
            className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
          >
            Back to Library
          </Link>
        </div>
      </div>
    );
  }

  const isBookmarked = bookmarks.includes(series.id);
  const originLabel =
    series.origin === 'manhua'
      ? 'Chinese Manhua (Vertical Scroll)'
      : series.origin === 'manhwa'
      ? 'Korean Manhwa (Vertical Webtoon)'
      : series.type === 'manga'
      ? 'Japanese Manga (Paged RTL)'
      : 'Vertical Webtoon';

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <TopNavbar username={username} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-8 pb-20 md:pb-12">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Discover
          </Link>
        </div>

        {/* Hero Header Section */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start rounded-2xl border border-slate-800 bg-slate-900/40 p-6 sm:p-8">
          {/* Cover Art */}
          <div className="relative aspect-[3/4] w-full max-w-[260px] mx-auto md:col-span-4 rounded-xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-950">
            <ResilientImage
              src={series.coverImage}
              alt={series.title}
              fallbackTitle={series.title}
              fallbackType={series.type}
              priority
              className="object-cover"
            />
          </div>

          {/* Details & Actions */}
          <div className="flex flex-col md:col-span-8 justify-between">
            <div>
              {/* Tradition & Native Script Titles */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide text-rose-400">
                <span>{originLabel}</span>
                {series.koreanTitle && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className="text-slate-300 font-normal">{series.koreanTitle}</span>
                  </>
                )}
                {series.japaneseTitle && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className="text-slate-300 font-normal">{series.japaneseTitle}</span>
                  </>
                )}
                {series.chineseTitle && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className="text-slate-300 font-normal">{series.chineseTitle}</span>
                  </>
                )}
              </div>

              <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-white tracking-tight text-balance">
                {series.title}
              </h1>

              {/* Unboxed Metadata */}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <span className="font-medium text-white">
                  {t.author}: {series.author}
                </span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span>
                  {t.artist}: {series.artist}
                </span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="capitalize">
                  {series.status === 'Completed' ? t.completed : t.ongoing}
                </span>
              </div>

              {/* Stats Bar */}
              <div className="mt-4 flex flex-wrap items-center gap-5 text-xs text-slate-400 py-3 border-y border-slate-800/80">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                  <Star className="h-4 w-4 fill-amber-400" />
                  <span className="font-mono tabular-nums">{series.rating.toFixed(2)}</span>
                  <span className="text-slate-500 font-normal">/ 5.0</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye className="h-4 w-4 text-slate-500" />
                  <span className="font-mono tabular-nums">
                    {(series.totalViews / 1000).toFixed(0)}k Reads
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <span>Updates {series.releaseDay}s</span>
                </div>
              </div>

              {/* Genres without pills */}
              <div className="mt-4 text-xs text-slate-400">
                <span className="text-slate-500 font-semibold mr-2">Genres:</span>
                {series.genres.join('  /  ')}
              </div>

              {/* Synopsis */}
              <div className="mt-4">
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {language === 'ml' && series.malayalamSynopsis
                    ? series.malayalamSynopsis
                    : series.synopsis}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-wrap items-center gap-3 pt-4 border-t border-slate-800">
              <Link
                href={`/read/${chapters[0]?.id || series.latestChapterId || 'ch-solo-leveling-1'}`}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-rose-950/50 hover:from-rose-500 hover:to-rose-400 transition-all cursor-pointer whitespace-nowrap shrink-0"
              >
                <BookOpen className="h-4 w-4" />
                <span>
                  Read First {series.type === 'webtoon' ? 'Episode' : 'Chapter'}
                </span>
              </Link>

              <button
                type="button"
                onClick={() => toggleBookmark(series.id)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isBookmarked
                    ? 'border-rose-500 bg-rose-600/20 text-rose-300'
                    : 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Bookmark
                  className={`h-4 w-4 ${isBookmarked ? 'fill-rose-400 text-rose-400' : ''}`}
                />
                <span>{isBookmarked ? 'Bookmarked' : 'Add to Library'}</span>
              </button>

              <button
                type="button"
                onClick={handleShare}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Share2 className="h-4 w-4" />
                <span>{copiedLink ? 'Link Copied!' : 'Share'}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Chapter / Episode Catalog */}
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold tracking-wide text-white">
              Episodes & Chapters ({chapters.length})
            </h2>
            <span className="text-xs text-slate-400">
              Format: {series.type === 'webtoon' ? 'Continuous Webtoon Scroll' : 'Paged RTL Manga'}
            </span>
          </div>

          <div className="flex flex-col divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-900/40">
            {chapters.map((ch) => (
              <Link
                key={ch.id}
                href={`/read/${ch.id}`}
                className="group flex items-center justify-between p-4 transition-colors hover:bg-slate-800/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/80 text-xs font-mono font-bold text-rose-400 group-hover:bg-rose-600 group-hover:text-white transition-colors tabular-nums">
                    {ch.chapterNumber}
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-100 group-hover:text-rose-400 transition-colors">
                      {ch.title}
                    </h3>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{ch.releaseDate}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {ch.pagesCount || ch.pages?.length || 18} pages
                      </span>
                      {ch.language && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono uppercase text-rose-400/90">
                            {ch.language}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {ch.views.toLocaleString('en-US')} reads
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors whitespace-nowrap shrink-0">
                    Stream & Read
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-rose-400 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
