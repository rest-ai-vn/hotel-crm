// Mã hóa bí mật của TENANT khi lưu trong CSDL — hiện dùng cho mật khẩu API hóa
// đơn điện tử. Đây là khóa phát hành hóa đơn dưới danh nghĩa công ty khách hàng,
// nên đọc được CSDL không được đồng nghĩa với xuất hóa đơn thay họ.
//
// Định dạng: "enc:v1:" + base64(iv[12] | authTag[16] | ciphertext), AES-256-GCM.
// Tiền tố phiên bản để (a) phân biệt với giá trị plaintext còn sót từ trước,
// (b) sau này đổi thuật toán mà vẫn đọc được dữ liệu cũ.
//
// KHÁC với hotel-bot-template: ở đó thiếu khóa thì lùi về một khóa mặc định
// công khai kèm cảnh báo, vì nó là template phải chạy được ngay. Ở đây ta giữ
// bí mật của bên thứ ba, nên mã hóa bằng khóa ai cũng biết còn tệ hơn không mã
// hóa — nó tạo cảm giác an toàn giả. Thiếu khóa thì TỪ CHỐI ghi.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const IV_LEN = 12;
const TAG_LEN = 16;
const MIN_PASSPHRASE_LEN = 32;

export class EncryptionKeyMissing extends Error {
  constructor() {
    super(
      "Chưa cấu hình EINVOICE_ENCRYPTION_KEY (tối thiểu 32 ký tự) — " +
        "không thể lưu bí mật của cơ sở khi chưa có khóa mã hóa",
    );
    this.name = "EncryptionKeyMissing";
  }
}

/** Khóa 32 byte dẫn xuất từ passphrase trong biến môi trường. */
function keyBuffer(): Buffer {
  const passphrase = process.env.EINVOICE_ENCRYPTION_KEY ?? "";
  if (passphrase.length < MIN_PASSPHRASE_LEN) throw new EncryptionKeyMissing();
  return createHash("sha256").update(passphrase).digest();
}

export function isEncryptionConfigured(): boolean {
  return (process.env.EINVOICE_ENCRYPTION_KEY ?? "").length >= MIN_PASSPHRASE_LEN;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Mã hóa để lưu. Trả null cho đầu vào rỗng.
 * Ném EncryptionKeyMissing nếu chưa cấu hình khóa — cố ý, để không bao giờ ghi
 * plaintext xuống CSDL một cách âm thầm.
 */
export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  if (isEncrypted(plaintext)) return plaintext; // đã mã hóa rồi, không bọc hai lần
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/**
 * Giải mã giá trị lấy từ CSDL.
 * - Giá trị không có tiền tố = plaintext còn sót từ trước khi có mã hóa → trả
 *   nguyên văn, để hệ thống vẫn chạy trong lúc chưa chuyển đổi xong.
 * - Sai khóa hoặc dữ liệu bị sửa → null (GCM phát hiện được), KHÔNG ném, để một
 *   bản ghi hỏng không làm sập luồng phát hành hóa đơn của cơ sở khác.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncrypted(stored)) return stored;
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const d = createDecipheriv("aes-256-gcm", keyBuffer(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
