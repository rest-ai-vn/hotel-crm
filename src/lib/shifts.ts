// Shift cash reconciliation (pure, no I/O).
// Expected drawer cash = opening + cash collected - cash refunded + cashbook net.

import type { PaymentKind } from "./folio";

export interface ShiftPayment {
  amount: number;
  method: string; // 'cash' | 'card' | 'transfer' | 'vietqr'
  kind?: PaymentKind;
}

export interface ShiftCashInput {
  openingCash: number;
  payments: ReadonlyArray<ShiftPayment>;
  cashbookIncome: number;
  cashbookExpense: number;
}

export interface ShiftCashSummary {
  opening_cash: number;
  cash_collected: number; // cash payments + deposits
  cash_refunded: number; // cash refunds
  noncash_collected: number; // card/transfer/vietqr (payments + deposits - refunds)
  cashbook_income: number;
  cashbook_expense: number;
  expected_cash: number;
}

export function computeShiftCashSummary(input: ShiftCashInput): ShiftCashSummary {
  let cashCollected = 0;
  let cashRefunded = 0;
  let noncash = 0;

  for (const p of input.payments) {
    const amount = p.amount ?? 0;
    const isRefund = p.kind === "refund";
    if (p.method === "cash") {
      if (isRefund) cashRefunded += amount;
      else cashCollected += amount;
    } else {
      noncash += isRefund ? -amount : amount;
    }
  }

  const expected =
    input.openingCash +
    cashCollected -
    cashRefunded +
    input.cashbookIncome -
    input.cashbookExpense;

  return {
    opening_cash: input.openingCash,
    cash_collected: cashCollected,
    cash_refunded: cashRefunded,
    noncash_collected: noncash,
    cashbook_income: input.cashbookIncome,
    cashbook_expense: input.cashbookExpense,
    expected_cash: expected,
  };
}
