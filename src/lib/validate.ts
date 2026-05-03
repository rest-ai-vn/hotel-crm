import type { Context } from "hono";
import type { ZodTypeAny, infer as zInfer } from "zod";

export async function parseBody<S extends ZodTypeAny>(
  c: Context,
  schema: S,
): Promise<{ ok: true; data: zInfer<S> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {
      ok: false,
      response: c.json({ success: false, error: "Invalid JSON body" }, 400),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return {
      ok: false,
      response: c.json({ success: false, error: "Validation failed", issues }, 400),
    };
  }
  return { ok: true, data: result.data as zInfer<S> };
}
