import jwt from 'jsonwebtoken';
import type { NextRequest } from 'next/server';
import { LICENSE_SERIAL_REVEAL_COOKIE, LICENSE_SERIAL_REVEAL_HEADER } from '@/lib/license-constants';
import { User } from '@/lib/db';
import { resolveJwtSecret } from '@/lib/env-secrets';

const SECRET = resolveJwtSecret();
const REVEAL_TTL = '15m';

export { LICENSE_SERIAL_REVEAL_COOKIE, LICENSE_SERIAL_REVEAL_HEADER } from '@/lib/license-constants';
type LicenseSerialRevealPayload = {
  sub: number;
  purpose: 'license_serial_reveal';
};

export function signLicenseSerialRevealToken(userId: number): string {
  return jwt.sign({ sub: userId, purpose: 'license_serial_reveal' }, SECRET, {
    expiresIn: REVEAL_TTL,
  });
}

export function verifyLicenseSerialRevealToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, SECRET) as unknown as LicenseSerialRevealPayload;
    if (payload.purpose !== 'license_serial_reveal' || typeof payload.sub !== 'number') {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

export async function verifyStaffPassword(userId: number, password: string): Promise<boolean> {
  const user = await User.findByPk(userId);
  if (!user) return false;
  return user.validatePassword(password);
}

export function licenseSerialsRevealed(req: NextRequest, sessionUserId: number): boolean {
  const headerToken = req.headers.get(LICENSE_SERIAL_REVEAL_HEADER)?.trim();
  if (headerToken) {
    const uid = verifyLicenseSerialRevealToken(headerToken);
    if (uid === sessionUserId) return true;
  }
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const uid = verifyLicenseSerialRevealToken(auth.slice(7).trim());
    if (uid === sessionUserId) return true;
  }
  const cookie = req.cookies.get(LICENSE_SERIAL_REVEAL_COOKIE)?.value;
  if (cookie) {
    const uid = verifyLicenseSerialRevealToken(cookie);
    if (uid === sessionUserId) return true;
  }
  return false;
}
