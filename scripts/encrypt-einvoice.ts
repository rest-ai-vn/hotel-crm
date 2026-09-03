#!/usr/bin/env bun
// Mã hóa các mật khẩu API hóa đơn điện tử đang còn nằm dạng plaintext trong CSDL.
// Chạy MỘT LẦN sau khi đặt EINVOICE_ENCRYPTION_KEY, và chạy lại bao nhiêu lần
// cũng không sao — dòng nào đã có tiền tố "enc:v1:" thì bỏ qua.
//
// Chạy:  EINVOICE_ENCRYPTION_KEY=... bun run einvoice:encrypt
//        thêm DRY_RUN=1 để chỉ xem sẽ đụng vào những gì, không ghi.
//
// Script KHÔNG in giá trị bí mật ra màn hình, chỉ in mã cơ sở.
import { getServerDb } from "../src/db/supabase-client";
import { encryptSecret, isEncrypted, isEncryptionConfigured } from "../src/lib/crypto";

const DRY_RUN = process.env.DRY_RUN === "1";

interface PropertyRow {
  id: string;
  code: string;
  einvoice_password: string | null;
}

async function main(): Promise<void> {
  if (!isEncryptionConfigured()) {
    throw new Error(
      "Chưa đặt EINVOICE_ENCRYPTION_KEY (tối thiểu 32 ký tự). " +
        "Sinh chuỗi ngẫu nhiên: openssl rand -base64 48",
    );
  }

  const db = getServerDb();
  const { data, error } = await db
    .from("properties")
    .select("id, code, einvoice_password")
    .order("created_at");
  if (error) throw new Error(`Không đọc được danh sách cơ sở: ${error.message}`);

  const rows = (data ?? []) as PropertyRow[];
  const plaintext = rows.filter((r) => r.einvoice_password && !isEncrypted(r.einvoice_password));
  const already = rows.filter((r) => isEncrypted(r.einvoice_password));
  const empty = rows.length - plaintext.length - already.length;

  console.log(
    `Tổng ${rows.length} cơ sở: ${plaintext.length} cần mã hóa · ` +
      `${already.length} đã mã hóa · ${empty} chưa đặt mật khẩu`,
  );

  if (plaintext.length === 0) {
    console.log("Không có gì phải làm.");
    return;
  }
  if (DRY_RUN) {
    console.log("DRY_RUN=1 — sẽ mã hóa các cơ sở:", plaintext.map((r) => r.code).join(", "));
    return;
  }

  let done = 0;
  for (const row of plaintext) {
    const { error: updateErr } = await db
      .from("properties")
      .update({ einvoice_password: encryptSecret(row.einvoice_password) })
      .eq("id", row.id);
    if (updateErr) {
      console.error(`✗ ${row.code}: ${updateErr.message}`);
      continue;
    }
    done += 1;
    console.log(`✓ ${row.code}`);
  }

  console.log(`\nĐã mã hóa ${done}/${plaintext.length} cơ sở.`);
  if (done < plaintext.length) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
