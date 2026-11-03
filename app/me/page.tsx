'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  KeyRound,
  Bookmark,
  Clock,
  RefreshCw,
  Check,
  Copy,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Upload,
  LogIn,
  LogOut,
  Download,
  Trash2,
} from 'lucide-react';
import { TopNavbar } from '@/components/TopNavbar';
import { BottomNav } from '@/components/BottomNav';
import { ResilientImage } from '@/components/ResilientImage';
import { useIdentity } from '@/hooks/useIdentity';
import { subscribeReadingProgressFromFirestore } from '@/lib/firebase-sync';
import {
  getAllOfflineChapters,
  removeOfflineChapter,
  clearAllOfflineChapters,
  OfflineChapterSummary,
} from '@/lib/offline-cache';
import { Series, ReadingProgress } from '@/lib/types';

export default function MeProfilePage() {
  const {
    id: userId,
    username,
    bookmarks,
    isAuthenticated,
    isAuthReady,
    email,
    signInWithGoogle,
    signOutUser,
    toggleBookmark,
    generateNewRecoveryKey,
    recoverAccount,
  } = useIdentity();

  const [bookmarkedSeries, setBookmarkedSeries] = useState<Series[]>([]);
  const [readingHistory, setReadingHistory] = useState<ReadingProgress[]>([]);
  const [offlineChapters, setOfflineChapters] = useState<OfflineChapterSummary[]>([]);
  const [newGeneratedKey, setNewGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [recoveryInput, setRecoveryInput] = useState('');
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  useEffect(() => {
    const syncOffline = () => {
      getAllOfflineChapters()
        .then(setOfflineChapters)
        .catch(() => {});
    };
    syncOffline();
    if (typeof window !== 'undefined') {
      window.addEventListener('panelverse-offline-updated', syncOffline);
      return () =>
        window.removeEventListener('panelverse-offline-updated', syncOffline);
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/series');
        if (res.ok) {
          const all: Series[] = await res.json();
          setBookmarkedSeries(all.filter((s) => bookmarks.includes(s.id)));
        }

        if (userId && !isAuthenticated) {
          const progRes = await fetch(`/api/progress?userId=${userId}`);
          if (progRes.ok) {
            const history = await progRes.json();
            setReadingHistory(history);
          }
        }
      } catch (err) {
        console.error('Failed to load profile data:', err);
      }
    }
    loadData();
  }, [bookmarks, userId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthReady || !isAuthenticated || !userId) return;
    const unsubscribe = subscribeReadingProgressFromFirestore(userId, (items) => {
      setReadingHistory(items);
    });
    return () => unsubscribe();
  }, [isAuthReady, isAuthenticated, userId]);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch (err) {
      console.error('Failed to sign in with Google:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGenerateKey = async () => {
    try {
      setIsGeneratingKey(true);
      const key = await generateNewRecoveryKey();
      setNewGeneratedKey(key);
    } catch (err) {
      console.error('Failed to generate key:', err);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryInput.trim() || isRecovering) return;

    try {
      setIsRecovering(true);
      setRecoveryError(null);
      await recoverAccount(recoveryInput.trim());
      setRecoverySuccess(true);
      setRecoveryInput('');
      setTimeout(() => setRecoverySuccess(false), 3000);
    } catch (err: unknown) {
      const e = err as Error;
      setRecoveryError(e.message || 'Recovery failed. Verify your key.');
    } finally {
      setIsRecovering(false);
    }
  };

  const copyKey = () => {
    if (!newGeneratedKey) return;
    navigator.clipboard.writeText(newGeneratedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <TopNavbar username={username} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 py-8 pb-20 md:pb-12">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 sm:p-8 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-rose-600 to-indigo-600 text-white shadow-lg text-2xl font-black">
                {username ? username.charAt(0).toUpperCase() : 'R'}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold text-white">{username || 'Anonymous Reader'}</h1>
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                    · <ShieldCheck className="h-3.5 w-3.5" />{' '}
                    {isAuthenticated ? 'Google Account Synced' : 'Anonymous Session'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400 font-mono">
                  {isAuthenticated && email
                    ? `Signed in as ${email}`
                    : `Reader ID: ${userId || 'usr_guest'}`}
                </p>
                <div className="mt-2 text-xs text-slate-400 flex items-center gap-3 font-mono tabular-nums">
                  <span>{bookmarkedSeries.length} Bookmarks</span>
                  <span aria-hidden="true">·</span>
                  <span>{readingHistory.length} Titles Read</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-row gap-2 shrink-0">
              {!isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow hover:from-rose-500 hover:to-indigo-500 disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={signOutUser}
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5 text-rose-400" />
                  <span>Sign Out</span>
                </button>
              )}

              <Link
                href="/admin"
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5 text-rose-400" />
                <span>Admin & Upload Studio</span>
              </Link>
              <button
                type="button"
                onClick={handleGenerateKey}
                disabled={isGeneratingKey}
                className="flex items-center justify-center gap-2 rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingKey ? 'animate-spin' : ''}`} />
                <span>New Recovery Key</span>
              </button>
            </div>
          </div>

          {newGeneratedKey && (
            <div className="mt-6 rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-xs text-amber-200">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold flex items-center gap-1.5 text-amber-300">
                  <KeyRound className="h-4 w-4" /> New Recovery Key Generated
                </span>
                <span className="text-[10px] text-amber-400">Save this now — shown once</span>
              </div>
              <p className="text-[11px] text-amber-300/80 mb-3">
                Old keys are invalidated. Only the cryptographic hash of this key is stored.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-black/60 px-3 py-1.5 font-mono text-xs text-amber-300 border border-amber-900/40 select-all">
                  {newGeneratedKey}
                </code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-800/80 bg-amber-900/60 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 transition-colors cursor-pointer"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 mb-8">
          <h2 className="text-xs font-bold tracking-wide text-slate-300 mb-2">
            Restore Reader Account On Another Device
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            If you already have a recovery key from an existing profile, enter it here to restore your bookmarks and reading history.
          </p>

          <form onSubmit={handleRecover} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value)}
              maxLength={128}
              placeholder="e.g. rec_9f82a17b884c..."
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs font-mono text-white placeholder-slate-600 focus:border-rose-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!recoveryInput.trim() || isRecovering}
              className="rounded-xl bg-slate-800 border border-slate-700 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
            >
              {isRecovering ? 'Restoring...' : 'Restore Profile'}
            </button>
          </form>

          {recoverySuccess && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
              <Check className="h-4 w-4" /> Account restored successfully!
            </div>
          )}
          {recoveryError && (
            <div className="mt-3 flex items-center gap-2 text-xs text-rose-400">
              <AlertCircle className="h-4 w-4" /> {recoveryError}
            </div>
          )}
        </section>

        {/* Offline Saved Chapters Section (Auto-Cached 5-Chapter LRU + Pinned Downloads) */}
        <section className="mb-10">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Download className="h-4 w-4 text-emerald-400" />
                <span>Offline Ready Chapters ({offlineChapters.length})</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Your 5 most recently read chapters are automatically cached for offline reading. Pin any chapter in the reader to keep it permanently.
              </p>
            </div>
            {offlineChapters.length > 0 && (
              <button
                type="button"
                onClick={() => void clearAllOfflineChapters()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-rose-500/40 hover:text-rose-300 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear Cache</span>
              </button>
            )}
          </div>

          {offlineChapters.length === 0 ? (
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/20 p-6 text-center text-xs text-slate-500">
              No chapters cached yet. Open any episode or chapter to automatically cache it for offline reading!
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/30">
              {offlineChapters.map((item) => (
                <div
                  key={item.chapterId}
                  className="flex items-center justify-between gap-3 p-4 hover:bg-slate-800/40 transition-colors"
                >
                  <Link
                    href={`/read/${item.chapterId}`}
                    className="group flex items-center gap-3 flex-1 min-w-0"
                  >
                    <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-slate-950">
                      <ResilientImage
                        src={item.coverImage}
                        alt={item.seriesTitle}
                        fallbackTitle={item.seriesTitle}
                        fallbackType={item.seriesType}
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors truncate">
                        {item.seriesTitle} —{' '}
                        {item.seriesType === 'webtoon' ? 'Ep.' : 'Ch.'}{' '}
                        {item.chapterNumber}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="truncate max-w-[200px] sm:max-w-xs">
                          {item.chapterTitle}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {item.pagesCount} pages
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            item.isPinned
                              ? 'text-emerald-400 font-semibold'
                              : 'text-sky-400 font-medium'
                          }
                        >
                          {item.isPinned ? 'Pinned Offline' : 'Auto-Cached (Recent 5)'}
                        </span>
                        {item.cachedLanguages.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono uppercase text-rose-400">
                              +{item.cachedLanguages.join(', ')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/read/${item.chapterId}`}
                      className="rounded-lg bg-emerald-600/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 transition-colors"
                    >
                      Read
                    </Link>
                    <button
                      type="button"
                      onClick={() => void removeOfflineChapter(item.chapterId)}
                      title="Remove from offline cache"
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Bookmark className="h-4 w-4 text-rose-400" />
              <span>Bookmarked Series ({bookmarkedSeries.length})</span>
            </div>
          </div>

          {bookmarkedSeries.length === 0 ? (
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/20 p-6 text-center text-xs text-slate-500">
              You haven&apos;t bookmarked any titles yet. Tap the bookmark icon on any series card to save it here.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {bookmarkedSeries.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 hover:border-slate-700 transition-colors"
                >
                  <Link
                    href={`/series/${s.slug}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded bg-slate-950">
                      <ResilientImage
                        src={s.coverImage}
                        alt={s.title}
                        fallbackTitle={s.title}
                        fallbackType={s.type}
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{s.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 uppercase tracking-wide">
                        {s.origin || s.type} · {s.chaptersCount} Chapters
                      </p>
                    </div>
                  </Link>

                  <button
                    type="button"
                    onClick={() => toggleBookmark(s.id)}
                    className="p-1.5 text-rose-400 hover:text-slate-400 transition-colors cursor-pointer"
                    title="Remove bookmark"
                  >
                    <Bookmark className="h-4 w-4 fill-rose-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Clock className="h-4 w-4 text-rose-400" />
              <span>Reading History & Progress ({readingHistory.length})</span>
            </div>
          </div>

          {readingHistory.length === 0 ? (
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/20 p-6 text-center text-xs text-slate-500">
              No reading history recorded yet. Open any chapter to begin reading!
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/30">
              {readingHistory.map((item) => (
                <Link
                  key={item.seriesId}
                  href={`/read/${item.chapterId}`}
                  className="group flex items-center justify-between p-4 hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-slate-950">
                      <ResilientImage
                        src={item.coverImage}
                        alt={item.seriesTitle}
                        fallbackTitle={item.seriesTitle}
                        fallbackType={item.seriesType}
                        className="object-cover"
                      />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white group-hover:text-rose-400 transition-colors">
                        {item.seriesTitle}
                      </h4>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {item.seriesType === 'webtoon' ? 'Episode' : 'Chapter'}{' '}
                        {item.chapterNumber} ·{' '}
                        {item.isCompleted ? 'Completed' : `${item.scrollPercentage}% Read`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500">{item.updatedAt}</span>
                    <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-rose-400 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
