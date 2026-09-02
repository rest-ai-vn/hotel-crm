// Bản mô tả API cho AI: OpenAPI 3.1 (cho người/công cụ sinh client) và
// tool manifest (dán thẳng vào function-calling của Gemini/OpenAI/Claude).
// Chỉ là dữ liệu tĩnh — không đọc DB, không lộ thông tin tenant.

const DATE = { type: "string", format: "date", example: "2026-09-10" } as const;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Định nghĩa tool cho function-calling. Dùng chung cho Gemini/OpenAI/Claude. */
export function toolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "get_hotel_info",
      description:
        "Lấy thông tin khách sạn: tên, địa chỉ, điện thoại, danh sách loại phòng (sức chứa, tiện nghi, ảnh) và bảng dịch vụ. Gọi một lần đầu hội thoại để biết khách sạn có gì.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "check_room_availability",
      description:
        "Kiểm tra phòng trống và báo giá cho một khoảng ngày. Trả về từng loại phòng kèm số phòng còn trống và tổng tiền đã gồm phụ thu cuối tuần, giá ngày lễ và VAT. Luôn gọi hàm này trước khi báo giá hoặc đặt phòng cho khách.",
      parameters: {
        type: "object",
        properties: {
          check_in: { ...DATE, description: "Ngày nhận phòng (YYYY-MM-DD)" },
          check_out: {
            ...DATE,
            description: "Ngày trả phòng (YYYY-MM-DD). Đặt theo giờ/theo ngày thì bằng check_in.",
          },
          booking_type: {
            type: "string",
            enum: ["overnight", "hourly", "daytime"],
            default: "overnight",
            description: "Qua đêm, theo giờ, hay nghỉ ngày",
          },
          duration_hours: {
            type: "integer",
            minimum: 1,
            maximum: 24,
            description: "Số giờ, chỉ dùng khi booking_type = hourly",
          },
          adults: {
            type: "integer",
            minimum: 1,
            description: "Số người lớn — chỉ trả loại phòng đủ sức chứa",
          },
          room_type_code: {
            type: "string",
            description: "Lọc theo mã loại phòng, ví dụ STD hoặc DLX",
          },
        },
        required: ["check_in", "check_out"],
      },
    },
    {
      name: "get_availability_calendar",
      description:
        "Số phòng trống theo từng ngày trong một khoảng (tối đa 62 ngày). Dùng khi khách hỏi 'còn phòng ngày nào', hoặc khi ngày khách muốn đã hết phòng và cần gợi ý ngày khác.",
      parameters: {
        type: "object",
        properties: {
          from: { ...DATE, description: "Ngày bắt đầu" },
          to: { ...DATE, description: "Ngày kết thúc, tối đa 62 ngày sau from" },
          room_type_code: { type: "string", description: "Lọc theo mã loại phòng" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "create_booking",
      description:
        "Đặt phòng cho khách. Giá luôn được tính lại phía máy chủ, không nhận giá do AI tự tính. Trả về mã xác nhận và thông tin cọc (QR VietQR nếu cơ sở có cấu hình). Chỉ gọi sau khi khách đã xác nhận rõ loại phòng, ngày và số điện thoại.",
      parameters: {
        type: "object",
        properties: {
          room_type_code: {
            type: "string",
            description: "Mã loại phòng lấy từ check_room_availability",
          },
          room_type_id: { type: "string", description: "Hoặc id loại phòng (UUID)" },
          check_in: DATE,
          check_out: DATE,
          booking_type: {
            type: "string",
            enum: ["overnight", "hourly", "daytime"],
            default: "overnight",
          },
          duration_hours: { type: "integer", minimum: 1, maximum: 24 },
          rooms_count: { type: "integer", minimum: 1, maximum: 10, default: 1 },
          adults: { type: "integer", minimum: 1, default: 1 },
          children: { type: "integer", minimum: 0, default: 0 },
          guest_name: { type: "string", description: "Họ tên khách" },
          guest_phone: { type: "string", description: "Số điện thoại khách, dùng để tra cứu sau" },
          guest_email: { type: "string" },
          zalo_id: { type: "string", description: "ID Zalo nếu khách chat qua Zalo" },
          facebook_id: { type: "string", description: "ID Facebook nếu khách chat qua Messenger" },
          source: {
            type: "string",
            enum: ["zalo", "facebook", "phone", "website", "walk_in"],
            default: "website",
            description: "Kênh khách đến, để báo cáo doanh thu theo nguồn",
          },
          note: { type: "string", description: "Ghi chú của khách, ví dụ giờ đến muộn" },
          idempotency_key: {
            type: "string",
            description:
              "Chuỗi duy nhất cho mỗi lần đặt (ví dụ id tin nhắn). Gọi lại cùng key sẽ trả booking cũ thay vì đặt trùng.",
          },
        },
        required: ["check_in", "check_out", "guest_name", "guest_phone"],
      },
    },
    {
      name: "get_booking",
      description:
        "Tra cứu một đặt phòng bằng mã xác nhận (dạng BON-YYMMDD-XXX). Dùng khi khách hỏi lại thông tin đặt phòng của họ.",
      parameters: {
        type: "object",
        properties: {
          confirmation_code: { type: "string", example: "BON-260910-A1B" },
        },
        required: ["confirmation_code"],
      },
    },
    {
      name: "cancel_booking",
      description:
        "Hủy một đặt phòng. Bắt buộc kèm số điện thoại của khách để xác minh đúng người. Chỉ hủy khi khách yêu cầu rõ ràng.",
      parameters: {
        type: "object",
        properties: {
          confirmation_code: { type: "string", example: "BON-260910-A1B" },
          guest_phone: { type: "string", description: "Số điện thoại đã dùng khi đặt" },
          reason: { type: "string" },
        },
        required: ["confirmation_code", "guest_phone"],
      },
    },
  ];
}

const ENVELOPE_ERROR = {
  type: "object",
  properties: {
    success: { type: "boolean", enum: [false] },
    error: { type: "string" },
    code: { type: "string" },
  },
};

function envelope(dataSchema: Record<string, unknown>) {
  return {
    type: "object",
    properties: { success: { type: "boolean", enum: [true] }, data: dataSchema },
  };
}

const PRICE_SCHEMA = {
  type: "object",
  nullable: true,
  properties: {
    currency: { type: "string", example: "VND" },
    nights: { type: "integer", example: 3 },
    base_amount: { type: "integer", example: 1500000 },
    surcharge: { type: "integer", example: 100000 },
    tax_amount: { type: "integer", example: 160000 },
    total_amount: { type: "integer", example: 1760000 },
    applied_overrides: { type: "array", items: { type: "string" } },
  },
};

const ROOM_TYPE_AVAILABILITY = {
  type: "object",
  properties: {
    room_type_id: { type: "string", format: "uuid" },
    code: { type: "string", example: "DLX" },
    name: { type: "string", example: "Deluxe" },
    description: { type: "string", nullable: true },
    max_guests: { type: "integer", example: 3 },
    amenities: { type: "array", items: { type: "string" } },
    photos: { type: "array", items: { type: "string" } },
    total_rooms: { type: "integer", example: 5 },
    booked_rooms: { type: "integer", example: 2 },
    available_rooms: { type: "integer", example: 3 },
    price: PRICE_SCHEMA,
    price_note: { type: "string", nullable: true },
  },
};

function queryParam(name: string, schema: Record<string, unknown>, required = false) {
  return { name, in: "query", required, schema };
}

const JSON_BODY = (schema: Record<string, unknown>) => ({
  required: true,
  content: { "application/json": { schema } },
});

const JSON_OK = (schema: Record<string, unknown>) => ({
  "200": { description: "OK", content: { "application/json": { schema } } },
  "401": {
    description: "API key sai/thiếu",
    content: { "application/json": { schema: ENVELOPE_ERROR } },
  },
});

/** OpenAPI 3.1 cho toàn bộ /api/ai. */
export function openApiDocument(baseUrl: string): Record<string, unknown> {
  const bookingProps = toolDefinitions().find((t) => t.name === "create_booking")!.parameters;

  return {
    openapi: "3.1.0",
    info: {
      title: "Hotel PMS — AI Integration API",
      version: "1.0.0",
      description:
        "API tra cứu phòng trống và đặt phòng dành cho trợ lý AI (chatbot Zalo/Facebook, tổng đài AI). " +
        "Xác thực bằng API key của từng cơ sở qua header X-API-Key. " +
        "Giá và tồn phòng luôn được tính lại phía máy chủ.",
    },
    servers: [{ url: baseUrl }],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
    },
    paths: {
      "/api/ai/hotel": {
        get: {
          operationId: "get_hotel_info",
          summary: "Thông tin khách sạn, loại phòng, dịch vụ",
          responses: JSON_OK(
            envelope({
              type: "object",
              properties: {
                name: { type: "string" },
                address: { type: "string", nullable: true },
                phone: { type: "string", nullable: true },
                vat_rate: { type: "integer", example: 10 },
                deposit_pct: { type: "integer", example: 30 },
                room_types: { type: "array", items: ROOM_TYPE_AVAILABILITY },
                services: { type: "array", items: { type: "object" } },
              },
            }),
          ),
        },
      },
      "/api/ai/availability": {
        get: {
          operationId: "check_room_availability",
          summary: "Phòng trống + báo giá cho một khoảng ngày",
          parameters: [
            queryParam("check_in", DATE, true),
            queryParam("check_out", DATE, true),
            queryParam("booking_type", {
              type: "string",
              enum: ["overnight", "hourly", "daytime"],
              default: "overnight",
            }),
            queryParam("duration_hours", { type: "integer", minimum: 1, maximum: 24 }),
            queryParam("adults", { type: "integer", minimum: 1 }),
            queryParam("room_type_code", { type: "string" }),
            queryParam("room_type_id", { type: "string", format: "uuid" }),
          ],
          responses: JSON_OK(
            envelope({
              type: "object",
              properties: {
                check_in: DATE,
                check_out: DATE,
                booking_type: { type: "string" },
                any_available: { type: "boolean" },
                room_types: { type: "array", items: ROOM_TYPE_AVAILABILITY },
              },
            }),
          ),
        },
      },
      "/api/ai/calendar": {
        get: {
          operationId: "get_availability_calendar",
          summary: "Số phòng trống theo từng ngày (tối đa 62 ngày)",
          parameters: [
            queryParam("from", DATE, true),
            queryParam("to", DATE, true),
            queryParam("room_type_code", { type: "string" }),
          ],
          responses: JSON_OK(
            envelope({
              type: "object",
              properties: {
                from: DATE,
                to: DATE,
                days: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: DATE,
                      total_rooms: { type: "integer" },
                      available_rooms: { type: "integer" },
                      by_room_type: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            }),
          ),
        },
      },
      "/api/ai/bookings": {
        post: {
          operationId: "create_booking",
          summary: "Đặt phòng (giá tính lại phía máy chủ)",
          requestBody: JSON_BODY(bookingProps),
          responses: {
            "201": {
              description: "Đã tạo đặt phòng",
              content: {
                "application/json": {
                  schema: envelope({
                    type: "object",
                    properties: {
                      confirmation_code: { type: "string", example: "BON-260910-A1B" },
                      status: { type: "string", example: "confirmed" },
                      check_in: DATE,
                      check_out: DATE,
                      rooms_count: { type: "integer" },
                      room_type: { type: "object" },
                      guest: { type: "object" },
                      price: PRICE_SCHEMA,
                      deposit: { type: "object", nullable: true },
                      replayed: { type: "boolean" },
                    },
                  }),
                },
              },
            },
            "409": {
              description: "Hết phòng — kèm gợi ý loại phòng khác",
              content: { "application/json": { schema: ENVELOPE_ERROR } },
            },
            "403": {
              description: "API key thiếu quyền book",
              content: { "application/json": { schema: ENVELOPE_ERROR } },
            },
          },
        },
      },
      "/api/ai/bookings/{confirmation_code}": {
        get: {
          operationId: "get_booking",
          summary: "Tra cứu đặt phòng theo mã xác nhận",
          parameters: [
            { name: "confirmation_code", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: JSON_OK(envelope({ type: "object" })),
        },
      },
      "/api/ai/bookings/{confirmation_code}/cancel": {
        post: {
          operationId: "cancel_booking",
          summary: "Hủy đặt phòng (xác minh bằng số điện thoại)",
          parameters: [
            { name: "confirmation_code", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: JSON_BODY({
            type: "object",
            properties: {
              guest_phone: { type: "string" },
              reason: { type: "string" },
            },
            required: ["guest_phone"],
          }),
          responses: JSON_OK(envelope({ type: "object" })),
        },
      },
    },
  };
}
