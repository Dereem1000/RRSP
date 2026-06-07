import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getAccountingSummary, getRecentFinancialTransactions } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');
    const [summary, recentTransactions] = await Promise.all([
      getAccountingSummary(),
      getRecentFinancialTransactions(8),
    ]);
    return NextResponse.json({ success: true, summary, recentTransactions });
  } catch (error) {
    console.error('[ACCOUNTING SUMMARY]', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load accounting summary' },
      { status: 500 }
    );
  }
}
