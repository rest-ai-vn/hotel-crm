import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import rooms from "./api/rooms";
import guests from "./api/guests";
import reservations from "./api/reservations";
import auth from "./api/auth";
import { requireAuth } from "./middleware/auth";

const app = new Hono();

app.use("*", cors());
app.use("*", honoLogger());

app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

app.route("/api/auth", auth);

const protectedApi = new Hono();
protectedApi.use("*", requireAuth);
protectedApi.route("/rooms", rooms);
protectedApi.route("/guests", guests);
protectedApi.route("/reservations", reservations);
app.route("/api", protectedApi);

// Serve frontend (Bun HTML imports)
app.get("/", (c) => c.html("<!DOCTYPE html><html><body><h1>Hotel CRM</h1><p>Dashboard coming soon</p></body></html>"));

const PORT = Number(process.env.PORT) || 3000;

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`Hotel CRM running on http://localhost:${PORT}`);
