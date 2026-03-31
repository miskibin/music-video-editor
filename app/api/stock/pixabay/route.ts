import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let body: { apiKey?: string; query?: string; page?: number; perPage?: number; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const page = typeof body.page === 'number' && body.page >= 1 ? Math.floor(body.page) : 1;
  const rawPerPage = typeof body.perPage === 'number' ? body.perPage : 15;
  const perPage = Math.min(200, Math.max(3, Math.floor(rawPerPage)));
  const mode = body.mode === 'video' ? 'video' : 'photo';

  if (!apiKey) {
    return NextResponse.json({ error: 'Pixabay API key is required' }, { status: 400 });
  }
  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  if (mode === 'video') {
    const url = new URL('https://pixabay.com/api/videos/');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('q', query);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));
    url.searchParams.set('safesearch', 'true');

    const upstream = await fetch(url.toString());

    if (!upstream.ok) {
      const detail = await upstream.text();
      return NextResponse.json(
        { error: 'Pixabay API request failed', detail: detail.slice(0, 500) },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
      );
    }

    const data = (await upstream.json()) as {
      hits?: Array<{
        id: number;
        user?: string;
        videos?: {
          large?: { url?: string; width?: number; height?: number };
          medium?: { url?: string; width?: number; height?: number };
          small?: { url?: string; width?: number; height?: number };
          tiny?: { url?: string; width?: number; height?: number };
        };
        picture_id?: string;
        previewURL?: string;
        imageWidth?: number;
        imageHeight?: number;
      }>;
    };

    const items = (data.hits ?? []).map((h) => {
      const large = h.videos?.large;
      const medium = h.videos?.medium;
      const downloadUrl = large?.url ?? medium?.url ?? h.videos?.small?.url ?? '';
      const previewUrl = h.previewURL ?? '';
      const width = large?.width ?? h.imageWidth ?? 0;
      const height = large?.height ?? h.imageHeight ?? 0;
      return {
        id: `pixabay-v-${h.id}`,
        source: 'pixabay' as const,
        kind: 'video' as const,
        previewUrl,
        downloadUrl,
        width,
        height,
        attribution: h.user ? `Video by ${h.user} (Pixabay)` : 'Pixabay',
      };
    });

    return NextResponse.json({ items });
  }

  const url = new URL('https://pixabay.com/api/');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('image_type', 'photo');
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));
  url.searchParams.set('safesearch', 'true');

  const upstream = await fetch(url.toString());

  if (!upstream.ok) {
    const detail = await upstream.text();
    return NextResponse.json(
      { error: 'Pixabay API request failed', detail: detail.slice(0, 500) },
      { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
    );
  }

  const data = (await upstream.json()) as {
    hits?: Array<{
      id: number;
      previewURL?: string;
      largeImageURL?: string;
      webformatURL?: string;
      imageWidth: number;
      imageHeight: number;
      user?: string;
    }>;
  };

  const items = (data.hits ?? []).map((h) => ({
    id: `pixabay-${h.id}`,
    source: 'pixabay' as const,
    kind: 'photo' as const,
    previewUrl: h.previewURL ?? '',
    downloadUrl: h.largeImageURL ?? h.webformatURL ?? '',
    width: h.imageWidth,
    height: h.imageHeight,
    attribution: h.user ? `Image by ${h.user} (Pixabay)` : 'Pixabay',
  }));

  return NextResponse.json({ items });
}
