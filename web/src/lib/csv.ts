// CSV download helper (UTF-8 BOM + CRLF so Excel opens Vietnamese correctly).

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(
  filename: string,
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): void {
  const lines = [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
