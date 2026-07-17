import { requireStaffUser } from '@/lib/session';
import { CalendarPageClient } from '@/components/calendar/CalendarPageClient';

export default async function CalendarPage() {
  await requireStaffUser();
  return <CalendarPageClient />;
}
