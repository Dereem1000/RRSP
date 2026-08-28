'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    grecaptcha?: {
      render: (container: HTMLElement, opts: { sitekey: string }) => number;
      getResponse: (widgetId?: number) => string;
      reset: (widgetId?: number) => void;
    };
  }
}

type CaptchaConfig = { enabled: boolean; siteKey: string | null };

export function LoginCaptcha({
  onReady,
}: {
  onReady: (api: { getToken: () => string; reset: () => void; required: boolean }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [cfg, setCfg] = useState<CaptchaConfig | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);

  const publishReady = useCallback(() => {
    onReadyRef.current({
      required: true,
      getToken: () =>
        widgetIdRef.current != null ? window.grecaptcha?.getResponse(widgetIdRef.current) ?? '' : '',
      reset: () => {
        if (widgetIdRef.current != null) window.grecaptcha?.reset(widgetIdRef.current);
      },
    });
  }, []);

  const tryRenderWidget = useCallback(() => {
    if (!cfg?.siteKey || !containerRef.current || !window.grecaptcha?.render) return false;

    try {
      if (widgetIdRef.current != null) {
        window.grecaptcha.reset(widgetIdRef.current);
        setWidgetReady(true);
        publishReady();
        return true;
      }

      containerRef.current.innerHTML = '';
      widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
        sitekey: cfg.siteKey,
      });
      setWidgetReady(true);
      setLoadError(null);
      publishReady();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not render CAPTCHA widget';
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this site';
      setLoadError(
        `${message}. Confirm "${host}" is listed under Domains in Google reCAPTCHA admin for key CDynamics.`
      );
      onReadyRef.current({ required: true, getToken: () => '', reset: () => {} });
      return false;
    }
  }, [cfg, publishReady]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/public/captcha-config')
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
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cfg?.enabled || !cfg.siteKey || !scriptLoaded) return;

    const id = window.requestAnimationFrame(() => {
      if (!tryRenderWidget()) {
        // Container may not be painted yet — retry once.
        window.setTimeout(() => tryRenderWidget(), 100);
      }
    });

    return () => window.cancelAnimationFrame(id);
  }, [cfg, scriptLoaded, tryRenderWidget]);

  useEffect(() => {
    if (!cfg) return;
    if (!cfg.enabled || !cfg.siteKey) {
      onReadyRef.current({ required: false, getToken: () => '', reset: () => {} });
    }
  }, [cfg]);

  function handleRecaptchaScriptLoad() {
    const start = Date.now();
    const tick = () => {
      if (window.grecaptcha?.render) {
        setScriptLoaded(true);
        return;
      }
      if (Date.now() - start > 15000) {
        setLoadError('Google reCAPTCHA loaded but did not initialize. Refresh the page and try again.');
        onReadyRef.current({ required: true, getToken: () => '', reset: () => {} });
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  }

  if (!cfg?.enabled || !cfg.siteKey) return null;

  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  return (
    <div className="space-y-2">
      <Script
        id="cd-login-recaptcha"
        src="https://www.google.com/recaptcha/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={handleRecaptchaScriptLoad}
        onError={() => {
          setLoadError(
            `Google reCAPTCHA script could not be downloaded${host ? ` on ${host}` : ''}. Check network, firewall, or DNS — not necessarily an ad blocker.`
          );
          onReadyRef.current({ required: true, getToken: () => '', reset: () => {} });
        }}
      />

      {loadError && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {loadError}
        </p>
      )}

      {!widgetReady && !loadError && (
        <p className="text-center text-xs text-slate-500">Loading verification…</p>
      )}

      <div ref={containerRef} className="flex min-h-[78px] justify-center" />
    </div>
  );
}
