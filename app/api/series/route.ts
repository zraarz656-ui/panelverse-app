import { NextRequest, NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { createCoverSvg } from '@/lib/svg-covers';
import { requireAdmin } from '@/lib/admin-auth';
import { Series } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slugOrId = searchParams.get('slug') || searchParams.get('id');
    if (slugOrId) {
      const target =
        dataStore.getSeriesById(slugOrId) || dataStore.getSeriesBySlug(slugOrId);
      if (!target) {
        return NextResponse.json({ error: 'Series not found' }, { status: 404 });
      }
      const chapters = dataStore.getChaptersBySeriesId(target.id);
      return NextResponse.json({
        ...target,
        chaptersCount: chapters.length,
        chapters,
      });
    }

    const q = searchParams.get('q') || undefined;
    const type = searchParams.get('type') || undefined;
    const genre = searchParams.get('genre') || undefined;
    const status = searchParams.get('status') || undefined;
    const sort = searchParams.get('sort') || undefined;

    const series = dataStore.getSeries({ q, type, genre, status, sort });
    return NextResponse.json(series);
  } catch (error) {
    console.error('Failed to load series:', error);
    return NextResponse.json({ error: 'Failed to fetch series' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const {
      title,
      author,
      artist,
      type,
      origin,
      status,
      genres,
      synopsis,
      releaseDay,
      coverImage,
      featured,
      rating,
      malayalamTitle,
      malayalamSynopsis,
    } = body;

    if (!title || !author || !type) {
      return NextResponse.json({ error: 'Title, author, and type are required' }, { status: 400 });
    }

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const resolvedType = type === 'manga' ? 'manga' : 'webtoon';
    const resolvedOrigin =
      origin === 'manga' || origin === 'manhua' || origin === 'manhwa'
        ? origin
        : resolvedType === 'manga'
        ? 'manga'
        : 'manhwa';

    const newSeries: Series = {
      id: `series-${Date.now()}`,
      slug,
      title: String(title).trim(),
      origin: resolvedOrigin,
      author: String(author).trim(),
      artist: artist ? String(artist).trim() : String(author).trim(),
      type: resolvedType,
      genres: Array.isArray(genres) && genres.length > 0 ? genres : ['Action', 'Fantasy'],
      status: status === 'Completed' ? 'Completed' : 'Ongoing',
      synopsis: synopsis ? String(synopsis).trim() : 'New thrilling series now serializing on PanelVerse.',
      coverImage:
        coverImage && String(coverImage).trim()
          ? String(coverImage).trim()
          : createCoverSvg(title, 'shadow', resolvedType),
      rating:
        rating !== undefined && !Number.isNaN(Number(rating))
          ? Math.max(0, Math.min(5, Number(rating)))
          : 4.9,
      totalViews: 100,
      releaseDay: releaseDay || 'Friday',
      chaptersCount: 0,
      featured: Boolean(featured),
      malayalamTitle: malayalamTitle ? String(malayalamTitle).trim() : undefined,
      malayalamSynopsis: malayalamSynopsis ? String(malayalamSynopsis).trim() : undefined,
    };

    const created = dataStore.addSeries(newSeries);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Failed to create series:', error);
    return NextResponse.json({ error: 'Failed to create series' }, { status: 500 });
  }
}
