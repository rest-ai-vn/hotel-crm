import { describe, expect, test, beforeAll } from "bun:test";

beforeAll(() => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = "a".repeat(48);
  }
});

describe("staff JWT", () => {
  test("round-trip preserves claims", async () => {
    const { signStaffToken, verifyStaffToken } = await import("./jwt");
    const token = await signStaffToken({
      sub: "11111111-2222-3333-4444-555555555555",
      email: "admin@hotel.local",
      role: "admin",
      name: "Admin",
    });
    const payload = await verifyStaffToken(token);
    expect(payload.sub).toBe("11111111-2222-3333-4444-555555555555");
    expect(payload.email).toBe("admin@hotel.local");
    expect(payload.role).toBe("admin");
    expect(payload.iss).toBe("hotel-crm");
    expect(payload.aud).toBe("hotel-crm-staff");
  });

  test("tampered token is rejected", async () => {
    const { signStaffToken, verifyStaffToken } = await import("./jwt");
    const token = await signStaffToken({
      sub: "11111111-2222-3333-4444-555555555555",
      email: "x@y.com",
      role: "receptionist",
      name: "X",
    });
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${"a".repeat(parts[2]!.length)}`;
    await expect(verifyStaffToken(tampered)).rejects.toThrow();
  });

  test("expired token is rejected", async () => {
    const { signStaffToken, verifyStaffToken } = await import("./jwt");
    const token = await signStaffToken(
      {
        sub: "11111111-2222-3333-4444-555555555555",
        email: "x@y.com",
        role: "receptionist",
        name: "X",
      },
      "1s",
    );
    await new Promise((r) => setTimeout(r, 1100));
    await expect(verifyStaffToken(token)).rejects.toThrow();
  });
});
