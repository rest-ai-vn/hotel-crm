import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set and at least 32 characters");
}
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET);
// Định danh trong JWT, KHÔNG đổi theo tên thương hiệu: mọi token đang lưu hành
// mang iss/aud này và verifyStaffToken đối chiếu chúng — đổi là đá văng toàn bộ
// phiên đăng nhập đang mở. Cùng lý do với khóa localStorage hotel_crm_* ở web.
const ISSUER = "hotel-crm";
const AUDIENCE = "hotel-crm-staff";

export interface StaffTokenPayload extends JWTPayload {
  sub: string;
  role: string;
  email: string;
  name: string;
  property_id: string;
}

export async function signStaffToken(
  payload: Omit<StaffTokenPayload, "iat" | "exp" | "iss" | "aud">,
  ttl: string = "24h",
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(ttl)
    .sign(SECRET_KEY);
}

export async function verifyStaffToken(token: string): Promise<StaffTokenPayload> {
  const { payload } = await jwtVerify(token, SECRET_KEY, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return payload as StaffTokenPayload;
}
