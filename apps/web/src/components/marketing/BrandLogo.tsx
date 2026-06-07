'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Monitor } from 'lucide-react';

type BrandLogoProps = {
  href?: string;
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

const sizes = {
  sm: { height: 36, maxWidth: 160 },
  md: { height: 44, maxWidth: 200 },
  lg: { height: 50, maxWidth: 220 },
  xl: { height: 72, maxWidth: 320 },
} as const;

export function BrandLogo({ href = '/', className = '', showText = false, size = 'md' }: BrandLogoProps) {
  const [src, setSrc] = useState('/logo.png');
  const [failed, setFailed] = useState(false);
  const { height, maxWidth } = sizes[size];

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
      <Image
        src={src}
        alt="Computer Dynamics Logo"
        width={maxWidth}
        height={height}
        className="w-auto object-contain"
        style={{ height: `${height}px`, maxWidth: `${maxWidth}px` }}
        priority
        unoptimized={src.endsWith('.svg')}
        onError={() => {
          if (src === '/logo.png') setSrc('/images/logo.png');
          else if (src === '/images/logo.png') setSrc('/logo.svg');
          else setFailed(true);
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
