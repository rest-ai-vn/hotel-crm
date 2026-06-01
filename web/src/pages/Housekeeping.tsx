import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { Room, RoomStatus } from "../lib/types";

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
            primary
          />
          <Section
            title="Sẵn sàng đón khách"
            empty="Chưa có phòng sẵn sàng"
            rooms={ready}
            onMark={(id, status) => updateStatus.mutate({ id, status })}
          />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  rooms,
  empty,
  onMark,
  primary,
}: {
  title: string;
  rooms: Room[];
  empty: string;
  onMark: (id: string, status: RoomStatus) => void;
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
