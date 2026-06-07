import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
import { User, publicUser } from '@/lib/db';

export async function requirePortalUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('cd_access_token')?.value;
  const session = token ? verifyToken(token) : null;
  if (!session) redirect('/login');

  const user = await User.findByPk(session.id, {
    attributes: { exclude: ['password', 'tempPassword'] },
  });
  if (!user) redirect('/login');

  return { session, user: publicUser(user) };
}

export async function requireStaffUser() {
  const { user } = await requirePortalUser();
  if (user.role === 'client') redirect('/tickets');
  return user;
}
