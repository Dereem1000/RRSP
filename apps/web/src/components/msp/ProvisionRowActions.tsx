'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  FileText,
  HardDriveDownload,
  Loader2,
  Package,
  XCircle,
} from 'lucide-react';
import type { ActivationFeature } from '@/lib/license-constants';
import type { GateStatus } from '@/lib/management-systems-shared';
import { buildProvisionDeepLink, gatePassed, gateStatusIcon } from '@/lib/management-system-provision';
import { ProvisionGateChecklistModal } from '@/components/msp/ProvisionGateChecklistModal';

type RowActionsProps = {
  clientId: string;
  clientName: string;
  feature: ActivationFeature;
  projectRoot: string;
  provisionStatus?: GateStatus;
  installStatus?: GateStatus;
  deliverableStatus?: 'none' | 'draft' | 'sent';
  provisionRunId?: string;
  installRunId?: string;
  provisionAt?: string;
  installAt?: string;
  onOpenDeliverable: () => void;
};

function StatusIcon({
  status,
  title,
  onClick,
}: {
  status: GateStatus | undefined;
  title: string;
  onClick?: () => void;
}) {
  const kind = gateStatusIcon(status);
  if (kind === 'none') return null;

  const clickable = Boolean(onClick) && (kind === 'pass' || kind === 'fail');
  const className = clickable
    ? 'cursor-pointer rounded p-0.5 hover:bg-slate-100'
    : undefined;
  const actionProps = clickable
    ? {
        type: 'button' as const,
        onClick,
        title: `View ${title} checklist`,
      }
    : { title: `${title}: ${kind}` };

  const inner =
    kind === 'running' ? (
      <Loader2 className="h-4 w-4 animate-spin text-amber-500" aria-label={`${title}: running`} />
    ) : kind === 'pass' ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label={`${title}: passed`} />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" aria-label={`${title}: failed`} />
    );

  if (clickable) {
    return (
      <button className={className} {...actionProps}>
        {inner}
      </button>
    );
  }

  return <span className={className}>{inner}</span>;
}

export function ProvisionRowActions({
  clientId,
  clientName,
  feature,
  projectRoot,
  provisionStatus,
  installStatus,
  deliverableStatus,
  provisionRunId,
  installRunId,
  provisionAt,
  installAt,
  onOpenDeliverable,
}: RowActionsProps) {
  const [checklistGate, setChecklistGate] = useState<'provision' | 'install' | null>(null);

  const canDeliverable = gatePassed(provisionStatus);
  const provisionHref = buildProvisionDeepLink({
    clientId,
    feature,
    customerName: clientName,
    projectRoot,
    phase: 'Complete',
  });
  const installHref = buildProvisionDeepLink({
    clientId,
    feature,
    customerName: clientName,
    projectRoot,
    phase: 'Install',
  });

  const activeGate = checklistGate;
  const activeStatus = activeGate === 'install' ? installStatus : provisionStatus;
  const activeRunId = activeGate === 'install' ? installRunId : provisionRunId;
  const activeAt = activeGate === 'install' ? installAt : provisionAt;

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <StatusIcon
          status={provisionStatus}
          title="Provision"
          onClick={
            gateStatusIcon(provisionStatus) === 'pass' || gateStatusIcon(provisionStatus) === 'fail'
              ? () => setChecklistGate('provision')
              : undefined
          }
        />
        <StatusIcon
          status={installStatus}
          title="Install"
          onClick={
            gateStatusIcon(installStatus) === 'pass' || gateStatusIcon(installStatus) === 'fail'
              ? () => setChecklistGate('install')
              : undefined
          }
        />
        {deliverableStatus === 'sent' && (
          <span title="Deliverable sent">
            <FileText className="h-4 w-4 text-indigo-500" aria-label="Deliverable sent" />
          </span>
        )}
        <Link
          href={provisionHref}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          title="Run provision gate"
        >
          <Package className="h-3.5 w-3.5" />
          Provision
        </Link>
        <button
          type="button"
          onClick={onOpenDeliverable}
          disabled={!canDeliverable}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          title={canDeliverable ? 'Edit deliverable' : 'Complete provision gate first'}
        >
          <FileText className="h-4 w-4" />
        </button>
        <Link
          href={installHref}
          className={`rounded-lg p-1 hover:bg-slate-100 ${
            gatePassed(installStatus) ? 'text-emerald-600' : 'text-slate-500'
          }`}
          title="Run install gate"
        >
          {gatePassed(installStatus) ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <HardDriveDownload className="h-4 w-4" />
          )}
        </Link>
      </div>

      {activeGate && activeStatus && (
        <ProvisionGateChecklistModal
          open
          onClose={() => setChecklistGate(null)}
          gate={activeGate}
          clientName={clientName}
          status={activeStatus}
          projectRoot={projectRoot}
          runId={activeRunId}
          completedAt={activeAt}
        />
      )}
    </>
  );
}
