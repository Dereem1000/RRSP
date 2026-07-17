/** Map API request body fields to client create/update payload (v1-compatible). */
import { normalizeStoredPhone } from '@/lib/phone-utils';

export function pickClientFields(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};

  const scalarFields = [
    'name',
    'companyName',
    'email',
    'phone',
    'address',
    'contactPerson',
    'serviceLevel',
    'supportTier',
    'status',
    'notes',
    'priorityLevel',
    'assignedTechnicianId',
  ] as const;

  for (const field of scalarFields) {
    if (body[field] !== undefined) {
      if (field === 'phone') {
        payload[field] = normalizeStoredPhone(String(body[field] ?? ''));
      } else {
        payload[field] = body[field] === '' ? null : body[field];
      }
    }
  }

  const dateFields = ['startDate', 'endDate', 'contractStartDate', 'contractEndDate', 'renewalDate'] as const;
  for (const field of dateFields) {
    if (body[field] !== undefined) {
      payload[field] = body[field] === '' || body[field] === null ? null : body[field];
    }
  }

  if (body.monthlyRate !== undefined && body.monthlyRate !== '') {
    payload.monthlyRate = body.monthlyRate === null ? 0 : Number(body.monthlyRate);
  }

  if (body.isActive !== undefined) {
    payload.isActive = Boolean(body.isActive);
  }

  const jsonFields = ['billingInfo', 'contractDetails', 'usageTracking', 'features', 'servicePlanData', 'slaAgreement'] as const;
  for (const field of jsonFields) {
    if (body[field] !== undefined) payload[field] = body[field];
  }

  return payload;
}
