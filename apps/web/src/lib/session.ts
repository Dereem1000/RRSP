import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
import { User, publicUser } from '@/lib/db';
import { buildLoginRedirectUrl } from '@/lib/safe-return-url';

/** One SQLite user lookup per RSC request (layout + page share this). */
export const requirePortalUser = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get('cd_access_token')?.value;
  const session = token ? verifyToken(token) : null;
  if (!session) {
    const headerStore = await headers();
    redirect(buildLoginRedirectUrl(headerStore.get('x-cd-return-path')));
  }

  const user = await User.findByPk(session.id, {
    attributes: { exclude: ['password', 'tempPassword'] },
  });
  if (!user) {
    const headerStore = await headers();
    redirect(buildLoginRedirectUrl(headerStore.get('x-cd-return-path')));
  }

  return { session, user: publicUser(user) };
});

export async function requireStaffUser() {
  const { user } = await requirePortalUser();
  if (user.role === 'client') redirect('/tickets');
  return user;
}
