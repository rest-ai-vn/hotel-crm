// Lightweight VI/EN dictionary for guest-facing pages (public booking).
// Staff-facing CRM stays Vietnamese by design.
import { useState } from "react";

export type Lang = "vi" | "en";

const LANG_KEY = "hotel_crm_lang";

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(LANG_KEY) : null;
    return stored === "en" ? "en" : "vi";
  });
  function setLang(l: Lang) {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  }
  return [lang, setLang];
}

const DICT = {
  booking_title: { vi: "Đặt phòng", en: "Book a room" },
  missing_code: {
    vi: "Thiếu mã khách sạn trong đường dẫn (?hotel=MÃ).",
    en: "Missing hotel code in the URL (?hotel=CODE).",
  },
  not_found: { vi: "Không tìm thấy khách sạn.", en: "Hotel not found." },
  loading: { vi: "Đang tải…", en: "Loading…" },
  check_in: { vi: "Nhận phòng", en: "Check-in" },
  check_out: { vi: "Trả phòng", en: "Check-out" },
  max_guests: { vi: "Tối đa {n} khách", en: "Up to {n} guests" },
  computing: { vi: "Đang tính giá…", en: "Calculating…" },
  rooms_left: { vi: "Còn {n} phòng", en: "{n} rooms left" },
  sold_out: { vi: "Hết phòng", en: "Sold out" },
  vat_included: { vi: "đã gồm VAT", en: "VAT included" },
  no_rate: { vi: "Chưa có giá", en: "No rate available" },
  contact: { vi: "Thông tin liên hệ", en: "Contact details" },
  full_name: { vi: "Họ tên", en: "Full name" },
  phone: { vi: "Số điện thoại", en: "Phone number" },
  note_opt: { vi: "Ghi chú (tuỳ chọn)", en: "Note (optional)" },
  book_btn: { vi: "Đặt phòng", en: "Book now" },
  pay_at_hotel: { vi: "trả tại khách sạn", en: "pay at hotel" },
  pick_type: { vi: "Chọn loại phòng để tiếp tục.", en: "Select a room type to continue." },
  success: { vi: "Đặt phòng thành công!", en: "Booking confirmed!" },
  payment_note: {
    vi: "thanh toán tại khách sạn",
    en: "payment at the hotel",
  },
  quote_code: {
    vi: "Vui lòng đọc mã này khi nhận phòng.",
    en: "Please present this code at check-in.",
  },
  hotline: { vi: "Hotline", en: "Hotline" },
  booking_error: { vi: "Lỗi đặt phòng", en: "Booking failed" },
  deposit_title: { vi: "Đặt cọc giữ phòng", en: "Deposit to secure your booking" },
  deposit_hint: {
    vi: "Quét mã VietQR bên dưới để chuyển khoản tiền cọc. Phòng được giữ sau khi khách sạn nhận được cọc.",
    en: "Scan the VietQR code below to transfer the deposit. Your room is held once the hotel receives it.",
  },
  transfer_memo: { vi: "Nội dung chuyển khoản", en: "Transfer note" },
} as const;

export type I18nKey = keyof typeof DICT;

export function t(lang: Lang, key: I18nKey, vars?: Record<string, string | number>): string {
  let s: string = DICT[key][lang];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}
