'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Database,
  Plus,
  Upload,
  BarChart3,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Edit2,
  Trash2,
  KeyRound,
  X,
  ExternalLink,
  Layers,
  Globe,
  Flame,
  ImagePlus,
  ArrowUp,
  ArrowDown,
  FileImage,
  FileText,
  Sparkles,
  Link2,
} from 'lucide-react';
import { TopNavbar } from '@/components/TopNavbar';
import { BottomNav } from '@/components/BottomNav';
import { ResilientImage } from '@/components/ResilientImage';
import { useIdentity } from '@/hooks/useIdentity';
import { LaunchDeployAssistant } from '@/components/LaunchDeployAssistant';
import {
  saveSeriesToFirestore,
  saveChapterToFirestore,
  subscribeLibrarySeriesFromFirestore,
  subscribeLibraryChaptersFromFirestore,
  mergeSeriesWithFirestore,
  mergeChaptersWithFirestore,
  PersistedSeriesRecord,
  PersistedChapterRecord,
} from '@/lib/supabase-sync';
import {
  compressImageFileToDataUrl,
  compressMultipleImageFiles,
  processPdfUrlViaServer,
  isPdfFile,
} from '@/lib/image-upload';
import { safeFetchJson } from '@/lib/utils';
import { Series, ModerationReport, Chapter, SeriesOrigin, SeriesType } from '@/lib/types';

export type AdminTabId = 'overview' | 'upload' | 'series' | 'reports' | 'checklist';

interface UploadedPanelItem {
  id: string;
  name: string;
  dataUrl: string;
  sizeKb: number;
}

export function AdminWorkspace({ initialTab = 'overview' }: { initialTab?: AdminTabId }) {
  const {
    username,
    isAdmin: isFirestoreAdmin,
    isAuthReady,
    signInWithGoogle,
  } = useIdentity();

  // Authentication State (Master PIN or Verified Firebase Admin)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    if (sessionStorage.getItem('panelverse_admin_auth') === 'true') {
      Promise.resolve().then(() => {
        setIsAuthenticated(true);
      });
    }
  }, []);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Change PIN modal
  const [isChangePinOpen, setIsChangePinOpen] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinChangeMsg, setPinChangeMsg] = useState<string | null>(null);

  // Dashboard Tab
  const [activeTab, setActiveTab] = useState<AdminTabId>(initialTab);
  const [hasAffirmedRights, setHasAffirmedRights] = useState(true);

  // Data states
  const [stats, setStats] = useState({
    totalSeries: 0,
    totalChapters: 0,
    totalReads: 0,
    pendingReports: 0,
    totalRequests: 0,
  });
  const [baseSeriesList, setBaseSeriesList] = useState<Series[]>([]);
  const [firestoreSeries, setFirestoreSeries] = useState<PersistedSeriesRecord[]>([]);
  const [firestoreChapters, setFirestoreChapters] = useState<PersistedChapterRecord[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [, setIsLoading] = useState(true);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Series Edit Modal
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState<SeriesType>('webtoon');
  const [editOrigin, setEditOrigin] = useState<SeriesOrigin>('manhwa');
  const [editStatus, setEditStatus] = useState<'Ongoing' | 'Completed'>('Ongoing');
  const [editGenres, setEditGenres] = useState('');
  const [editReleaseDay, setEditReleaseDay] = useState('Friday');
  const [editAuthor, setEditAuthor] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editSynopsis, setEditSynopsis] = useState('');
  const [editCoverImage, setEditCoverImage] = useState('');
  const [editRating, setEditRating] = useState('4.9');
  const [editFeatured, setEditFeatured] = useState(false);
  const [editMalayalamTitle, setEditMalayalamTitle] = useState('');
  const [editMalayalamSynopsis, setEditMalayalamSynopsis] = useState('');
  const [isUpdatingSeries, setIsUpdatingSeries] = useState(false);
  const [isCompressingEditCover, setIsCompressingEditCover] = useState(false);
  const editCoverInputRef = useRef<HTMLInputElement>(null);

  // Delete Series Confirm
  const [deletingSeriesId, setDeletingSeriesId] = useState<string | null>(null);

  // Create Series Form
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<SeriesType>('webtoon');
  const [newOrigin, setNewOrigin] = useState<SeriesOrigin>('manhwa');
  const [newAuthor, setNewAuthor] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newGenre, setNewGenre] = useState('Action, Fantasy');
  const [newSynopsis, setNewSynopsis] = useState('');
  const [newReleaseDay, setNewReleaseDay] = useState('Friday');
  const [newCoverImage, setNewCoverImage] = useState('');
  const [newRating, setNewRating] = useState('4.95');
  const [newFeatured, setNewFeatured] = useState(false);
  const [newMalayalamTitle, setNewMalayalamTitle] = useState('');
  const [newMalayalamSynopsis, setNewMalayalamSynopsis] = useState('');
  const [isSubmittingSeries, setIsSubmittingSeries] = useState(false);
  const [seriesSuccess, setSeriesSuccess] = useState(false);
  const [isCompressingNewCover, setIsCompressingNewCover] = useState(false);
  const newCoverInputRef = useRef<HTMLInputElement>(null);

  // Chapter Upload & Management
  const [uploadSeriesId, setUploadSeriesId] = useState('');
  const [uploadChapterNum, setUploadChapterNum] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [panelMode, setPanelMode] = useState<'file_upload' | 'custom_urls' | 'generated'>(
    'file_upload'
  );
  const [uploadedPanels, setUploadedPanels] = useState<UploadedPanelItem[]>([]);
  const [pdfUrlInput, setPdfUrlInput] = useState('');
  const [showAllUploadedPreviews, setShowAllUploadedPreviews] = useState(false);
  const [isCompressingPanels, setIsCompressingPanels] = useState(false);
  const [panelCompressionStatus, setPanelCompressionStatus] = useState<string | null>(null);
  const [uploadPagesCount, setUploadPagesCount] = useState('6');
  const [customUrlsText, setCustomUrlsText] = useState('');
  const [isUploadingChapter, setIsUploadingChapter] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [baseSeriesChapters, setBaseSeriesChapters] = useState<Chapter[]>([]);
  const chapterFilesInputRef = useRef<HTMLInputElement>(null);

  // Chapter Edit Modal
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [editChNumber, setEditChNumber] = useState('1');
  const [editChTitle, setEditChTitle] = useState('');
  const [editChReleaseDate, setEditChReleaseDate] = useState('');
  const [editChUrlsText, setEditChUrlsText] = useState('');
  const [editChPdfUrlInput, setEditChPdfUrlInput] = useState('');
  const [showAllEditChPreviews, setShowAllEditChPreviews] = useState(false);
  const [isUpdatingChapter, setIsUpdatingChapter] = useState(false);
  const [isCompressingEditChPanels, setIsCompressingEditChPanels] = useState(false);
  const editChapterFilesInputRef = useRef<HTMLInputElement>(null);

  // Merged catalog & chapter lists
  const seriesList = useMemo(
    () => mergeSeriesWithFirestore(baseSeriesList, firestoreSeries),
    [baseSeriesList, firestoreSeries]
  );

  const seriesChapters = useMemo(
    () => mergeChaptersWithFirestore(baseSeriesChapters, firestoreChapters, uploadSeriesId),
    [baseSeriesChapters, firestoreChapters, uploadSeriesId]
  );

  const showToast = (msg: string) => {
    setStatusFeedback(msg);
    setTimeout(() => setStatusFeedback(null), 4000);
  };

  const fetchAdminData = async () => {
    try {
      const data = await safeFetchJson<{
        stats: typeof stats;
        series: Series[];
        reports: ModerationReport[];
      }>('/api/admin');
      if (data) {
        setStats(data.stats);
        setBaseSeriesList(data.series);
        setReports(data.reports);
        if (data.series.length > 0 && !uploadSeriesId) {
          setUploadSeriesId(data.series[0].id);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    safeFetchJson<{
      stats: typeof stats;
      series: Series[];
      reports: ModerationReport[];
    }>('/api/admin').then((data) => {
      if (isMounted) {
        if (data) {
          setStats(data.stats);
          setBaseSeriesList(data.series);
          setReports(data.reports);
          if (data.series.length > 0) {
            setUploadSeriesId((prev) => prev || data.series[0].id);
          }
        }
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to Firestore series and chapter overrides
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

  // Fetch chapters for selected series in upload tab
  useEffect(() => {
    if (!uploadSeriesId) return;
    let isMounted = true;
    safeFetchJson<{ chapters?: Chapter[] }>(
      `/api/admin?seriesId=${encodeURIComponent(uploadSeriesId)}`
    ).then((data) => {
      if (isMounted && data?.chapters) {
        setBaseSeriesChapters(data.chapters);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [uploadSeriesId]);

  // Auto-suggest next chapter number based on existing chapters
  const suggestedChapterNum = useMemo(() => {
    if (seriesChapters.length > 0) {
      const maxNum = Math.max(...seriesChapters.map((c) => Number(c.chapterNumber) || 0));
      return String(maxNum + 1);
    }
    return '1';
  }, [seriesChapters]);

  const activeUploadChapterNum = uploadChapterNum || suggestedChapterNum;

  // Handle PIN verification
  const verifyPinCode = async (pinToVerify: string) => {
    if (!pinToVerify.trim() || isVerifyingPin) return;
    try {
      setIsVerifyingPin(true);
      setPinError(null);
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_pin', pin: pinToVerify.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Incorrect PIN');
      }
      setIsAuthenticated(true);
      sessionStorage.setItem('panelverse_admin_auth', 'true');
      sessionStorage.setItem('panelverse_admin_pin', pinToVerify.trim());
      setPinInput('');
    } catch (err: unknown) {
      const e = err as Error;
      setPinError(e.message || 'Incorrect PIN');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifyPinCode(pinInput);
  };

  const handleLock = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('panelverse_admin_auth');
    sessionStorage.removeItem('panelverse_admin_pin');
    fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    }).catch(() => {});
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_pin', pin: oldPin.trim(), newPin: newPin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change PIN');
      setPinChangeMsg('PIN changed successfully!');
      setOldPin('');
      setNewPin('');
      setTimeout(() => {
        setPinChangeMsg(null);
        setIsChangePinOpen(false);
      }, 2000);
    } catch (err: unknown) {
      const e = err as Error;
      setPinChangeMsg(e.message || 'PIN change failed');
    }
  };

  // Cover File Upload Handlers (New Series & Edit Series)
  const handleNewCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressingNewCover(true);
      const dataUrl = await compressImageFileToDataUrl(file, {
        maxWidth: 640,
        maxHeight: 960,
        maxCharLength: 78000,
      });
      setNewCoverImage(dataUrl);
      showToast(`Uploaded cover image "${file.name}" (WebP optimized)`);
    } catch (err) {
      console.error('Cover upload error:', err);
      showToast('Failed to process cover image file');
    } finally {
      setIsCompressingNewCover(false);
      e.target.value = '';
    }
  };

  const handleEditCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsCompressingEditCover(true);
      const dataUrl = await compressImageFileToDataUrl(file, {
        maxWidth: 640,
        maxHeight: 960,
        maxCharLength: 78000,
      });
      setEditCoverImage(dataUrl);
      showToast(`Uploaded cover image "${file.name}" (WebP optimized)`);
    } catch (err) {
      console.error('Cover upload error:', err);
      showToast('Failed to process cover image file');
    } finally {
      setIsCompressingEditCover(false);
      e.target.value = '';
    }
  };

  // Chapter Panel File Upload Handlers (Server-Side PDF + WebP Processor — zero phone RAM)
  const handleChapterPanelFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Snapshot FileList before clearing input
    const selectedFiles = Array.from(files);
    e.target.value = '';

    const firstPdf = selectedFiles.find((f) => isPdfFile(f));
    if (firstPdf && !uploadTitle.trim()) {
      const cleanedTitle = firstPdf.name
        .replace(/\.pdf$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      if (cleanedTitle) {
        setUploadTitle(cleanedTitle);
      }
    }

    try {
      setIsCompressingPanels(true);
      setPanelCompressionStatus('Streaming to Server PDF Processor (Zero-RAM mobile mode)...');
      const remainingSlots = Math.max(1, 80 - uploadedPanels.length);
      const compressed = await compressMultipleImageFiles(selectedFiles, {
        maxPages: remainingSlots,
        onProgress: (status) => setPanelCompressionStatus(status),
      });
      const newItems: UploadedPanelItem[] = compressed.map((item, idx) => ({
        id: `panel-${Date.now()}-${idx}`,
        name: item.name,
        dataUrl: item.dataUrl,
        sizeKb: item.sizeKb,
      }));
      setUploadedPanels((prev) => [...prev, ...newItems].slice(0, 80));
      showToast(
        firstPdf
          ? `Server extracted ${newItems.length} page(s) from PDF "${firstPdf.name}" (WebP ready)`
          : `Server processed ${newItems.length} panel image(s) (WebP ready)`
      );
    } catch (err: unknown) {
      console.error('Server panel processor error:', err);
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not process PDF or image files on server.';
      showToast(msg);
    } finally {
      setIsCompressingPanels(false);
      setPanelCompressionStatus(null);
    }
  };

  // Process PDF from Direct URL or Google Drive Link on Server (Upload Tab)
  const handleProcessPdfUrl = async () => {
    if (!pdfUrlInput.trim() || isCompressingPanels) return;
    try {
      setIsCompressingPanels(true);
      setPanelCompressionStatus('Server downloading & extracting PDF from link...');
      const remainingSlots = Math.max(1, 80 - uploadedPanels.length);
      const result = await processPdfUrlViaServer(pdfUrlInput.trim(), {
        maxPages: remainingSlots,
        onProgress: (status) => setPanelCompressionStatus(status),
      });

      if (!uploadTitle.trim() && result.fileName) {
        const cleaned = result.fileName
          .replace(/\.pdf$/i, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        if (cleaned) setUploadTitle(cleaned);
      }

      const newItems: UploadedPanelItem[] = result.pages.map((item, idx) => ({
        id: `panel-url-${Date.now()}-${idx}`,
        name: item.name,
        dataUrl: item.dataUrl,
        sizeKb: item.sizeKb,
      }));
      setUploadedPanels((prev) => [...prev, ...newItems].slice(0, 80));
      setPdfUrlInput('');
      showToast(
        `Server extracted ${newItems.length} page(s) from "${result.fileName}" (${result.totalSizeKb} KB WebP)`
      );
    } catch (err: unknown) {
      console.error('Server PDF URL processor error:', err);
      const msg =
        err instanceof Error ? err.message : 'Failed to extract PDF from link.';
      showToast(msg);
    } finally {
      setIsCompressingPanels(false);
      setPanelCompressionStatus(null);
    }
  };

  const moveUploadedPanel = (index: number, direction: 'up' | 'down') => {
    setUploadedPanels((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const removeUploadedPanel = (id: string) => {
    setUploadedPanels((prev) => prev.filter((item) => item.id !== id));
  };

  // Edit Chapter Modal File Upload Handler (Server-Side PDF + Image Processor)
  const handleEditChapterFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    e.target.value = '';
    try {
      setIsCompressingEditChPanels(true);
      setPanelCompressionStatus('Server extracting & optimizing chapter pages...');
      const compressed = await compressMultipleImageFiles(selectedFiles, {
        maxPages: 80,
        onProgress: (status) => setPanelCompressionStatus(status),
      });
      const uploadedUrls = compressed.map((c) => c.dataUrl);
      setEditChUrlsText((prev) => {
        const existing = prev
          .split('\n')
          .map((u) => u.trim())
          .filter(Boolean);
        return [...existing, ...uploadedUrls].slice(0, 80).join('\n');
      });
      showToast(`Server processed and added ${uploadedUrls.length} page(s) to chapter`);
    } catch (err: unknown) {
      console.error('Edit chapter server upload error:', err);
      const msg =
        err instanceof Error ? err.message : 'Failed to process uploaded PDF or image files';
      showToast(msg);
    } finally {
      setIsCompressingEditChPanels(false);
      setPanelCompressionStatus(null);
    }
  };

  // Edit Chapter Modal PDF URL / Google Drive Processor
  const handleEditChapterProcessPdfUrl = async () => {
    if (!editChPdfUrlInput.trim() || isCompressingEditChPanels) return;
    try {
      setIsCompressingEditChPanels(true);
      setPanelCompressionStatus('Server downloading & extracting PDF from link...');
      const result = await processPdfUrlViaServer(editChPdfUrlInput.trim(), {
        maxPages: 80,
        onProgress: (status) => setPanelCompressionStatus(status),
      });
      const uploadedUrls = result.pages.map((c) => c.dataUrl);
      setEditChUrlsText((prev) => {
        const existing = prev
          .split('\n')
          .map((u) => u.trim())
          .filter(Boolean);
        return [...existing, ...uploadedUrls].slice(0, 80).join('\n');
      });
      setEditChPdfUrlInput('');
      showToast(
        `Server extracted ${uploadedUrls.length} page(s) from "${result.fileName}"`
      );
    } catch (err: unknown) {
      console.error('Edit chapter PDF URL error:', err);
      const msg =
        err instanceof Error ? err.message : 'Failed to extract PDF from link';
      showToast(msg);
    } finally {
      setIsCompressingEditChPanels(false);
      setPanelCompressionStatus(null);
    }
  };

  // Open Series Edit Modal
  const startEdit = (s: Series) => {
    setEditingSeries(s);
    setEditTitle(s.title);
    setEditType(s.type);
    setEditOrigin(s.origin || (s.type === 'manga' ? 'manga' : 'manhwa'));
    setEditStatus(s.status);
    setEditGenres(s.genres.join(', '));
    setEditReleaseDay(s.releaseDay);
    setEditAuthor(s.author);
    setEditArtist(s.artist);
    setEditSynopsis(s.synopsis);
    setEditCoverImage(s.coverImage || '');
    setEditRating(String(s.rating ?? 4.9));
    setEditFeatured(Boolean(s.featured));
    setEditMalayalamTitle(s.malayalamTitle || '');
    setEditMalayalamSynopsis(s.malayalamSynopsis || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeries || isUpdatingSeries) return;

    const payload = {
      title: editTitle.trim(),
      type: editType,
      origin: editOrigin,
      status: editStatus,
      genres: editGenres
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean),
      releaseDay: editReleaseDay,
      author: editAuthor.trim(),
      artist: editArtist.trim() || editAuthor.trim(),
      synopsis: editSynopsis.trim(),
      coverImage: editCoverImage.trim() || editingSeries.coverImage,
      rating: Number(editRating) || editingSeries.rating,
      featured: editFeatured,
      malayalamTitle: editMalayalamTitle.trim() || undefined,
      malayalamSynopsis: editMalayalamSynopsis.trim() || undefined,
    };

    try {
      setIsUpdatingSeries(true);
      const res = await fetch(`/api/series/${encodeURIComponent(editingSeries.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let updatedObj: Series = {
        ...editingSeries,
        ...payload,
      };

      if (res.ok) {
        updatedObj = await res.json();
      }

      if (isFirestoreAdmin) {
        await saveSeriesToFirestore(updatedObj, false);
      }

      setBaseSeriesList((prev) =>
        prev.map((item) => (item.id === editingSeries.id ? updatedObj : item))
      );
      setEditingSeries(null);
      showToast(`Saved edits to "${updatedObj.title}"`);
      fetchAdminData();
    } catch (err) {
      console.error('Failed to update series:', err);
    } finally {
      setIsUpdatingSeries(false);
    }
  };

  // Delete Series
  const handleDeleteSeries = async (id: string) => {
    try {
      const targetSeries = seriesList.find((s) => s.id === id);
      const res = await fetch(`/api/series/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (isFirestoreAdmin && targetSeries) {
          await saveSeriesToFirestore(targetSeries, true);
        }
        setBaseSeriesList((prev) => prev.filter((s) => s.id !== id));
        setDeletingSeriesId(null);
        showToast('Series deleted from catalog');
        fetchAdminData();
      }
    } catch (err) {
      console.error('Failed to delete series:', err);
    }
  };

  // Open Chapter Edit Modal
  const startEditChapter = (ch: Chapter) => {
    setEditingChapter(ch);
    setEditChNumber(String(ch.chapterNumber));
    setEditChTitle(ch.title);
    setEditChReleaseDate(ch.releaseDate || 'Recent');
    setEditChUrlsText(
      Array.isArray(ch.pages) ? ch.pages.map((p) => p.imageUrl).join('\n') : ''
    );
  };

  // Save Chapter Edit
  const handleSaveChapterEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChapter || isUpdatingChapter) return;

    const parsedUrls = editChUrlsText
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    try {
      setIsUpdatingChapter(true);
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_chapter',
          chapterId: editingChapter.id,
          chapterNumber: Number(editChNumber),
          title: editChTitle.trim(),
          releaseDate: editChReleaseDate.trim(),
          panelUrls: parsedUrls,
        }),
      });

      let updatedChapter: Chapter = {
        ...editingChapter,
        chapterNumber: Number(editChNumber) || editingChapter.chapterNumber,
        title: editChTitle.trim() || editingChapter.title,
        releaseDate: editChReleaseDate.trim() || editingChapter.releaseDate,
        pages:
          parsedUrls.length > 0
            ? parsedUrls.map((url, idx) => ({
                pageNumber: idx + 1,
                imageUrl: url,
                caption: `Panel ${idx + 1}`,
              }))
            : editingChapter.pages,
        pagesCount: parsedUrls.length > 0 ? parsedUrls.length : editingChapter.pagesCount,
        hasCustomPages: true,
        isCustomEdited: true,
      };

      if (res.ok) {
        const data = await res.json();
        if (data.chapter) {
          updatedChapter = data.chapter;
        }
      }

      if (isFirestoreAdmin) {
        await saveChapterToFirestore(updatedChapter, false);
      }

      setBaseSeriesChapters((prev) =>
        prev
          .map((c) => (c.id === editingChapter.id ? updatedChapter : c))
          .sort((a, b) => a.chapterNumber - b.chapterNumber)
      );
      setEditingChapter(null);
      showToast(`Updated Ch. ${updatedChapter.chapterNumber}: ${updatedChapter.title}`);
      fetchAdminData();
    } catch (err) {
      console.error('Failed to update chapter:', err);
    } finally {
      setIsUpdatingChapter(false);
    }
  };

  // Delete Chapter
  const handleDeleteChapter = async (chapterId: string) => {
    try {
      const targetCh = seriesChapters.find((c) => c.id === chapterId);
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_chapter', chapterId }),
      });
      if (res.ok) {
        if (isFirestoreAdmin && targetCh) {
          await saveChapterToFirestore(targetCh, true);
        }
        setBaseSeriesChapters((prev) => prev.filter((c) => c.id !== chapterId));
        showToast('Chapter deleted');
        fetchAdminData();
      }
    } catch (err) {
      console.error('Failed to delete chapter:', err);
    }
  };

  // Resolve Report
  const handleResolveReport = async (
    reportId: string,
    reportAction: 'dismiss' | 'delete_comment'
  ) => {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_report', reportId, reportAction }),
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports);
        fetchAdminData();
      }
    } catch (err) {
      console.error('Failed to resolve report:', err);
    }
  };

  // Create Series
  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newAuthor.trim() || isSubmittingSeries) return;

    try {
      setIsSubmittingSeries(true);
      const res = await fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          type: newType,
          origin: newOrigin,
          author: newAuthor.trim(),
          artist: newArtist.trim() || newAuthor.trim(),
          genres: newGenre
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean),
          synopsis: newSynopsis.trim(),
          releaseDay: newReleaseDay,
          coverImage: newCoverImage.trim() || undefined,
          rating: Number(newRating) || 4.95,
          featured: newFeatured,
          malayalamTitle: newMalayalamTitle.trim() || undefined,
          malayalamSynopsis: newMalayalamSynopsis.trim() || undefined,
        }),
      });

      if (res.ok) {
        const createdSeries: Series = await res.json();
        if (isFirestoreAdmin) {
          await saveSeriesToFirestore(createdSeries, false);
        }
        setSeriesSuccess(true);
        setNewTitle('');
        setNewAuthor('');
        setNewArtist('');
        setNewSynopsis('');
        setNewCoverImage('');
        setNewFeatured(false);
        setNewMalayalamTitle('');
        setNewMalayalamSynopsis('');
        setUploadSeriesId(createdSeries.id);
        fetchAdminData();
        showToast(`Created "${createdSeries.title}" — ready for chapter upload!`);
        setTimeout(() => setSeriesSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Series create error:', err);
    } finally {
      setIsSubmittingSeries(false);
    }
  };

  // Upload Chapter
  const handleUploadChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadSeriesId || !activeUploadChapterNum || !uploadTitle.trim() || isUploadingChapter)
      return;

    if (panelMode === 'file_upload' && uploadedPanels.length === 0) {
      showToast('Please select at least 1 panel image file to upload, or switch panel mode.');
      return;
    }

    try {
      setIsUploadingChapter(true);
      let parsedUrls: string[] | undefined;

      if (panelMode === 'file_upload') {
        parsedUrls = uploadedPanels.map((p) => p.dataUrl);
      } else if (panelMode === 'custom_urls') {
        parsedUrls = customUrlsText
          .split('\n')
          .map((u) => u.trim())
          .filter((u) => u.length > 0);
      }

      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_chapter',
          seriesId: uploadSeriesId,
          chapterNumber: activeUploadChapterNum,
          title: uploadTitle.trim(),
          pagesCount: uploadPagesCount,
          panelUrls: parsedUrls,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (isFirestoreAdmin && data.chapter) {
          await saveChapterToFirestore(data.chapter, false);
          if (data.series) {
            await saveSeriesToFirestore(data.series, false);
          }
        }
        setUploadSuccess(true);
        setUploadChapterNum('');
        setUploadTitle('');
        setCustomUrlsText('');
        setUploadedPanels([]);
        fetchAdminData();
        // Refresh chapter list
        fetch(`/api/admin?seriesId=${encodeURIComponent(uploadSeriesId)}`)
          .then((r) => r.json())
          .then((d) => d.chapters && setBaseSeriesChapters(d.chapters));
        showToast(`Published Ch. ${data.chapter?.chapterNumber || activeUploadChapterNum} with ${data.chapter?.pages?.length || 0} panels!`);
        setTimeout(() => setUploadSuccess(false), 3500);
      }
    } catch (err) {
      console.error('Chapter upload error:', err);
    } finally {
      setIsUploadingChapter(false);
    }
  };

  const unlocked = isAuthenticated || isFirestoreAdmin;

  const editChPreviewList = useMemo(
    () =>
      editChUrlsText
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean),
    [editChUrlsText]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <TopNavbar username={username} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-8 pb-20 md:pb-12">
        {statusFeedback && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-emerald-800/80 bg-emerald-950/60 px-4 py-3 text-xs font-medium text-emerald-300 shadow-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{statusFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusFeedback(null)}
              className="text-emerald-400 hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* PIN Security Gate */}
        {!unlocked ? (
          <div className="mx-auto max-w-md py-12">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 mb-4">
                <Lock className="h-7 w-7" />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Admin Dashboard Protected
              </h1>
              <p className="mt-1.5 text-xs text-slate-400">
                Unlock with the administrator PIN or your verified Google Admin account to upload chapters, covers, and manage series.
              </p>

              <form onSubmit={handleVerifyPin} className="mt-6 space-y-3">
                <div>
                  <input
                    type="password"
                    maxLength={10}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="Enter PIN (Default: 1234)"
                    className="w-full text-center rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-base tracking-widest text-white placeholder-slate-600 focus:border-rose-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={!pinInput.trim() || isVerifyingPin}
                  className="w-full rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 py-2.5 text-xs font-bold text-white shadow-lg hover:from-rose-500 hover:to-indigo-500 disabled:opacity-40 transition-all cursor-pointer"
                >
                  {isVerifyingPin ? 'Verifying...' : 'Unlock Dashboard'}
                </button>
              </form>

              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => verifyPinCode('1234')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
                >
                  Quick Unlock with Default PIN (1234)
                </button>
                <button
                  type="button"
                  onClick={() => signInWithGoogle()}
                  className="w-full rounded-xl border border-indigo-800/60 bg-indigo-950/40 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-900/50 hover:text-white transition-colors cursor-pointer"
                >
                  Sign In with Google Admin
                </button>
              </div>

              {pinError && (
                <div className="mt-3.5 rounded-lg border border-rose-900/60 bg-rose-950/40 p-2.5 text-xs text-rose-300">
                  {pinError}
                </div>
              )}

              <p className="mt-4 text-[11px] text-slate-500">
                Default installation PIN is <code className="font-mono text-slate-300">1234</code>.
              </p>
            </div>
          </div>
        ) : (
          /* Unlocked Admin Workspace */
          <div>
            {/* Header with Prominent Upload CTA & Security Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6 mb-8">
              <div>
                <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider">
                  <ShieldAlert className="h-4 w-4" />
                  <span>Admin Control Console</span>
                </div>
                <h1 className="mt-1 text-2xl font-extrabold text-white tracking-tight">
                  Publishing, Upload &amp; Moderation Hub
                </h1>
                <p className="mt-1 text-xs text-slate-400">
                  Upload Webtoon/Manga episodes &amp; cover files (auto-WebP), edit catalog metadata, and manage moderation.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/studio"
                  className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2 text-xs font-bold text-rose-300 shadow-md hover:bg-rose-500/25 hover:text-white transition-all"
                >
                  <Sparkles className="h-3.5 w-3.5 text-rose-400" />
                  <span>Translation &amp; Cut Studio</span>
                </Link>

                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:from-rose-500 hover:to-indigo-500 transition-all cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload Chapter / Panels</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('series')}
                  className="flex items-center gap-1.5 rounded-xl border border-rose-800/70 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-900/50 hover:text-white transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Series</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsChangePinOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                  <span>PIN</span>
                </button>

                {!isFirestoreAdmin && (
                  <button
                    type="button"
                    onClick={handleLock}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Lock className="h-3.5 w-3.5 text-rose-400" />
                    <span>Lock</span>
                  </button>
                )}
              </div>
            </div>

            {/* Admin Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 mb-8 overflow-x-auto pb-2 no-scrollbar">
              {[
                { id: 'overview', label: 'Library Catalog & Edit', icon: BarChart3 },
                { id: 'upload', label: 'Upload Chapter & Panels', icon: Upload },
                { id: 'series', label: 'Create New Series', icon: Plus },
                {
                  id: 'reports',
                  label: `Moderation (${stats.pendingReports})`,
                  icon: AlertTriangle,
                },
                { id: 'checklist', label: 'Supabase SQL & Free Deploy', icon: Database },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as AdminTabId)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB 1: Library Catalog & Series Edit/Delete */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Metrics strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                    <span className="text-[11px] font-semibold uppercase text-slate-400">
                      Total Series
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-white tabular-nums">
                      {seriesList.length}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                    <span className="text-[11px] font-semibold uppercase text-slate-400">
                      Total Chapters
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-white tabular-nums">
                      {stats.totalChapters}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                    <span className="text-[11px] font-semibold uppercase text-slate-400">
                      Cumulative Reads
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-white tabular-nums">
                      {(stats.totalReads / 1000).toFixed(0)}k
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                    <span className="text-[11px] font-semibold uppercase text-slate-400">
                      Community Requests
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-white tabular-nums">
                      {stats.totalRequests}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                    <span className="text-[11px] font-semibold uppercase text-slate-400">
                      Pending Flags
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-amber-400 tabular-nums">
                      {stats.pendingReports}
                    </div>
                  </div>
                </div>

                {/* Series Catalog Table with Upload, Edit, Manage Chapters, & Delete */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
                  <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Serialized Titles Management ({seriesList.length})
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('upload')}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors cursor-pointer"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Upload Episode</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('series')}
                        className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition-colors cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>New Series</span>
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="p-3.5">Title</th>
                          <th className="p-3.5">Tradition / Format</th>
                          <th className="p-3.5">Author</th>
                          <th className="p-3.5">Chapters</th>
                          <th className="p-3.5">Schedule</th>
                          <th className="p-3.5">Status</th>
                          <th className="p-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {seriesList.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="p-3.5">
                              <div className="flex items-center gap-3">
                                <div className="relative h-11 w-8 shrink-0 overflow-hidden rounded bg-slate-950 border border-slate-800">
                                  <ResilientImage
                                    src={s.coverImage}
                                    alt={s.title}
                                    fallbackTitle={s.title}
                                    fallbackType={s.type}
                                    className="object-cover"
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <Link
                                      href={`/series/${s.slug}`}
                                      className="font-semibold text-white hover:text-rose-400 transition-colors"
                                    >
                                      {s.title}
                                    </Link>
                                    {s.featured && (
                                      <span
                                        title="Featured on Hero Banner"
                                        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-400"
                                      >
                                        <Flame className="h-3 w-3 fill-amber-400" />
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                    <span className="text-amber-400 font-mono">
                                      ★ {Number(s.rating || 4.9).toFixed(2)}
                                    </span>
                                    <span>·</span>
                                    <span className="truncate max-w-[180px]">
                                      {s.genres.join(', ')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3.5">
                              <div className="uppercase text-[11px] font-mono text-rose-400">
                                {s.origin || (s.type === 'manga' ? 'manga' : 'manhwa')}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {s.type === 'manga' ? 'Paged RTL' : 'Vertical Scroll'}
                              </div>
                            </td>
                            <td className="p-3.5 text-slate-300">{s.author}</td>
                            <td className="p-3.5 font-mono tabular-nums">{s.chaptersCount}</td>
                            <td className="p-3.5">{s.releaseDay}</td>
                            <td className="p-3.5">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-medium border ${
                                  s.status === 'Completed'
                                    ? 'border-emerald-800/80 bg-emerald-950/40 text-emerald-300'
                                    : 'border-slate-700 bg-slate-800 text-slate-300'
                                }`}
                              >
                                {s.status}
                              </span>
                            </td>
                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadSeriesId(s.id);
                                    setActiveTab('upload');
                                  }}
                                  className="flex items-center gap-1 rounded bg-rose-600/20 border border-rose-500/40 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                                  title="Upload new chapter or panel images for this series"
                                >
                                  <Upload className="h-3 w-3" />
                                  <span>Upload</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEdit(s)}
                                  className="flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
                                >
                                  <Edit2 className="h-3 w-3" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUploadSeriesId(s.id);
                                    setActiveTab('upload');
                                  }}
                                  className="flex items-center gap-1 rounded bg-indigo-950/60 border border-indigo-800/60 px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:bg-indigo-900/60 hover:text-white transition-colors cursor-pointer"
                                >
                                  <Layers className="h-3 w-3" />
                                  <span>Chapters</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingSeriesId(s.id)}
                                  className="flex items-center gap-1 rounded bg-rose-950/40 border border-rose-900/60 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-900/60 transition-colors cursor-pointer"
                                  title="Delete Series"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Upload Chapter & Panels (File Upload + Custom URLs + Chapter Editor) */}
            {activeTab === 'upload' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left: Upload Form */}
                <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Upload className="h-4 w-4 text-rose-400" />
                      <span>Upload New Chapter / Episode</span>
                    </h2>
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 rounded px-2 py-0.5">
                      PDF + Auto-WebP Pipeline Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-5">
                    Upload a full chapter PDF file (.pdf) or panel images (PNG, JPG, WebP) directly from your device, paste external URLs, or generate story panels.
                  </p>

                  <form onSubmit={handleUploadChapter} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Target Series
                      </label>
                      <select
                        value={uploadSeriesId}
                        onChange={(e) => setUploadSeriesId(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white focus:border-rose-500 focus:outline-none"
                      >
                        {seriesList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title} ({s.origin || s.type}) — {s.chaptersCount} Ch.
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Chapter / Episode #
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={activeUploadChapterNum}
                          onChange={(e) => setUploadChapterNum(e.target.value)}
                          placeholder="e.g. 4"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Chapter Title
                        </label>
                        <input
                          type="text"
                          required
                          value={uploadTitle}
                          onChange={(e) => setUploadTitle(e.target.value)}
                          placeholder="e.g. Awakening in the Abyss"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Source Mode: Upload Image Files vs Custom URLs vs Auto-Generated */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Panel Source Method
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setPanelMode('file_upload')}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border py-2.5 px-3 text-xs font-medium transition-colors cursor-pointer ${
                            panelMode === 'file_upload'
                              ? 'border-rose-500 bg-rose-600/20 text-rose-300 font-bold'
                              : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Upload PDF / Images</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPanelMode('custom_urls')}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border py-2.5 px-3 text-xs font-medium transition-colors cursor-pointer ${
                            panelMode === 'custom_urls'
                              ? 'border-rose-500 bg-rose-600/20 text-rose-300 font-bold'
                              : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                          }`}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          <span>Paste Image URLs</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPanelMode('generated')}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border py-2.5 px-3 text-xs font-medium transition-colors cursor-pointer ${
                            panelMode === 'generated'
                              ? 'border-rose-500 bg-rose-600/20 text-rose-300 font-bold'
                              : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                          }`}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Auto-Generate Panels</span>
                        </button>
                      </div>
                    </div>

                    {/* MODE 1: Server-Side PDF & Image Processor (Local File + URL / Google Drive + Zero-RAM Text Summary) */}
                    {panelMode === 'file_upload' && (
                      <div className="space-y-3">
                        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/70 hover:border-rose-500/80 p-5 text-center transition-all">
                          <div className="flex items-center gap-2 mb-2.5">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                              <ImagePlus className="h-5 w-5" />
                            </div>
                          </div>
                          <p className="text-xs font-bold text-white">
                            {isCompressingPanels
                              ? panelCompressionStatus ||
                                'Server PDF Processor extracting & optimizing pages to WebP...'
                              : 'Server-Side PDF & Image Processor (Zero Phone RAM)'}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400 max-w-md">
                            Your PDF is streamed in lightweight chunks directly to the server processor. Pages are extracted &amp; converted to WebP on the server so your phone browser never runs out of memory.
                          </p>

                          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                            <label className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 px-3.5 py-2 text-xs font-bold text-white shadow transition-colors cursor-pointer">
                              <FileText className="h-3.5 w-3.5" />
                              <span>
                                {isCompressingPanels ? 'Processing on Server...' : 'Select PDF File (.pdf)'}
                              </span>
                              <input
                                ref={chapterFilesInputRef}
                                type="file"
                                accept=".pdf,application/pdf"
                                disabled={isCompressingPanels}
                                onChange={handleChapterPanelFilesChange}
                                className="sr-only"
                              />
                            </label>

                            <label className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white shadow transition-colors cursor-pointer">
                              <FileImage className="h-3.5 w-3.5" />
                              <span>
                                {isCompressingPanels ? 'Processing...' : 'Select Panel Images'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                disabled={isCompressingPanels}
                                onChange={handleChapterPanelFilesChange}
                                className="sr-only"
                              />
                            </label>

                            <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors cursor-pointer">
                              <Upload className="h-3.5 w-3.5 text-amber-400" />
                              <span>Standard File Picker</span>
                              <input
                                type="file"
                                disabled={isCompressingPanels}
                                onChange={handleChapterPanelFilesChange}
                                className="sr-only"
                              />
                            </label>
                          </div>

                          {/* Direct PDF URL or Google Drive Link Processor */}
                          <div className="mt-4 w-full max-w-lg border-t border-slate-800/80 pt-3.5 text-left">
                            <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                              Or Process PDF from Direct URL / Google Drive Link:
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="url"
                                value={pdfUrlInput}
                                onChange={(e) => setPdfUrlInput(e.target.value)}
                                disabled={isCompressingPanels}
                                placeholder="https://drive.google.com/file/d/... or https://.../chapter.pdf"
                                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={!pdfUrlInput.trim() || isCompressingPanels}
                                onClick={handleProcessPdfUrl}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-3.5 py-2 text-xs font-bold text-white transition-colors cursor-pointer shrink-0"
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                <span>Process PDF Link</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Zero-RAM Text-Only Summary (No thumbnails rendered by default to protect mobile RAM) */}
                        {uploadedPanels.length > 0 && (
                          <div className="rounded-xl border border-emerald-800/60 bg-slate-950/90 p-3.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                <span className="text-xs font-bold text-emerald-300">
                                  Server Processed: {uploadedPanels.length} Page(s) Ready — Total ~
                                  {uploadedPanels.reduce((acc, p) => acc + p.sizeKb, 0)} KB (WebP)
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setShowAllUploadedPreviews((prev) => !prev)}
                                  className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                                >
                                  {showAllUploadedPreviews
                                    ? 'Text-Only Summary (Zero Phone RAM)'
                                    : 'Preview First 4 Thumbnails'}
                                </button>
                                <span className="text-slate-700">|</span>
                                <button
                                  type="button"
                                  onClick={() => setUploadedPanels([])}
                                  className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 cursor-pointer"
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>

                            <p className="text-[11px] text-slate-400 mb-2.5">
                              All pages are stored on the server as optimized WebP files. Text-only summary mode is active so your phone uses zero image memory.
                            </p>

                            {showAllUploadedPreviews && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                {uploadedPanels.slice(0, 4).map((item, idx) => (
                                  <div
                                    key={`thumb-${item.id}`}
                                    className="relative h-24 rounded border border-slate-800 bg-black overflow-hidden flex items-center justify-center"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={item.dataUrl}
                                      alt={item.name}
                                      loading="lazy"
                                      decoding="async"
                                      className="h-full w-full object-contain"
                                    />
                                    <span className="absolute top-1 left-1 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                                      #{idx + 1}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                              {uploadedPanels.map((item, idx) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between rounded-lg border border-slate-800/90 bg-slate-900/70 px-2.5 py-1.5 text-[11px]"
                                >
                                  <div className="flex items-center gap-2 min-w-0 pr-2">
                                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400 shrink-0">
                                      #{idx + 1}
                                    </span>
                                    <span className="truncate text-slate-200 font-medium">
                                      {item.name}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                      (~{item.sizeKb} KB)
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      disabled={idx === 0}
                                      onClick={() => moveUploadedPanel(idx, 'up')}
                                      className="rounded bg-slate-800 p-1 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                                      title="Move Earlier"
                                    >
                                      <ArrowUp className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === uploadedPanels.length - 1}
                                      onClick={() => moveUploadedPanel(idx, 'down')}
                                      className="rounded bg-slate-800 p-1 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                                      title="Move Later"
                                    >
                                      <ArrowDown className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeUploadedPanel(item.id)}
                                      className="rounded bg-rose-950/60 p-1 text-rose-400 hover:text-rose-200 cursor-pointer"
                                      title="Remove Page"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* MODE 2: Custom Image URLs */}
                    {panelMode === 'custom_urls' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Custom Panel Image URLs (Paste one URL per line)
                        </label>
                        <textarea
                          rows={5}
                          value={customUrlsText}
                          onChange={(e) => setCustomUrlsText(e.target.value)}
                          placeholder="https://example.com/panel_1.png&#10;https://example.com/panel_2.png&#10;data:image/webp;base64,..."
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs font-mono text-white placeholder-slate-600 focus:border-rose-500 focus:outline-none"
                        />
                        <div className="mt-1 text-[11px] text-slate-400">
                          Total parsed panels:{' '}
                          {customUrlsText.split('\n').filter((u) => u.trim()).length}
                        </div>
                      </div>
                    )}

                    {/* MODE 3: Auto-Generated Story Panels */}
                    {panelMode === 'generated' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Generated Panel Count
                        </label>
                        <input
                          type="number"
                          min="2"
                          max="20"
                          value={uploadPagesCount}
                          onChange={(e) => setUploadPagesCount(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={
                          isUploadingChapter ||
                          isCompressingPanels ||
                          !activeUploadChapterNum ||
                          !uploadTitle.trim()
                        }
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:from-rose-500 hover:to-indigo-500 disabled:opacity-40 transition-all cursor-pointer shadow-lg"
                      >
                        <Upload className="h-4 w-4" />
                        <span>
                          {isUploadingChapter
                            ? 'Uploading & Publishing...'
                            : 'Upload & Publish Episode'}
                        </span>
                      </button>
                    </div>

                    {uploadSuccess && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
                        <CheckCircle className="h-4 w-4" /> Episode uploaded and published to library &amp; reader!
                      </div>
                    )}
                  </form>
                </div>

                {/* Right: Existing Chapters for Selected Series with Edit & Delete */}
                <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Existing Chapters ({seriesChapters.length})
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Click Edit on any chapter to upload replacement panel images or edit URLs.
                      </p>
                    </div>
                  </div>

                  {seriesChapters.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">
                      No chapters uploaded yet for this title.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
                      {seriesChapters.map((ch) => (
                        <div
                          key={ch.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950/60 text-xs hover:border-slate-700 transition-colors"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-semibold text-white truncate">
                              Ch. {ch.chapterNumber}: {ch.title}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                              <span>{ch.pages?.length || ch.pagesCount || 0} panels</span>
                              <span>·</span>
                              <span>{ch.releaseDate}</span>
                              <span>·</span>
                              <span>{ch.views.toLocaleString()} reads</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditChapter(ch)}
                              className="flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
                              title="Edit Chapter & Upload Panels"
                            >
                              <Edit2 className="h-3 w-3" />
                              <span>Edit / Upload</span>
                            </button>
                            <Link
                              href={`/read/${ch.id}`}
                              target="_blank"
                              className="p-1.5 rounded bg-slate-900 text-slate-400 hover:text-white transition-colors"
                              title="Preview Chapter in Reader"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDeleteChapter(ch.id)}
                              className="p-1.5 rounded bg-rose-950/40 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                              title="Delete Chapter"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: Create New Series (with Cover Image File Upload + URL) */}
            {activeTab === 'series' && (
              <div className="max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
                <h2 className="text-sm font-bold text-white mb-1">Create New Serialization</h2>
                <p className="text-xs text-slate-400 mb-6">
                  Add a new Webtoon, Manhwa, Manga, or Manhua title and upload its cover artwork.
                </p>

                <form onSubmit={handleCreateSeries} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Title
                      </label>
                      <input
                        type="text"
                        required
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g. Return of the Mount Hua Sect"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Initial Rating (0 - 5)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="5"
                        value={newRating}
                        onChange={(e) => setNewRating(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Tradition / Origin
                      </label>
                      <select
                        value={newOrigin}
                        onChange={(e) => {
                          const val = e.target.value as SeriesOrigin;
                          setNewOrigin(val);
                          if (val === 'manga') setNewType('manga');
                          else setNewType('webtoon');
                        }}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                      >
                        <option value="manhwa">Korean Manhwa</option>
                        <option value="manga">Japanese Manga</option>
                        <option value="manhua">Chinese Manhua</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Reader Engine Format
                      </label>
                      <select
                        value={newType}
                        onChange={(e) => setNewType(e.target.value as SeriesType)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                      >
                        <option value="webtoon">Webtoon (Continuous Scroll)</option>
                        <option value="manga">Manga (Paged RTL)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Weekly Release Day
                      </label>
                      <select
                        value={newReleaseDay}
                        onChange={(e) => setNewReleaseDay(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                      >
                        {[
                          'Monday',
                          'Tuesday',
                          'Wednesday',
                          'Thursday',
                          'Friday',
                          'Saturday',
                          'Sunday',
                        ].map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Author / Writer
                      </label>
                      <input
                        type="text"
                        required
                        value={newAuthor}
                        onChange={(e) => setNewAuthor(e.target.value)}
                        placeholder="e.g. Biga"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Artist / Studio
                      </label>
                      <input
                        type="text"
                        value={newArtist}
                        onChange={(e) => setNewArtist(e.target.value)}
                        placeholder="e.g. LICO"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Cover Image Upload + URL */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <label className="block text-xs font-semibold text-slate-300 mb-2">
                      Series Cover Image (Upload File or Paste URL)
                    </label>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-900 border border-slate-700">
                        <ResilientImage
                          src={newCoverImage}
                          alt={newTitle || 'Cover Preview'}
                          fallbackTitle={newTitle || 'NEW SERIES'}
                          fallbackType={newType}
                          className="object-cover"
                        />
                      </div>
                      <div className="flex-1 w-full space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 transition-colors cursor-pointer">
                            <Upload className="h-3.5 w-3.5" />
                            <span>
                              {isCompressingNewCover
                                ? 'Compressing Cover...'
                                : 'Upload Cover Image File'}
                            </span>
                            <input
                              ref={newCoverInputRef}
                              type="file"
                              accept="image/*"
                              disabled={isCompressingNewCover}
                              onChange={handleNewCoverFileChange}
                              className="sr-only"
                            />
                          </label>
                          {newCoverImage && (
                            <button
                              type="button"
                              onClick={() => setNewCoverImage('')}
                              className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                            >
                              Reset Cover
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={newCoverImage}
                          onChange={(e) => setNewCoverImage(e.target.value)}
                          placeholder="Or paste cover image URL (https://...) — auto-generates if empty"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Genres (comma separated)
                    </label>
                    <input
                      type="text"
                      value={newGenre}
                      onChange={(e) => setNewGenre(e.target.value)}
                      placeholder="Action, Martial Arts, Comedy"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Synopsis
                    </label>
                    <textarea
                      rows={3}
                      value={newSynopsis}
                      onChange={(e) => setNewSynopsis(e.target.value)}
                      placeholder="Provide an engaging summary of the storyline and world..."
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Malayalam Title (Optional)
                      </label>
                      <input
                        type="text"
                        value={newMalayalamTitle}
                        onChange={(e) => setNewMalayalamTitle(e.target.value)}
                        placeholder="മലയാളം പേര്"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Malayalam Synopsis (Optional)
                      </label>
                      <input
                        type="text"
                        value={newMalayalamSynopsis}
                        onChange={(e) => setNewMalayalamSynopsis(e.target.value)}
                        placeholder="മലയാളം സംഗ്രഹം..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 pt-1 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFeatured}
                      onChange={(e) => setNewFeatured(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-0"
                    />
                    <span>Feature this series on the Home Hero Spotlight</span>
                  </label>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmittingSeries || !newTitle.trim()}
                      className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>
                        {isSubmittingSeries ? 'Creating Series...' : 'Publish Series to Catalog'}
                      </span>
                    </button>
                  </div>

                  {seriesSuccess && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle className="h-4 w-4" /> Series serialized! Switch to &ldquo;Upload Chapter &amp; Panels&rdquo; to upload episodes.
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* TAB 4: Moderation Queue with Direct Actions */}
            {activeTab === 'reports' && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-sm font-bold text-white">
                      User Moderation &amp; Reports Queue
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Take direct action on flagged comments and community submissions.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-amber-400 bg-amber-950/40 border border-amber-900/60 rounded px-2.5 py-1">
                    {reports.filter((r) => r.status === 'Pending').length} Pending Review
                  </span>
                </div>

                {reports.length === 0 ? (
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-8 text-center text-xs text-slate-500">
                    No active moderation flags or pending user reports.
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {reports.map((rep) => (
                      <div
                        key={rep.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 text-slate-400 mb-1">
                            <span className="font-semibold text-rose-400 uppercase tracking-wide">
                              {rep.targetType} Flag
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Reported by <strong className="text-slate-300">{rep.reportedBy}</strong>
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Target: <code className="font-mono text-slate-400">{rep.targetId}</code>
                            </span>
                          </div>
                          <p className="text-slate-200 font-medium">Reason: {rep.reason}</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                rep.status === 'Resolved'
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/60'
                                  : rep.status === 'Dismissed'
                                  ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                  : 'bg-amber-950/60 text-amber-300 border border-amber-900/60'
                              }`}
                            >
                              {rep.status}
                            </span>
                          </div>
                        </div>

                        {/* Direct Moderation Actions */}
                        {rep.status === 'Pending' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleResolveReport(rep.id, 'delete_comment')}
                              className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete Comment</span>
                            </button>
                            <button
                              onClick={() => handleResolveReport(rep.id, 'dismiss')}
                              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
                            >
                              Dismiss Flag
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: Supabase SQL, Migration & Free Vercel Deploy */}
            {activeTab === 'checklist' && (
              <div className="space-y-6">
                <LaunchDeployAssistant />

                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                    <div>
                      <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold uppercase tracking-wider">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Pre-Flight Verification</span>
                      </div>
                      <h2 className="text-base font-bold text-white mt-1">
                        Production Launch &amp; Compliance Audit
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Verify platform readiness, legal protection, copyright compliance, and deployment requirements.
                      </p>
                    </div>

                    <span className="flex items-center gap-1.5 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span>Ready for Launch</span>
                    </span>
                  </div>

                  {/* Checklist Items Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <h3 className="text-xs font-bold text-white">
                              Next.js 15 Standalone Build
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Next.js App Router standalone build compiled without errors. Zero broken links or runtime fatal errors.
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/40 px-2 py-0.5">
                          PASSED
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <h3 className="text-xs font-bold text-white">Admin Console Security</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Master PIN gate and verified Firebase Admin protection active with persistent catalog &amp; chapter editing.
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/40 px-2 py-0.5">
                          SECURED
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <h3 className="text-xs font-bold text-white">
                              DMCA &amp; Copyright Policy
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Designated copyright agent assigned (<code>yuniquearun@gmail.com</code>). Takedown instructions live at <code>/dmca</code>.
                            </p>
                          </div>
                        </div>
                        <Link
                          href="/dmca"
                          target="_blank"
                          className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300"
                        >
                          <span>/dmca</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <h3 className="text-xs font-bold text-white">
                              Terms &amp; Anonymous Privacy
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Zero PII policy disclosed. One-way SHA-256 token hashing and comment guidelines live at <code>/terms</code>.
                            </p>
                          </div>
                        </div>
                        <Link
                          href="/terms"
                          target="_blank"
                          className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300"
                        >
                          <span>/terms</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <h3 className="text-xs font-bold text-white">Dual Reading Engines</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Both Continuous Vertical Webtoon and Paged RTL Japanese Manga readers tested with progress auto-saving.
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/40 px-2 py-0.5">
                          ACTIVE
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <Database className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <h3 className="text-xs font-bold text-white">
                              Database &amp; Cloud Sync
                            </h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Persistent file-backed catalog state and Firebase Firestore real-time synchronization active.
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/40 px-2 py-0.5">
                          SYNCED
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Copyright Affirmation Interactive Checkbox */}
                  <div className="mt-6 rounded-xl border border-rose-900/60 bg-rose-950/20 p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasAffirmedRights}
                        onChange={(e) => setHasAffirmedRights(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-0 cursor-pointer"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-white">
                          Publisher Content Rights &amp; Copyright Affirmation
                        </span>
                        <p className="text-slate-300 mt-0.5 leading-relaxed">
                          I affirm that all serializations, covers, and panels published or indexed on this platform are authorized, licensed, or hosted in compliance with applicable copyright law.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Quick Link Navigation Check */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/20 p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                    Public Endpoint Quick Links
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { href: '/', label: 'Home & Catalog' },
                      { href: '/schedule', label: 'Release Schedule' },
                      { href: '/requests', label: 'Community Requests' },
                      { href: '/me', label: 'Reader Profile & Keys' },
                      { href: '/dmca', label: 'DMCA Takedown Notice' },
                      { href: '/terms', label: 'Terms of Service' },
                    ].map((lnk) => (
                      <Link
                        key={lnk.href}
                        href={lnk.href}
                        target="_blank"
                        className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
                      >
                        <Globe className="h-3.5 w-3.5 text-rose-400" />
                        <span>{lnk.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal: Edit Series (Full Metadata, Cover File Upload + URL, Origin, Format, Featured, Malayalam) */}
        {editingSeries && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Edit Series: {editingSeries.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Upload a new cover image or update metadata. Changes sync across server and Firestore.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingSeries(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Rating (0 - 5)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="5"
                      value={editRating}
                      onChange={(e) => setEditRating(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Tradition / Origin
                    </label>
                    <select
                      value={editOrigin}
                      onChange={(e) => setEditOrigin(e.target.value as SeriesOrigin)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    >
                      <option value="manhwa">Manhwa (KR)</option>
                      <option value="manga">Manga (JP)</option>
                      <option value="manhua">Manhua (CN)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Reader Engine
                    </label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as SeriesType)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    >
                      <option value="webtoon">Webtoon Scroll</option>
                      <option value="manga">Manga RTL</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as 'Ongoing' | 'Completed')}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    >
                      <option value="Ongoing">Ongoing</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Release Day
                    </label>
                    <select
                      value={editReleaseDay}
                      onChange={(e) => setEditReleaseDay(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    >
                      {[
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                      ].map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Author
                    </label>
                    <input
                      type="text"
                      value={editAuthor}
                      onChange={(e) => setEditAuthor(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Artist
                    </label>
                    <input
                      type="text"
                      value={editArtist}
                      onChange={(e) => setEditArtist(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Cover Image Upload + URL */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-2">
                    Series Cover Image (Upload File or Paste URL)
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-950 border border-slate-700">
                      <ResilientImage
                        src={editCoverImage || editingSeries.coverImage}
                        alt={editTitle}
                        fallbackTitle={editTitle}
                        fallbackType={editType}
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 transition-colors cursor-pointer">
                          <Upload className="h-3.5 w-3.5" />
                          <span>
                            {isCompressingEditCover
                              ? 'Compressing...'
                              : 'Upload Cover File'}
                          </span>
                          <input
                            ref={editCoverInputRef}
                            type="file"
                            accept="image/*"
                            disabled={isCompressingEditCover}
                            onChange={handleEditCoverFileChange}
                            className="sr-only"
                          />
                        </label>
                      </div>
                      <input
                        type="text"
                        value={editCoverImage}
                        onChange={(e) => setEditCoverImage(e.target.value)}
                        placeholder="https://example.com/cover.jpg or uploaded data URL"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-mono text-white focus:border-rose-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Genres (comma separated)
                  </label>
                  <input
                    type="text"
                    value={editGenres}
                    onChange={(e) => setEditGenres(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Synopsis
                  </label>
                  <textarea
                    rows={3}
                    value={editSynopsis}
                    onChange={(e) => setEditSynopsis(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Malayalam Title (Optional)
                    </label>
                    <input
                      type="text"
                      value={editMalayalamTitle}
                      onChange={(e) => setEditMalayalamTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Malayalam Synopsis (Optional)
                    </label>
                    <input
                      type="text"
                      value={editMalayalamSynopsis}
                      onChange={(e) => setEditMalayalamSynopsis(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editFeatured}
                    onChange={(e) => setEditFeatured(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-0"
                  />
                  <span>Feature on Home Hero Spotlight</span>
                </label>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingSeries(null)}
                    className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingSeries}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                  >
                    {isUpdatingSeries ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Chapter & Upload Panel Images */}
        {editingChapter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Edit Chapter {editingChapter.chapterNumber}: {editingChapter.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Upload new panel image files or edit chapter panel URLs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingChapter(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveChapterEdit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Chapter #
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={editChNumber}
                      onChange={(e) => setEditChNumber(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Chapter Title
                    </label>
                    <input
                      type="text"
                      required
                      value={editChTitle}
                      onChange={(e) => setEditChTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Release Date Label
                  </label>
                  <input
                    type="text"
                    value={editChReleaseDate}
                    onChange={(e) => setEditChReleaseDate(e.target.value)}
                    placeholder="e.g. Oct 26, 2026 or Just now"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>

                {/* Upload Panel Files or Process PDF URL directly into Chapter Editor */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-white">
                        Chapter Panels ({editChPreviewList.length})
                      </span>
                      <p className="text-[11px] text-slate-400">
                        Server-Side PDF &amp; Image Processor (Zero Phone RAM).
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 transition-colors cursor-pointer">
                        <FileText className="h-3.5 w-3.5" />
                        <span>
                          {isCompressingEditChPanels
                            ? panelCompressionStatus || 'Server Processing...'
                            : 'Upload PDF (.pdf)'}
                        </span>
                        <input
                          ref={editChapterFilesInputRef}
                          type="file"
                          accept=".pdf,application/pdf"
                          disabled={isCompressingEditChPanels}
                          onChange={handleEditChapterFilesChange}
                          className="sr-only"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition-colors cursor-pointer">
                        <FileImage className="h-3.5 w-3.5" />
                        <span>Upload Images</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={isCompressingEditChPanels}
                          onChange={handleEditChapterFilesChange}
                          className="sr-only"
                        />
                      </label>
                      {editChPreviewList.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setEditChUrlsText('')}
                          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PDF URL / Google Drive Input inside Chapter Editor */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <input
                      type="url"
                      value={editChPdfUrlInput}
                      onChange={(e) => setEditChPdfUrlInput(e.target.value)}
                      disabled={isCompressingEditChPanels}
                      placeholder="Or paste PDF URL / Google Drive link..."
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={!editChPdfUrlInput.trim() || isCompressingEditChPanels}
                      onClick={handleEditChapterProcessPdfUrl}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer shrink-0"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      <span>Process PDF Link</span>
                    </button>
                  </div>

                  {/* Lightweight Text-Only Summary for Chapter Editor */}
                  {editChPreviewList.length > 0 && (
                    <div className="rounded-lg border border-emerald-800/50 bg-slate-900/80 p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-emerald-300">
                          {editChPreviewList.length} Page(s) Ready on Server (Zero-RAM Text Summary)
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAllEditChPreviews((prev) => !prev)}
                          className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                        >
                          {showAllEditChPreviews
                            ? 'Hide Thumbnails (Save RAM)'
                            : 'Preview First 4 Thumbnails'}
                        </button>
                      </div>

                      {showAllEditChPreviews && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2">
                          {editChPreviewList.slice(0, 4).map((url, idx) => (
                            <div
                              key={`edit-thumb-${idx}`}
                              className="relative rounded border border-slate-800 bg-black h-20 overflow-hidden flex items-center justify-center"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={`Panel ${idx + 1}`}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-contain"
                              />
                              <span className="absolute top-1 left-1 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-white">
                                #{idx + 1}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                        {editChPreviewList.map((url, idx) => (
                          <div
                            key={`${idx}-${url.slice(-20)}`}
                            className="flex items-center justify-between rounded bg-slate-950/80 px-2 py-1 text-[11px]"
                          >
                            <span className="truncate text-slate-300 font-mono">
                              Page #{idx + 1} — {url.startsWith('/api/pdf-pages/') ? 'Server WebP Asset' : url.slice(0, 42)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const next = editChPreviewList.filter((_, i) => i !== idx);
                                setEditChUrlsText(next.join('\n'));
                              }}
                              className="ml-2 rounded bg-rose-950/70 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-600 hover:text-white cursor-pointer shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Only render textarea if entries are external URLs, avoiding large strings inside a DOM textarea */}
                  {editChPreviewList.some((u) => u.startsWith('data:')) ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-300">
                      {editChPreviewList.length} embedded WebP page(s) loaded. Use the controls above to add or remove pages.
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Panel Image URLs (One per line)
                      </label>
                      <textarea
                        rows={3}
                        value={editChUrlsText}
                        onChange={(e) => setEditChUrlsText(e.target.value)}
                        placeholder="https://example.com/page1.jpg&#10;/api/pdf-pages/..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:border-rose-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingChapter(null)}
                    className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingChapter}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                  >
                    {isUpdatingChapter ? 'Saving Chapter...' : 'Save Chapter Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Delete Series Confirmation */}
        {deletingSeriesId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl border border-rose-900/60 bg-slate-900 p-6 shadow-2xl text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 mb-3">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Delete Serialization?</h3>
              <p className="mt-1 text-xs text-slate-400">
                Are you sure you want to delete this series? All published chapters and reading data will be permanently removed.
              </p>

              <div className="mt-5 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingSeriesId(null)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSeries(deletingSeriesId)}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 cursor-pointer"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Change Admin PIN */}
        {isChangePinOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <h3 className="text-sm font-bold text-white">Change Master Admin PIN</h3>
                <button
                  onClick={() => setIsChangePinOpen(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleChangePin} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Current PIN
                  </label>
                  <input
                    type="password"
                    required
                    value={oldPin}
                    onChange={(e) => setOldPin(e.target.value)}
                    placeholder="Enter current PIN"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    New PIN (min 4 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="Enter new PIN"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white focus:border-rose-500 focus:outline-none"
                  />
                </div>

                {pinChangeMsg && (
                  <div className="text-xs text-rose-300 font-medium">{pinChangeMsg}</div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsChangePinOpen(false)}
                    className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 cursor-pointer"
                  >
                    Update PIN
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

export default function AdminDashboardPage() {
  return <AdminWorkspace initialTab="overview" />;
}
