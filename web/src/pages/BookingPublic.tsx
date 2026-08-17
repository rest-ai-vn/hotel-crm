import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { addDaysIso, formatDate, formatVnd, todayIso } from "../lib/format";
import { t as tr, useLang, type Lang } from "../lib/i18n";

interface PublicHotel {
  name: string;
  address: string | null;
  phone: string | null;
  room_types: Array<{
    id: string;
    name: string;
    code: string;
    max_guests: number;
    description: string | null;
  }>;
}

interface PublicOffer {
  base: number;
  surcharge: number;
  tax_amount: number;
  total: number;
  available: number;
}

interface PublicBooking {
  confirmation_code: string;
  check_in: string;
  check_out: string;
  total_amount: number;
}

export function BookingPublic() {
  const [lang, setLang] = useLang();
  const [params] = useSearchParams();
  const code = params.get("hotel") ?? "";
  const [checkIn, setCheckIn] = useState(todayIso());
  const [checkOut, setCheckOut] = useState(addDaysIso(todayIso(), 1));
  const [selectedType, setSelectedType] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [done, setDone] = useState<PublicBooking | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hotel = useQuery({
    queryKey: ["public-hotel", code],
    queryFn: () => apiFetch<PublicHotel>("/api/public/hotel", { query: { code } }),
    enabled: !!code,
    retry: false,
  });

  const offer = useQuery({
    queryKey: ["public-quote", code, selectedType, checkIn, checkOut],
    queryFn: () =>
      apiFetch<PublicOffer>("/api/public/quote", {
        query: { code, room_type_id: selectedType, check_in: checkIn, check_out: checkOut },
      }),
    enabled: !!code && !!selectedType && checkOut > checkIn,
    retry: false,
  });

  const book = useMutation({
    mutationFn: () =>
      apiFetch<PublicBooking>("/api/public/book", {
        method: "POST",
        body: {
          code,
          room_type_id: selectedType,
          check_in: checkIn,
          check_out: checkOut,
          name,
          phone,
          note: note || undefined,
          website: honeypot || undefined,
        },
      }),
    onSuccess: (data) => {
      setDone(data);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Booking failed / Lỗi đặt phòng"),
  });

  if (!code) {
    return (
      <PublicShell title={tr(lang, "booking_title")} lang={lang} onLang={setLang}>
        <div className="muted">{tr(lang, "missing_code")}</div>
      </PublicShell>
    );
  }
  if (hotel.isError) {
    return (
      <PublicShell title={tr(lang, "booking_title")} lang={lang} onLang={setLang}>
        <div style={{ color: "var(--color-danger)" }}>{tr(lang, "not_found")}</div>
      </PublicShell>
    );
  }
  if (!hotel.data) {
    return (
      <PublicShell title={tr(lang, "booking_title")} lang={lang} onLang={setLang}>
        <div className="muted">{tr(lang, "loading")}</div>
      </PublicShell>
    );
  }

  if (done) {
    return (
      <PublicShell title={hotel.data.name} lang={lang} onLang={setLang}>
        <div className="card" style={{ padding: "var(--space-6)", textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>🎉</div>
          <h2 style={{ margin: "8px 0 4px" }}>{tr(lang, "success")}</h2>
          <div className="muted" style={{ marginBottom: 12 }}>
            {formatDate(done.check_in)} → {formatDate(done.check_out)} ·{" "}
            {formatVnd(done.total_amount)} ({tr(lang, "payment_note")})
          </div>
          <div
            style={{
              display: "inline-block",
              fontFamily: "ui-monospace, monospace",
              fontSize: 22,
              fontWeight: 700,
              padding: "10px 24px",
              borderRadius: "var(--radius-md)",
              background: "var(--color-accent-soft)",
              color: "var(--color-accent)",
            }}
          >
            {done.confirmation_code}
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            {tr(lang, "quote_code")}
            {hotel.data.phone ? ` ${tr(lang, "hotline")}: ${hotel.data.phone}` : ""}
          </div>
        </div>
      </PublicShell>
    );
  }

  const o = offer.data;
  const canBook =
    !!selectedType && !!o && o.available > 0 && name.trim().length >= 2 && phone.trim().length >= 8;

  return (
    <PublicShell title={hotel.data.name} subtitle={hotel.data.address ?? undefined} lang={lang} onLang={setLang}>
      <div className="card" style={{ padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
        <div className="row" style={{ gap: "var(--space-3)", flexWrap: "wrap" }}>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>{tr(lang, "check_in")}</span>
            <input
              type="date"
              className="input"
              style={{ width: "auto" }}
              min={todayIso()}
              value={checkIn}
              onChange={(e) => {
                setCheckIn(e.target.value);
                if (e.target.value >= checkOut) setCheckOut(addDaysIso(e.target.value, 1));
              }}
            />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>{tr(lang, "check_out")}</span>
            <input
              type="date"
              className="input"
              style={{ width: "auto" }}
              min={addDaysIso(checkIn, 1)}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="stack" style={{ gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        {hotel.data.room_types.map((t) => {
          const selected = selectedType === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSelectedType(t.id)}
              className="card"
              style={{
                padding: "var(--space-4)",
                textAlign: "left",
                cursor: "pointer",
                borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
                boxShadow: selected ? "0 0 0 3px var(--color-accent-soft)" : "var(--shadow-sm)",
              }}
            >
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {tr(lang, "max_guests", { n: t.max_guests })}
                    {t.description ? ` · ${t.description}` : ""}
                  </div>
                </div>
                {selected && offer.isLoading ? (
                  <span className="muted">{tr(lang, "computing")}</span>
                ) : selected && o ? (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: "var(--color-accent)" }}>
                      {formatVnd(o.total)}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {o.available > 0 ? tr(lang, "rooms_left", { n: o.available }) : tr(lang, "sold_out")}
                      {o.tax_amount > 0 ? ` · ${tr(lang, "vat_included")}` : ""}
                    </div>
                  </div>
                ) : selected && offer.isError ? (
                  <span style={{ color: "var(--color-danger)", fontSize: 13 }}>
                    {(offer.error as Error)?.message ?? tr(lang, "no_rate")}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {selectedType ? (
        <div className="card" style={{ padding: "var(--space-4)" }}>
          <h3 style={{ margin: "0 0 var(--space-3)", fontSize: 15 }}>{tr(lang, "contact")}</h3>
          <div className="stack" style={{ gap: "var(--space-3)" }}>
            <input
              className="input"
              placeholder={tr(lang, "full_name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input"
              placeholder={tr(lang, "phone")}
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="input"
              placeholder={tr(lang, "note_opt")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <input
              type="text"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
            />
            {error ? <div style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div> : null}
            <button
              className="btn btn-primary"
              style={{ justifyContent: "center", padding: "12px" }}
              disabled={!canBook || book.isPending}
              onClick={() => book.mutate()}
            >
              {book.isPending
                ? "…"
                : o
                  ? `${tr(lang, "book_btn")} · ${formatVnd(o.total)} (${tr(lang, "pay_at_hotel")})`
                  : tr(lang, "book_btn")}
            </button>
          </div>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 13 }}>{tr(lang, "pick_type")}</div>
      )}
    </PublicShell>
  );
}

function PublicShell({
  title,
  subtitle,
  lang,
  onLang,
  children,
}: {
  title: string;
  subtitle?: string;
  lang?: Lang;
  onLang?: (l: Lang) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--space-6) var(--space-4)" }}>
        {lang && onLang ? (
          <div className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
            {(["vi", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                className={`btn ${lang === l ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: 12, padding: "3px 10px" }}
                onClick={() => onLang(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        ) : null}
        <div style={{ textAlign: "center", marginBottom: "var(--space-5)" }}>
          <div style={{ fontSize: 34 }}>🏨</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, letterSpacing: "-0.01em" }}>{title}</h1>
          {subtitle ? <div className="muted">{subtitle}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
