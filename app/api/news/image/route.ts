import { cachedNewsThumbnail, readImageTicket } from '@/lib/news-media';

export const runtime = 'nodejs';
export const maxDuration = 20;
export async function GET(request: Request) {
  let ticket;
  try { ticket = readImageTicket(new URL(request.url).searchParams.get('ticket') || ''); }
  catch { return new Response(null, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
  try {
    const data = await cachedNewsThumbnail(ticket);
    return new Response(new Uint8Array(data), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=1800', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
  } catch { return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } }); }
}
