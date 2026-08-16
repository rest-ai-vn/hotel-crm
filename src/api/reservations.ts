import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import {
  reservationCancelSchema,
  reservationCheckInSchema,
  reservationCreateSchema,
  reservationExtendSchema,
  reservationMoveRoomSchema,
  reservationNoShowSchema,
  reservationUpdateSchema,
} from "../lib/schemas";
import {
  calculatePriceWithOverrides,
  pickActiveRatePlan,
  type BookingType,
  type RateOverride,
} from "../lib/pricing";
import { computeTier, pointsForAmount } from "../lib/loyalty";
import { logAudit } from "../lib/audit";

const reservations = new Hono();

reservations.get("/quote", async (c) => {
  const roomTypeId = c.req.query("room_type_id");
  const bookingType = c.req.query("booking_type") as BookingType | undefined;
  const checkIn = c.req.query("check_in");
  const checkOut = c.req.query("check_out");
  const durationHours = c.req.query("duration_hours");

  if (!roomTypeId || !bookingType || !checkIn || !checkOut) {
    return c.json(
      { success: false, error: "room_type_id, booking_type, check_in, check_out required" },
      400,
    );
  }
  if (!["hourly", "overnight", "daytime"].includes(bookingType)) {
    return c.json({ success: false, error: "invalid booking_type" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    return c.json({ success: false, error: "dates must be YYYY-MM-DD" }, 400);
  }

  const db = getServerDb();
  const pid = c.get("user").property_id;
  const { data: plans, error } = await db
    .from("rate_plans")
    .select("*")
    .eq("property_id", pid)
    .eq("room_type_id", roomTypeId)
    .eq("booking_type", bookingType)
    .eq("is_active", true);

  if (error) return c.json({ success: false, error: error.message }, 500);
  if (!plans || plans.length === 0) {
    return c.json({ success: false, error: "Không tìm thấy bảng giá phù hợp" }, 404);
  }

  const plan = pickActiveRatePlan(plans, checkIn);
  if (!plan) {
    return c.json({ success: false, error: "Không có bảng giá hiệu lực cho ngày này" }, 404);
  }

  // Holiday/event overrides that touch any date of the stay for this room type.
  const { data: overrides } = await db
    .from("rate_overrides")
    .select("*")
    .eq("property_id", pid)
    .eq("is_active", true)
    .gte("date", checkIn)
    .lte("date", checkOut)
    .or(`room_type_id.is.null,room_type_id.eq.${roomTypeId}`);

  try {
    const breakdown = calculatePriceWithOverrides(
      plan,
      {
        check_in: checkIn,
        check_out: checkOut,
        duration_hours: durationHours ? Number(durationHours) : undefined,
      },
      (overrides ?? []) as RateOverride[],
    );
    return c.json({
      success: true,
      data: { plan_id: plan.id, plan_name: plan.name, breakdown },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi tính giá";
    return c.json({ success: false, error: msg }, 400);
  }
});

reservations.get("/availability", async (c) => {
  const db = getServerDb();
  const roomTypeId = c.req.query("room_type_id");
  const date = c.req.query("date");

  if (!roomTypeId || !date) {
    return c.json({ success: false, error: "room_type_id and date required" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ success: false, error: "date must be YYYY-MM-DD" }, 400);
  }

  const pid = c.get("user").property_id;
  const { count: totalRooms } = await db
    .from("rooms")
    .select("*", { count: "exact", head: true })
    .eq("property_id", pid)
    .eq("room_type_id", roomTypeId)
    .eq("is_active", true);

  const { count: bookedRooms } = await db
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .eq("property_id", pid)
    .eq("room_type_id", roomTypeId)
    .in("status", ["confirmed", "checked_in"])
    .lte("check_in", date)
    .gte("check_out", date);

  const total = totalRooms ?? 0;
  const booked = bookedRooms ?? 0;
  const available = Math.max(0, total - booked);

  return c.json({
    success: true,
    data: { room_type_id: roomTypeId, date, total, booked, available },
  });
});

reservations.get("/", async (c) => {
  const db = getServerDb();
  const from = c.req.query("from");
  const to = c.req.query("to");
  const status = c.req.query("status");
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);

  let query = db
    .from("reservations")
    .select(
      "*, guests(name, phone), room_types(name, code), rooms(number, floor)",
      { count: "exact" },
    )
    .eq("property_id", c.get("user").property_id);

  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("check_in", from);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("check_in", to);
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query
    .order("check_in", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data, meta: { total: count, limit, offset } });
});

reservations.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .select("*, guests(name, phone, id_number), room_types(name), rooms(number, floor)")
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .maybeSingle();

  if (error) return c.json({ success: false, error: error.message }, 500);
  if (!data) return c.json({ success: false, error: "Reservation not found" }, 404);
  return c.json({ success: true, data });
});

reservations.post("/", async (c) => {
  const parsed = await parseBody(c, reservationCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
  const user = c.get("user");
  const { data, error } = await db
    .from("reservations")
    .insert({ ...parsed.data, property_id: user.property_id, created_by: user.sub })
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  await logAudit(db, user, "reservation.create", "reservation", data.id, {
    confirmation_code: data.confirmation_code,
    total_amount: data.total_amount,
  });
  return c.json({ success: true, data }, 201);
});

reservations.put("/:id", async (c) => {
  const parsed = await parseBody(c, reservationUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .update(parsed.data)
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data });
});

reservations.post("/:id/cancel", async (c) => {
  const parsed = await parseBody(c, reservationCancelSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: parsed.data.reason ?? null,
    })
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);
  await logAudit(db, c.get("user"), "reservation.cancel", "reservation", id, {
    reason: parsed.data.reason ?? null,
  });
  return c.json({ success: true, data });
});

reservations.post("/:id/check-in", async (c) => {
  const parsed = await parseBody(c, reservationCheckInSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const { room_id } = parsed.data;
  const db = getServerDb();
  const pid = c.get("user").property_id;

  // The room being assigned must belong to the caller's property.
  const { data: room } = await db
    .from("rooms")
    .select("id")
    .eq("id", room_id)
    .eq("property_id", pid)
    .maybeSingle();
  if (!room) return c.json({ success: false, error: "Phòng không tồn tại" }, 404);

  const { data, error } = await db
    .from("reservations")
    .update({ status: "checked_in", room_id })
    .eq("id", id)
    .eq("property_id", pid)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);

  await db.from("rooms").update({ status: "occupied" }).eq("id", room_id);

  await logAudit(db, c.get("user"), "reservation.check_in", "reservation", id, { room_id });
  return c.json({ success: true, data });
});

reservations.post("/:id/check-out", async (c) => {
  const id = c.req.param("id");
  const db = getServerDb();

  const { data: reservation, error: fetchErr } = await db
    .from("reservations")
    .select("room_id, guest_id, total_amount, services_total")
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .maybeSingle();

  if (fetchErr) return c.json({ success: false, error: fetchErr.message }, 400);
  if (!reservation) return c.json({ success: false, error: "Reservation not found" }, 404);

  const { data, error } = await db
    .from("reservations")
    .update({
      status: "checked_out",
      check_out_time: new Date().toTimeString().slice(0, 5),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ success: false, error: error.message }, 400);

  if (reservation.room_id) {
    await db.from("rooms").update({ status: "cleaning" }).eq("id", reservation.room_id);
  }

  // Loyalty accrual: 1 stay = +1 visit, folio total adds revenue + points, tier recomputed.
  if (reservation.guest_id) {
    const folioTotal = (reservation.total_amount ?? 0) + (reservation.services_total ?? 0);
    const { data: guest } = await db
      .from("guests")
      .select("visit_count, total_revenue, loyalty_points")
      .eq("id", reservation.guest_id)
      .maybeSingle();
    if (guest) {
      const newVisits = (guest.visit_count ?? 0) + 1;
      await db
        .from("guests")
        .update({
          visit_count: newVisits,
          total_revenue: (guest.total_revenue ?? 0) + folioTotal,
          loyalty_points: (guest.loyalty_points ?? 0) + pointsForAmount(folioTotal),
          loyalty_tier: computeTier(newVisits),
        })
        .eq("id", reservation.guest_id);
    }
  }

  await logAudit(db, c.get("user"), "reservation.check_out", "reservation", id);
  return c.json({ success: true, data });
});

// Mark a confirmed reservation whose guest never arrived as no-show.
reservations.post("/:id/no-show", async (c) => {
  const parsed = await parseBody(c, reservationNoShowSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();
  const { data, error } = await db
    .from("reservations")
    .update({ status: "no_show" })
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .eq("status", "confirmed")
    .select()
    .maybeSingle();

  if (error) return c.json({ success: false, error: error.message }, 400);
  if (!data) {
    return c.json(
      { success: false, error: "Chỉ đánh dấu không đến cho đặt phòng ở trạng thái đã xác nhận" },
      400,
    );
  }
  await logAudit(db, c.get("user"), "reservation.no_show", "reservation", id, {
    note: parsed.data.note ?? null,
  });
  return c.json({ success: true, data });
});

// Move to another room mid-stay (đổi phòng), with audit trail.
reservations.post("/:id/move-room", async (c) => {
  const parsed = await parseBody(c, reservationMoveRoomSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();

  const pid = c.get("user").property_id;
  const { data: reservation, error: fetchErr } = await db
    .from("reservations")
    .select("id, status, room_id")
    .eq("id", id)
    .eq("property_id", pid)
    .maybeSingle();
  if (fetchErr) return c.json({ success: false, error: fetchErr.message }, 400);
  if (!reservation) return c.json({ success: false, error: "Reservation not found" }, 404);
  if (!["confirmed", "checked_in"].includes(reservation.status)) {
    return c.json({ success: false, error: "Chỉ đổi phòng khi đã xác nhận hoặc đang lưu trú" }, 400);
  }
  if (reservation.room_id === parsed.data.room_id) {
    return c.json({ success: false, error: "Khách đang ở phòng này rồi" }, 400);
  }

  const { data: targetRoom, error: roomErr } = await db
    .from("rooms")
    .select("id, number, status")
    .eq("id", parsed.data.room_id)
    .eq("property_id", pid)
    .maybeSingle();
  if (roomErr) return c.json({ success: false, error: roomErr.message }, 400);
  if (!targetRoom) return c.json({ success: false, error: "Phòng không tồn tại" }, 404);
  if (["occupied", "maintenance", "out_of_order"].includes(targetRoom.status)) {
    return c.json({ success: false, error: `Phòng ${targetRoom.number} không sẵn sàng` }, 400);
  }

  const { data, error } = await db
    .from("reservations")
    .update({ room_id: parsed.data.room_id })
    .eq("id", id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  if (reservation.status === "checked_in") {
    await Promise.all([
      db.from("rooms").update({ status: "occupied" }).eq("id", parsed.data.room_id),
      reservation.room_id
        ? db.from("rooms").update({ status: "cleaning" }).eq("id", reservation.room_id)
        : Promise.resolve(),
    ]);
  }

  await logAudit(db, c.get("user"), "reservation.move_room", "reservation", id, {
    from_room_id: reservation.room_id,
    to_room_id: parsed.data.room_id,
    reason: parsed.data.reason ?? null,
  });
  return c.json({ success: true, data });
});

// Extend the stay (gia hạn): push check_out later and add the extra amount.
reservations.post("/:id/extend", async (c) => {
  const parsed = await parseBody(c, reservationExtendSchema);
  if (!parsed.ok) return parsed.response;

  const id = c.req.param("id");
  const db = getServerDb();

  const { data: reservation, error: fetchErr } = await db
    .from("reservations")
    .select("id, status, check_out, total_amount")
    .eq("id", id)
    .eq("property_id", c.get("user").property_id)
    .maybeSingle();
  if (fetchErr) return c.json({ success: false, error: fetchErr.message }, 400);
  if (!reservation) return c.json({ success: false, error: "Reservation not found" }, 404);
  if (!["confirmed", "checked_in"].includes(reservation.status)) {
    return c.json({ success: false, error: "Chỉ gia hạn khi đã xác nhận hoặc đang lưu trú" }, 400);
  }
  if (parsed.data.check_out < reservation.check_out) {
    return c.json(
      { success: false, error: "Ngày trả mới phải bằng hoặc sau ngày trả hiện tại" },
      400,
    );
  }

  const update: Record<string, unknown> = {
    check_out: parsed.data.check_out,
    total_amount: (reservation.total_amount ?? 0) + parsed.data.extra_amount,
  };
  if (parsed.data.check_out_time) update.check_out_time = parsed.data.check_out_time;

  const { data, error } = await db
    .from("reservations")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return c.json({ success: false, error: error.message }, 400);

  await logAudit(db, c.get("user"), "reservation.extend", "reservation", id, {
    old_check_out: reservation.check_out,
    new_check_out: parsed.data.check_out,
    extra_amount: parsed.data.extra_amount,
    note: parsed.data.note ?? null,
  });
  return c.json({ success: true, data });
});

export default reservations;
