'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2, Users } from 'lucide-react';
import { RRSP_MODULE_LABELS, RRSP_MODULES, type RrspModule } from '@/lib/rrsp';
import { RrspStaffLoginUrl } from '@/components/portal/RrspStaffLoginUrl';

type StaffMember = {
  id: number;
  username: string;
  localUsername: string;
  email: string;
  firstName: string;
  lastName: string;
  roleLabel: string;
  modules: RrspModule[];
  isActive: boolean;
  passwordSet: boolean;
};

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

const emptyForm = {
  localUsername: '',
  firstName: '',
  lastName: '',
  roleLabel: '',
  password: '',
  modules: [] as RrspModule[],
};

export function RrspStaffTab({
  shopLoginSlug,
  staffLoginEnabled,
}: {
  shopLoginSlug: string;
  staffLoginEnabled: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [licensedModules, setLicensedModules] = useState<RrspModule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function loadStaff() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/profile/rrsp/staff', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load staff');
      setStaff(data.staff ?? []);
      setLicensedModules((data.licensedModules ?? []) as RrspModule[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaff();
  }, []);

  function resetForm() {
    setForm({
      ...emptyForm,
      modules: licensedModules.length ? [licensedModules[0]] : [],
    });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(member: StaffMember) {
    setEditingId(member.id);
    setShowForm(true);
    setForm({
      localUsername: member.localUsername,
      firstName: member.firstName,
      lastName: member.lastName,
      roleLabel: member.roleLabel,
      password: '',
      modules: member.modules,
    });
    setError('');
    setMessage('');
  }

  async function saveStaff(e: FormEvent) {
    e.preventDefault();
    if (!staffLoginEnabled) {
      setError('Turn on staff login under Business info first');
      return;
    }
    setSaving('staff');
    setError('');
    setMessage('');
    try {
      const payload = {
        localUsername: form.localUsername,
        firstName: form.firstName,
        lastName: form.lastName,
        roleLabel: form.roleLabel,
        modules: form.modules,
        ...(form.password ? { password: form.password } : {}),
      };
      const res = await fetch(
        editingId ? '/api/auth/profile/rrsp/staff' : '/api/auth/profile/rrsp/staff',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save staff');
      setMessage(data.message || 'Staff saved');
      if (data.tempPassword) {
        setMessage(`Created. Temporary password: ${data.tempPassword}`);
      }
      resetForm();
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save staff');
    } finally {
      setSaving('');
    }
  }

  async function removeStaff(id: number) {
    if (!confirm('Remove this staff account? They will no longer be able to sign in.')) return;
    setSaving('delete');
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/auth/profile/rrsp/staff', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to remove staff');
      setMessage('Staff account removed');
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove staff');
    } finally {
      setSaving('');
    }
  }

  function toggleModule(module: RrspModule) {
    setForm((prev) => {
      const has = prev.modules.includes(module);
      const modules = has ? prev.modules.filter((m) => m !== module) : [...prev.modules, module];
      return { ...prev, modules };
    });
  }

  const loginHint = shopLoginSlug ? `username@${shopLoginSlug}` : 'username@yourshop';

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <Users className="h-4 w-4 text-indigo-600" />
        Shop staff
      </div>
      <p className="text-xs text-slate-500">
        Staff sign in with <span className="font-mono text-slate-700">{loginHint}</span>. They only
        see RRSP shop pages you allow — not Computer Dynamics billing, orders, or support tickets.
      </p>

      {staffLoginEnabled && shopLoginSlug ? (
        <RrspStaffLoginUrl shopLoginSlug={shopLoginSlug} />
      ) : null}

      {!staffLoginEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Enable <strong>Allow my staff to login</strong> on the Business info tab before adding staff.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading staff…
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {staff.length === 0 ? (
              <p className="text-sm text-slate-500">No staff accounts yet.</p>
            ) : (
              staff.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {member.firstName} {member.lastName}
                      <span className="ml-2 text-xs font-normal text-slate-500">{member.roleLabel}</span>
                    </p>
                    <p className="font-mono text-xs text-slate-600">{member.username}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pages:{' '}
                      {member.modules.map((m) => RRSP_MODULE_LABELS[m]).join(', ') || 'None'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(member)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={saving === 'delete'}
                      onClick={() => removeStaff(member.id)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {!showForm ? (
            <button
              type="button"
              disabled={!staffLoginEnabled}
              onClick={() => {
                setShowForm(true);
                setForm({
                  ...emptyForm,
                  modules: licensedModules.length ? [licensedModules[0]] : [],
                });
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add staff
            </button>
          ) : (
            <form onSubmit={saveStaff} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-800">
                {editingId ? 'Edit staff' : 'New staff member'}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Username</span>
                  <input
                    value={form.localUsername}
                    onChange={(e) => setForm({ ...form, localUsername: e.target.value })}
                    className={inputClass}
                    placeholder="jane"
                    required
                  />
                  {shopLoginSlug && (
                    <span className="mt-1 block font-mono text-[11px] text-slate-400">
                      → {form.localUsername || 'jane'}@{shopLoginSlug}
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Role label</span>
                  <input
                    value={form.roleLabel}
                    onChange={(e) => setForm({ ...form, roleLabel: e.target.value })}
                    className={inputClass}
                    placeholder="Cashier, Technician…"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">First name</span>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className={inputClass}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Last name</span>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className={inputClass}
                    required
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Password {editingId ? '(leave blank to keep)' : '(optional — temp password if empty)'}
                  </span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-slate-600">RRSP page access</p>
                <div className="flex flex-wrap gap-2">
                  {licensedModules.map((module) => (
                    <label
                      key={module}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={form.modules.includes(module)}
                        onChange={() => toggleModule(module)}
                      />
                      {RRSP_MODULE_LABELS[module]}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving === 'staff'}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving === 'staff' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save staff
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
