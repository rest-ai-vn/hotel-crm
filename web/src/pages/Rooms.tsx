import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import type { Room, RoomStatus, RoomType } from "../lib/types";

const STATUS_LABEL: Record<RoomStatus, string> = {
  available: "Trống",
  reserved: "Đã đặt",
  occupied: "Đang ở",
  cleaning: "Đang dọn",
  maintenance: "Bảo trì",
  out_of_order: "Hỏng",
};

const STATUS_OPTIONS: RoomStatus[] = [
  "available",
  "reserved",
  "occupied",
  "cleaning",
  "maintenance",
  "out_of_order",
];

// Tile colors per status — dense room map that stays readable at 100+ rooms.
const TILE_STYLE: Record<RoomStatus, { bg: string; border: string; text: string }> = {
  available: { bg: "oklch(96% 0.05 145)", border: "oklch(80% 0.09 145)", text: "oklch(35% 0.14 145)" },
  reserved: { bg: "oklch(95% 0.04 230)", border: "oklch(80% 0.07 230)", text: "oklch(38% 0.13 230)" },
  occupied: { bg: "oklch(96% 0.07 80)", border: "oklch(80% 0.1 80)", text: "oklch(38% 0.14 80)" },
  cleaning: { bg: "oklch(96% 0.005 250)", border: "oklch(85% 0.01 250)", text: "oklch(45% 0.02 250)" },
  maintenance: { bg: "oklch(95% 0.03 300)", border: "oklch(82% 0.06 300)", text: "oklch(40% 0.1 300)" },
  out_of_order: { bg: "oklch(95% 0.05 25)", border: "oklch(82% 0.09 25)", text: "oklch(38% 0.18 25)" },
};

export function Rooms() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";
  const [statusFilter, setStatusFilter] = useState<RoomStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [picker, setPicker] = useState<Room | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  const typesQuery = useQuery({
    queryKey: ["roomTypes"],
    queryFn: () => apiFetch<RoomType[]>("/api/rooms/types"),
  });

  // Fetch once; filter client-side so the status counters stay free and instant.
  const roomsQuery = useQuery({
    queryKey: ["rooms", "all"],
    queryFn: () => apiFetch<Room[]>("/api/rooms"),
    refetchInterval: 30_000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RoomStatus }) =>
      apiFetch<Room>(`/api/rooms/${id}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => {
      setPicker(null);
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const removeRoom = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ number: string; mode: "deleted" | "archived"; past_reservations?: number }>(
        `/api/rooms/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: (result) => {
      setPicker(null);
      setDeleteError(null);
      setDeleteNotice(
        result.mode === "archived"
          ? `Phòng ${result.number} đã ngừng sử dụng (giữ lại ${result.past_reservations ?? 0} đặt phòng cũ để không mất lịch sử)`
          : `Đã xóa phòng ${result.number}`,
      );
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (e) => setDeleteError(e instanceof Error ? e.message : "Không xóa được phòng"),
  });

  const allRooms = roomsQuery.data ?? [];
  const counts = allRooms.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const rooms = allRooms.filter(
    (r) =>
      (!statusFilter || r.status === statusFilter) &&
      (!typeFilter || r.room_type_id === typeFilter) &&
      (!search || r.number.includes(search)),
  );
  const byFloor = rooms.reduce<Record<number, Room[]>>((acc, r) => {
    (acc[r.floor] ??= []).push(r);
    return acc;
  }, {});
  const sortedFloors = Object.keys(byFloor)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="stack" style={{ gap: "var(--space-4)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Phòng</h1>
          <div className="muted">
            {rooms.length}/{allRooms.length} phòng · bấm vào ô phòng để đổi trạng thái
          </div>
        </div>
      </div>

      {deleteNotice ? (
        <div
          className="card"
          style={{
            padding: "var(--space-3)",
            borderLeft: "3px solid var(--color-accent)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--space-3)",
          }}
        >
          <span style={{ fontSize: 13 }}>✓ {deleteNotice}</span>
          <button className="btn btn-ghost" onClick={() => setDeleteNotice(null)}>
            ✕
          </button>
        </div>
      ) : null}

      <div className="card" style={{ padding: "var(--space-3)" }}>
        <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
          {STATUS_OPTIONS.map((s) => {
            const active = statusFilter === s;
            const t = TILE_STYLE[s];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(active ? "" : s)}
                className="pill"
                style={{
                  cursor: "pointer",
                  background: t.bg,
                  borderColor: active ? t.text : t.border,
                  color: t.text,
                  fontWeight: active ? 700 : 500,
                  boxShadow: active ? `0 0 0 2px ${t.border}` : "none",
                }}
              >
                {STATUS_LABEL[s]} {counts[s] ?? 0}
              </button>
            );
          })}
          <div className="spacer" />
          <input
            className="input"
            style={{ width: 120 }}
            placeholder="🔍 Số phòng"
            inputMode="numeric"
            value={search}
            onChange={(e) => setSearch(e.target.value.trim())}
          />
          <select
            className="input"
            style={{ width: "auto" }}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">Mọi loại phòng</option>
            {(typesQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {roomsQuery.isLoading ? (
        <div className="muted">Đang tải…</div>
      ) : roomsQuery.isError ? (
        <div className="card" style={{ padding: "var(--space-4)", color: "var(--color-danger)" }}>
          Lỗi tải danh sách phòng
        </div>
      ) : sortedFloors.length === 0 ? (
        <div className="card" style={{ padding: "var(--space-5)", textAlign: "center" }}>
          <div className="muted">Không có phòng nào khớp bộ lọc</div>
        </div>
      ) : (
        <div className="stack" style={{ gap: "var(--space-4)" }}>
          {sortedFloors.map((floor) => (
            <section key={floor}>
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--color-text-soft)",
                  marginBottom: 6,
                }}
              >
                Tầng {floor} · {byFloor[floor]!.length} phòng
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(86px, 1fr))",
                  gap: 8,
                }}
              >
                {byFloor[floor]!.map((room) => {
                  const t = TILE_STYLE[room.status];
                  return (
                    <button
                      key={room.id}
                      className="room-tile"
                      onClick={() => setPicker(room)}
                      title={`${room.number} · ${room.room_types?.name ?? ""} · ${STATUS_LABEL[room.status]}`}
                      style={{
                        border: `1px solid ${t.border}`,
                        background: t.bg,
                        color: t.text,
                        borderRadius: "var(--radius-md)",
                        padding: "8px 6px",
                        textAlign: "center",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
                        {room.number}
                      </div>
                      <div style={{ fontSize: 10, opacity: 0.85, letterSpacing: "0.03em" }}>
                        {room.room_types?.code ?? ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {picker ? (
        <StatusPickerModal
          room={picker}
          busy={updateStatus.isPending}
          canManage={canManage}
          deleting={removeRoom.isPending}
          deleteError={deleteError}
          onClose={() => {
            setPicker(null);
            setDeleteError(null);
          }}
          onPick={(status) => updateStatus.mutate({ id: picker.id, status })}
          onDelete={() => removeRoom.mutate(picker.id)}
        />
      ) : null}

      {canManage ? <RoomTypesSection /> : null}
    </div>
  );
}

function StatusPickerModal({
  room,
  busy,
  canManage,
  deleting,
  deleteError,
  onClose,
  onPick,
  onDelete,
}: {
  room: Room;
  busy: boolean;
  canManage: boolean;
  deleting: boolean;
  deleteError: string | null;
  onClose: () => void;
  onPick: (status: RoomStatus) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0% 0 0 / 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 70,
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          width: 300,
          maxWidth: "100%",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "var(--space-4)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Phòng {room.number}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {room.room_types?.name ?? ""} · Tầng {room.floor}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {STATUS_OPTIONS.map((s) => {
            const t = TILE_STYLE[s];
            const current = room.status === s;
            return (
              <button
                key={s}
                disabled={busy || current}
                onClick={() => onPick(s)}
                style={{
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  borderRadius: "var(--radius-md)",
                  padding: "9px 12px",
                  textAlign: "left",
                  fontWeight: current ? 700 : 500,
                  cursor: current ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {STATUS_LABEL[s]}
                {current ? " ✓ (hiện tại)" : ""}
              </button>
            );
          })}
        </div>

        {canManage ? (
          <div
            style={{
              marginTop: "var(--space-3)",
              paddingTop: "var(--space-3)",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            {deleteError ? (
              <div style={{ color: "var(--color-danger)", fontSize: 12, marginBottom: 8 }}>
                {deleteError}
              </div>
            ) : null}

            {confirming ? (
              <div className="stack" style={{ gap: 8 }}>
                <div style={{ fontSize: 12, lineHeight: 1.45 }}>
                  Xóa phòng <strong>{room.number}</strong>? Phòng từng có khách ở sẽ được{" "}
                  <em>ngừng sử dụng</em> thay vì xóa hẳn, để không mất hóa đơn và báo cáo cũ.
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setConfirming(false)}
                    disabled={deleting}
                  >
                    Không
                  </button>
                  <button
                    className="btn"
                    onClick={onDelete}
                    disabled={deleting}
                    style={{
                      background: "var(--color-danger)",
                      color: "white",
                      fontWeight: 600,
                    }}
                  >
                    {deleting ? "Đang xóa…" : "Xóa phòng"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={() => setConfirming(true)}
                style={{ color: "var(--color-danger)", fontSize: 13, padding: "4px 8px" }}
              >
                🗑 Xóa phòng
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RoomTypesSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RoomType | null>(null);
  const [creating, setCreating] = useState(false);
  const [newRoom, setNewRoom] = useState({ number: "", floor: "", typeId: "" });
  const [roomError, setRoomError] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ["roomTypes", "all"],
    queryFn: () => apiFetch<RoomType[]>("/api/rooms/types", { query: { all: 1 } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["roomTypes"] });
    qc.invalidateQueries({ queryKey: ["rooms"] });
  };

  const addRoom = useMutation({
    mutationFn: () =>
      apiFetch<Room>("/api/rooms", {
        method: "POST",
        body: {
          room_type_id: newRoom.typeId,
          number: newRoom.number,
          floor: Number(newRoom.floor) || 0,
        },
      }),
    onSuccess: () => {
      setNewRoom({ number: "", floor: "", typeId: "" });
      setRoomError(null);
      refresh();
    },
    onError: (e) => setRoomError(e instanceof Error ? e.message : "Lỗi"),
  });

  const rows = types.data ?? [];

  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <h2
          style={{
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--color-text-soft)",
            margin: 0,
          }}
        >
          Loại phòng của cơ sở
        </h2>
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setCreating(true)}>
          + Thêm loại phòng
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Mã</th>
              <th>Sức chứa</th>
              <th>Mô tả</th>
              <th>Thứ tự</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{t.code}</td>
                <td>{t.max_guests} khách</td>
                <td className="muted" style={{ fontSize: 13, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.description ?? "—"}
                </td>
                <td>{t.sort_order}</td>
                <td>
                  {t.is_active ? (
                    <span className="pill success">Hoạt động</span>
                  ) : (
                    <span className="pill neutral">Đã tắt</span>
                  )}
                </td>
                <td style={{ width: 1 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: "2px 8px" }}
                    onClick={() => setEditing(t)}
                  >
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: "var(--space-3)", marginTop: "var(--space-3)" }}>
        <form
          className="row"
          style={{ gap: 8, flexWrap: "wrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (newRoom.number && newRoom.typeId && !addRoom.isPending) addRoom.mutate();
          }}
        >
          <span className="muted" style={{ fontSize: 13 }}>＋ Thêm phòng nhanh:</span>
          <input
            className="input"
            style={{ width: 100 }}
            placeholder="Số phòng"
            value={newRoom.number}
            onChange={(e) => setNewRoom({ ...newRoom, number: e.target.value })}
          />
          <input
            className="input"
            style={{ width: 80 }}
            placeholder="Tầng"
            inputMode="numeric"
            value={newRoom.floor}
            onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value.replace(/[^0-9]/g, "") })}
          />
          <select
            className="input"
            style={{ width: "auto" }}
            value={newRoom.typeId}
            onChange={(e) => setNewRoom({ ...newRoom, typeId: e.target.value })}
          >
            <option value="">Chọn loại…</option>
            {rows.filter((t) => t.is_active).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button className="btn" type="submit" disabled={!newRoom.number || !newRoom.typeId || addRoom.isPending}>
            Thêm
          </button>
        </form>
        {roomError ? <div style={{ color: "var(--color-danger)", fontSize: 13, marginTop: 6 }}>{roomError}</div> : null}
      </div>

      {creating || editing ? (
        <RoomTypeModal
          type={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function RoomTypeModal({
  type,
  onClose,
  onSaved,
}: {
  type: RoomType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(type?.name ?? "");
  const [code, setCode] = useState(type?.code ?? "");
  const [maxGuests, setMaxGuests] = useState(String(type?.max_guests ?? 2));
  const [description, setDescription] = useState(type?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(type?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(type?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        code: code.toUpperCase(),
        max_guests: Math.max(1, Number(maxGuests) || 2),
        description: description || undefined,
        sort_order: Number(sortOrder) || 0,
        ...(type ? { is_active: isActive } : {}),
      };
      return type
        ? apiFetch<RoomType>(`/api/rooms/types/${type.id}`, { method: "PUT", body })
        : apiFetch<RoomType>("/api/rooms/types", { method: "POST", body });
    },
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof Error ? e.message : "Lỗi"),
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0% 0 0 / 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 70,
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          width: 440,
          maxWidth: "100%",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "var(--space-5)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {type ? `Sửa loại phòng ${type.code}` : "Thêm loại phòng"}
          </h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="stack" style={{ gap: "var(--space-3)" }}>
          <div className="row" style={{ gap: "var(--space-3)" }}>
            <label className="stack" style={{ gap: 4, flex: 1 }}>
              <span className="muted" style={{ fontSize: 12 }}>Tên loại phòng</span>
              <input className="input" placeholder="VD: Deluxe hướng biển" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="stack" style={{ gap: 4, width: 110 }}>
              <span className="muted" style={{ fontSize: 12 }}>Mã</span>
              <input className="input" placeholder="DLX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} disabled={!!type} />
            </label>
          </div>
          <div className="row" style={{ gap: "var(--space-3)" }}>
            <label className="stack" style={{ gap: 4, flex: 1 }}>
              <span className="muted" style={{ fontSize: 12 }}>Sức chứa tối đa (khách)</span>
              <input className="input" inputMode="numeric" value={maxGuests} onChange={(e) => setMaxGuests(e.target.value.replace(/[^0-9]/g, ""))} />
            </label>
            <label className="stack" style={{ gap: 4, width: 110 }}>
              <span className="muted" style={{ fontSize: 12 }}>Thứ tự hiển thị</span>
              <input className="input" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9]/g, ""))} />
            </label>
          </div>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Mô tả (hiện cho lễ tân khi đặt phòng)</span>
            <textarea className="input" rows={3} placeholder="Tuỳ chọn" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {type ? (
            <label className="row" style={{ gap: 8, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Đang hoạt động (tắt để ẩn khỏi đặt phòng — phòng cũ giữ nguyên)
            </label>
          ) : null}
          {error ? <div style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div> : null}
          <button
            className="btn btn-primary"
            disabled={!name || !code || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Đang lưu…" : type ? "Lưu thay đổi" : "Tạo loại phòng"}
          </button>
        </div>
      </div>
    </div>
  );
}
