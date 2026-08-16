import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetchEnvelope } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { AuditLog } from "../lib/types";

const ENTITY_OPTIONS = [
  { value: "", label: "Mọi đối tượng" },
  { value: "reservation", label: "Đặt phòng" },
  { value: "payment", label: "Thanh toán" },
  { value: "shift", label: "Ca làm việc" },
  { value: "night_audit", label: "Chốt ngày" },
  { value: "rate_override", label: "Giá ngày lễ" },
  { value: "rate_plan", label: "Bảng giá" },
  { value: "cash_transaction", label: "Sổ quỹ" },
  { value: "staff", label: "Nhân viên" },
  { value: "property", label: "Cơ sở" },
];

const ACTION_LABEL: Record<string, string> = {
  "reservation.create": "Tạo đặt phòng",
  "reservation.cancel": "Hủy đặt phòng",
  "reservation.check_in": "Nhận phòng",
  "reservation.check_out": "Trả phòng",
  "reservation.no_show": "Đánh dấu không đến",
  "reservation.move_room": "Đổi phòng",
  "reservation.extend": "Gia hạn",
  "payment.payment": "Thu tiền",
  "payment.deposit": "Nhận cọc",
  "payment.refund": "Hoàn tiền",
  "payment.delete": "Xóa thanh toán",
  "shift.open": "Mở ca",
  "shift.close": "Chốt ca",
  "night_audit.run": "Chốt ngày",
  "rate_override.create": "Tạo giá ngày lễ",
  "rate_override.update": "Sửa giá ngày lễ",
  "rate_override.delete": "Xóa giá ngày lễ",
  "rate_plan.create": "Tạo bảng giá",
  "rate_plan.update": "Sửa bảng giá",
  "rate_plan.delete": "Xóa bảng giá",
  "cash_transaction.delete": "Xóa giao dịch quỹ",
  "staff.create": "Tạo nhân viên",
  "staff.update": "Cập nhật nhân viên",
  "staff.change_password": "Đổi mật khẩu",
  "property.create": "Tạo cơ sở",
  "property.update": "Sửa cơ sở",
  "voucher.create": "Tạo voucher",
  "voucher.update": "Sửa voucher",
  "company.create": "Tạo công ty",
  "company.update": "Sửa công ty",
  "work_order.create": "Tạo phiếu bảo trì",
  "work_order.update": "Cập nhật phiếu bảo trì",
};

export function AuditLogs() {
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const logs = useQuery({
    queryKey: ["audit-logs", entity, from, to],
    queryFn: () =>
      apiFetchEnvelope<AuditLog[]>("/api/audit-logs", {
        query: { entity: entity || undefined, from: from || undefined, to: to || undefined, limit: 200 },
      }),
  });

  const rows = logs.data?.data ?? [];

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Nhật ký hoạt động</h1>
        <div className="muted">{logs.data?.meta?.total ?? rows.length} bản ghi</div>
      </div>

      <div className="card" style={{ padding: "var(--space-3)" }}>
        <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-3)" }}>
          <select className="input" style={{ width: "auto" }} value={entity} onChange={(e) => setEntity(e.target.value)}>
            {ENTITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input type="date" className="input" style={{ width: "auto" }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">→</span>
          <input type="date" className="input" style={{ width: "auto" }} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {logs.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: "var(--space-5)", textAlign: "center" }}>
          <span className="muted">Không có bản ghi nào.</span>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Nhân viên</th>
                <th>Hành động</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{formatDateTime(l.created_at)}</td>
                  <td>{l.staff_name ?? "—"}</td>
                  <td>{ACTION_LABEL[l.action] ?? l.action}</td>
                  <td className="muted" style={{ fontSize: 12, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.details ? JSON.stringify(l.details) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
