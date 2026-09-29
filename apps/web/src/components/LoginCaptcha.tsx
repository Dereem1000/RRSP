'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    grecaptcha?: {
      render: (container: HTMLElement, opts: { sitekey: string }) => number;
      getResponse: (widgetId?: number) => string;
      reset: (widgetId?: number) => void;
    };
    __cdRecaptchaOnload?: () => void;
  }
}

type CaptchaConfig = { enabled: boolean; siteKey: string | null };

export type LoginCaptchaApi = {
  required: boolean;
  /** True when captcha is off, or the widget finished loading. */
  ready: boolean;
  getToken: () => string;
  reset: () => void;
};

const RECAPTCHA_CALLBACK = '__cdRecaptchaOnload';

function waitForGrecaptcha(timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (window.grecaptcha?.render) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

export function LoginCaptcha({
  onReady,
}: {
  onReady: (api: LoginCaptchaApi) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const widgetReadyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [cfg, setCfg] = useState<CaptchaConfig | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const publish = useCallback((api: LoginCaptchaApi) => {
    onReadyRef.current(api);
  }, []);

  const publishDisabled = useCallback(() => {
    widgetReadyRef.current = true;
    setWidgetReady(true);
    publish({
      required: false,
      ready: true,
      getToken: () => '',
      reset: () => {},
    });
  }, [publish]);

  const publishPending = useCallback(() => {
    publish({
      required: true,
      ready: false,
      getToken: () => '',
      reset: () => {},
    });
  }, [publish]);

  const publishWidgetReady = useCallback(() => {
    widgetReadyRef.current = true;
    setWidgetReady(true);
    setLoadError(null);
    publish({
      required: true,
      ready: true,
      getToken: () =>
        widgetIdRef.current != null ? window.grecaptcha?.getResponse(widgetIdRef.current) ?? '' : '',
      reset: () => {
        if (widgetIdRef.current != null) window.grecaptcha?.reset(widgetIdRef.current);
      },
    });
  }, [publish]);

  const tryRenderWidget = useCallback(() => {
    if (!cfg?.siteKey || !containerRef.current || !window.grecaptcha?.render) return false;

    try {
      if (widgetIdRef.current != null) {
        window.grecaptcha.reset(widgetIdRef.current);
        publishWidgetReady();
        return true;
      }

      containerRef.current.innerHTML = '';
      widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
        sitekey: cfg.siteKey,
      });
      publishWidgetReady();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not render CAPTCHA widget';
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this site';
      setLoadError(
        `${message}. Confirm "${host}" is listed under Domains in Google reCAPTCHA admin for key CDynamics.`
      );
      publishPending();
      return false;
    }
  }, [cfg, publishPending, publishWidgetReady]);

  // Load captcha config.
  useEffect(() => {
    let cancelled = false;
    publishPending();

    fetch('/api/public/captcha-config', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const raw = data.captchaConfig ?? data;
        setCfg({
          enabled: Boolean(raw.enabled),
          siteKey: raw.siteKey ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Could not load CAPTCHA settings from the portal.');
          publishPending();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [publishPending]);

  // Disable captcha when not required.
  useEffect(() => {
    if (!cfg) return;
    if (!cfg.enabled || !cfg.siteKey) {
      publishDisabled();
    }
  }, [cfg, publishDisabled]);

  // Load Google script (handles cached script + client navigations).
  useEffect(() => {
    if (!cfg?.enabled || !cfg.siteKey) return;

    let cancelled = false;
    widgetIdRef.current = null;
    widgetReadyRef.current = false;
    setWidgetReady(false);
    setLoadError(null);
    publishPending();

    window.__cdRecaptchaOnload = () => {
      if (!cancelled) setScriptLoaded(true);
    };

    (async () => {
      if (window.grecaptcha?.render) {
        if (!cancelled) setScriptLoaded(true);
        return;
      }

      const existing = document.querySelector<HTMLScriptElement>(
        'script[src*="google.com/recaptcha/api.js"]'
      );
      if (existing) {
        const ok = await waitForGrecaptcha();
        if (!cancelled) setScriptLoaded(ok);
        if (!ok && !cancelled) {
          setLoadError('Google reCAPTCHA loaded but did not initialize. Try reloading verification.');
        }
        return;
      }

      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?onload=${RECAPTCHA_CALLBACK}&render=explicit`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        if (cancelled) return;
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setLoadError(
          `Google reCAPTCHA script could not be downloaded${host ? ` on ${host}` : ''}. Check network, firewall, or DNS — not necessarily an ad blocker.`
        );
        publishPending();
      };
      document.head.appendChild(script);

      const ok = await waitForGrecaptcha();
      if (!cancelled && ok) setScriptLoaded(true);
    })();

    return () => {
      cancelled = true;
      delete window.__cdRecaptchaOnload;
    };
  }, [cfg, reloadNonce, publishPending]);

  // Render widget once script + container are ready (retry until painted).
  useEffect(() => {
    if (!cfg?.enabled || !cfg.siteKey || !scriptLoaded) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;

    const tick = () => {
      if (cancelled) return;
      if (tryRenderWidget()) return;
      attempts += 1;
      if (attempts >= maxAttempts) {
        setLoadError('Verification widget did not appear. Try reloading verification below.');
        publishPending();
        return;
      }
      window.setTimeout(tick, 150);
    };

    const raf = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [cfg, scriptLoaded, tryRenderWidget, publishPending, reloadNonce]);

  function reloadWidget() {
    widgetIdRef.current = null;
    widgetReadyRef.current = false;
    setWidgetReady(false);
    setLoadError(null);
    setScriptLoaded(Boolean(window.grecaptcha?.render));
    setReloadNonce((n) => n + 1);
  }

  if (!cfg?.enabled || !cfg.siteKey) return null;

  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  return (
    <div className="space-y-2">
      {loadError && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={reloadWidget}
            className="text-xs font-semibold text-amber-950 underline underline-offset-2 hover:no-underline"
          >
            Reload verification
          </button>
        </div>
      )}

      {!widgetReady && !loadError && (
        <p className="text-center text-xs text-slate-500">Loading verification…</p>
      )}

      <div ref={containerRef} className="flex min-h-[78px] justify-center" />

      {host && !loadError && widgetReady ? (
        <p className="text-center text-[11px] text-slate-400">Protected by reCAPTCHA</p>
      ) : null}
    </div>
  );
}
