export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { total: number | null; limit: number; offset: number };
  created?: boolean;
}
export interface ApiError {
  success: false;
  error: string;
  issues?: Array<{ path: string; message: string }>;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

const TOKEN_KEY = "hotel_crm_token";

export function getToken(): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiHttpError extends Error {
  status: number;
  issues?: Array<{ path: string; message: string }>;
  constructor(status: number, message: string, issues?: Array<{ path: string; message: string }>) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

interface RequestInitJson extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  if (!query) return path;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "") continue;
    search.set(k, String(v));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

async function rawFetch<T>(path: string, init: RequestInitJson): Promise<ApiSuccess<T>> {
  const { body, query, headers, ...rest } = init;
  const token = getToken();
  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers ?? {}),
  };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path, query), {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    /* non-JSON */
  }

  if (!res.ok || !payload || payload.success === false) {
    const message =
      payload && "error" in payload ? payload.error : `HTTP ${res.status}`;
    const issues = payload && "issues" in payload ? payload.issues : undefined;
    throw new ApiHttpError(res.status, message, issues);
  }
  return payload;
}

export async function apiFetch<T>(path: string, init: RequestInitJson = {}): Promise<T> {
  const env = await rawFetch<T>(path, init);
  return env.data;
}

export async function apiFetchEnvelope<T>(
  path: string,
  init: RequestInitJson = {},
): Promise<ApiSuccess<T>> {
  return rawFetch<T>(path, init);
}
