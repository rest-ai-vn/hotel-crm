import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
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
