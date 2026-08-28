'use client';

import type { ActivationFeature } from '@/lib/license-constants';
import type { GateStatus } from '@/lib/management-systems-shared';

export type ProductCatalogEntry = {
  projectRoot: string;
  deliverableTemplatePath: string;
  systemKey?: string;
};

export function buildProvisionDeepLink(input: {
  clientId: string;
  feature: ActivationFeature;
  customerName: string;
  projectRoot: string;
  phase: 'Complete' | 'Install';
}) {
  const params = new URLSearchParams({
    tab: 'provisioning',
    clientId: input.clientId,
    feature: input.feature,
    customerName: input.customerName,
    projectRoot: input.projectRoot,
    phase: input.phase,
    clear: 'package,install,publicUrl',
    returnTo: `/msp/systems?feature=${encodeURIComponent(input.feature)}&highlight=${encodeURIComponent(input.clientId)}`,
  });
  return `/developer-toolbox?${params.toString()}`;
}

export function gateStatusIcon(status: GateStatus | undefined): 'none' | 'pass' | 'fail' | 'running' {
  if (!status || status === 'none') return 'none';
  if (status === 'running') return 'running';
  if (status === 'passed' || status === 'passed_with_warnings') return 'pass';
  if (status === 'failed') return 'fail';
  return 'none';
}

export function gatePassed(status: GateStatus | undefined): boolean {
  return status === 'passed' || status === 'passed_with_warnings';
}
