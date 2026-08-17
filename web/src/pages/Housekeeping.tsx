import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { formatDate } from "../lib/format";
import type {
  LostFoundItem,
  Room,
  RoomStatus,
  StaffLite,
  WorkOrder,
  WorkOrderStatus,
} from "../lib/types";

const PRIORITY_STATUSES: RoomStatus[] = ["cleaning", "maintenance", "out_of_order"];

const STATUS_LABEL: Record<RoomStatus, string> = {
  available: "Trống",
  reserved: "Đã đặt",
  occupied: "Đang ở",
  cleaning: "Đang dọn",
  maintenance: "Bảo trì",
  out_of_order: "Hỏng",
};

const STATUS_PILL: Record<RoomStatus, string> = {
  available: "success",
  reserved: "info",
  occupied: "warning",
  cleaning: "neutral",
  maintenance: "neutral",
  out_of_order: "danger",
};

export function Housekeeping() {
  const qc = useQueryClient();

  const roomsQuery = useQuery({
    queryKey: ["rooms", "all"],
    queryFn: () => apiFetch<Room[]>("/api/rooms"),
    refetchInterval: 30_000,
  });

  const staffQuery = useQuery({
    queryKey: ["staff-lite"],
    queryFn: () => apiFetch<StaffLite[]>("/api/auth/staff-lite"),
  });

  const assign = useMutation({
    mutationFn: ({ roomId, staffId }: { roomId: string; staffId: string | null }) =>
      apiFetch(`/api/rooms/${roomId}/assign`, { method: "PATCH", body: { staff_id: staffId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RoomStatus }) =>
      apiFetch<Room>(`/api/rooms/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const rooms = roomsQuery.data ?? [];
  const needsAttention = rooms.filter((r) => PRIORITY_STATUSES.includes(r.status));
  const ready = rooms.filter((r) => r.status === "available");

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Buồng phòng</h1>
        <div className="muted">
          {needsAttention.length} cần xử lý · {ready.length} sẵn sàng
        </div>
      </div>

      {roomsQuery.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : roomsQuery.isError ? (
        <div className="card" style={{ padding: "var(--space-4)", color: "var(--color-danger)" }}>
          Lỗi tải danh sách phòng
        </div>
      ) : (
        <>
          <Section
            title="Cần xử lý"
            empty="Không có phòng nào cần xử lý"
            rooms={needsAttention}
            onMark={(id, status) => updateStatus.mutate({ id, status })}
            staff={staffQuery.data ?? []}
            onAssign={(roomId, staffId) => assign.mutate({ roomId, staffId })}
            primary
          />
          <Section
            title="Sẵn sàng đón khách"
            empty="Chưa có phòng sẵn sàng"
            rooms={ready}
            onMark={(id, status) => updateStatus.mutate({ id, status })}
          />
          <WorkOrdersSection rooms={rooms} />
          <LostFoundSection />
        </>
      )}
    </div>
  );
}

function LostFoundSection() {
  const qc = useQueryClient();
  const [item, setItem] = useState("");
  const [location, setLocation] = useState("");
  const [showReturned, setShowReturned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["lost-found"],
    queryFn: () => apiFetch<LostFoundItem[]>("/api/lost-found"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<LostFoundItem>("/api/lost-found", {
        method: "POST",
        body: { item, location: location || undefined },
      }),
    onSuccess: () => {
      setItem("");
      setLocation("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["lost-found"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  const markReturned = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/lost-found/${id}`, { method: "PUT", body: { status: "returned" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lost-found"] }),
  });

  const rows = (list.data ?? []).filter((x) => showReturned || x.status === "stored");

  return (
    <section>
      <h2
        style={{
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-soft)",
          margin: "0 0 var(--space-2)",
        }}
      >
        Đồ thất lạc (Lost &amp; Found)
      </h2>
      <div className="card" style={{ padding: "var(--space-4)" }}>
        <form
          className="row"
          style={{ gap: 8, flexWrap: "wrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (item && !create.isPending) create.mutate();
          }}
        >
          <input
            className="input"
            style={{ flex: "1 1 200px" }}
            placeholder="Món đồ (VD: Sạc iPhone màu trắng)"
            value={item}
            onChange={(e) => setItem(e.target.value)}
          />
          <input
            className="input"
            style={{ width: 180 }}
            placeholder="Nơi nhặt (VD: Phòng 101)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={!item || create.isPending}>
            + Ghi nhận
          </button>
          <div className="spacer" />
          <label className="row" style={{ gap: 4, fontSize: 12, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showReturned}
              onChange={(e) => setShowReturned(e.target.checked)}
            />
            Hiện đồ đã trả
          </label>
        </form>
        {error ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}

        {rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, marginTop: "var(--space-2)" }}>
            Không có đồ thất lạc đang lưu.
          </div>
        ) : (
          <table className="table" style={{ marginTop: "var(--space-2)" }}>
            <thead>
              <tr>
                <th>Món đồ</th>
                <th>Nơi nhặt</th>
                <th>Ngày nhặt</th>
                <th>Người ghi nhận</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td style={{ fontWeight: 500 }}>{x.item}</td>
                  <td>{x.location ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(x.found_on)}</td>
                  <td>{x.staff?.name ?? "—"}</td>
                  <td>
                    {x.status === "stored" ? (
                      <span className="pill warning">Đang lưu</span>
                    ) : (
                      <span className="pill success">Đã trả khách</span>
                    )}
                  </td>
                  <td style={{ width: 1 }}>
                    {x.status === "stored" ? (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: "2px 8px" }}
                        onClick={() => markReturned.mutate(x.id)}
                        disabled={markReturned.isPending}
                      >
                        ✓ Đã trả khách
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

const WO_LABEL: Record<WorkOrderStatus, string> = {
  open: "Mới",
  in_progress: "Đang sửa",
  done: "Đã xong",
};
const WO_PILL: Record<WorkOrderStatus, string> = {
  open: "danger",
  in_progress: "warning",
  done: "success",
};

function WorkOrdersSection({ rooms }: { rooms: Room[] }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [roomId, setRoomId] = useState("");
  const [markMaintenance, setMarkMaintenance] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["work-orders"],
    queryFn: () => apiFetch<WorkOrder[]>("/api/work-orders"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<WorkOrder>("/api/work-orders", {
        method: "POST",
        body: {
          title,
          room_id: roomId || undefined,
          set_room_maintenance: markMaintenance && !!roomId,
        },
      }),
    onSuccess: () => {
      setTitle("");
      setRoomId("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  const advance = useMutation({
    mutationFn: (wo: WorkOrder) =>
      apiFetch(`/api/work-orders/${wo.id}`, {
        method: "PUT",
        body:
          wo.status === "open"
            ? { status: "in_progress" }
            : { status: "done", release_room: true },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
    },
  });

  const rows = (list.data ?? []).filter((w) => showDone || w.status !== "done");

  return (
    <section>
      <h2
        style={{
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-soft)",
          margin: "0 0 var(--space-2)",
        }}
      >
        Phiếu bảo trì
      </h2>
      <div className="card" style={{ padding: "var(--space-4)" }}>
        <form
          className="row"
          style={{ gap: 8, flexWrap: "wrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (title && !create.isPending) create.mutate();
          }}
        >
          <input
            className="input"
            style={{ flex: "1 1 220px" }}
            placeholder="Sự cố (VD: Điều hòa không mát)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select className="input" style={{ width: "auto" }} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Không gắn phòng</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Phòng {r.number}
              </option>
            ))}
          </select>
          <label className="row" style={{ gap: 4, fontSize: 12, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={markMaintenance}
              onChange={(e) => setMarkMaintenance(e.target.checked)}
            />
            Chuyển phòng sang bảo trì
          </label>
          <button className="btn btn-primary" type="submit" disabled={!title || create.isPending}>
            + Tạo phiếu
          </button>
        </form>
        {error ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}

        <div className="row" style={{ justifyContent: "flex-end", marginTop: "var(--space-2)" }}>
          <label className="row" style={{ gap: 4, fontSize: 12, alignItems: "center" }}>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Hiện phiếu đã xong
          </label>
        </div>

        {rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, marginTop: "var(--space-2)" }}>
            Không có phiếu bảo trì nào đang mở.
          </div>
        ) : (
          <table className="table" style={{ marginTop: "var(--space-2)" }}>
            <thead>
              <tr>
                <th>Sự cố</th>
                <th>Phòng</th>
                <th>Người tạo</th>
                <th>Lúc</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((wo) => (
                <tr key={wo.id}>
                  <td>{wo.title}</td>
                  <td>{wo.rooms?.number ?? "—"}</td>
                  <td>{wo.staff?.name ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>{formatDateTime(wo.created_at)}</td>
                  <td>
                    <span className={`pill ${WO_PILL[wo.status]}`}>{WO_LABEL[wo.status]}</span>
                  </td>
                  <td style={{ width: 1 }}>
                    {wo.status !== "done" ? (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: "2px 8px" }}
                        onClick={() => advance.mutate(wo)}
                        disabled={advance.isPending}
                      >
                        {wo.status === "open" ? "Bắt đầu sửa" : "✓ Xong (phòng → dọn)"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Section({
  title,
  rooms,
  empty,
  onMark,
  staff,
  onAssign,
  primary,
}: {
  title: string;
  rooms: Room[];
  empty: string;
  onMark: (id: string, status: RoomStatus) => void;
  staff?: StaffLite[];
  onAssign?: (roomId: string, staffId: string | null) => void;
  primary?: boolean;
}) {
  return (
    <section>
      <h2
        style={{
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--color-text-soft)",
          margin: "0 0 var(--space-2)",
        }}
      >
        {title}
      </h2>
      {rooms.length === 0 ? (
        <div className="card" style={{ padding: "var(--space-4)", textAlign: "center" }}>
          <span className="muted">{empty}</span>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "var(--space-3)",
          }}
        >
          {rooms.map((room) => (
            <div key={room.id} className="card" style={{ padding: "var(--space-3)" }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{room.number}</div>
                <span className={`pill ${STATUS_PILL[room.status]}`}>
                  {STATUS_LABEL[room.status]}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Tầng {room.floor} · {room.room_types?.name ?? "—"}
              </div>
              {room.last_cleaned_at ? (
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                  Đã dọn: {formatDateTime(room.last_cleaned_at)}
                </div>
              ) : null}
              {onAssign && staff && room.status === "cleaning" ? (
                <select
                  className="input"
                  style={{ marginTop: 6, height: 30, fontSize: 12 }}
                  value={room.cleaning_assignee ?? ""}
                  onChange={(e) => onAssign(room.id, e.target.value || null)}
                  title="Giao phòng này cho nhân viên dọn"
                >
                  <option value="">— Giao cho… —</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : room.staff?.name && room.status === "cleaning" ? (
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                  🧹 {room.staff.name}
                </div>
              ) : null}
              <div
                className="row"
                style={{ gap: 6, marginTop: "var(--space-2)", flexWrap: "wrap" }}
              >
                {primary && room.status === "cleaning" ? (
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={() => onMark(room.id, "available")}
                  >
                    ✓ Đã dọn
                  </button>
                ) : null}
                {room.status !== "maintenance" ? (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={() => onMark(room.id, "maintenance")}
                  >
                    Bảo trì
                  </button>
                ) : null}
                {room.status !== "available" ? (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={() => onMark(room.id, "available")}
                  >
                    Sẵn sàng
                  </button>
                ) : null}
                {room.status === "available" ? (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: "4px 10px" }}
                    onClick={() => onMark(room.id, "cleaning")}
                  >
                    Cần dọn
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
