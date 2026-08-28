import { NoticeBoard, SystemConfig } from '@cd-v2/database';

const SYSTEM_AUTHOR_ID = 1;
const THROTTLE_MS = 10 * 60 * 1000;
const THROTTLE_KEY = 'email_failure_last_notice';

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error != null) return String(error);
  return 'Unknown error';
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

export async function notifyEmailSendFailure({
  to,
  subject,
  error,
  reason = 'send',
}: {
  to: string;
  subject: string;
  error?: unknown;
  reason?: 'send' | 'init';
}) {
  if (subject.startsWith('[TEST]')) return null;

  try {
    const lastNotice = await SystemConfig.getConfig<string>(THROTTLE_KEY, '');
    if (lastNotice) {
      const elapsed = Date.now() - new Date(lastNotice).getTime();
      if (!Number.isNaN(elapsed) && elapsed < THROTTLE_MS) return null;
    }

    const errorText = truncate(formatError(error), 500);
    const safeSubject = truncate(subject, 120);
    const safeTo = truncate(to, 120);

    const title = reason === 'init' ? 'Email service unavailable' : 'Email failed to send';
    const content =
      reason === 'init'
        ? `The system could not connect to the mail server. Outbound emails may be failing until this is resolved. Error: ${errorText}`
        : `Failed to send "${safeSubject}" to ${safeTo}. Error: ${errorText}`;

    return await NoticeBoard.create({
      title,
      content,
      authorId: SYSTEM_AUTHOR_ID,
      priority: 'high',
      category: 'system',
      targetAudience: 'admin',
      targetRoles: ['admin'],
      targetUsers: [],
      isPinned: false,
      isActive: true,
      publishAt: new Date(),
      attachments: [],
      tags: ['automated', 'email_send_failure'],
    }).then(async (notice) => {
      await SystemConfig.setConfig(THROTTLE_KEY, new Date().toISOString(), 'string', 'email');
      return notice;
    });
  } catch (noticeError) {
    console.error('[EMAIL FAILURE NOTICE]', noticeError);
    return null;
  }
}
