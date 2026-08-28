const GUARD_KEY = '__cdClientDisconnectGuardsInstalled';

function isBenignConnectionDrop(error: unknown): boolean {
  if (!(error instanceof Error)) {
    if (typeof error === 'string') {
      const text = error.toLowerCase();
      return text.includes('aborted') || text.includes('econnreset');
    }
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  if (
    code === 'ECONNRESET'
    || code === 'ECONNABORTED'
    || code === 'ERR_STREAM_PREMATURE_CLOSE'
    || code === 'EPIPE'
  ) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === 'AbortError'
    || message === 'aborted'
    || message.includes('aborted')
    || message.includes('econnreset')
    || message.includes('socket hang up')
  );
}

/** Next.js logs client disconnects as uncaughtException before route handlers can catch them. */
export function installClientDisconnectGuards(): void {
  const g = globalThis as typeof globalThis & { [GUARD_KEY]?: boolean };
  if (g[GUARD_KEY]) return;
  g[GUARD_KEY] = true;

  process.on('uncaughtException', (error) => {
    if (!isBenignConnectionDrop(error)) {
      console.error('[web] uncaughtException:', error);
    }
  });

  process.on('unhandledRejection', (reason) => {
    if (!isBenignConnectionDrop(reason)) {
      console.error('[web] unhandledRejection:', reason);
    }
  });

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map((arg) => {
      if (arg instanceof Error) return `${arg.name}: ${arg.message} ${(arg as NodeJS.ErrnoException).code || ''}`;
      return String(arg);
    }).join(' ');

    if (
      /uncaughtException/i.test(text)
      && /aborted|ECONNRESET|ECONNABORTED|socket hang up/i.test(text)
    ) {
      return;
    }

    if (/^\[Error: aborted\]/i.test(text) && /ECONNRESET/i.test(text)) {
      return;
    }

    originalConsoleError(...args);
  };
}
