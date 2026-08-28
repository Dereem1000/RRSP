/** Lightweight markdown preview (headings, bold, lists, tables). Client-safe — no Node fs. */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 text-sm">$1</code>');
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.includes('|');
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

export function renderMarkdownPreview(markdown: string): string {
  const source = markdown.trim();
  if (!source) {
    return '<p class="text-sm text-slate-500">No preview content yet. Check that the deliverable template path is configured and the file exists on this machine.</p>';
  }

  const lines = source.split('\n');
  const blocks: string[] = [];
  let tableRows: string[] = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const rows = tableRows
      .map((row) => {
        const cells = row
          .slice(1, -1)
          .split('|')
          .map((c) => `<td class="border border-slate-200 px-2 py-1 align-top">${inlineMarkdown(c.trim())}</td>`)
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    blocks.push(
      `<div class="my-3 overflow-x-auto"><table class="w-full min-w-[20rem] border-collapse text-sm">${rows}</table></div>`,
    );
    tableRows = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (isTableRow(trimmed)) {
      if (isTableSeparator(trimmed)) continue;
      tableRows.push(trimmed);
      continue;
    }

    flushTable();

    if (!trimmed) {
      blocks.push('<div class="h-2"></div>');
      continue;
    }
    if (trimmed === '---') {
      blocks.push('<hr class="my-4 border-slate-200" />');
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push(`<h3 class="mt-4 mb-2 text-base font-semibold text-slate-900">${inlineMarkdown(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(
        `<h2 class="mt-5 mb-2 border-b border-slate-200 pb-1 text-lg font-semibold text-slate-900">${inlineMarkdown(trimmed.slice(3))}</h2>`,
      );
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(`<h1 class="mt-2 mb-3 text-xl font-bold text-slate-900">${inlineMarkdown(trimmed.slice(2))}</h1>`);
      continue;
    }
    if (trimmed.startsWith('- ')) {
      blocks.push(`<p class="mb-1 ml-4 text-sm text-slate-700">• ${inlineMarkdown(trimmed.slice(2))}</p>`);
      continue;
    }
    if (trimmed.startsWith('> ')) {
      blocks.push(
        `<blockquote class="my-2 border-l-4 border-indigo-200 bg-indigo-50/50 px-3 py-2 text-sm text-slate-700">${inlineMarkdown(trimmed.slice(2))}</blockquote>`,
      );
      continue;
    }

    blocks.push(`<p class="mb-2 text-sm leading-relaxed text-slate-700">${inlineMarkdown(trimmed)}</p>`);
  }

  flushTable();

  return `<div class="deliverable-preview text-slate-900">${blocks.join('\n')}</div>`;
}
