#!/usr/bin/env bun
// Seed a fully-populated DEMO property via the HTTP API (safe to run against
// any environment — everything lands in its own tenant).
//
// Usage:
//   SEED_BASE_URL=https://hotel-pms.restai.vn \
//   SEED_ROOT_EMAIL=admin@hotel.local SEED_ROOT_PASSWORD=... \
//   bun run seed:demo

const BASE = process.env.SEED_BASE_URL ?? "http://localhost:3000";
const ROOT_EMAIL = process.env.SEED_ROOT_EMAIL ?? "admin@hotel.local";
const ROOT_PASSWORD = process.env.SEED_ROOT_PASSWORD ?? "";
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? "demo@hotel.local";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo@2026";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

async function call<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<ApiEnvelope<T>> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as ApiEnvelope<T>;
}

function must<T>(resp: ApiEnvelope<T>, label: string): T {
  if (!resp.success) {
    throw new Error(`FAIL ${label}: ${resp.error}`);
  }
  return resp.data;
}

function isoDaysFromNow(offset: number): string {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  if (!ROOT_PASSWORD) {
    throw new Error("SEED_ROOT_PASSWORD is required (root admin để tạo cơ sở demo)");
  }

  const root = must(
    await call<{ token: string }>("POST", "/api/auth/login", undefined, {
      email: ROOT_EMAIL,
      password: ROOT_PASSWORD,
    }),
    "root login",
  ).token;

  const existing = must(
    await call<Array<{ id: string; code: string }>>("GET", "/api/properties", root),
    "list properties",
  );
  if (existing.some((p) => p.code === "DEMO")) {
    throw new Error("Cơ sở DEMO đã tồn tại — xóa/đổi mã trước khi seed lại.");
  }

  const demoProp = must(
    await call<{ id: string }>("POST", "/api/properties", root, {
      name: "Khách sạn Sao Mai (Demo)",
      code: "DEMO",
      address: "88 Bạch Đằng, Đà Nẵng",
      phone: "0236 999 888",
    }),
    "create property",
  );
  must(
    await call("PUT", `/api/properties/${demoProp.id}`, root, {
      vat_rate: 10,
      bank_id: "VCB",
      bank_account_no: "0000000000",
      bank_account_name: "KHACH SAN DEMO",
    }),
    "property config",
  );
  must(
    await call("POST", "/api/auth/staff", root, {
      name: "Quản lý Demo",
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      role: "admin",
      property_id: demoProp.id,
    }),
    "create demo staff",
  );
  console.log(`✓ cơ sở DEMO + tài khoản ${DEMO_EMAIL}`);

  const token = must(
    await call<{ token: string }>("POST", "/api/auth/login", undefined, {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    }),
    "demo login",
  ).token;

  const types = new Map<string, string>();
  for (const [code, name, maxGuests, sort] of [
    ["STD", "Standard", 2, 10],
    ["DLX", "Deluxe", 3, 20],
    ["SUT", "Suite", 4, 30],
  ] as const) {
    const t = must(
      await call<{ id: string }>("POST", "/api/rooms/types", token, {
        name,
        code,
        max_guests: maxGuests,
        sort_order: sort,
      }),
      `room type ${code}`,
    );
    types.set(code, t.id);
  }
  console.log("✓ 3 loại phòng");

  const rooms = new Map<string, string>();
  for (const [number, floor, code] of [
    ["101", 1, "STD"], ["102", 1, "STD"], ["103", 1, "STD"],
    ["201", 2, "DLX"], ["202", 2, "DLX"],
    ["301", 3, "SUT"],
  ] as const) {
    const r = must(
      await call<{ id: string }>("POST", "/api/rooms", token, {
        room_type_id: types.get(code),
        number,
        floor,
      }),
      `room ${number}`,
    );
    rooms.set(number, r.id);
  }
  console.log("✓ 6 phòng");

  for (const [code, rate] of [["STD", 500_000], ["DLX", 800_000], ["SUT", 1_500_000]] as const) {
    must(
      await call("POST", "/api/rate-plans", token, {
        room_type_id: types.get(code),
        booking_type: "overnight",
        name: `Giá đêm ${code}`,
        overnight_rate: rate,
        weekend_surcharge_pct: 20,
      }),
      `rate plan ${code}`,
    );
  }
  must(
    await call("POST", "/api/rate-plans", token, {
      room_type_id: types.get("STD"),
      booking_type: "hourly",
      name: "Giá giờ STD",
      hourly_rate: 150_000,
      min_hours: 2,
      extra_hour_rate: 60_000,
    }),
    "hourly plan",
  );
  console.log("✓ bảng giá");

  for (const [name, category, price, unit] of [
    ["Ăn sáng buffet", "ăn uống", 120_000, "suất"],
    ["Giặt ủi", "giặt ủi", 40_000, "kg"],
    ["Minibar - Nước ngọt", "minibar", 20_000, "lon"],
    ["Minibar - Bia", "minibar", 30_000, "lon"],
    ["Spa thư giãn 60p", "spa", 450_000, "lần"],
    ["Đưa đón sân bay", "đưa đón", 250_000, "lượt"],
  ] as const) {
    must(await call("POST", "/api/services/catalog", token, { name, category, price, unit }), name);
  }
  console.log("✓ 6 dịch vụ");

  const guests = new Map<string, string>();
  for (const [name, phone] of [
    ["Nguyễn Văn An", "0905111222"],
    ["Trần Thị Bình", "0913333444"],
    ["Lê Hoàng Cường", "0987555666"],
    ["Phạm Thu Dung", "0932777888"],
  ] as const) {
    const g = must(
      await call<{ id: string }>("POST", "/api/guests/find-or-create", token, { name, phone }),
      `guest ${name}`,
    );
    guests.set(name, g.id);
  }
  must(
    await call("PUT", `/api/guests/${guests.get("Nguyễn Văn An")}`, token, {
      id_number: "048090001234",
      id_type: "CCCD",
      address: "12 Lê Duẩn, Hải Châu, Đà Nẵng",
    }),
    "guest CCCD",
  );
  console.log("✓ 4 khách mẫu");

  const company = must(
    await call<{ id: string }>("POST", "/api/companies", token, {
      name: "Công ty Du lịch Miền Trung",
      tax_code: "0401234567",
      contact_name: "Chị Hoa",
      phone: "0905999000",
      discount_pct: 15,
    }),
    "company",
  );
  must(
    await call("POST", "/api/vouchers", token, { code: "DEMO10", kind: "percent", value: 10 }),
    "voucher",
  );
  must(
    await call("POST", "/api/rate-overrides", token, {
      name: "Lễ Quốc khánh 2/9",
      date: `${new Date().getFullYear()}-09-02`,
      surcharge_pct: 30,
    }),
    "rate override",
  );
  console.log("✓ công ty (-15% HĐ) + voucher DEMO10 + giá lễ 2/9");

  const today = isoDaysFromNow(0);
  const yesterday = isoDaysFromNow(-1);
  const tomorrow = isoDaysFromNow(1);

  async function book(
    guestName: string,
    typeCode: string,
    checkIn: string,
    checkOut: string,
    base: number,
    total: number,
    extra: Record<string, unknown> = {},
  ) {
    return must(
      await call<{ id: string }>("POST", "/api/reservations", token, {
        guest_id: guests.get(guestName),
        room_type_id: types.get(typeCode),
        booking_type: "overnight",
        check_in: checkIn,
        check_out: checkOut,
        base_amount: base,
        tax_amount: total - base,
        total_amount: total,
        ...extra,
      }),
      `booking ${guestName} ${checkIn}`,
    );
  }

  // Đang ở: cọc + dịch vụ (demo folio/QR/in phiếu)
  const r1 = await book("Nguyễn Văn An", "STD", today, tomorrow, 500_000, 550_000);
  must(
    await call("POST", `/api/reservations/${r1.id}/check-in`, token, { room_id: rooms.get("101") }),
    "check-in 101",
  );
  must(
    await call("POST", "/api/payments", token, {
      reservation_id: r1.id,
      amount: 300_000,
      method: "transfer",
      kind: "deposit",
      note: "Cọc giữ phòng",
    }),
    "deposit",
  );
  const catalog = must(await call<Array<{ id: string; name: string; price: number }>>("GET", "/api/services/catalog", token), "catalog");
  for (const key of ["Bia", "sáng"]) {
    const svc = catalog.find((s) => s.name.includes(key))!;
    must(
      await call("POST", "/api/services", token, {
        reservation_id: r1.id,
        service_id: svc.id,
        name: svc.name,
        unit_price: svc.price,
        quantity: 2,
      }),
      `charge ${key}`,
    );
  }

  // Đã trả phòng: thanh toán đủ
  const r2 = await book("Trần Thị Bình", "STD", yesterday, today, 500_000, 550_000);
  must(await call("POST", `/api/reservations/${r2.id}/check-in`, token, { room_id: rooms.get("102") }), "check-in 102");
  must(
    await call("POST", "/api/payments", token, {
      reservation_id: r2.id,
      amount: 550_000,
      method: "cash",
      kind: "payment",
    }),
    "pay full",
  );
  must(await call("POST", `/api/reservations/${r2.id}/check-out`, token, {}), "check-out 102");
  must(await call("PATCH", `/api/rooms/${rooms.get("102")}/status`, token, { status: "available" }), "room 102 ready");

  // Đến hôm nay + đoàn công ty + suite ngày mai
  await book("Lê Hoàng Cường", "DLX", today, isoDaysFromNow(2), 1_600_000, 1_760_000);
  await book("Phạm Thu Dung", "DLX", isoDaysFromNow(3), isoDaysFromNow(4), 800_000, 880_000, {
    rooms_count: 2,
    company_id: company.id,
  });
  await book("Phạm Thu Dung", "SUT", tomorrow, isoDaysFromNow(3), 3_000_000, 3_300_000);
  console.log("✓ 5 kịch bản đặt phòng (đang ở, đã trả, sắp đến, đoàn công nợ, suite)");

  console.log(`\nSeed demo hoàn tất → đăng nhập ${DEMO_EMAIL} / ${DEMO_PASSWORD} tại ${BASE}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
