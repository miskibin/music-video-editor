import { NextRequest, NextResponse } from 'next/server';

function isAllowedMediaUrl(url: URL): boolean {
  if (url.protocol !== 'https:') {
    return false;
  }
  const { hostname } = url;
  if (hostname === 'images.pexels.com') {
    return true;
  }
  if (hostname === 'videos.pexels.com') {
    return true;
  }
  if (hostname === 'player.vimeo.com') {
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

  if (!isAllowedMediaUrl(url)) {
    return NextResponse.json({ error: 'Media host is not allowed' }, { status: 400 });
  }

  const upstream = await fetch(url.toString(), {
    headers: { Accept: 'image/*,video/*,*/*' },
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
    return NextResponse.json({ error: 'Response is not image or video' }, { status: 400 });
  }

  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    headers: { 'Content-Type': contentType },
  });
}
