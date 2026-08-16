// Folio payment math (pure, no I/O).
// paid = payments + deposits - refunds; legacy rows without kind = payment.

export type PaymentKind = "payment" | "deposit" | "refund";

export interface FolioPayment {
  amount: number;
  kind?: PaymentKind;
}

export function computePaidTotal(payments: ReadonlyArray<FolioPayment>): number {
  let total = 0;
  for (const p of payments) {
    const amount = p.amount ?? 0;
    total += p.kind === "refund" ? -amount : amount;
  }
  return total;
}

export function computeRemaining(
  folioTotal: number,
  payments: ReadonlyArray<FolioPayment>,
): number {
  return Math.max(0, folioTotal - computePaidTotal(payments));
}
