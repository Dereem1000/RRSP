/** Client-safe deliverable template helpers (no Node fs). */

const PLACEHOLDER_RE = /\[([^\]]+)\]/g;

/** Whole sections (## headings) omitted from the client portal copy. */
export const CLIENT_HIDDEN_SECTION_PATTERNS = [
  /^##\s*5\.\s*Deferred scope/i,
  /^##\s*7\.\s*Final handover month/i,
  /^##\s*8\.\s*Post-project change control/i,
  /^##\s*10\.\s*Technical appendix/i,
  /^##\s*11\.\s*Document control/i,
];

/** Subsections under Section 4.5 — vendor/ops detail; ownership is in Section 3. */
export const CLIENT_HIDDEN_SUBSECTION_PATTERNS = [
  /^#{1,6}\s+Not included in the provision package\b/i,
  /^#{1,6}\s+Source code vs provisioned code\b/i,
];

function normalizeDeliverableLine(line: string): string {
  return line.replace(/\r$/, '').trimStart();
}

function headingLevel(line: string): number | null {
  const match = normalizeDeliverableLine(line).match(/^(#{1,6})\s+/);
  return match ? match[1].length : null;
}

function isClientHiddenSection(line: string): boolean {
  const normalized = normalizeDeliverableLine(line);
  return CLIENT_HIDDEN_SECTION_PATTERNS.some((re) => re.test(normalized));
}

function isClientHiddenSubsection(line: string): boolean {
  const normalized = normalizeDeliverableLine(line);
  return CLIENT_HIDDEN_SUBSECTION_PATTERNS.some((re) => re.test(normalized));
}

function isVendorNoteLine(line: string): boolean {
  return /^>\s*\*\*Vendor note:\*\*/i.test(normalizeDeliverableLine(line));
}

export type PlaceholderFieldMeta = {
  label: string;
  help: string;
  multiline?: boolean;
};

export const PLACEHOLDER_FIELD_META: Record<string, PlaceholderFieldMeta> = {
  '[Client / Organization Name]': {
    label: 'Client / organization name',
    help: 'Legal or trading name in Section 1 (Parties) and tables.',
  },
  '[Client Name]': {
    label: 'Client name (narrative)',
    help: 'Short name used in the executive summary opening sentence. Usually matches the organization name.',
  },
  '[Name, email, phone]': {
    label: 'Primary client contact',
    help: 'Contact person with reach details for Section 1 — e.g. Jane Doe · jane@example.com · +1 868 555-0100.',
  },
  '[Project / Invoice Reference]': {
    label: 'Project / invoice reference',
    help: 'Quote number, invoice ID, or internal project code for Section 1.',
  },
  '[TTD $X,XXX.XX]': {
    label: 'Agreed project fee (TTD)',
    help: 'Total project fee in Trinidad & Tobago dollars for Section 2 — e.g. TTD $15,000.00.',
  },
  '[Agreed project fee]': {
    label: 'Agreed project fee',
    help: 'Fee text if the template uses this token instead of the TTD amount field.',
  },
  '[N]': {
    label: 'Final handover month (#)',
    help: 'Which project month is production handover (Section 7 timeline). Enter a number only — e.g. 3 for “Month 3”.',
  },
  '[Page 1 name / description]': {
    label: 'Deferred scope — page 1',
    help: 'Name and brief description of the first interactive page still out of scope (Section 5). Leave blank if none.',
    multiline: true,
  },
  '[Page 2 name / description]': {
    label: 'Deferred scope — page 2',
    help: 'Name and brief description of the second deferred page (Section 5). Leave blank if none.',
    multiline: true,
  },
  '[Define if any — e.g. 30 days for defect fixes on delivered scope only]': {
    label: 'Warranty / support period',
    help: 'Post-delivery defect-fix window in the acceptance section. Default: 30 days for delivered scope only.',
    multiline: true,
  },
};

export function getPlaceholderFieldMeta(token: string): PlaceholderFieldMeta {
  const known = PLACEHOLDER_FIELD_META[token];
  if (known) return known;
  const inner = token.replace(/^\[|\]$/g, '').trim();
  return {
    label: inner || token,
    help: 'Replace this placeholder text in the deliverable template.',
  };
}

export function extractPlaceholders(markdown: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  while ((match = re.exec(markdown)) !== null) {
    found.add(`[${match[1]}]`);
  }
  return [...found].sort();
}

export function applyPlaceholders(
  markdown: string,
  placeholders: Record<string, string>,
): string {
  let out = markdown;
  for (const [token, value] of Object.entries(placeholders)) {
    const key = token.startsWith('[') ? token : `[${token}]`;
    out = out.split(key).join(value ?? '');
  }
  return out;
}

export function toClientDeliverable(staffMarkdown: string): string {
  const lines = staffMarkdown.split('\n');
  const out: string[] = [];
  let skip = false;
  let skipLevel = 0;
  let skipVendorNote = false;

  for (const rawLine of lines) {
    const line = normalizeDeliverableLine(rawLine);
    const level = headingLevel(line);

    if (level != null) {
      if (skip && level <= skipLevel) {
        skip = false;
        skipLevel = 0;
      }
      if (!skip) {
        if (isClientHiddenSection(line)) {
          skip = true;
          skipLevel = 2;
          skipVendorNote = false;
          continue;
        }
        if (isClientHiddenSubsection(line)) {
          skip = true;
          skipLevel = 4;
          skipVendorNote = false;
          continue;
        }
      }
    }

    if (isVendorNoteLine(line)) {
      skipVendorNote = true;
      continue;
    }
    if (skipVendorNote) {
      if (line.startsWith('>')) continue;
      skipVendorNote = false;
    }

    if (skip) continue;
    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function renderDeliverablePreviews(
  templateMarkdown: string,
  placeholders: Record<string, string>,
): { staffMarkdown: string; clientMarkdown: string } {
  const staffMarkdown = applyPlaceholders(templateMarkdown, placeholders);
  return {
    staffMarkdown,
    clientMarkdown: toClientDeliverable(staffMarkdown),
  };
}
