import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/** Return 499 when the browser already cancelled the request (avoids ECONNRESET noise). */
export function abortIfClientDisconnected(request: NextRequest): NextResponse | null {
  if (request.signal.aborted) {
    return new NextResponse(null, { status: 499 });
  }
  return null;
}
