// Thin audit-log writer. Failures are swallowed on purpose — audit must
// never break the primary operation.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffTokenPayload } from "./jwt";

/** Ai thực hiện hành động: nhân viên (có staff_id) hoặc API key (không có). */
export interface AuditActor {
  staff_id: string | null;
  staff_name: string | null;
  property_id: string | null;
}

export async function logActorAudit(
  db: SupabaseClient,
  actor: AuditActor,
  action: string,
  entity: string,
  entityId: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.from("audit_logs").insert({
      ...actor,
      action,
      entity,
      entity_id: entityId,
      details: details ?? null,
    });
  } catch {
    /* intentionally ignored */
  }
}

export async function logAudit(
  db: SupabaseClient,
  user: StaffTokenPayload | undefined,
  action: string,
  entity: string,
  entityId: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  return logActorAudit(
    db,
    {
      staff_id: user?.sub ?? null,
      staff_name: user?.name ?? null,
      property_id: user?.property_id ?? null,
    },
    action,
    entity,
    entityId,
    details,
  );
}
