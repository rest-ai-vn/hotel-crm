// Voucher validation/discount, VAT, VietQR quicklink (pure, no I/O).

export interface VoucherLike {
  kind: "percent" | "fixed";
  value: number;
  valid_from: string; // YYYY-MM-DD
  valid_to: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
}

/** Returns a user-facing error, or null when the voucher is usable on `onDate`. */
export function voucherError(v: VoucherLike, onDate: string): string | null {
  if (!v.is_active) return "Mã giảm giá không còn hiệu lực";
  if (onDate < v.valid_from) return "Mã giảm giá chưa đến ngày hiệu lực";
  if (v.valid_to && onDate > v.valid_to) return "Mã giảm giá đã hết hạn";
  if (v.max_uses !== null && v.used_count >= v.max_uses) return "Mã giảm giá đã hết lượt dùng";
  return null;
}

/** Discount amount for a folio subtotal, capped at the subtotal. */
export function voucherDiscount(v: VoucherLike, amount: number): number {
  const base = Math.max(0, amount);
  const raw = v.kind === "percent" ? Math.round((base * v.value) / 100) : v.value;
  return Math.min(base, Math.max(0, raw));
}

/** VAT on an after-discount amount. */
export function computeVat(amount: number, ratePct: number): number {
  return Math.round((Math.max(0, amount) * Math.max(0, ratePct)) / 100);
}

export interface VietQrInput {
  bankId: string;
  accountNo: string;
  accountName: string;
  amount: number;
  memo: string;
}

/** VietQR quicklink image URL (img.vietqr.io — renders a scannable QR). */
export function buildVietQrUrl(input: VietQrInput): string {
  const params = new URLSearchParams({
    amount: String(Math.max(0, Math.round(input.amount))),
    addInfo: input.memo,
    accountName: input.accountName,
  });
  return `https://img.vietqr.io/image/${input.bankId}-${input.accountNo}-compact2.png?${params.toString()}`;
}
