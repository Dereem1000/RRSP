'use client';

import { renderMarkdownPreview } from '@/lib/deliverable-markdown-preview';

type Props = {
  markdown: string;
  className?: string;
};

/** Shared deliverable document body — same formatting in staff editor and client portal. */
export function DeliverableMarkdownBody({ markdown, className = '' }: Props) {
  const html = renderMarkdownPreview(markdown);

  return (
    <div
      className={`deliverable-markdown-body overflow-x-auto bg-white text-sm ${className}`.trim()}
      dangerouslySetInnerHTML={{
        __html: html || '<p class="text-sm text-slate-500">No content to display.</p>',
      }}
    />
  );
}
