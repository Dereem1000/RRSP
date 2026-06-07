import { NoticeBoard, SystemConfig } from '@cd-v2/database';
import { Op } from 'sequelize';

const SYSTEM_AUTHOR_ID = 1;

type NoticeTemplate = {
  title: string;
  content: string;
  priority: NoticeBoard['priority'];
  category: string;
  targetRoles: string[];
};

const templates: Record<string, NoticeTemplate> = {
  new_ticket_created: {
    title: 'New Ticket Created',
    content: 'New ticket #{ticketNumber}: "{title}" for {clientName}. Priority: {priority}. Created by: {createdBy}.',
    priority: 'normal',
    category: 'work',
    targetRoles: ['admin', 'technician'],
  },
  new_ticket_assignment: {
    title: 'New Ticket Assignment',
    content: 'You have been assigned ticket #{ticketNumber}: "{title}". Priority: {priority}.',
    priority: 'normal',
    category: 'work',
    targetRoles: ['technician'],
  },
  ticket_status_update: {
    title: 'Ticket Status Update',
    content: 'Ticket #{ticketNumber} status updated to "{status}". Updated by: {updatedBy}.',
    priority: 'normal',
    category: 'work',
    targetRoles: ['admin', 'technician', 'client'],
  },
  ticket_escalation: {
    title: 'Ticket Escalation',
    content: 'Ticket #{ticketNumber}: "{title}" escalated. Reason: {reason}. By: {escalatedBy}.',
    priority: 'high',
    category: 'work',
    targetRoles: ['admin', 'technician'],
  },
};

function fillTemplate(template: string, data: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] ?? '');
}

export async function isNoticeEnabled(type: 'create' | 'assign' | 'status') {
  const key =
    type === 'create'
      ? 'ticket_notice_on_create'
      : type === 'assign'
        ? 'ticket_notice_on_assign'
        : 'ticket_notice_on_status';
  const val = await SystemConfig.getConfig<boolean>(key, true);
  return val !== false;
}

export async function createAutomatedNotice(
  noticeType: keyof typeof templates,
  data: Record<string, string>,
  options: {
    targetRoles?: string[];
    authorId?: number;
    targetAudience?: NoticeBoard['targetAudience'];
    clientId?: string | null;
  } = {}
) {
  const template = templates[noticeType];
  if (!template) return null;

  const tags: string[] = ['automated', noticeType];
  if (options.clientId) tags.push(`client:${options.clientId}`);

  try {
    return await NoticeBoard.create({
      title: fillTemplate(template.title, data),
      content: fillTemplate(template.content, data),
      authorId: options.authorId ?? SYSTEM_AUTHOR_ID,
      priority: template.priority,
      category: template.category,
      targetAudience: (options.targetAudience as NoticeBoard['targetAudience']) ?? 'all',
      targetRoles: options.targetRoles ?? template.targetRoles,
      targetUsers: [],
      isPinned: false,
      isActive: true,
      publishAt: new Date(),
      attachments: [],
      tags,
    });
  } catch (error) {
    console.error('[NOTICE] Failed to create notice:', error);
    return null;
  }
}

export async function getRecentNotices(
  role: string,
  limit = 5,
  scope?: { userId?: number; clientId?: string | null }
) {
  try {
    const now = new Date();

    if (role === 'client') {
      if (!scope?.clientId) return [];

      return await NoticeBoard.findAll({
        where: {
          isActive: true,
          publishAt: { [Op.lte]: now },
          [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }],
          tags: { [Op.like]: `%"client:${scope.clientId}"%` },
        },
        order: [
          ['isPinned', 'DESC'],
          ['publishAt', 'DESC'],
        ],
        limit,
      });
    }

    const audiences =
      role === 'technician' ? ['all', 'technician', 'admin'] : ['all', 'admin', 'technician'];

    return await NoticeBoard.findAll({
      where: {
        isActive: true,
        publishAt: { [Op.lte]: now },
        targetAudience: { [Op.in]: audiences },
        [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }],
      },
      order: [
        ['isPinned', 'DESC'],
        ['publishAt', 'DESC'],
      ],
      limit,
    });
  } catch {
    return [];
  }
}
