export type RrspContactField = 'email' | 'phone' | 'address';

export function getMissingRrspContactFields(input: {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}): RrspContactField[] {
  const missing: RrspContactField[] = [];
  if (!String(input.email ?? '').trim()) missing.push('email');
  if (!String(input.phone ?? '').trim()) missing.push('phone');
  if (!String(input.address ?? '').trim()) missing.push('address');
  return missing;
}

export function isRrspContactComplete(input: {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}): boolean {
  return getMissingRrspContactFields(input).length === 0;
}
