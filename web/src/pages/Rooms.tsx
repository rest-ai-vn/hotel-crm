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

const STATUS_PILL: Record<RoomStatus, string> = {
  available: "success",
  reserved: "info",
  occupied: "warning",
  cleaning: "neutral",
  maintenance: "neutral",
  out_of_order: "danger",
};

const STATUS_OPTIONS: RoomStatus[] = [
  "available",
  "reserved",
  "occupied",
  "cleaning",
  "maintenance",
  "out_of_order",
];

export function Rooms() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";
  const [statusFilter, setStatusFilter] = useState<RoomStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [floorFilter, setFloorFilter] = useState<string>("");

  const typesQuery = useQuery({
    queryKey: ["roomTypes"],
    queryFn: () => apiFetch<RoomType[]>("/api/rooms/types"),
  });

  const roomsQuery = useQuery({
    queryKey: ["rooms", statusFilter, typeFilter, floorFilter],
    queryFn: () =>
      apiFetch<Room[]>("/api/rooms", {
        query: {
          status: statusFilter || undefined,
          type_id: typeFilter || undefined,
          floor: floorFilter || undefined,
        },
      }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RoomStatus }) =>
      apiFetch<Room>(`/api/rooms/${id}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
  });

  const rooms = roomsQuery.data ?? [];
  const byFloor = rooms.reduce<Record<number, Room[]>>((acc, r) => {
    (acc[r.floor] ??= []).push(r);
    return acc;
  }, {});
  const sortedFloors = Object.keys(byFloor)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.01em" }}>Phòng</h1>
          <div className="muted">{rooms.length} phòng</div>
        </div>
      </div>

      <div className="card" style={{ padding: "var(--space-3)" }}>
        <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-3)" }}>
          <select
            className="input"
            style={{ width: "auto" }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RoomStatus | "")}
          >
            <option value="">Mọi trạng thái</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
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
          <input
            className="input"
            style={{ width: 100 }}
            placeholder="Tầng"
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value.replace(/[^0-9]/g, ""))}
          />
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
        <div className="stack" style={{ gap: "var(--space-5)" }}>
          {sortedFloors.map((floor) => (
            <section key={floor}>
              <div
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--color-text-soft)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Tầng {floor}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: "var(--space-3)",
                }}
              >
                {byFloor[floor]!.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onChangeStatus={(status) => updateStatus.mutate({ id: room.id, status })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {canManage ? <RoomTypesSection /> : null}
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

function RoomCard({
  room,
  onChangeStatus,
}: {
  room: Room;
  onChangeStatus: (status: RoomStatus) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ padding: "var(--space-3)", position: "relative" }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{room.number}</div>
        <span className={`pill ${STATUS_PILL[room.status]}`}>{STATUS_LABEL[room.status]}</span>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {room.room_types?.name ?? "—"}
      </div>
      <button
        className="btn btn-ghost"
        onClick={() => setOpen((v) => !v)}
        style={{ marginTop: "var(--space-2)", width: "100%", padding: "4px 8px", fontSize: 12 }}
      >
        Đổi trạng thái
      </button>
      {open ? (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            padding: 4,
            zIndex: 10,
            display: "grid",
            gap: 2,
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              className="btn btn-ghost"
              style={{
                justifyContent: "flex-start",
                padding: "6px 10px",
                fontWeight: room.status === s ? 600 : 400,
              }}
              onClick={() => {
                setOpen(false);
                if (s !== room.status) onChangeStatus(s);
              }}
            >
              <span className={`pill ${STATUS_PILL[s]}`} style={{ marginRight: 8 }}>
                {STATUS_LABEL[s]}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
