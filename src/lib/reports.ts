// Hotel revenue KPIs (pure, no I/O).
// Standard industry metrics: Occupancy %, ADR, RevPAR.

export interface RevenueKpis {
  room_revenue: number;        // tổng tiền phòng (VND)
  service_revenue: number;     // tổng tiền dịch vụ (VND)
  total_revenue: number;       // room + service
  room_nights_sold: number;    // số đêm-phòng đã bán
  available_room_nights: number; // số phòng × số ngày trong kỳ
  occupancy_pct: number;       // công suất %
  adr: number;                 // Average Daily Rate = room_revenue / room_nights_sold
  revpar: number;              // Revenue per Available Room = room_revenue / available_room_nights
}

function round(n: number): number {
  return Math.round(n);
}

/** Number of calendar days in an inclusive YYYY-MM-DD..YYYY-MM-DD range (min 1). */
export function daysInRange(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 1;
  const diff = Math.floor((to - from) / 86_400_000) + 1;
  return Math.max(1, diff);
}

/**
 * Compute revenue KPIs.
 * @param roomRevenue   tổng tiền phòng đã bán trong kỳ
 * @param serviceRevenue tổng tiền dịch vụ đã bán trong kỳ
 * @param roomNightsSold số đêm-phòng đã bán
 * @param totalRooms     số phòng đang hoạt động
 * @param days           số ngày trong kỳ
 */
export function computeRevenueKpis(
  roomRevenue: number,
  serviceRevenue: number,
  roomNightsSold: number,
  totalRooms: number,
  days: number,
): RevenueKpis {
  const room = Math.max(0, roomRevenue);
  const service = Math.max(0, serviceRevenue);
  const sold = Math.max(0, roomNightsSold);
  const available = Math.max(0, totalRooms) * Math.max(1, days);

  const occupancyPct = available > 0 ? Math.round((sold / available) * 100) : 0;
  const adr = sold > 0 ? round(room / sold) : 0;
  const revpar = available > 0 ? round(room / available) : 0;

  return {
    room_revenue: room,
    service_revenue: service,
    total_revenue: room + service,
    room_nights_sold: sold,
    available_room_nights: available,
    occupancy_pct: occupancyPct,
    adr,
    revpar,
  };
}
