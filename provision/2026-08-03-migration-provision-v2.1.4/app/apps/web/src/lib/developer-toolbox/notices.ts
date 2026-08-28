import { NoticeBoard } from '@cd-v2/database';
import type { DevSlotConfig, DevToolboxAlert } from './types';

const SYSTEM_AUTHOR_ID = 1;

export async function publishDevToolboxAlertNotice(
  alert: DevToolboxAlert,
  slot: DevSlotConfig
): Promise<void> {
  try {
    const isDown = alert.level === 'error';
    const publicUrl = `https://${slot.hostname}`;

    const title = isDown ? `Dev server down: ${slot.label}` : `Dev server back online: ${slot.label}`;
    const content = isDown
      ? `${alert.message}. Public URL: ${publicUrl}. Confirm the app is running at ${slot.host}:${slot.port}, then check Developer Toolbox.`
      : `${alert.message}. ${publicUrl} is reachable again.`;

    await NoticeBoard.create({
      title,
      content,
      authorId: SYSTEM_AUTHOR_ID,
      priority: isDown ? 'high' : 'normal',
      category: 'system',
      targetAudience: 'admin',
      targetRoles: ['admin'],
      targetUsers: [],
      isPinned: false,
      isActive: true,
      publishAt: new Date(),
      attachments: [],
      tags: [
        'automated',
        'developer_toolbox',
        `dev_slot:${slot.id}`,
        isDown ? 'dev_server_down' : 'dev_server_up',
      ],
    });
  } catch (error) {
    console.error('[DEV TOOLBOX NOTICE]', error);
  }
}
