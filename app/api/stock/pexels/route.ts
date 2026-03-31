import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let body: { apiKey?: string; query?: string; page?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const page = typeof body.page === 'number' && body.page >= 1 ? Math.floor(body.page) : 1;

  if (!apiKey) {
    return NextResponse.json({ error: 'Pexels API key is required' }, { status: 400 });
  }
  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', '20');
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
    previewUrl: p.src?.medium ?? p.src?.small ?? '',
    downloadUrl: p.src?.large2x ?? p.src?.large ?? p.src?.original ?? '',
    width: p.width,
    height: p.height,
    attribution: p.photographer ? `Photo by ${p.photographer} (Pexels)` : 'Pexels',
  }));

  return NextResponse.json({ items });
}
