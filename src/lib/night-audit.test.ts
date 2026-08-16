import { describe, expect, test } from "bun:test";
import { isNoShowCandidate } from "./night-audit";

describe("isNoShowCandidate", () => {
  test("confirmed reservation with check_in before business date is a no-show", () => {
    expect(
      isNoShowCandidate({ status: "confirmed", check_in: "2026-08-14" }, "2026-08-15"),
    ).toBe(true);
  });

  test("check_in on the business date is NOT yet a no-show (still may arrive)", () => {
    expect(
      isNoShowCandidate({ status: "confirmed", check_in: "2026-08-15" }, "2026-08-15"),
    ).toBe(false);
  });

  test("checked_in / cancelled / checked_out are never no-show", () => {
    for (const status of ["checked_in", "cancelled", "checked_out", "no_show"] as const) {
      expect(isNoShowCandidate({ status, check_in: "2026-08-01" }, "2026-08-15")).toBe(false);
    }
  });

  test("future check_in is not a no-show", () => {
    expect(
      isNoShowCandidate({ status: "confirmed", check_in: "2026-08-20" }, "2026-08-15"),
    ).toBe(false);
  });
});
