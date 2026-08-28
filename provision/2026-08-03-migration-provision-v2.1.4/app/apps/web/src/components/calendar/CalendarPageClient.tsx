'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import type { SerializedCalendarEvent } from '@/lib/calendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sameDay(a: Date, b: Date) {
  return toDateKey(a) === toDateKey(b);
}

export function CalendarPageClient() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => new Date());
  const [events, setEvents] = useState<SerializedCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = startOfMonth(month).toISOString();
      const to = endOfMonth(month).toISOString();
      const res = await fetch(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load calendar');
      setEvents(data.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, SerializedCalendarEvent[]> = {};
    for (const event of events) {
      const key = toDateKey(new Date(event.scheduledAt));
      if (!map[key]) map[key] = [];
      map[key].push(event);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    }
    return map;
  }, [events]);

  const gridDays = useMemo(() => {
    const first = startOfMonth(month);
    const last = endOfMonth(month);
    const startPad = (first.getDay() + 6) % 7;
    const days: Array<{ date: Date; inMonth: boolean }> = [];

    for (let i = startPad; i > 0; i--) {
      const date = new Date(first);
      date.setDate(first.getDate() - i);
      days.push({ date, inMonth: false });
    }

    for (let d = 1; d <= last.getDate(); d++) {
      days.push({ date: new Date(month.getFullYear(), month.getMonth(), d), inMonth: true });
    }

    while (days.length % 7 !== 0) {
      const date = new Date(last);
      date.setDate(last.getDate() + (days.length - (startPad + last.getDate()) + 1));
      days.push({ date, inMonth: false });
    }

    return days;
  }, [month]);

  const selectedEvents = eventsByDay[toDateKey(selected)] ?? [];
  const today = new Date();

  async function markComplete(id: string) {
    setActing(id);
    try {
      await fetch(`/api/calendar/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      });
      await load();
    } finally {
      setActing('');
    }
  }

  async function removeEvent(id: string) {
    if (!confirm('Remove this calendar event?')) return;
    setActing(id);
    try {
      await fetch(`/api/calendar/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setActing('');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sales follow-ups and scheduled interactions from the pipeline
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-slate-900">
              {month.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
            </h2>
            <button
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {gridDays.map(({ date, inMonth }) => {
              const key = toDateKey(date);
              const count = eventsByDay[key]?.length ?? 0;
              const isSelected = sameDay(date, selected);
              const isToday = sameDay(date, today);

              return (
                <button
                  key={key + (inMonth ? '' : '-pad')}
                  type="button"
                  onClick={() => setSelected(date)}
                  className={`min-h-[72px] rounded-xl border p-2 text-left transition ${
                    isSelected
                      ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-500/20'
                      : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      isToday ? 'bg-indigo-600 font-semibold text-white' : 'text-slate-700'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {count > 0 && (
                    <span className="mt-1 block text-[10px] font-medium text-indigo-700">
                      {count} event{count === 1 ? '' : 's'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loading && (
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading events…
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-indigo-600" />
            <h3 className="font-semibold text-slate-900">
              {selected.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </h3>
          </div>

          <div className="mt-4 space-y-3">
            {selectedEvents.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                No follow-ups scheduled for this day
              </p>
            )}

            {selectedEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{event.title}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(event.scheduledAt).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                    {event.notes && <p className="mt-2 text-sm text-slate-600">{event.notes}</p>}
                    {event.opportunityId && (
                      <Link
                        href={`/sales/${event.opportunityId}`}
                        className="mt-2 inline-block text-sm font-medium text-indigo-700 hover:underline"
                      >
                        Open opportunity
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      title="Mark complete"
                      disabled={acting === event.id}
                      onClick={() => markComplete(event.id)}
                      className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {acting === event.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      title="Remove"
                      disabled={acting === event.id}
                      onClick={() => removeEvent(event.id)}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
