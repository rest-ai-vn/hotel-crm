// In phiếu xác nhận / phiếu thanh toán qua cửa sổ print của trình duyệt.
import { formatDate, formatDateTime, formatVnd } from "./format";
import type { Payment, Reservation, ReservationService } from "./types";

const KIND_LABEL: Record<string, string> = {
  payment: "Thanh toán",
  deposit: "Đặt cọc",
  refund: "Hoàn tiền",
};
const METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  card: "Thẻ",
  transfer: "Chuyển khoản",
  vietqr: "VietQR",
};

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printReservationReceipt(
  reservation: Reservation,
  services: ReadonlyArray<ReservationService>,
  payments: ReadonlyArray<Payment>,
): void {
  const servicesTotal = services.reduce((s, x) => s + x.amount, 0);
  const folioTotal = reservation.total_amount + servicesTotal;
  const paid = payments.reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);
  const remaining = Math.max(0, folioTotal - paid);

  const serviceRows = services
    .map(
      (s) =>
        `<tr><td>${esc(s.name)}</td><td class="num">${s.quantity}</td><td class="num">${formatVnd(s.amount)}</td></tr>`,
    )
    .join("");
  const paymentRows = payments
    .map(
      (p) =>
        `<tr><td>${formatDateTime(p.created_at)}</td><td>${esc(KIND_LABEL[p.kind] ?? p.kind)} · ${esc(
          METHOD_LABEL[p.method] ?? p.method,
        )}</td><td class="num">${p.kind === "refund" ? "-" : ""}${formatVnd(p.amount)}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Phiếu ${esc(reservation.confirmation_code)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 13px; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
  .muted { color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ddd; }
  .num { text-align: right; }
  .total-row { font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-top: 8px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; margin-top: 36px; text-align: center; }
  @media print { body { margin: 8mm; } }
</style>
</head>
<body>
  <h1>PHIẾU XÁC NHẬN ĐẶT PHÒNG / PHIẾU THANH TOÁN</h1>
  <div class="muted">Mã đặt phòng: <strong>${esc(reservation.confirmation_code)}</strong> · In lúc ${formatDateTime(new Date().toISOString())}</div>

  <div class="grid">
    <div><span class="muted">Khách:</span> <strong>${esc(reservation.guests?.name)}</strong></div>
    <div><span class="muted">SĐT:</span> ${esc(reservation.guests?.phone)}</div>
    <div><span class="muted">Loại phòng:</span> ${esc(reservation.room_types?.name)}</div>
    <div><span class="muted">Phòng:</span> ${esc(reservation.rooms?.number ?? "Chưa gán")}</div>
    <div><span class="muted">Nhận phòng:</span> ${formatDate(reservation.check_in)}${reservation.check_in_time ? ` ${esc(reservation.check_in_time)}` : ""}</div>
    <div><span class="muted">Trả phòng:</span> ${formatDate(reservation.check_out)}${reservation.check_out_time ? ` ${esc(reservation.check_out_time)}` : ""}</div>
  </div>

  <h2>Chi phí</h2>
  <table>
    <tr><td>Tiền phòng</td><td></td><td class="num">${formatVnd(reservation.base_amount + reservation.surcharge)}</td></tr>
    ${
      reservation.discount_amount > 0
        ? `<tr><td>Giảm giá</td><td></td><td class="num">-${formatVnd(reservation.discount_amount)}</td></tr>`
        : ""
    }
    ${
      reservation.tax_amount > 0
        ? `<tr><td>VAT</td><td></td><td class="num">${formatVnd(reservation.tax_amount)}</td></tr>`
        : ""
    }
    ${serviceRows}
    <tr class="total-row"><td>Tổng cộng</td><td></td><td class="num">${formatVnd(folioTotal)}</td></tr>
  </table>

  <h2>Thanh toán</h2>
  <table>
    ${paymentRows || `<tr><td class="muted" colspan="3">Chưa có thanh toán</td></tr>`}
    <tr class="total-row"><td>Đã thanh toán</td><td></td><td class="num">${formatVnd(paid)}</td></tr>
    <tr class="total-row"><td>Còn lại</td><td></td><td class="num">${formatVnd(remaining)}</td></tr>
  </table>

  <div class="sign">
    <div>Khách hàng<br/><br/><br/>(Ký, ghi rõ họ tên)</div>
    <div>Lễ tân<br/><br/><br/>(Ký, ghi rõ họ tên)</div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export interface GroupMemberRow {
  confirmation_code: string;
  room_type: string;
  room_number: string;
  total_amount: number;
  services_total: number;
  payment_status: string;
}

/** In phiếu tổng hợp cho cả đoàn — một bảng, tổng cộng cuối trang. */
export function printGroupReceipt(
  groupCode: string,
  members: ReadonlyArray<GroupMemberRow>,
): void {
  const rows = members
    .map(
      (m) =>
        `<tr><td>${esc(m.confirmation_code)}</td><td>${esc(m.room_type)}</td><td>${esc(m.room_number)}</td>` +
        `<td class="num">${formatVnd(m.total_amount)}</td><td class="num">${formatVnd(m.services_total)}</td>` +
        `<td class="num">${formatVnd(m.total_amount + m.services_total)}</td><td>${esc(m.payment_status)}</td></tr>`,
    )
    .join("");
  const grand = members.reduce((s, m) => s + m.total_amount + m.services_total, 0);
  const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8" />
<title>Phiếu đoàn ${esc(groupCode)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 13px; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #ddd; }
  th { font-size: 11px; text-transform: uppercase; color: #555; }
  .num { text-align: right; }
  .total-row td { font-weight: 700; border-top: 2px solid #111; }
  @media print { body { margin: 8mm; } }
</style></head><body>
  <h1>PHIẾU THANH TOÁN ĐOÀN</h1>
  <div style="color:#666">Mã đoàn: <strong>${esc(groupCode)}</strong> · ${members.length} phòng · In lúc ${formatDateTime(new Date().toISOString())}</div>
  <table>
    <thead><tr><th>Mã đặt phòng</th><th>Loại</th><th>Phòng</th><th class="num">Tiền phòng</th><th class="num">Dịch vụ</th><th class="num">Cộng</th><th>Thanh toán</th></tr></thead>
    <tbody>${rows}
      <tr class="total-row"><td colspan="5">TỔNG CỘNG CẢ ĐOÀN</td><td class="num">${formatVnd(grand)}</td><td></td></tr>
    </tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body></html>`;
  const w = window.open("", "_blank", "width=860,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
