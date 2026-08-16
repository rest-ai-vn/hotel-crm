// Night-audit rules (pure, no I/O).

export interface NoShowCandidate {
  status: string;
  check_in: string; // YYYY-MM-DD
}

/**
 * A reservation becomes a no-show when the business date has passed its
 * check_in date and the guest never arrived (still 'confirmed').
 * Same-day check_in is NOT a no-show — the guest may still arrive.
 */
export function isNoShowCandidate(res: NoShowCandidate, businessDate: string): boolean {
  return res.status === "confirmed" && res.check_in < businessDate;
}
