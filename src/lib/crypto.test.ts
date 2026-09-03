import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  EncryptionKeyMissing,
  decryptSecret,
  encryptSecret,
  isEncrypted,
  isEncryptionConfigured,
} from "./crypto";

const KEY = "khoa-thu-nghiem-dai-hon-32-ky-tu-abcdef";
const OTHER_KEY = "mot-khoa-khac-cung-dai-hon-32-ky-tu-xyz";
const SECRET = "mat-khau-api-viettel";

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.EINVOICE_ENCRYPTION_KEY;
  process.env.EINVOICE_ENCRYPTION_KEY = KEY;
});

afterEach(() => {
  if (saved === undefined) delete process.env.EINVOICE_ENCRYPTION_KEY;
  else process.env.EINVOICE_ENCRYPTION_KEY = saved;
});

describe("mã hóa / giải mã", () => {
  test("đi một vòng ra đúng chuỗi ban đầu", () => {
    const stored = encryptSecret(SECRET);
    expect(decryptSecret(stored)).toBe(SECRET);
  });

  test("bản mã không chứa bản rõ và có tiền tố phiên bản", () => {
    const stored = encryptSecret(SECRET)!;
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(stored.includes(SECRET)).toBe(false);
    expect(isEncrypted(stored)).toBe(true);
  });

  test("mã hai lần cùng một bí mật cho hai bản mã khác nhau (IV ngẫu nhiên)", () => {
    expect(encryptSecret(SECRET)).not.toBe(encryptSecret(SECRET));
  });

  test("giữ được dấu tiếng Việt và ký tự đặc biệt", () => {
    const tricky = "Mật khẩu #1 @Viettel — ký tự lạ: %$&";
    expect(decryptSecret(encryptSecret(tricky))).toBe(tricky);
  });

  test("đầu vào rỗng trả null", () => {
    expect(encryptSecret("")).toBeNull();
    expect(encryptSecret(null)).toBeNull();
    expect(encryptSecret(undefined)).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });

  test("không bọc hai lần khi đã mã hóa", () => {
    const once = encryptSecret(SECRET)!;
    expect(encryptSecret(once)).toBe(once);
  });
});

describe("giá trị plaintext còn sót từ trước", () => {
  test("không có tiền tố thì trả nguyên văn, hệ thống vẫn chạy", () => {
    expect(decryptSecret("mat-khau-cu-chua-ma-hoa")).toBe("mat-khau-cu-chua-ma-hoa");
    expect(isEncrypted("mat-khau-cu-chua-ma-hoa")).toBe(false);
  });
});

describe("sai khóa hoặc dữ liệu bị sửa", () => {
  test("sai khóa trả null chứ không ném lỗi", () => {
    const stored = encryptSecret(SECRET);
    process.env.EINVOICE_ENCRYPTION_KEY = OTHER_KEY;
    expect(decryptSecret(stored)).toBeNull();
  });

  test("bản mã bị sửa bị GCM phát hiện", () => {
    const stored = encryptSecret(SECRET)!;
    const body = stored.slice("enc:v1:".length);
    const flipped = (body[5] === "A" ? "B" : "A") as string;
    const tampered = "enc:v1:" + body.slice(0, 5) + flipped + body.slice(6);
    expect(decryptSecret(tampered)).toBeNull();
  });
});

describe("thiếu khóa mã hóa", () => {
  test("từ chối ghi thay vì âm thầm lưu plaintext", () => {
    delete process.env.EINVOICE_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret(SECRET)).toThrow(EncryptionKeyMissing);
  });

  test("khóa quá ngắn cũng bị từ chối", () => {
    process.env.EINVOICE_ENCRYPTION_KEY = "ngan-qua";
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret(SECRET)).toThrow(EncryptionKeyMissing);
  });

  test("vẫn đọc được plaintext cũ khi chưa có khóa", () => {
    delete process.env.EINVOICE_ENCRYPTION_KEY;
    expect(decryptSecret("mat-khau-cu")).toBe("mat-khau-cu");
  });
});
