import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { resolveMarketingOverrideFile } from '@/lib/marketing-images';

export const runtime = 'nodejs';

/** Serve marketing override images at runtime (next start does not pick up new public files). */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  const resolved = resolveMarketingOverrideFile(filename);
  if (!resolved) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = fs.readFileSync(resolved.abs);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': resolved.mime,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
