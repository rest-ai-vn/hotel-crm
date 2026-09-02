# API cho trợ lý AI

API để chatbot / tổng đài AI **tra phòng trống** và **đặt phòng** trực tiếp vào Hotel CRM.

Mọi endpoint nằm dưới `/api/ai`, xác thực bằng **API key của từng cơ sở** (không dùng tài khoản
nhân viên). Giá và tồn phòng luôn được máy chủ tính lại — AI không thể tự bịa giá hay đặt vượt số
phòng thực có.

---

## 1. Lấy API key

Đăng nhập CRM → **Tích hợp AI** (menu bên trái, dành cho admin/manager) → *Tạo API key mới*.

| Quyền (scope) | Cho phép |
| --- | --- |
| `read` | `/hotel`, `/availability`, `/calendar`, xem đặt phòng |
| `book` | tạo đặt phòng, hủy đặt phòng |

Chuỗi key dạng `hk_…` **chỉ hiện một lần**. Mất thì khóa key cũ và tạo key mới.

Có thể tạo bằng dòng lệnh khi khởi tạo cơ sở:

```bash
BASE_URL=https://hotel-crm.example \
ROOT_EMAIL=admin@example.local ROOT_PASSWORD=... \
TENANT_NAME="Khách sạn Mẫu" TENANT_CODE=SAMPLE \
TENANT_EMAIL=owner@example.com TENANT_PASSWORD=... \
bun run create:tenant
```

Tài khoản chủ cơ sở được tạo với role `manager` — chỉ thao tác trong cơ sở của mình.
**Không đặt `TENANT_ROLE=admin`** cho chủ khách sạn: `admin` là quyền toàn nền tảng,
thấy và thao tác được mọi cơ sở khác.

## 2. Xác thực

```
X-API-Key: hk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

(`Authorization: Bearer hk_…` cũng được chấp nhận.)

Giới hạn: **600 request/phút** cho mỗi key. Key sai bị chặn sau 30 lần thử trong 15 phút.

## 3. Khám phá hợp đồng API (không cần key)

| Endpoint | Dùng để |
| --- | --- |
| `GET /api/ai/openapi.json` | Spec OpenAPI 3.1 — sinh client, import vào Postman |
| `GET /api/ai/tools.json` | Tool manifest — dán thẳng vào function-calling của Gemini/OpenAI/Claude |

## 4. Endpoint

### `GET /api/ai/hotel` — thông tin khách sạn (`read`)

Trả tên, địa chỉ, điện thoại, VAT, % cọc, danh sách loại phòng và bảng dịch vụ.
Gọi một lần đầu hội thoại để AI biết khách sạn có gì.

### `GET /api/ai/availability` — phòng trống + báo giá (`read`)

| Tham số | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `check_in`, `check_out` | ✔ | `YYYY-MM-DD`. Đặt theo giờ/ngày thì `check_out` = `check_in` |
| `booking_type` | | `overnight` (mặc định), `hourly`, `daytime` |
| `duration_hours` | | chỉ dùng với `hourly` |
| `adults` | | chỉ trả loại phòng đủ sức chứa |
| `room_type_code` / `room_type_id` | | lọc một loại phòng |

```bash
curl -H "X-API-Key: hk_..." \
  "https://hotel-crm.example/api/ai/availability?check_in=2026-09-10&check_out=2026-09-12"
```

```jsonc
{
  "success": true,
  "data": {
    "check_in": "2026-09-10",
    "check_out": "2026-09-12",
    "booking_type": "overnight",
    "nights": 2,
    "any_available": true,
    "room_types": [
      {
        "room_type_id": "…",
        "code": "STD",
        "name": "Standard",
        "max_guests": 2,
        "total_rooms": 5,
        "booked_rooms": 2,
        "available_rooms": 3,
        "price": {
          "currency": "VND",
          "nights": 2,
          "base_amount": 1000000,
          "surcharge": 100000,
          "tax_amount": 110000,
          "total_amount": 1210000,
          "applied_overrides": ["Lễ Quốc khánh 2/9"]
        },
        "price_note": null
      }
    ]
  }
}
```

`price` là `null` khi loại phòng chưa có bảng giá — lý do nằm ở `price_note`.

### `GET /api/ai/calendar` — phòng trống theo ngày (`read`)

`?from=2026-09-01&to=2026-09-30` (tối đa 62 ngày). Dùng khi khách hỏi "còn phòng ngày nào",
hoặc để gợi ý ngày khác khi ngày khách muốn đã hết phòng.

### `POST /api/ai/bookings` — đặt phòng (`book`)

```bash
curl -X POST -H "X-API-Key: hk_..." -H "Content-Type: application/json" \
  -d '{
    "room_type_code": "STD",
    "check_in": "2026-09-10",
    "check_out": "2026-09-12",
    "rooms_count": 1,
    "adults": 2,
    "guest_name": "Nguyễn Văn A",
    "guest_phone": "0905111222",
    "source": "zalo",
    "note": "Đến muộn khoảng 22h",
    "idempotency_key": "zalo-msg-123456"
  }' \
  "https://hotel-crm.example/api/ai/bookings"
```

Trả `201` kèm mã xác nhận và thông tin cọc:

```jsonc
{
  "success": true,
  "data": {
    "confirmation_code": "BON-260910-A1B",
    "status": "confirmed",
    "rooms_count": 1,
    "room_type": { "code": "STD", "name": "Standard" },
    "guest": { "name": "Nguyễn Văn A", "phone": "0905111222" },
    "price": { "total_amount": 1210000, "per_room_amount": 1210000, "currency": "VND" },
    "deposit": {
      "pct": 30,
      "amount": 363000,
      "qr_url": "https://img.vietqr.io/image/…"
    },
    "replayed": false
  }
}
```

Lưu ý cho người tích hợp:

- **Luôn gửi `idempotency_key`** (ví dụ id tin nhắn). Gọi lại cùng key trả về đúng booking cũ với
  `replayed: true` thay vì đặt trùng — quan trọng khi bot retry hoặc mạng chập chờn.
- Giá do máy chủ tính; mọi số tiền AI gửi lên đều bị bỏ qua.
- Khách được tìm/tạo theo **số điện thoại** trong phạm vi cơ sở; `zalo_id`/`facebook_id` được ghi
  bổ sung vào hồ sơ có sẵn để lần sau nhận ra khách.
- `rooms_count > 1` tạo nhiều đặt phòng cùng `group_code`.

### `GET /api/ai/bookings/:confirmation_code` — tra cứu (`read`)

### `POST /api/ai/bookings/:confirmation_code/cancel` — hủy (`book`)

Bắt buộc gửi `guest_phone`; server đối chiếu với hồ sơ khách, sai số là từ chối. Chỉ hủy được
đặt phòng đang ở trạng thái `confirmed`.

## 5. Mã lỗi

Mọi lỗi trả `{ "success": false, "error": "…", "code": "…" }`. AI nên phân nhánh theo `code`:

| `code` | HTTP | Ý nghĩa |
| --- | --- | --- |
| `missing_api_key`, `invalid_api_key`, `expired_api_key` | 401 | Vấn đề xác thực |
| `insufficient_scope` | 403 | Key không có quyền `book` |
| `rate_limited` | 429 | Gọi quá nhanh |
| `invalid_date`, `invalid_range`, `invalid_booking_type` | 400 | Tham số ngày sai |
| `check_in_in_past` | 400 | Ngày nhận phòng đã qua |
| `room_type_not_found` | 404 | Sai mã loại phòng |
| `sold_out` | 409 | Hết phòng — kèm `available_rooms` và `alternatives` |
| `capacity_exceeded` | 409 | Phòng không đủ sức chứa — kèm `alternatives` |
| `no_rate_plan` | 409 | Loại phòng chưa cấu hình giá |
| `phone_mismatch` | 400 | SĐT không khớp khi hủy |
| `not_cancellable` | 409 | Đặt phòng không ở trạng thái hủy được |

Khi gặp `sold_out` hoặc `capacity_exceeded`, response kèm `alternatives` — danh sách loại phòng
khác còn trống với giá — để AI đề xuất ngay thay vì chỉ nói "hết phòng".

## 6. Cách tính tồn phòng

Khoảng lưu trú là **nửa mở** `[check_in, check_out)`: khách trả phòng ngày 12 thì phòng đó ngày 12
đã trống. Quy ước này khớp với ràng buộc chống đặt trùng ở tầng cơ sở dữ liệu
(`no_double_book_overnight`). Đặt theo giờ / theo ngày chiếm đúng một ngày.

Phòng trống = số phòng đang hoạt động của loại đó − số đặt phòng `confirmed`/`checked_in` chồng lấn.

## 7. Nhật ký

Mọi lần đặt/hủy qua API được ghi vào **Nhật ký** với `staff_name = "API: <tên key>"` và
`action = ai.booking.create` / `ai.booking.cancel`, kèm `api_key_id`. Trang **Tích hợp AI** hiển thị
thời điểm dùng gần nhất của từng key.
