// Residence-declaration CSV (khai báo lưu trú) — pure, no I/O.
// Columns follow the common ASM/dichvucong upload template for accommodation.

export interface ResidenceRow {
  guest_name: string;
  id_number: string | null;
  id_type: string | null;
  nationality: string | null;
  address: string | null;
  phone: string | null;
  room_number: string | null;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
}

export const RESIDENCE_HEADERS = [
  "Họ và tên",
  "Loại giấy tờ",
  "Số giấy tờ",
  "Quốc tịch",
  "Địa chỉ thường trú",
  "Số điện thoại",
  "Số phòng",
  "Ngày đến",
  "Ngày đi (dự kiến)",
] as const;

function csvCell(value: string | null | undefined): string {
  const s = value ?? "";
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** UTF-8 BOM + CRLF CSV so Excel opens Vietnamese text correctly. */
export function buildResidenceCsv(rows: ReadonlyArray<ResidenceRow>): string {
  const lines: string[] = [RESIDENCE_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.guest_name),
        csvCell(r.id_type),
        csvCell(r.id_number),
        csvCell(r.nationality),
        csvCell(r.address),
        csvCell(r.phone),
        csvCell(r.room_number),
        csvCell(r.check_in),
        csvCell(r.check_out),
      ].join(","),
    );
  }
  return `﻿${lines.join("\r\n")}`;
}
