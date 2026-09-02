import { describe, expect, test } from "bun:test";
import {
  addDaysIso,
  daysBetweenIso,
  isIsoDate,
  stayEndExclusive,
  staysOverlap,
} from "./availability";

describe("availability date helpers", () => {
  test("addDaysIso qua mốc tháng và năm", () => {
    expect(addDaysIso("2026-09-10", 1)).toBe("2026-09-11");
    expect(addDaysIso("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("daysBetweenIso", () => {
    expect(daysBetweenIso("2026-09-10", "2026-09-13")).toBe(3);
    expect(daysBetweenIso("2026-09-10", "2026-09-10")).toBe(0);
    expect(daysBetweenIso("2026-12-30", "2027-01-02")).toBe(3);
  });

  test("isIsoDate", () => {
    expect(isIsoDate("2026-09-10")).toBe(true);
    expect(isIsoDate("10/09/2026")).toBe(false);
    expect(isIsoDate("2026-9-1")).toBe(false);
  });
});

describe("stayEndExclusive", () => {
  test("qua đêm giữ nguyên ngày trả phòng", () => {
    expect(stayEndExclusive({ check_in: "2026-09-10", check_out: "2026-09-13" })).toBe(
      "2026-09-13",
    );
  });

  test("đặt theo giờ/theo ngày chiếm đúng một ngày", () => {
    expect(stayEndExclusive({ check_in: "2026-09-10", check_out: "2026-09-10" })).toBe(
      "2026-09-11",
    );
  });
});

describe("staysOverlap (nửa mở, khớp ràng buộc DB)", () => {
  const stay = { check_in: "2026-09-10", check_out: "2026-09-13" };

  test("khách trả phòng đúng ngày mình nhận thì KHÔNG chồng lấn", () => {
    expect(staysOverlap(stay, { check_in: "2026-09-07", check_out: "2026-09-10" })).toBe(false);
  });

  test("khách nhận phòng đúng ngày mình trả thì KHÔNG chồng lấn", () => {
    expect(staysOverlap(stay, { check_in: "2026-09-13", check_out: "2026-09-15" })).toBe(false);
  });

  test("chồng lấn một phần ở hai đầu", () => {
    expect(staysOverlap(stay, { check_in: "2026-09-09", check_out: "2026-09-11" })).toBe(true);
    expect(staysOverlap(stay, { check_in: "2026-09-12", check_out: "2026-09-14" })).toBe(true);
  });

  test("lồng nhau và trùng khít", () => {
    expect(staysOverlap(stay, { check_in: "2026-09-11", check_out: "2026-09-12" })).toBe(true);
    expect(staysOverlap(stay, { check_in: "2026-09-08", check_out: "2026-09-20" })).toBe(true);
    expect(staysOverlap(stay, stay)).toBe(true);
  });

  test("tách rời hoàn toàn", () => {
    expect(staysOverlap(stay, { check_in: "2026-09-01", check_out: "2026-09-05" })).toBe(false);
    expect(staysOverlap(stay, { check_in: "2026-09-20", check_out: "2026-09-22" })).toBe(false);
  });

  test("đặt theo giờ cùng ngày chặn nhau, khác ngày thì không", () => {
    const hourly = { check_in: "2026-09-11", check_out: "2026-09-11" };
    expect(staysOverlap(hourly, { check_in: "2026-09-11", check_out: "2026-09-11" })).toBe(true);
    expect(staysOverlap(hourly, { check_in: "2026-09-12", check_out: "2026-09-12" })).toBe(false);
    expect(staysOverlap(hourly, stay)).toBe(true);
  });

  test("đối xứng", () => {
    const other = { check_in: "2026-09-12", check_out: "2026-09-14" };
    expect(staysOverlap(stay, other)).toBe(staysOverlap(other, stay));
  });
});
