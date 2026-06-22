'use client';

import { Plug } from 'lucide-react';
import { SettingsLicenseSystemHealthSection } from '@/components/settings/SettingsLicenseSystemHealthSection';
import { SettingsMiniSection } from '@/components/settings/SettingsMiniSection';
import { SettingsMspSyncTokenSection } from '@/components/settings/SettingsMspSyncTokenSection';
import { SettingsRecaptchaSection } from '@/components/settings/SettingsRecaptchaSection';

export function SettingsIntegrationsSection({
  onMessage,
  onError,
}: {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  return (
    <div className="space-y-8">
      <SettingsLicenseSystemHealthSection />

      <div>
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-900">Integrations</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          License Activation GUI sync token, Mini assistant dock, and Google reCAPTCHA for public forms and login.
        </p>
      </div>

      <SettingsMiniSection onMessage={onMessage} onError={onError} />

      <SettingsMspSyncTokenSection onMessage={onMessage} onError={onError} />

      <SettingsRecaptchaSection onMessage={onMessage} onError={onError} />
    </div>
  );
}
