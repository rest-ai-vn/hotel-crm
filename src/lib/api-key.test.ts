import { describe, expect, test } from "bun:test";
import {
  generateApiKey,
  hasScope,
  hashApiKey,
  isApiKeyFormat,
  maskApiKey,
  parseScopes,
} from "./api-key";

describe("api-key", () => {
  test("sinh key có tiền tố hk_ và không trùng nhau", () => {
    const first = generateApiKey();
    const second = generateApiKey();
    expect(first.key.startsWith("hk_")).toBe(true);
    expect(first.key).not.toBe(second.key);
    expect(first.hash).not.toBe(second.hash);
  });

  test("prefix là 10 ký tự đầu của bản rõ", () => {
    const generated = generateApiKey();
    expect(generated.prefix).toBe(generated.key.slice(0, 10));
    expect(generated.prefix.length).toBe(10);
  });

  test("hash ổn định, bỏ khoảng trắng thừa, không chứa bản rõ", () => {
    const generated = generateApiKey();
    expect(hashApiKey(generated.key)).toBe(generated.hash);
    expect(hashApiKey(`  ${generated.key}  `)).toBe(generated.hash);
    expect(generated.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.hash.includes(generated.key)).toBe(false);
  });

  test("maskApiKey chỉ lộ phần prefix", () => {
    const generated = generateApiKey();
    const masked = maskApiKey(generated.prefix);
    expect(masked).toBe(`${generated.prefix}…`);
    expect(masked.length).toBeLessThan(generated.key.length);
  });

  test("isApiKeyFormat loại chuỗi lạ", () => {
    expect(isApiKeyFormat(generateApiKey().key)).toBe(true);
    expect(isApiKeyFormat("Bearer abc")).toBe(false);
    expect(isApiKeyFormat("hk_short")).toBe(false);
  });

  test("parseScopes lọc giá trị lạ và mặc định về read", () => {
    expect(parseScopes(["read", "book"])).toEqual(["read", "book"]);
    expect(parseScopes(["book", "book"])).toEqual(["book"]);
    expect(parseScopes(["delete_everything"])).toEqual(["read"]);
    expect(parseScopes(undefined)).toEqual(["read"]);
    expect(parseScopes("read")).toEqual(["read"]);
  });

  test("hasScope", () => {
    expect(hasScope(["read"], "read")).toBe(true);
    expect(hasScope(["read"], "book")).toBe(false);
    expect(hasScope(["read", "book"], "book")).toBe(true);
  });
});
