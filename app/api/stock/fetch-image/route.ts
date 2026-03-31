import { NextRequest, NextResponse } from 'next/server';

function isAllowedImageUrl(url: URL): boolean {
  if (url.protocol !== 'https:') {
    return false;
  }
  const { hostname } = url;
  if (hostname === 'images.pexels.com') {
    return true;
  }
  if (hostname === 'cdn.pixabay.com' || hostname === 'pixabay.com') {
    return true;
  }
  if (hostname.endsWith('.pixabay.com')) {
    return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = typeof body.url === 'string' ? body.url.trim() : '';
  if (!raw) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!isAllowedImageUrl(url)) {
    return NextResponse.json({ error: 'Image host is not allowed' }, { status: 400 });
  }

  const upstream = await fetch(url.toString(), {
    headers: { Accept: 'image/*,*/*' },
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'Response is not an image' }, { status: 400 });
  }

  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    headers: { 'Content-Type': contentType },
  });
}
