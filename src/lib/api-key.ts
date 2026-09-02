// API key cho tích hợp AI: sinh — băm — che. Key là chuỗi ngẫu nhiên 256-bit nên
// SHA-256 là đủ (không cần bcrypt: không có entropy thấp để brute-force).
import { createHash, randomBytes } from "node:crypto";

export const API_KEY_SCOPES = ["read", "book"] as const;
export type ApiScope = (typeof API_KEY_SCOPES)[number];

const KEY_PREFIX = "hk_";
const PREFIX_LENGTH = 10; // "hk_" + 7 ký tự — đủ để nhận diện, không đủ để đoán

export interface GeneratedApiKey {
  /** Bản rõ — chỉ trả về đúng một lần, không bao giờ lưu. */
  key: string;
  prefix: string;
  hash: string;
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey.trim()).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const rawKey = KEY_PREFIX + randomBytes(32).toString("base64url");
  return {
    key: rawKey,
    prefix: rawKey.slice(0, PREFIX_LENGTH),
    hash: hashApiKey(rawKey),
  };
}

/** Hiển thị an toàn trên UI/nhật ký: "hk_AbCdEfG…". */
export function maskApiKey(prefix: string): string {
  return `${prefix}…`;
}

export function isApiKeyFormat(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length >= 20;
}

export function parseScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return ["read"];
  const kept = input.filter((s): s is ApiScope =>
    (API_KEY_SCOPES as readonly string[]).includes(s as string),
  );
  return kept.length > 0 ? [...new Set(kept)] : ["read"];
}

export function hasScope(granted: readonly string[], required: ApiScope): boolean {
  return granted.includes(required);
}
