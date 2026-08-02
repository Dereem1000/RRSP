'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';

type BrandLogoProps = {
  href?: string;
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Custom logo URL or data URL (RRSP shop branding). */
  src?: string | null;
  alt?: string;
};

const sizes = {
  sm: { height: 36, maxWidth: 160 },
  md: { height: 44, maxWidth: 200 },
  lg: { height: 50, maxWidth: 220 },
  xl: { height: 72, maxWidth: 320 },
} as const;

const PLATFORM_FALLBACKS = ['/logo.png', '/images/logo.png', '/logo.svg'] as const;

export function BrandLogo({
  href = '/',
  className = '',
  showText = false,
  size = 'md',
  src: customSrc = null,
  alt = 'Computer Dynamics Logo',
}: BrandLogoProps) {
  const custom = Boolean(customSrc && String(customSrc).trim());
  const [src, setSrc] = useState(custom ? String(customSrc) : PLATFORM_FALLBACKS[0]);
  const [failed, setFailed] = useState(false);
  const { height, maxWidth } = sizes[size];

  useEffect(() => {
    setFailed(false);
    setSrc(custom ? String(customSrc) : PLATFORM_FALLBACKS[0]);
  }, [custom, customSrc]);

  const content = failed ? (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10">
        <Monitor className="h-5 w-5 text-indigo-600" />
      </span>
      <span className="bg-gradient-to-r from-indigo-600 to-pink-500 bg-clip-text text-lg font-bold text-transparent">
        Computer Dynamics
      </span>
    </span>
  ) : (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URLs + fallback chain */}
      <img
        src={src}
        alt={alt}
        width={maxWidth}
        height={height}
        className="w-auto object-contain"
        style={{ height: `${height}px`, maxWidth: `${maxWidth}px` }}
        onError={() => {
          if (custom) {
            setFailed(true);
            return;
          }
          const idx = PLATFORM_FALLBACKS.indexOf(src as (typeof PLATFORM_FALLBACKS)[number]);
          if (idx >= 0 && idx < PLATFORM_FALLBACKS.length - 1) {
            setSrc(PLATFORM_FALLBACKS[idx + 1]);
          } else {
            setFailed(true);
          }
        }}
      />
      {showText && (
        <span className="bg-gradient-to-r from-indigo-600 to-pink-500 bg-clip-text text-lg font-bold text-transparent">
          Computer Dynamics
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="shrink-0">
        {content}
      </Link>
    );
  }

  return content;
}

/** Small floating Computer Dynamics mark when a shop uses a custom logo. */
export function ComputerDynamicsCreditBadge({
  visible,
  className = '',
}: {
  visible: boolean;
  className?: string;
}) {
  if (!visible) return null;
  return (
    <a
      href="https://www.computerdynamicstt.com"
      target="_blank"
      rel="noopener noreferrer"
      title="Powered by Computer Dynamics"
      className={`fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white/95 px-2.5 py-1.5 shadow-lg shadow-slate-900/10 backdrop-blur-sm transition hover:bg-white ${className}`}
    >
      <Image
        src="/logo.png"
        alt="Computer Dynamics"
        width={88}
        height={28}
        className="h-7 w-auto object-contain"
        unoptimized
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src.endsWith('/logo.png')) img.src = '/images/logo.png';
          else if (img.src.endsWith('/images/logo.png')) img.src = '/logo.svg';
        }}
      />
      <span className="hidden text-[10px] font-medium text-slate-500 sm:inline">Computer Dynamics</span>
    </a>
  );
}
