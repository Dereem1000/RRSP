'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Pencil, Plus, RefreshCw, Trash2, Users, X } from 'lucide-react';
import type { PublicUser } from '@/lib/users';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

const ROLES = ['admin', 'technician', 'client'] as const;
const CLEARANCES = [
  { value: 'S-CLS1', label: 'S-CLS1 (Full access)' },
  { value: 'S-CLS2', label: 'S-CLS2 (Limited)' },
  { value: 'S-CLS3', label: 'S-CLS3 (Restricted)' },
] as const;

type UserForm = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: (typeof ROLES)[number];
  securityClearance: 'S-CLS1' | 'S-CLS2' | 'S-CLS3';
  phone: string;
  bio: string;
  isActive: boolean;
  password: string;
  autoPassword: boolean;
};

function emptyForm(): UserForm {
  return {
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    role: 'technician',
    securityClearance: 'S-CLS3',
    phone: '',
    bio: '',
    isActive: true,
    password: '',
    autoPassword: true,
  };
}

function userToForm(user: PublicUser): UserForm {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    role: user.role as UserForm['role'],
    securityClearance: user.securityClearance as UserForm['securityClearance'],
    phone: user.phone ?? '',
    bio: user.bio ?? '',
    isActive: user.isActive,
    password: '',
    autoPassword: false,
  };
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: 'bg-violet-50 text-violet-700',
    technician: 'bg-blue-50 text-blue-700',
    client: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colors[role] ?? 'bg-slate-100 text-slate-600'}`}>
      {role}
    </span>
  );
}

export function SettingsUsersSection({
  onMessage,
  onError,
}: {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [tempPasswordHint, setTempPasswordHint] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading('list');
    onError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('active', statusFilter);
      const res = await fetch(`/api/users?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load users');
      setUsers(data.users ?? []);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading('');
    }
  }, [search, roleFilter, statusFilter, onError]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function openCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setTempPasswordHint(null);
    setModal('create');
  }

  function openEdit(user: PublicUser) {
    setForm(userToForm(user));
    setEditingId(user.id);
    setTempPasswordHint(null);
    setModal('edit');
  }

  function closeModal() {
    setModal(null);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading('save');
    onError('');
    try {
      const body: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username,
        email: form.email,
        role: form.role,
        securityClearance: form.securityClearance,
        phone: form.phone || null,
        bio: form.bio || null,
        isActive: form.isActive,
      };

      if (modal === 'create') {
        if (!form.autoPassword && form.password.trim()) {
          body.password = form.password;
        }
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to create user');
        if (data.tempPassword) {
          setTempPasswordHint(data.tempPassword);
          onMessage('User created. Copy the temporary password below.');
        } else {
          onMessage('User created');
          closeModal();
        }
      } else if (editingId) {
        if (form.password.trim()) body.password = form.password;
        const res = await fetch(`/api/users/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to update user');
        onMessage('User updated');
        closeModal();
      }
      await loadUsers();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading('');
    }
  }

  async function resetPassword(user: PublicUser) {
    if (!confirm(`Reset password for ${user.firstName} ${user.lastName}? They must set a new password on next login.`)) return;
    setLoading(`reset-${user.id}`);
    onError('');
    try {
      const res = await fetch(`/api/users/${user.id}/reset-password`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to reset password');
      setTempPasswordHint(data.tempPassword ?? null);
      onMessage(`Password reset for ${user.username} — copy the temporary password below.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading('');
    }
  }

  async function toggleActive(user: PublicUser) {
    setLoading(`active-${user.id}`);
    onError('');
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update user');
      onMessage(user.isActive ? 'User deactivated' : 'User activated');
      await loadUsers();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading('');
    }
  }

  async function removeUser(user: PublicUser) {
    if (!confirm(`Delete user ${user.username}? This cannot be undone.`)) return;
    setLoading(`delete-${user.id}`);
    onError('');
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete user');
      onMessage('User deleted');
      await loadUsers();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading('');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-600" />
          <h2 className="font-semibold text-slate-900">User management</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add user
          </button>
          <button
            type="button"
            onClick={loadUsers}
            disabled={!!loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading === 'list' ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {tempPasswordHint && !modal && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Temporary password</p>
          <p className="mt-1 font-mono text-base">{tempPasswordHint}</p>
          <p className="mt-2 text-xs">Share securely. User must change it on next login.</p>
          <button
            type="button"
            onClick={() => setTempPasswordHint(null)}
            className="mt-3 rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, username, email…"
          className={inputClass}
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={inputClass}>
          <option value="all">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className={inputClass}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              {['Name', 'Username', 'Email', 'Role', 'Clearance', 'Status', 'Last login', ''].map((h) => (
                <th key={h || 'actions'} className="px-4 py-3 font-semibold text-slate-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  {loading === 'list' ? 'Loading…' : 'No users found'}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.username}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{user.securityClearance}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {user.isLocked && <span className="ml-1 text-xs text-red-600">Locked</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {user.lastLoginAt ? String(user.lastLoginAt).slice(0, 16).replace('T', ' ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button type="button" title="Edit" onClick={() => openEdit(user)} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Reset password" onClick={() => resetPassword(user)} disabled={!!loading} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-60">
                        {loading === `reset-${user.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" title={user.isActive ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(user)} disabled={!!loading} className="inline-flex rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60">
                        {user.isActive ? 'Off' : 'On'}
                      </button>
                      <button type="button" title="Delete" onClick={() => removeUser(user)} disabled={!!loading} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60">
                        {loading === `delete-${user.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {modal === 'create' ? 'Add user' : 'Edit user'}
              </h3>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {tempPasswordHint && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-medium">Temporary password</p>
                <p className="mt-1 font-mono text-base">{tempPasswordHint}</p>
                <p className="mt-2 text-xs">Share securely. User must change it on first login.</p>
                <button type="button" onClick={closeModal} className="mt-3 rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-medium text-white">
                  Done
                </button>
              </div>
            )}

            {!tempPasswordHint && (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">First name</span>
                    <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Last name</span>
                    <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputClass} />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Username</span>
                  <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputClass} disabled={modal === 'edit'} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Email</span>
                  <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Role</span>
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserForm['role'] })} className={inputClass}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">Clearance</span>
                    <select
                      value={form.securityClearance}
                      onChange={(e) => setForm({ ...form, securityClearance: e.target.value as UserForm['securityClearance'] })}
                      className={inputClass}
                    >
                      {CLEARANCES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Phone</span>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Bio</span>
                  <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={2} className={inputClass} />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  Active account
                </label>

                {modal === 'create' ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.autoPassword} onChange={(e) => setForm({ ...form, autoPassword: e.target.checked })} />
                      Generate temporary password
                    </label>
                    {!form.autoPassword && (
                      <input
                        type="password"
                        minLength={6}
                        placeholder="Set password (min 6 characters)"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        className={inputClass}
                      />
                    )}
                  </div>
                ) : (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-500">New password (optional)</span>
                    <input
                      type="password"
                      minLength={6}
                      placeholder="Leave blank to keep current"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={closeModal} className="rounded-xl border px-4 py-2 text-sm">Cancel</button>
                  <button type="submit" disabled={loading === 'save'} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                    {loading === 'save' ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
