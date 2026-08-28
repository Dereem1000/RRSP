export type ClientPickerOption = {
  id: string;
  name: string;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  serviceLevel?: string | null;
  priorityLevel?: string | null;
  contactPerson?: string | null;
};

export const CLIENT_PICKER_ATTRIBUTES = [
  'id',
  'name',
  'companyName',
  'phone',
  'email',
  'address',
  'serviceLevel',
  'priorityLevel',
  'contactPerson',
] as const;

export function mapClientToPickerOption(client: {
  id: string;
  name: string;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  serviceLevel?: string | null;
  priorityLevel?: string | null;
  contactPerson?: string | null;
}): ClientPickerOption {
  return {
    id: client.id,
    name: client.name,
    companyName: client.companyName,
    phone: client.phone,
    email: client.email,
    address: client.address,
    serviceLevel: client.serviceLevel,
    priorityLevel: client.priorityLevel,
    contactPerson: client.contactPerson,
  };
}

export function ticketFormDefaultsFromClient(client?: ClientPickerOption | null) {
  if (!client) return {};
  return {
    clientContactNumber: client.phone?.trim() || '',
    subscription: client.serviceLevel?.trim() || '',
    priority: client.priorityLevel?.trim() || 'medium',
  };
}

/** Parse typed client search text into contact name and optional company. */
export function parseClientSearchQuery(query: string): { name: string; companyName?: string } {
  const q = query.trim();
  if (!q) return { name: '' };

  const sep = q.includes(' — ') ? ' — ' : q.includes(' - ') ? ' - ' : null;
  if (sep) {
    const [left, ...rest] = q.split(sep);
    const right = rest.join(sep).trim();
    if (left.trim() && right.trim()) {
      return { companyName: left.trim(), name: right.trim() };
    }
  }

  return { name: q };
}
