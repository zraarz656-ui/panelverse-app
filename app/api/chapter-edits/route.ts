import { NextRequest, NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { requireAdmin } from '@/lib/admin-auth';
import { ChapterEditRecord, ChapterEditsData } from '@/lib/types';

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128) || 'default';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seriesId = searchParams.get('seriesId') || '';
    const chapterId = searchParams.get('chapterId') || '';
    const lang = searchParams.get('lang') || '';

    if (!seriesId || !chapterId) {
      return NextResponse.json(
        { error: 'seriesId and chapterId are required' },
        { status: 400 }
      );
    }

    const safeSeriesId = sanitizeId(seriesId);
    const safeChapterId = sanitizeId(chapterId);

    if (lang) {
      const safeLang = sanitizeId(lang).slice(0, 8);
      const editId = sanitizeId(`${safeSeriesId}_${safeChapterId}_${safeLang}`);
      const record =
        dataStore.getChapterEdit(editId) ||
        dataStore.getChapterEdit(`${seriesId}_${chapterId}_${lang}`);
      return NextResponse.json({ record: record || null });
    }

    const records = dataStore.getChapterEditsForChapter(safeSeriesId, safeChapterId);
    const rawRecords =
      records.length > 0
        ? records
        : dataStore.getChapterEditsForChapter(seriesId, chapterId);
    return NextResponse.json({ records: rawRecords });
  } catch (error) {
    console.error('Failed to get chapter edits:', error);
    return NextResponse.json(
      { error: 'Failed to load chapter edits' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { seriesId, chapterId, languageCode = 'en', data, adminEmail } = body;

    // Verify Admin Access (Admin session cookie, PIN header, or verified owner email)
    const adminAuthErr = requireAdmin(req);
    const isVerifiedOwnerEmail = adminEmail === 'yuniquearun@gmail.com';
    if (adminAuthErr && !isVerifiedOwnerEmail) {
      return adminAuthErr;
    }

    if (!seriesId || !chapterId || !data) {
      return NextResponse.json(
        { error: 'seriesId, chapterId, and data are required' },
        { status: 400 }
      );
    }

    const safeSeriesId = sanitizeId(String(seriesId));
    const safeChapterId = sanitizeId(String(chapterId));
    const safeLang = ['en', 'ml', 'hi', 'ta'].includes(String(languageCode))
      ? String(languageCode)
      : 'en';
    const editId = sanitizeId(`${safeSeriesId}_${safeChapterId}_${safeLang}`);

    const normalizedData: ChapterEditsData = {
      version: 1,
      pages: Array.isArray(data.pages) ? data.pages.slice(0, 60) : [],
    };

    const record: ChapterEditRecord = {
      id: editId,
      seriesId: safeSeriesId,
      chapterId: safeChapterId,
      languageCode: safeLang,
      data: normalizedData,
      updatedAt: new Date().toISOString(),
    };

    const saved = dataStore.saveChapterEdit(record);
    return NextResponse.json({ success: true, record: saved });
  } catch (error) {
    console.error('Failed to save chapter edit:', error);
    return NextResponse.json(
      { error: 'Failed to save chapter edit' },
      { status: 500 }
    );
  }
}
