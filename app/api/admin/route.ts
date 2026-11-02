import { NextRequest, NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { Chapter } from '@/lib/types';
import { createReaderPanelSvg } from '@/lib/svg-covers';
import { issueAdminSession, clearAdminSession } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seriesId = searchParams.get('seriesId');

    // If seriesId requested, return chapters for that series
    if (seriesId) {
      const chapters = dataStore.getChaptersBySeriesId(seriesId);
      return NextResponse.json({ chapters });
    }

    const allSeries = dataStore.getSeries();
    const reports = dataStore.getReports();
    const requests = dataStore.getRequests();

    const totalChapters = allSeries.reduce((acc, s) => acc + s.chaptersCount, 0);
    const totalReads = allSeries.reduce((acc, s) => acc + s.totalViews, 0);

    return NextResponse.json({
      stats: {
        totalSeries: allSeries.length,
        totalChapters,
        totalReads,
        pendingReports: reports.filter((r) => r.status === 'Pending').length,
        totalRequests: requests.length,
      },
      series: allSeries,
      reports,
    });
  } catch (error) {
    console.error('Admin API error:', error);
    return NextResponse.json({ error: 'Failed to fetch admin data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      seriesId,
      chapterNumber,
      title,
      releaseDate,
      pagesCount,
      customPages,
      panelUrls,
      chapterId,
      reportId,
      reportAction,
      pin,
      newPin,
    } = body;

    // 1. PIN verification
    if (action === 'verify_pin') {
      const isValid = dataStore.verifyAdminPin(pin || '');
      if (!isValid) {
        return NextResponse.json({ error: 'Incorrect Admin PIN' }, { status: 401 });
      }
      const response = NextResponse.json({ success: true, message: 'Admin authenticated' });
      issueAdminSession(response);
      return response;
    }

    // 1b. Admin Logout
    if (action === 'logout') {
      const response = NextResponse.json({ success: true, message: 'Admin logged out' });
      clearAdminSession(req, response);
      return response;
    }

    // 2. PIN change
    if (action === 'change_pin') {
      const isOldValid = dataStore.verifyAdminPin(pin || '');
      if (!isOldValid) {
        return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 401 });
      }
      const updated = dataStore.setAdminPin(newPin);
      if (!updated) {
        return NextResponse.json({ error: 'New PIN must be at least 4 characters' }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'PIN updated successfully' });
    }

    // 3. Resolve report
    if (action === 'resolve_report') {
      if (!reportId || !reportAction) {
        return NextResponse.json({ error: 'reportId and reportAction required' }, { status: 400 });
      }
      const success = dataStore.resolveReport(reportId, reportAction);
      if (!success) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, reports: dataStore.getReports() });
    }

    // 4. Delete chapter
    if (action === 'delete_chapter') {
      if (!chapterId) {
        return NextResponse.json({ error: 'chapterId required' }, { status: 400 });
      }
      const existingChapter = dataStore.getChapterById(chapterId);
      const success = dataStore.deleteChapter(chapterId);
      if (!success) {
        return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        message: 'Chapter deleted',
        deletedChapter: existingChapter,
      });
    }

    // 5. Edit existing chapter
    if (action === 'edit_chapter') {
      if (!chapterId) {
        return NextResponse.json({ error: 'chapterId is required' }, { status: 400 });
      }

      const cleanedUrls = Array.isArray(panelUrls)
        ? panelUrls.map((u: string) => String(u).trim()).filter(Boolean)
        : undefined;

      let updatedChapter = dataStore.updateChapter(chapterId, {
        chapterNumber: chapterNumber !== undefined ? Number(chapterNumber) : undefined,
        title: title !== undefined ? String(title).trim() : undefined,
        releaseDate: releaseDate !== undefined ? String(releaseDate).trim() : undefined,
        panelUrls: cleanedUrls && cleanedUrls.length > 0 ? cleanedUrls : undefined,
        pages: Array.isArray(customPages) && customPages.length > 0 ? customPages : undefined,
      });

      if (!updatedChapter && seriesId) {
        const fallbackPages =
          Array.isArray(customPages) && customPages.length > 0
            ? customPages
            : cleanedUrls && cleanedUrls.length > 0
            ? cleanedUrls.map((url: string, idx: number) => ({
                pageNumber: idx + 1,
                imageUrl: url,
                caption: `Panel ${idx + 1}`,
              }))
            : [];

        updatedChapter = dataStore.addChapter({
          id: String(chapterId),
          seriesId: String(seriesId),
          chapterNumber: Number(chapterNumber) || 1,
          title: String(title || 'Episode').trim(),
          releaseDate: String(releaseDate || 'Updated').trim(),
          views: 1,
          pages: fallbackPages,
          pagesCount: fallbackPages.length,
          hasCustomPages: true,
          isCustomEdited: true,
        });
      }

      if (!updatedChapter) {
        return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        chapter: updatedChapter,
        series: dataStore.getSeriesById(updatedChapter.seriesId),
      });
    }

    // 6. Upload chapter (with generated panels or custom image URLs)
    if (action === 'upload_chapter') {
      if (!seriesId || !chapterNumber || !title) {
        return NextResponse.json({ error: 'seriesId, chapterNumber, and title required' }, { status: 400 });
      }

      const series = dataStore.getSeriesById(seriesId);
      if (!series) {
        return NextResponse.json({ error: 'Series not found' }, { status: 404 });
      }

      const chId = `ch-${series.slug}-${chapterNumber}-${Date.now().toString().slice(-4)}`;

      let pages: { pageNumber: number; imageUrl: string; caption?: string }[] = [];

      // If custom panel URLs provided (one per line)
      if (Array.isArray(panelUrls) && panelUrls.length > 0) {
        pages = panelUrls.map((url: string, idx: number) => ({
          pageNumber: idx + 1,
          imageUrl: url.trim(),
          caption: `Panel ${idx + 1}`,
        }));
      } else if (Array.isArray(customPages) && customPages.length > 0) {
        pages = customPages;
      } else {
        const count = Number(pagesCount) || 6;
        pages = Array.from({ length: count }, (_, i) => ({
          pageNumber: i + 1,
          imageUrl: createReaderPanelSvg(
            series.title,
            Number(chapterNumber),
            i + 1,
            series.type,
            `Episode ${chapterNumber} scene`
          ),
          caption: `Panel ${i + 1}`,
        }));
      }

      const newChapter: Chapter = {
        id: chId,
        seriesId,
        chapterNumber: Number(chapterNumber),
        title,
        releaseDate: releaseDate?.trim() || 'Just now',
        views: 1,
        pages,
        pagesCount: pages.length,
        hasCustomPages: true,
        isCustomEdited: true,
      };

      dataStore.addChapter(newChapter);
      return NextResponse.json({
        success: true,
        chapter: newChapter,
        series: dataStore.getSeriesById(seriesId),
      });
    }

    return NextResponse.json({ error: 'Invalid admin action' }, { status: 400 });
  } catch (error) {
    console.error('Admin POST error:', error);
    return NextResponse.json({ error: 'Admin action failed' }, { status: 500 });
  }
}
