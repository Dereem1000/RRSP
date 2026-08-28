export interface TokenPayload {
  id: number;
  role: string;
  clearance?: string;
  username?: string;
}

export type ApiContext = {
  method: string;
  /** Path relative to the domain router mount, e.g. `/ai-status` under `/api/security`. */
  path: string;
  /** Full request path, e.g. `/api/auth/login`. */
  urlPath: string;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  session: TokenPayload | null;
  header(name: string): string | undefined;
  formData?: FormData;
  cookies?: Record<string, string>;
};

export type ApiCookie = {
  name: string;
  value: string;
  httpOnly?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  /** Milliseconds (Express `res.cookie` convention). */
  maxAge?: number;
};

export type ApiResult = {
  status: number;
  body: unknown;
  cookies?: ApiCookie[];
  /** When set, response is sent as raw bytes/text instead of JSON. */
  rawBody?: string | Buffer;
  headers?: Record<string, string>;
};

export type ApiHandler = (ctx: ApiContext) => Promise<ApiResult>;
