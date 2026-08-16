import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import rooms from "./api/rooms";
import guests from "./api/guests";
import reservations from "./api/reservations";
import auth from "./api/auth";
import dashboard from "./api/dashboard";
import chat from "./api/chat";
import payments from "./api/payments";
import ratePlans from "./api/rate-plans";
import services from "./api/services";
import cashbook from "./api/cashbook";
import reports from "./api/reports";
import shifts from "./api/shifts";
import nightAudit from "./api/night-audit";
import auditLogs from "./api/audit-logs";
import rateOverrides from "./api/rate-overrides";
import properties from "./api/properties";
import vouchers from "./api/vouchers";
import companies from "./api/companies";
import workOrders from "./api/work-orders";
import { requireAuth, requireRole } from "./middleware/auth";

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
protectedApi.route("/dashboard", dashboard);
protectedApi.route("/chat", chat);
protectedApi.route("/payments", payments);
protectedApi.route("/services", services);
protectedApi.route("/cashbook", cashbook);
protectedApi.route("/reports", reports);
protectedApi.route("/shifts", shifts);
protectedApi.route("/companies", companies);
protectedApi.route("/work-orders", workOrders);

const adminApi = new Hono();
adminApi.use("*", requireRole("admin", "manager"));
adminApi.route("/rate-plans", ratePlans);
adminApi.route("/rate-overrides", rateOverrides);
adminApi.route("/night-audit", nightAudit);
adminApi.route("/audit-logs", auditLogs);
adminApi.route("/properties", properties);
adminApi.route("/vouchers", vouchers);
protectedApi.route("/", adminApi);

app.route("/api", protectedApi);

// Serve frontend (Bun HTML imports)
app.get("/", (c) => c.html("<!DOCTYPE html><html><body><h1>Hotel CRM</h1><p>Dashboard coming soon</p></body></html>"));

const PORT = Number(process.env.PORT) || 3000;

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`Hotel CRM running on http://localhost:${PORT}`);
