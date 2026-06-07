import { NoticeBoard } from '@cd-v2/database';

const SYSTEM_AUTHOR_ID = 1;

type OrderNoticeData = Record<string, string>;

async function createOrderNotice(
  title: string,
  content: string,
  options?: { priority?: 'low' | 'normal' | 'high' | 'urgent'; targetRoles?: string[] }
) {
  try {
    return await NoticeBoard.create({
      title,
      content,
      authorId: SYSTEM_AUTHOR_ID,
      priority: options?.priority ?? 'normal',
      category: 'orders',
      targetAudience: 'admin',
      targetRoles: options?.targetRoles ?? ['admin', 'technician'],
      targetUsers: [],
      isPinned: false,
      isActive: true,
      publishAt: new Date(),
      attachments: [],
      tags: ['automated', 'orders'],
    });
  } catch (error) {
    console.error('[ORDER NOTICE]', error);
    return null;
  }
}

export async function createNewOrderNotice(data: OrderNoticeData) {
  return createOrderNotice(
    `New order ${data.orderNumber}`,
    `New order #${data.orderNumber}: "${data.title}" (${data.itemName}) for ${data.clientName}. Cost: ${data.costPrice}. Created by ${data.createdBy}.`,
    { priority: 'normal' }
  );
}

export async function createOrderStatusUpdateNotice(data: OrderNoticeData & { previousStatus: string }) {
  return createOrderNotice(
    `Order ${data.orderNumber} status updated`,
    `Order #${data.orderNumber} "${data.title}" changed from ${data.previousStatus} to ${data.status} for ${data.clientName}.`,
    { priority: 'normal' }
  );
}

export async function createOrderArrivedNotice(data: OrderNoticeData) {
  return createOrderNotice(
    `Order ${data.orderNumber} arrived`,
    `Order #${data.orderNumber} "${data.title}" (${data.itemName}) has arrived for ${data.clientName}.`,
    { priority: 'high' }
  );
}

export async function createOrderNotPreAlertedNotice(data: OrderNoticeData) {
  return createOrderNotice(
    `Pre-alert needed: ${data.orderNumber}`,
    `Order #${data.orderNumber} "${data.title}" for ${data.clientName} has not been logged in pre-alerts. Created by ${data.createdBy}.`,
    { priority: 'high' }
  );
}

function fill(template: string, data: OrderNoticeData) {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] ?? '');
}

export { fill as fillOrderNoticeTemplate };