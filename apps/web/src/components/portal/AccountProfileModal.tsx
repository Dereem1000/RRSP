'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  ExternalLink,
  FlaskConical,
  ImageIcon,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Save,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  AddressMapPicker,
  type AddressLocation,
  type AddressMapPickerHandle,
} from '@/components/portal/AddressMapPicker';
import {
  RRSP_DEFAULT_LOGO,
  type RrspBranding,
  type RrspEmailSettings,
} from '@/lib/rrsp-branding-shared';
import { RrspStaffTab } from '@/components/portal/RrspStaffTab';

type ProfileUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  username?: string;
  role: string;
};

type ProfileClient = {
  id: string;
  name: string;
  companyName?: string | null;
  email: string;
  phone: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: 'geocode' | 'pin' | null;
} | null;

export type ProfileTab = 'account' | 'business' | 'email' | 'staff';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

function emptyBranding(): RrspBranding {
  return {
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyWebsite: '',
    companyLogo: RRSP_DEFAULT_LOGO,
  };
}

function emptyEmail(): RrspEmailSettings {
  return {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    fromName: '',
    fromEmail: '',
  };
}

export function AccountProfileModal({
  open,
  onClose,
  mode = 'profile',
  forceContact = false,
  initialTab = 'account',
  onBrandingSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** `contact` emphasizes RRSP-required fields and allows skip. */
  mode?: 'profile' | 'contact';
  forceContact?: boolean;
  initialTab?: ProfileTab;
  onBrandingSaved?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [client, setClient] = useState<ProfileClient>(null);
  const [rrspNeedsContact, setRrspNeedsContact] = useState(false);
  const [rrspLicensed, setRrspLicensed] = useState(false);
  const [tab, setTab] = useState<ProfileTab>(initialTab);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState<AddressLocation>({
    latitude: null,
    longitude: null,
    locationSource: null,
  });
  const locationRef = useRef<AddressLocation>(location);
  const mapPickerRef = useRef<AddressMapPickerHandle | null>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [branding, setBranding] = useState<RrspBranding>(emptyBranding());
  const [rrspEmail, setRrspEmail] = useState<RrspEmailSettings>(emptyEmail());
  const [testEmail, setTestEmail] = useState('');
  const [shopDemoMode, setShopDemoMode] = useState(false);
  const [demoToggling, setDemoToggling] = useState(false);
  const [staffLoginEnabled, setStaffLoginEnabled] = useState(false);
  const [shopLoginSlug, setShopLoginSlug] = useState('');
  const [isShopOwner, setIsShopOwner] = useState(false);
  const [isShopStaff, setIsShopStaff] = useState(false);

  const isContactMode = mode === 'contact' || forceContact;
  const showAddress = Boolean(client || isContactMode || rrspNeedsContact);
  /** Licensed RRSP shop account (not staff) — business, email, and staff settings. */
  const showRrspTabs = rrspLicensed && !isShopStaff;

  function updateLocation(next: AddressLocation) {
    locationRef.current = next;
    setLocation(next);
  }

  useEffect(() => {
    if (!open) return;
    if (mode === 'contact') {
      setTab('account');
      return;
    }
    setTab(initialTab);
  }, [open, initialTab, mode]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setMessage('');
      try {
        const res = await fetch('/api/auth/profile', { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load profile');
        if (cancelled) return;
        setUser(data.user);
        setClient(data.client ?? null);
        setRrspNeedsContact(Boolean(data.rrspNeedsContact));
        const licensed = Boolean(data.rrspLicensed);
        setRrspLicensed(licensed);
        setIsShopOwner(Boolean(data.isShopOwner));
        setIsShopStaff(Boolean(data.isShopStaff));
        setFirstName(data.user.firstName ?? '');
        setLastName(data.user.lastName ?? '');
        setEmail(data.client?.email || data.user.email || '');
        setPhone(data.client?.phone || data.user.phone || '');
        setAddress(data.client?.address || '');
        setClientName(data.client?.name || '');
        updateLocation({
          latitude: data.client?.latitude ?? null,
          longitude: data.client?.longitude ?? null,
          locationSource: data.client?.locationSource ?? null,
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');

        if (licensed && !data.isShopStaff) {
          const rrspRes = await fetch('/api/auth/profile/rrsp', { cache: 'no-store' });
          const rrspData = await rrspRes.json();
          if (rrspRes.ok && !cancelled) {
            if (rrspData.branding) setBranding(rrspData.branding);
            if (rrspData.email) setRrspEmail(rrspData.email);
            setShopDemoMode(Boolean(rrspData.demoMode));
            setStaffLoginEnabled(Boolean(rrspData.staffLoginEnabled));
            setShopLoginSlug(String(rrspData.shopLoginSlug ?? ''));
            setIsShopOwner(Boolean(rrspData.isShopOwner));
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving('profile');
    setError('');
    setMessage('');
    const pin = mapPickerRef.current?.getLocation() ?? locationRef.current;
    if (showAddress && address.trim() && (pin.latitude == null || pin.longitude == null)) {
      setError('Drop a pin on the map (or find the address) before saving.');
      setSaving('');
      return;
    }
    locationRef.current = pin;
    updateLocation(pin);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          address,
          latitude: pin.latitude,
          longitude: pin.longitude,
          locationSource: pin.locationSource ?? 'pin',
          clientEmail: email,
          clientPhone: phone,
          clientName: clientName || undefined,
          requireRrspContact: isContactMode || rrspNeedsContact,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save profile');
      setMessage('Profile saved');
      setClient(data.client ?? null);
      setRrspNeedsContact(Boolean(data.rrspNeedsContact));
      setRrspLicensed(Boolean(data.rrspLicensed ?? rrspLicensed));
      const savedLat = data.client?.latitude ?? null;
      const savedLon = data.client?.longitude ?? null;
      if (savedLat != null && savedLon != null) {
        updateLocation({
          latitude: savedLat,
          longitude: savedLon,
          locationSource: data.client?.locationSource ?? pin.locationSource,
        });
      } else if (pin.latitude != null && pin.longitude != null) {
        updateLocation(pin);
        setError('Profile saved, but the map pin was not stored. Try Save details again.');
      } else {
        updateLocation({
          latitude: null,
          longitude: null,
          locationSource: null,
        });
      }
      router.refresh();
      if (isContactMode && !data.rrspNeedsContact) {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving('');
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setSaving('password');
    setError('');
    setMessage('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      setSaving('');
      return;
    }
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update password');
      setMessage('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSaving('');
    }
  }

  async function toggleStaffLogin(next: boolean) {
    setSaving('staffLogin');
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/auth/profile/rrsp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'business',
          branding,
          staffLoginEnabled: next,
          shopLoginSlug: shopLoginSlug || branding.companyName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update staff login');
      setStaffLoginEnabled(Boolean(data.staffLoginEnabled));
      if (data.shopLoginSlug) setShopLoginSlug(data.shopLoginSlug);
      setMessage(
        data.message ||
          (next ? 'Staff can now sign in with username@yourshop' : 'Staff sign-in disabled')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update staff login');
    } finally {
      setSaving('');
    }
  }

  async function saveBusiness(e: FormEvent) {
    e.preventDefault();
    setSaving('business');
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/auth/profile/rrsp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'business', branding }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save business info');
      setBranding(data.branding);
      if (data.shopLoginSlug) setShopLoginSlug(data.shopLoginSlug);
      if (data.staffLoginEnabled !== undefined) {
        setStaffLoginEnabled(Boolean(data.staffLoginEnabled));
      }
      setMessage('Business information saved');
      onBrandingSaved?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save business info');
    } finally {
      setSaving('');
    }
  }

  async function toggleShopDemo(next: boolean) {
    setDemoToggling(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/auth/profile/rrsp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'demo', enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update shop demo mode');
      setShopDemoMode(Boolean(data.demoMode));
      setMessage(data.message || (next ? 'Shop demo mode enabled' : 'Shop demo mode disabled'));
      window.dispatchEvent(new CustomEvent('rrsp-shop-demo-changed', { detail: { demoMode: data.demoMode } }));
      // Full reload so POS/inventory client state picks up seeded (or restored) shop data.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update shop demo mode');
      setDemoToggling(false);
    }
  }

  async function saveRrspEmailSettings(e: FormEvent) {
    e.preventDefault();
    setSaving('email');
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/auth/profile/rrsp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'email', email: rrspEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save email settings');
      setRrspEmail(data.email);
      setMessage('Email settings saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save email settings');
    } finally {
      setSaving('');
    }
  }

  async function sendTestEmail() {
    if (!testEmail.trim()) {
      setError('Enter a test email address');
      return;
    }
    if (!rrspEmail.host.trim() || !rrspEmail.user.trim()) {
      setError('Enter SMTP host and username, then save before testing.');
      return;
    }
    if (!rrspEmail.password) {
      setError('Enter the SMTP password, then save before testing.');
      return;
    }
    setSaving('test');
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/auth/profile/rrsp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmail,
          email: rrspEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Test email failed');
      if (data.email) setRrspEmail(data.email);
      setMessage(data.message || 'Test email sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test email failed');
    } finally {
      setSaving('');
    }
  }

  function onLogoFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (PNG, JPG, SVG, etc.)');
      return;
    }
    if (file.size > 512 * 1024) {
      setError('Logo must be 512 KB or smaller');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBranding({ ...branding, companyLogo: String(reader.result) });
      setMessage('Logo ready — save business information to apply');
      setError('');
    };
    reader.readAsDataURL(file);
  }

  if (!open) return null;

  const logoPreview =
    branding.companyLogo && branding.companyLogo !== RRSP_DEFAULT_LOGO
      ? branding.companyLogo
      : RRSP_DEFAULT_LOGO;

  const tabs: { id: ProfileTab; label: string; icon: typeof UserRound }[] = [
    { id: 'account', label: 'Account', icon: UserRound },
    ...(showRrspTabs
      ? ([
          { id: 'business', label: 'Business info', icon: Building2 },
          ...(isShopOwner
            ? [{ id: 'staff' as ProfileTab, label: 'Staff', icon: Users }]
            : []),
          { id: 'email', label: 'Email', icon: Mail },
        ] as const)
      : []),
  ];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isContactMode ? 'Complete your business details' : 'Your profile'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isContactMode
                ? 'RRSP requires an address, email, and contact number before you can use shop features.'
                : showRrspTabs
                  ? 'Account, shop branding, and outbound email for your RRSP portal.'
                  : 'Update your account details or change your password.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {showRrspTabs && (
          <div className="mt-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  setError('');
                  setMessage('');
                }}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  tab === id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        )}

        {loading || !user ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : tab === 'business' && showRrspTabs ? (
          <form onSubmit={saveBusiness} className="mt-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <Building2 className="h-4 w-4 text-indigo-600" />
              Business information &amp; logo
            </div>
            <p className="text-xs text-slate-500">
              Your logo replaces the Computer Dynamics mark in your portal. A small Computer Dynamics
              badge stays visible in the corner once you upload a custom logo.
            </p>

            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Logo</p>
                <div className="relative flex min-h-[64px] items-center justify-center rounded-lg border border-slate-200 bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoPreview} alt="Shop logo" className="max-h-14 max-w-full object-contain" />
                  <button
                    type="button"
                    onClick={() => logoFileRef.current?.click()}
                    className="absolute -right-1 -top-1 rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:bg-slate-50"
                    aria-label="Edit logo"
                    title="Edit logo"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onLogoFile(e.target.files?.[0])}
                />
                <div className="mt-2 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => logoFileRef.current?.click()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Upload logo
                  </button>
                  <button
                    type="button"
                    onClick={() => setBranding({ ...branding, companyLogo: RRSP_DEFAULT_LOGO })}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Use Computer Dynamics logo
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Business name</span>
                  <input
                    value={branding.companyName}
                    onChange={(e) => setBranding({ ...branding, companyName: e.target.value })}
                    className={inputClass}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Address</span>
                  <textarea
                    rows={2}
                    value={branding.companyAddress}
                    onChange={(e) => setBranding({ ...branding, companyAddress: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Phone</span>
                    <input
                      value={branding.companyPhone}
                      onChange={(e) => setBranding({ ...branding, companyPhone: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Website</span>
                    <input
                      value={branding.companyWebsite}
                      onChange={(e) => setBranding({ ...branding, companyWebsite: e.target.value })}
                      className={inputClass}
                      placeholder="https://"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">Allow my staff to login</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Staff sign in with{' '}
                    <span className="font-mono text-slate-800">
                      username@{shopLoginSlug || 'yourshop'}
                    </span>
                    . Manage accounts and page access on the Staff tab once this is on.
                  </p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 pt-0.5">
                  <span className="text-xs font-medium text-slate-700">
                    {staffLoginEnabled ? 'On' : 'Off'}
                  </span>
                  <input
                    type="checkbox"
                    checked={staffLoginEnabled}
                    disabled={saving === 'staffLogin'}
                    onChange={(e) => toggleStaffLogin(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-950">
                    <FlaskConical className="h-4 w-4 text-amber-700" />
                    Shop demo mode
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                    Loads sample customers, tickets, orders, sales, invoices, quotes, and POS items
                    so you can demonstrate every shop feature. Your real shop data is snapshotted and
                    restored when you turn this off. This is separate from Computer Dynamics staff
                    demo mode and does not affect the MSP database.
                  </p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 pt-0.5">
                  <span className="text-xs font-medium text-amber-950">
                    {shopDemoMode ? 'On' : 'Off'}
                  </span>
                  <input
                    type="checkbox"
                    checked={shopDemoMode}
                    disabled={demoToggling}
                    onChange={(e) => toggleShopDemo(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-300 text-amber-600"
                  />
                </label>
              </div>
              {demoToggling ? (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-800">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {shopDemoMode ? 'Restoring your shop data…' : 'Preparing demo data…'}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={saving === 'business'}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving === 'business' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save business info
              </button>
            </div>
          </form>
        ) : tab === 'staff' && showRrspTabs && isShopOwner ? (
          <RrspStaffTab shopLoginSlug={shopLoginSlug} staffLoginEnabled={staffLoginEnabled} />
        ) : tab === 'email' && showRrspTabs ? (
          <form onSubmit={saveRrspEmailSettings} className="mt-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <Mail className="h-4 w-4 text-indigo-600" />
              Shop outbound email
            </div>
            <p className="text-xs text-slate-500">
              When enabled, RRSP shop emails (tickets, invoices, and related notices) send from your
              address instead of Computer Dynamics.
            </p>

            <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Gmail setup (recommended)</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600">
                <li>
                  Turn on 2-Step Verification for your Google account if it is not already on.
                </li>
                <li>
                  Create an <strong>App password</strong> (do not use your normal Gmail password).
                </li>
                <li>
                  Click <strong>Use Gmail settings</strong> below, enter your Gmail address as
                  username and from email, paste the 16-character app password, then save and send a
                  test.
                </li>
              </ol>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50"
                >
                  Create app password
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href="https://support.google.com/accounts/answer/185833"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-50"
                >
                  Google help: App passwords
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setRrspEmail({
                      ...rrspEmail,
                      enabled: true,
                      host: 'smtp.gmail.com',
                      port: 465,
                      secure: true,
                      fromEmail: rrspEmail.fromEmail || rrspEmail.user || email || '',
                      user: rrspEmail.user || email || '',
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800"
                >
                  Use Gmail settings
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                If Google asks you to sign in, use the same Gmail account you want shop emails to
                come from. App passwords only work when 2-Step Verification is enabled.
              </p>
            </div>

            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-slate-800">Enable shop email</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Use your SMTP account for RRSP feature emails
                </span>
              </span>
              <input
                type="checkbox"
                checked={rrspEmail.enabled}
                onChange={(e) => setRrspEmail({ ...rrspEmail, enabled: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">SMTP host</span>
                <input
                  value={rrspEmail.host}
                  onChange={(e) => setRrspEmail({ ...rrspEmail, host: e.target.value })}
                  className={inputClass}
                  placeholder="smtp.gmail.com"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Port</span>
                <input
                  type="number"
                  value={rrspEmail.port}
                  onChange={(e) => {
                    const port = Number(e.target.value) || 587;
                    setRrspEmail({
                      ...rrspEmail,
                      port,
                      // 465 = SSL from connect; 587 = STARTTLS (do not force SSL handshake)
                      secure: port === 465 || port === 8465,
                    });
                  }}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col justify-end gap-1 pb-1 text-sm text-slate-700">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rrspEmail.secure || rrspEmail.port === 465}
                    onChange={(e) => {
                      const secure = e.target.checked;
                      setRrspEmail({
                        ...rrspEmail,
                        secure,
                        port: secure && rrspEmail.port === 587 ? 465 : !secure && rrspEmail.port === 465 ? 587 : rrspEmail.port,
                      });
                    }}
                  />
                  Use SSL (port 465)
                </span>
                <span className="text-xs text-slate-500">
                  Leave off for port 587 (STARTTLS). Turning this on with 587 causes SSL errors.
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Username</span>
                <input
                  value={rrspEmail.user}
                  onChange={(e) => setRrspEmail({ ...rrspEmail, user: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
                <input
                  type="password"
                  value={rrspEmail.password === '********' ? '' : rrspEmail.password}
                  placeholder={
                    rrspEmail.password === '********'
                      ? 'Saved password on file — leave blank to keep'
                      : 'Gmail app password (16 characters)'
                  }
                  onChange={(e) =>
                    setRrspEmail({
                      ...rrspEmail,
                      password: e.target.value || (rrspEmail.password === '********' ? '********' : ''),
                    })
                  }
                  className={inputClass}
                  autoComplete="new-password"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  For Gmail, paste the app password here — not your regular login password.
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">From name</span>
                <input
                  value={rrspEmail.fromName}
                  onChange={(e) => setRrspEmail({ ...rrspEmail, fromName: e.target.value })}
                  className={inputClass}
                  placeholder={branding.companyName || 'Your shop name'}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">From email</span>
                <input
                  type="email"
                  value={rrspEmail.fromEmail}
                  onChange={(e) => setRrspEmail({ ...rrspEmail, fromEmail: e.target.value })}
                  className={inputClass}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={saving === 'email'}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving === 'email' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save email
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
              <label className="block min-w-[12rem] flex-1">
                <span className="mb-1 block text-sm font-medium text-slate-700">Test recipient</span>
                <input
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                onClick={sendTestEmail}
                disabled={saving === 'test'}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {saving === 'test' ? 'Sending…' : 'Send test email'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 space-y-6">
            <form onSubmit={saveProfile} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <UserRound className="h-4 w-4 text-indigo-600" />
                Account details
              </div>
              {!isContactMode && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">First name</span>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={inputClass}
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">Last name</span>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={inputClass}
                      required
                    />
                  </label>
                </div>
              )}
              {client && !showRrspTabs && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Business name</span>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className={inputClass}
                  />
                </label>
              )}
              {client && showRrspTabs && (
                <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Shop name and logo are managed under the Business info tab.
                </p>
              )}
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Email {isContactMode || rrspNeedsContact ? <span className="text-red-500">*</span> : null}
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Contact number{' '}
                  {isContactMode || rrspNeedsContact ? <span className="text-red-500">*</span> : null}
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  required={isContactMode || rrspNeedsContact}
                  placeholder="Phone / WhatsApp"
                />
              </label>
              {showAddress && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      Address{' '}
                      {isContactMode || rrspNeedsContact ? <span className="text-red-500">*</span> : null}
                    </span>
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      rows={3}
                      className={inputClass}
                      required={isContactMode || rrspNeedsContact}
                      placeholder="Business / service address"
                    />
                  </label>
                  <AddressMapPicker
                    ref={mapPickerRef}
                    key={client?.id || 'profile-map'}
                    address={address}
                    value={location}
                    onChange={updateLocation}
                    required={isContactMode || rrspNeedsContact}
                  />
                </>
              )}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {isContactMode && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Skip for now
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving === 'profile'}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving === 'profile' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save details
                </button>
              </div>
              {isContactMode && (
                <p className="text-xs text-amber-700">
                  If you skip, RRSP shop features stay locked until these details are saved.
                </p>
              )}
            </form>

            {!isContactMode && (
              <form onSubmit={changePassword} className="space-y-3 border-t border-slate-100 pt-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <KeyRound className="h-4 w-4 text-indigo-600" />
                  Change password
                </div>
                {user.username && (
                  <p className="text-xs text-slate-500">Username: {user.username}</p>
                )}
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Current password</span>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={inputClass}
                    required
                    autoComplete="current-password"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">New password</span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Confirm new password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </label>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving === 'password'}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {saving === 'password' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    Update password
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
