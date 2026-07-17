'use client';

import { useEffect, useId, useState } from 'react';
import {
  TT_PHONE_PREFIX_DISPLAY,
  buildFullPhone,
  formatLocalPhoneInput,
  parsePhoneToLocal,
} from '@/lib/phone-utils';

export function PhoneInput({
  name,
  value,
  defaultValue,
  onChange,
  required,
  className,
  id,
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (fullPhone: string) => void;
  required?: boolean;
  className?: string;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const isControlled = value !== undefined;
  const [local, setLocal] = useState(() => parsePhoneToLocal(isControlled ? value : defaultValue));
  const fullPhone = buildFullPhone(local);

  useEffect(() => {
    if (isControlled) setLocal(parsePhoneToLocal(value));
  }, [isControlled, value]);

  function handleChange(nextRaw: string) {
    const nextLocal = formatLocalPhoneInput(nextRaw);
    setLocal(nextLocal);
    onChange?.(buildFullPhone(nextLocal));
  }

  return (
    <div className={`flex w-full overflow-hidden rounded-xl border border-slate-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 ${className ?? ''}`}>
      <span className="flex shrink-0 items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
        {TT_PHONE_PREFIX_DISPLAY}
      </span>
      <input
        id={inputId}
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        placeholder="000-0000"
        maxLength={8}
        required={required}
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        className="min-w-0 flex-1 border-0 bg-white px-3 py-2 text-sm outline-none focus:ring-0"
      />
      {name ? <input type="hidden" name={name} value={fullPhone} /> : null}
    </div>
  );
}
