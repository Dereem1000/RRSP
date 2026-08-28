declare module 'mailparser' {
  export interface ParsedMail {
    subject?: string;
    text?: string;
    html?: string | { toString(): string };
    from?: { text?: string };
  }

  export function simpleParser(source: Buffer | string): Promise<ParsedMail>;
}
