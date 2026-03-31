export type StockSearchItem = {
  id: string;
  source: 'pexels' | 'pixabay';
  previewUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  attribution: string;
};

export async function searchPexelsStock(
  apiKey: string,
  query: string,
  page = 1,
  perPage = 15,
): Promise<StockSearchItem[]> {
  const res = await fetch('/api/stock/pexels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: apiKey.trim(),
      query: query.trim(),
      page,
      perPage: Math.min(80, Math.max(1, Math.floor(perPage))),
    }),
  });
  const data = (await res.json()) as { items?: StockSearchItem[]; error?: string; detail?: string };
  if (!res.ok) {
    const msg = [data.error, data.detail].filter(Boolean).join(': ');
    throw new Error(msg || 'Pexels search failed');
  }
  return data.items ?? [];
}

export async function searchPixabayStock(
  apiKey: string,
  query: string,
  page = 1,
  perPage = 15,
): Promise<StockSearchItem[]> {
  const res = await fetch('/api/stock/pixabay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: apiKey.trim(),
      query: query.trim(),
      page,
      perPage: Math.min(200, Math.max(3, Math.floor(perPage))),
    }),
  });
  const data = (await res.json()) as { items?: StockSearchItem[]; error?: string; detail?: string };
  if (!res.ok) {
    const msg = [data.error, data.detail].filter(Boolean).join(': ');
    throw new Error(msg || 'Pixabay search failed');
  }
  return data.items ?? [];
}

export async function fetchStockImageBlob(downloadUrl: string): Promise<Blob> {
  const res = await fetch('/api/stock/fetch-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: downloadUrl }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Could not download image');
  }
  return res.blob();
}
