import { NextRequest, NextResponse } from 'next/server';

function pickBestPexelsVideoLink(
  files: Array<{ width?: number; quality?: string; link?: string; file_type?: string }>,
): string {
  const withLink = files.filter((f) => Boolean(f.link));
  const mp4 = withLink.filter((f) => f.file_type?.includes('mp4') || f.link?.includes('.mp4'));
  const pool = mp4.length ? mp4 : withLink;
  const sorted = [...pool].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0]?.link ?? '';
}

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
  const perPage = Math.min(80, Math.max(1, Math.floor(rawPerPage)));
  const mode = body.mode === 'video' ? 'video' : 'photo';

  if (!apiKey) {
    return NextResponse.json({ error: 'Pexels API key is required' }, { status: 400 });
  }
  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  if (mode === 'video') {
    const url = new URL('https://api.pexels.com/v1/videos/search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));

    const upstream = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return NextResponse.json(
        { error: 'Pexels API request failed', detail: detail.slice(0, 500) },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
      );
    }

    const data = (await upstream.json()) as {
      videos?: Array<{
        id: number;
        width: number;
        height: number;
        image?: string;
        user?: { name?: string };
        video_files?: Array<{ width?: number; quality?: string; link?: string; file_type?: string }>;
      }>;
    };

    const items = (data.videos ?? [])
      .map((v) => {
        const downloadUrl = pickBestPexelsVideoLink(v.video_files ?? []);
        return {
          id: `pexels-v-${v.id}`,
          source: 'pexels' as const,
          kind: 'video' as const,
          previewUrl: v.image ?? '',
          downloadUrl,
          width: v.width,
          height: v.height,
          attribution: v.user?.name ? `Video by ${v.user.name} (Pexels)` : 'Pexels',
        };
      })
      .filter((item) => Boolean(item.downloadUrl));

    return NextResponse.json({ items });
  }

  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));

  const upstream = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    return NextResponse.json(
      { error: 'Pexels API request failed', detail: detail.slice(0, 500) },
      { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
    );
  }

  const data = (await upstream.json()) as {
    photos?: Array<{
      id: number;
      width: number;
      height: number;
      photographer?: string;
      src?: { medium?: string; small?: string; large2x?: string; large?: string; original?: string };
    }>;
  };

  const items = (data.photos ?? []).map((p) => ({
    id: `pexels-${p.id}`,
    source: 'pexels' as const,
    kind: 'photo' as const,
    previewUrl: p.src?.medium ?? p.src?.small ?? '',
    downloadUrl: p.src?.large2x ?? p.src?.large ?? p.src?.original ?? '',
    width: p.width,
    height: p.height,
    attribution: p.photographer ? `Photo by ${p.photographer} (Pexels)` : 'Pexels',
  }));

  return NextResponse.json({ items });
}
