import { NextResponse } from 'next/server';
import { miniApiUnavailableReason } from '@/lib/mini-dock';

export async function guardMiniApiRoute(): Promise<NextResponse | null> {
  const reason = await miniApiUnavailableReason();
  if (!reason) return null;
  return NextResponse.json({ success: false, error: reason }, { status: 503 });
}
