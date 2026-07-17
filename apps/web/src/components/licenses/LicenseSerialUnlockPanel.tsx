'use client';

import { useCallback, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, LockOpen } from 'lucide-react';
import {
  LICENSE_SERIAL_REVEAL_HEADER,
  LICENSE_SERIAL_REVEAL_STORAGE_KEY,
} from '@/lib/license-constants';

export function useLicenseSerialReveal() {
  const [revealed, setRevealed] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState('');

  const authHeaders = useCallback((): HeadersInit => {
    if (typeof window === 'undefined') return {};
    const token = sessionStorage.getItem(LICENSE_SERIAL_REVEAL_STORAGE_KEY);
    return token ? { [LICENSE_SERIAL_REVEAL_HEADER]: token } : {};
  }, []);

  const applyRevealResponse = useCallback((serialsRevealed?: boolean) => {
    if (typeof serialsRevealed === 'boolean') {
      setRevealed(serialsRevealed);
    }
  }, []);

  async function unlock(password: string): Promise<boolean> {
    setUnlocking(true);
    setError('');
    try {
      const res = await fetch('/api/msp/license-serials/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || 'Could not verify password');
        return false;
      }
      if (json.token) {
        sessionStorage.setItem(LICENSE_SERIAL_REVEAL_STORAGE_KEY, json.token);
      }
      setRevealed(true);
      return true;
    } catch {
      setError('Could not verify password');
      return false;
    } finally {
      setUnlocking(false);
    }
  }

  async function lock() {
    setError('');
    try {
      await fetch('/api/msp/license-serials/lock', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      sessionStorage.removeItem(LICENSE_SERIAL_REVEAL_STORAGE_KEY);
      setRevealed(false);
    }
  }

  return {
    revealed,
    setRevealed,
    unlocking,
    error,
    setError,
    unlock,
    lock,
    authHeaders,
    applyRevealResponse,
  };
}

export function LicenseSerialUnlockPanel({
  unlocking,
  error,
  onUnlock,
  onLock,
  revealed,
  compact = false,
}: {
  unlocking: boolean;
  error: string;
  revealed: boolean;
  onUnlock: (password: string) => void | Promise<void>;
  onLock: () => void | Promise<void>;
  compact?: boolean;
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (revealed) {
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 ${
          compact ? '' : 'mt-4'
        }`}
      >
        <p className="text-sm text-emerald-800">
          <LockOpen className="mr-1.5 inline h-4 w-4" />
          License serials visible (unlocks for 15 minutes)
        </p>
        <button
          type="button"
          onClick={() => onLock()}
          className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
        >
          Hide serials
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onUnlock(password);
      }}
      className={`rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 ${compact ? '' : 'mt-4'}`}
    >
      <p className="text-sm font-medium text-slate-800">View license serial numbers</p>
      <p className="mt-1 text-xs text-slate-600">
        Re-enter your portal password to show full license serials. They stay hidden everywhere else
        in CD until you unlock.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Your password"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          type="submit"
          disabled={unlocking || !password}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Unlock serials
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}
