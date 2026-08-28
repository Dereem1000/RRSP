'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, ExternalLink } from 'lucide-react';
import { BrandLogo } from '@/components/marketing/BrandLogo';
import { LoginCaptcha } from '@/components/LoginCaptcha';
import { resolveReturnPath } from '@/lib/safe-return-url';

type LoginFormProps = {
  demoPortalUrl?: string | null;
};

type DemoStaffHint = {
  username: string;
  roleLabel: string;
  modules: string;
};

export function LoginForm({ demoPortalUrl = null }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demoParam = searchParams?.get('demo')?.trim().toLowerCase() ?? '';
  const autostart = searchParams?.get('autostart') === '1';
  const returnPath = resolveReturnPath(
    searchParams?.get('returnUrl') ?? (demoParam === 'rrms' ? '/rrsp' : null)
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLabel, setDemoLabel] = useState<string | null>(null);
  const [demoStaffHint, setDemoStaffHint] = useState<DemoStaffHint[]>([]);
  const [demoReady, setDemoReady] = useState(!demoParam);
  const autostartAttempted = useRef(false);
  const captchaRef = useRef<{ getToken: () => string; reset: () => void; required: boolean }>({
    getToken: () => '',
    reset: () => {},
    required: false,
  });

  const handleCaptchaReady = useCallback(
    (api: { getToken: () => string; reset: () => void; required: boolean }) => {
      captchaRef.current = api;
    },
    []
  );

  async function performLogin() {
    setError('');
    setLoading(true);
    try {
      const captchaToken = captchaRef.current.getToken();
      if (captchaRef.current.required && !captchaToken) {
        throw new Error('Please complete the CAPTCHA verification.');
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          captchaToken,
          demoProduct: demoParam || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');
      router.push(returnPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      captchaRef.current.reset();
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await performLogin();
  }

  useEffect(() => {
    if (!demoParam) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/demo-login?product=${encodeURIComponent(demoParam)}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (cancelled || !res.ok || !data.success) return;
        setUsername(String(data.username || ''));
        setPassword(String(data.password || ''));
        setDemoLabel(String(data.label || 'Live demo'));
        setDemoStaffHint(Array.isArray(data.staffLogins) ? data.staffLogins : []);
      } catch {
        /* manual login still works */
      } finally {
        if (!cancelled) setDemoReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [demoParam]);

  useEffect(() => {
    if (!autostart || !demoReady || !demoParam || !username || !password) return;
    if (autostartAttempted.current) return;
    if (loading) return;
    if (captchaRef.current.required) return;

    autostartAttempted.current = true;
    performLogin();
  }, [autostart, demoReady, demoParam, username, password, loading]);

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden bg-cd-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cd-700/40 via-transparent to-transparent" />
        <div className="relative">
          <BrandLogo href="/" size="xl" />
          <p className="mt-4 text-lg font-semibold text-white">MSP Portal</p>
        </div>
        <div className="relative space-y-4">
          <h2 className="max-w-md text-3xl font-bold leading-tight text-white">
            Manage clients, tickets, and operations from one place.
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-slate-400">
            Trinidad & Tobago managed services platform. Your existing accounts and data carry over
            from the legacy system.
          </p>
        </div>
        <p className="relative text-xs text-slate-500">v2 · Next.js · SQLite compatible</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="mb-8 lg:hidden">
            <BrandLogo href="/" size="lg" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-500">
            Employee or customer — sign in with your portal credentials.
          </p>

          {demoLabel ? (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <p className="font-semibold">{demoLabel} — live demo</p>
              <p className="mt-1 text-sky-800/90">
                Credentials are filled in below. Shop demo mode turns on automatically when you sign
                in.
              </p>
              {demoStaffHint.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-sky-800/85">
                  {demoStaffHint.map((staff) => (
                    <li key={staff.username}>
                      <span className="font-medium">{staff.roleLabel}:</span> {staff.username}
                      <span className="text-sky-700/80"> ({staff.modules})</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                Username or email
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-cd-500 focus:ring-2 focus:ring-cd-500/20"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-cd-500 focus:ring-2 focus:ring-cd-500/20"
              />
            </div>

            <LoginCaptcha onReady={handleCaptchaReady} />

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (demoParam && !demoReady)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cd-900 py-3 text-sm font-semibold text-white shadow-lg shadow-cd-900/20 transition hover:bg-cd-800 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>

            {demoPortalUrl ? (
              <a
                href={demoPortalUrl}
                target="_top"
                rel="noopener noreferrer"
                className="flex w-full flex-col items-center justify-center gap-0.5 rounded-xl border border-cd-200 bg-cd-50 py-3 text-sm font-semibold text-cd-900 transition hover:border-cd-300 hover:bg-cd-100"
              >
                <span className="inline-flex items-center gap-2">
                  Go to demo
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-xs font-normal text-slate-500">
                  Explore the portal with sample data
                </span>
              </a>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
