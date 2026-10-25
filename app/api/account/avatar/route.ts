import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { prisma } from '@/lib/prisma';
import { AccessError, accessError, guardAccountRequest, requireAccount, reserveAccessAttempt } from '@/lib/access';

export async function POST(request: Request) {
  try {
    guardAccountRequest(request);
    const user = await requireAccount(request);
    await reserveAccessAttempt('avatar', user.id, 10);
    const reader = request.body?.getReader();
    if (!reader) throw new AccessError('请选择图片。');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new AccessError('头像图片不能超过 2 MB。', 413); }
      chunks.push(value);
    }
    let image: string;
    try {
      const input = Buffer.concat(chunks);
      const metadata = await sharp(input, { limitInputPixels: 16_000_000 }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '')) throw new Error('format');
      const output = await sharp(input, { limitInputPixels: 16_000_000 }).rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
      image = `data:image/webp;base64,${output.toString('base64')}`;
    } catch { throw new AccessError('请选择有效的 JPG、PNG 或 WebP 图片（最多 1600 万像素）。'); }
    // Re-encoding strips metadata and prevents storing executable SVG/HTML.
    await prisma.user.update({ where: { id: user.id }, data: { image } });
    return NextResponse.json({ image });
  } catch (error) { return accessError(error); }
}
export async function DELETE(request: Request) {
  try {
    guardAccountRequest(request);
    const user = await requireAccount(request);
    await prisma.user.update({ where: { id: user.id }, data: { image: null } });
    return NextResponse.json({ image: null });
  } catch (error) { return accessError(error); }
}
