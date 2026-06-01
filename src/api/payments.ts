import { Hono } from "hono";
import { getServerDb } from "../db/supabase-client";
import { parseBody } from "../lib/validate";
import { paymentCreateSchema } from "../lib/schemas";

const payments = new Hono();

payments.get("/", async (c) => {
  const reservationId = c.req.query("reservation_id");
  if (!reservationId) {
    return c.json({ success: false, error: "reservation_id required" }, 400);
  }

  const db = getServerDb();
  const { data, error } = await db
    .from("payments")
    .select("*")
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false });

  if (error) return c.json({ success: false, error: error.message }, 500);
  return c.json({ success: true, data });
});

payments.post("/", async (c) => {
  const parsed = await parseBody(c, paymentCreateSchema);
  if (!parsed.ok) return parsed.response;

  const db = getServerDb();
  const user = c.get("user");
  const insert = {
    ...parsed.data,
    received_by: user?.sub ?? null,
  };

  const { data, error } = await db.from("payments").insert(insert).select().single();
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data }, 201);
});

payments.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getServerDb();
  const { error } = await db.from("payments").delete().eq("id", id);
  if (error) return c.json({ success: false, error: error.message }, 400);
  return c.json({ success: true, data: { id } });
});

export default payments;
