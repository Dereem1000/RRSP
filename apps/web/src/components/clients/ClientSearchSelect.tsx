'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { ClientPickerOption } from '@/lib/client-picker';

export type ClientOption = ClientPickerOption;

export function formatClientLabel(c: ClientOption) {
  const company = c.companyName?.trim();
  const name = c.name?.trim() || 'Unnamed client';
  if (company && company !== name) return `${company} — ${name}`;
  return company || name;
}

const defaultInputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

type ClientSearchSelectProps = {
  clients: ClientOption[];
  value: string;
  onChange: (clientId: string) => void;
  /** For native form submission */
  name?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  /** Filter mode: include "All clients" with value `all` */
  allowAll?: boolean;
  allLabel?: string;
  id?: string;
  'aria-label'?: string;
};

export function ClientSearchSelect({
  clients,
  value,
  onChange,
  name,
  placeholder = 'Type to search client…',
  required,
  disabled,
  className,
  inputClassName = defaultInputClass,
  allowAll = false,
  allLabel = 'All clients',
  id: idProp,
  'aria-label': ariaLabel,
}: ClientSearchSelectProps) {
  const autoId = useId();
  const inputId = idProp ?? autoId;
  const listId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected =
    value === 'all' && allowAll
      ? ({ id: 'all', name: allLabel, companyName: null } as ClientOption)
      : clients.find((c) => c.id === value);

  useEffect(() => {
    if (!open) {
      if (selected) setQuery(formatClientLabel(selected));
      else if (!value) setQuery('');
    }
  }, [selected, value, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base: ClientOption[] = allowAll ? [{ id: 'all', name: allLabel, companyName: null }, ...clients] : clients;
    if (!q) return base.slice(0, 80);
    return base
      .filter((c) => {
        if (c.id === 'all') return allLabel.toLowerCase().includes(q) || 'all clients'.includes(q);
        const label = formatClientLabel(c).toLowerCase();
        return (
          label.includes(q) ||
          c.name.toLowerCase().includes(q) ||
          (c.companyName?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 80);
  }, [clients, query, allowAll, allLabel]);

  function pick(clientId: string) {
    onChange(clientId);
    const picked =
      clientId === 'all' && allowAll
        ? ({ id: 'all', name: allLabel, companyName: null } as ClientOption)
        : clients.find((c) => c.id === clientId);
    setQuery(picked ? formatClientLabel(picked) : '');
    setOpen(false);
  }

  function clear() {
    onChange(allowAll ? 'all' : '');
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      {name && <input type="hidden" name={name} value={value} required={required && value !== 'all'} />}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel ?? 'Search clients'}
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          className={`${inputClassName} pl-9 pr-9`}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value && value !== 'all') onChange('');
            if (value === 'all' && allowAll) onChange('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && open && options[0]) {
              e.preventDefault();
              pick(options[0].id);
            }
          }}
        />
        {(value || query) && !disabled && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Clear client"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No clients match</li>
          ) : (
            options.map((c) => (
              <li key={c.id} role="option" aria-selected={c.id === value}>
                <button
                  type="button"
                  className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-indigo-50 ${
                    c.id === value ? 'bg-indigo-50 font-medium text-indigo-900' : 'text-slate-800'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c.id)}
                >
                  <span>{c.id === 'all' ? allLabel : formatClientLabel(c)}</span>
                  {c.id !== 'all' && c.companyName && c.name && c.companyName !== c.name && (
                    <span className="text-xs text-slate-500">{c.name}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
