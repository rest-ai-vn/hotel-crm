#!/usr/bin/env bun
import { getServerDb } from "./supabase-client";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@hotel.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";

const ROOM_TYPES = [
  { code: "ONTOP", name: "On Top", max_guests: 2, sort_order: 10 },
  { code: "HEAVEN7", name: "7 Heaven", max_guests: 2, sort_order: 20 },
  { code: "CLOUD10", name: "Cloud 10", max_guests: 3, sort_order: 30 },
  { code: "CLOUD9", name: "Cloud 9", max_guests: 4, sort_order: 40 },
];

const SERVICES = [
  { name: "Ăn sáng", category: "ăn uống", price: 50_000, unit: "suất", sort_order: 10 },
  { name: "Giặt ủi", category: "giặt ủi", price: 30_000, unit: "kg", sort_order: 20 },
  { name: "Minibar - Nước suối", category: "minibar", price: 15_000, unit: "chai", sort_order: 30 },
  { name: "Minibar - Bia", category: "minibar", price: 25_000, unit: "lon", sort_order: 40 },
  { name: "Đưa đón sân bay", category: "đưa đón", price: 200_000, unit: "lượt", sort_order: 50 },
  { name: "Massage", category: "spa", price: 300_000, unit: "lần", sort_order: 60 },
];

const ROOMS_PER_TYPE: Record<string, Array<{ number: string; floor: number }>> = {
  ONTOP: [
    { number: "108", floor: 1 },
    { number: "208", floor: 2 },
  ],
  HEAVEN7: [
    { number: "701", floor: 7 },
    { number: "702", floor: 7 },
  ],
  CLOUD10: [
    { number: "1001", floor: 10 },
    { number: "1002", floor: 10 },
  ],
  CLOUD9: [
    { number: "901", floor: 9 },
    { number: "902", floor: 9 },
  ],
};

async function main() {
  const db = getServerDb();

  // Default property (tenant) — everything below is scoped to it.
  let propertyId: string;
  const existingProp = await db
    .from("properties")
    .select("id")
    .eq("code", "MAIN")
    .maybeSingle();
  if (existingProp.data) {
    propertyId = existingProp.data.id;
    console.log("✓ property MAIN exists");
  } else {
    const { data, error } = await db
      .from("properties")
      .insert({ name: "Khách sạn chính", code: "MAIN" })
      .select("id")
      .single();
    if (error) throw error;
    propertyId = data.id;
    console.log("✓ property MAIN created");
  }

  const existingAdmin = await db
    .from("staff")
    .select("id")
    .eq("email", ADMIN_EMAIL)
    .maybeSingle();
  if (!existingAdmin.data) {
    const password_hash = await Bun.password.hash(ADMIN_PASSWORD);
    const { error } = await db.from("staff").insert({
      email: ADMIN_EMAIL,
      name: "Admin",
      role: "admin",
      password_hash,
      property_id: propertyId,
    });
    if (error) throw error;
    console.log(`✓ admin staff created: ${ADMIN_EMAIL}`);
  } else {
    console.log(`✓ admin staff exists: ${ADMIN_EMAIL}`);
  }

  const codeToId = new Map<string, string>();
  for (const rt of ROOM_TYPES) {
    const existing = await db
      .from("room_types")
      .select("id")
      .eq("property_id", propertyId)
      .eq("code", rt.code)
      .maybeSingle();
    if (existing.data) {
      codeToId.set(rt.code, existing.data.id);
      console.log(`✓ room_type ${rt.code} exists`);
      continue;
    }
    const { data, error } = await db
      .from("room_types")
      .insert({ ...rt, property_id: propertyId })
      .select("id")
      .single();
    if (error) throw error;
    codeToId.set(rt.code, data.id);
    console.log(`✓ room_type ${rt.code} created`);
  }

  for (const [code, rooms] of Object.entries(ROOMS_PER_TYPE)) {
    const room_type_id = codeToId.get(code);
    if (!room_type_id) continue;
    for (const r of rooms) {
      const existing = await db
        .from("rooms")
        .select("id")
        .eq("property_id", propertyId)
        .eq("number", r.number)
        .maybeSingle();
      if (existing.data) {
        console.log(`✓ room ${r.number} exists`);
        continue;
      }
      const { error } = await db
        .from("rooms")
        .insert({ room_type_id, number: r.number, floor: r.floor, property_id: propertyId });
      if (error) throw error;
      console.log(`✓ room ${r.number} created`);
    }
  }

  for (const svc of SERVICES) {
    const existing = await db
      .from("services")
      .select("id")
      .eq("property_id", propertyId)
      .eq("name", svc.name)
      .maybeSingle();
    if (existing.data) {
      console.log(`✓ service ${svc.name} exists`);
      continue;
    }
    const { error } = await db.from("services").insert({ ...svc, property_id: propertyId });
    if (error) throw error;
    console.log(`✓ service ${svc.name} created`);
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
