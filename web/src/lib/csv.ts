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
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function xmlEsc(v: string | number | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Excel file via SpreadsheetML (.xls) — native Excel format, no encoding
 * issues, numbers stay numbers. (Not a zipped .xlsx container, but Excel
 * opens it identically.)
 */
export function downloadExcel(
  filename: string,
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): void {
  const headerRow =
    "<Row>" +
    headers
      .map((h) => `<Cell ss:StyleID="hd"><Data ss:Type="String">${xmlEsc(h)}</Data></Cell>`)
      .join("") +
    "</Row>";
  const bodyRows = rows
    .map(
      (r) =>
        "<Row>" +
        r
          .map((v) =>
            typeof v === "number"
              ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
              : `<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`,
          )
          .join("") +
        "</Row>",
    )
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="hd"><Font ss:Bold="1"/></Style></Styles>
<Worksheet ss:Name="Sheet1"><Table>${headerRow}${bodyRows}</Table></Worksheet>
</Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  triggerDownload(blob, filename.endsWith(".xls") ? filename : `${filename}.xls`);
}
