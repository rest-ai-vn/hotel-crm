import { describe, expect, test } from "bun:test";
import { buildResidenceCsv, RESIDENCE_HEADERS } from "./residence";

const row = {
  guest_name: "Nguyễn Văn A",
  id_number: "012345678901",
  id_type: "CCCD",
  nationality: "VN",
  address: "1 Lê Lợi, Đà Nẵng",
  phone: "0905123456",
  room_number: "108",
  check_in: "2026-08-15",
  check_out: "2026-08-16",
};

describe("buildResidenceCsv", () => {
  test("includes BOM, header row and data row", () => {
    const csv = buildResidenceCsv([row]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(RESIDENCE_HEADERS.join(","));
    expect(lines[1]).toContain("Nguyễn Văn A");
    expect(lines[1]).toContain("012345678901");
    expect(lines[1]).toContain("108");
  });

  test("escapes commas and quotes in values", () => {
    const csv = buildResidenceCsv([{ ...row, address: 'Số 1, đường "A"' }]);
    expect(csv).toContain('"Số 1, đường ""A"""');
  });

  test("null fields become empty cells", () => {
    const csv = buildResidenceCsv([{ ...row, id_number: null, phone: null }]);
    const dataLine = csv.slice(1).split("\r\n")[1]!;
    expect(dataLine.split(",").length).toBeGreaterThanOrEqual(RESIDENCE_HEADERS.length);
  });

  test("empty list still produces headers", () => {
    const csv = buildResidenceCsv([]);
    expect(csv.slice(1).trim()).toBe(RESIDENCE_HEADERS.join(","));
  });
});
