import net from 'net';

export function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => {
      server.close(() => resolve(true));
    });
  });
}

export async function isShowcaseOnPort(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const body = await res.json();
    if (body.success !== true) return false;
    if (body.showcase === true) return true;
    if (typeof body.database === 'string' && /showcase/i.test(body.database)) return true;
    return false;
  } catch {
    return false;
  }
}

/** Prefer 3001 (tunnel default); scan upward if busy. */
export async function pickShowcasePort(start = 3001, end = 3010) {
  for (let port = start; port <= end; port += 1) {
    if (await isShowcaseOnPort(port)) {
      return { port, alreadyRunning: true };
    }
    if (await isPortFree(port)) {
      return { port, alreadyRunning: false };
    }
  }
  throw new Error(`No free showcase port between ${start} and ${end}`);
}
