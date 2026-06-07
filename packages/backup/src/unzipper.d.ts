declare module 'unzipper' {
  import { Readable } from 'stream';

  export interface ZipEntry {
    path: string;
    buffer(): Promise<Buffer>;
  }

  export interface Directory {
    files: ZipEntry[];
  }

  export namespace Open {
    function file(path: string): Promise<Directory>;
  }

  export function Extract(options: { path: string }): NodeJS.WritableStream;
}
