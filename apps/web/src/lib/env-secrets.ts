const WEAK_JWT_SECRETS = new Set([
  '',
  'supersecretkey',
  'your-secret-key-here',
  'your-secret-key-change-in-production',
  'changeme',
  'secret',
]);

export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim() || '';
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret || WEAK_JWT_SECRETS.has(secret)) {
    if (isProduction) {
      throw new Error(
        'JWT_SECRET must be set to a strong random value in production. Update .env before running npm run start.'
      );
    }
    return 'supersecretkey';
  }

  if (isProduction && secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }

  return secret;
}
