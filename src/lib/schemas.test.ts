import { describe, expect, test } from "bun:test";
import {
  guestCreateSchema,
  guestFindOrCreateSchema,
  reservationCreateSchema,
  roomCreateSchema,
} from "./schemas";

const UUID_A = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const UUID_B = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

describe("guestCreateSchema", () => {
  test("accepts minimal valid guest", () => {
    const r = guestCreateSchema.safeParse({ name: "Khách" });
    expect(r.success).toBe(true);
  });

  test("rejects empty name", () => {
    const r = guestCreateSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  test("rejects bad email", () => {
    const r = guestCreateSchema.safeParse({ name: "X", email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  test("rejects bad phone format", () => {
    const r = guestCreateSchema.safeParse({ name: "X", phone: "abc" });
    expect(r.success).toBe(false);
  });
});

describe("guestFindOrCreateSchema", () => {
  test("requires at least one identifier", () => {
    const r = guestFindOrCreateSchema.safeParse({ name: "Khách" });
    expect(r.success).toBe(false);
  });

  test("accepts when zalo_id present", () => {
    const r = guestFindOrCreateSchema.safeParse({ zalo_id: "zalo:abc" });
    expect(r.success).toBe(true);
  });
});

describe("reservationCreateSchema", () => {
  const valid = {
    guest_id: UUID_A,
    room_type_id: UUID_B,
    booking_type: "overnight",
    check_in: "2026-05-04",
    check_out: "2026-05-05",
    adults: 2,
    children: 0,
    base_amount: 350_000,
    total_amount: 350_000,
  };

  test("accepts a valid reservation", () => {
    const r = reservationCreateSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  test("rejects when check_out is before check_in", () => {
    const r = reservationCreateSchema.safeParse({
      ...valid,
      check_in: "2026-05-05",
      check_out: "2026-05-04",
    });
    expect(r.success).toBe(false);
  });

  test("rejects negative money", () => {
    const r = reservationCreateSchema.safeParse({ ...valid, base_amount: -1 });
    expect(r.success).toBe(false);
  });

  test("rejects bad booking_type", () => {
    const r = reservationCreateSchema.safeParse({ ...valid, booking_type: "weekly" });
    expect(r.success).toBe(false);
  });

  test("rejects bad date format", () => {
    const r = reservationCreateSchema.safeParse({ ...valid, check_in: "04/05/2026" });
    expect(r.success).toBe(false);
  });

  test("rejects bad UUID", () => {
    const r = reservationCreateSchema.safeParse({ ...valid, guest_id: "not-a-uuid" });
    expect(r.success).toBe(false);
  });
});

describe("roomCreateSchema", () => {
  test("rejects floor out of range", () => {
    const r = roomCreateSchema.safeParse({
      room_type_id: UUID_A,
      number: "108",
      floor: -1,
    });
    expect(r.success).toBe(false);
  });

  test("accepts valid room", () => {
    const r = roomCreateSchema.safeParse({
      room_type_id: UUID_A,
      number: "108",
      floor: 1,
    });
    expect(r.success).toBe(true);
  });
});
