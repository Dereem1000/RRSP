declare module 'imap' {
  import { EventEmitter } from 'events';

  interface ImapConfig {
    user: string;
    password: string;
    host: string;
    port?: number;
    tls?: boolean;
    tlsOptions?: Record<string, unknown>;
  }

  interface ImapMessage {
    on(event: 'body', listener: (stream: NodeJS.ReadableStream) => void): this;
  }

  interface ImapFetch extends EventEmitter {
    on(event: 'message', listener: (msg: ImapMessage) => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'end', listener: () => void): this;
  }

  class Connection extends EventEmitter {
    constructor(config: ImapConfig);
    connect(): void;
    end(): void;
    openBox(
      mailbox: string,
      readOnly: boolean,
      callback: (err: Error | null, box?: unknown) => void
    ): void;
    search(criteria: string[], callback: (err: Error | null, results?: number[]) => void): void;
    fetch(source: number | number[], options: { bodies: string }): ImapFetch;
  }

  export = Connection;
}
