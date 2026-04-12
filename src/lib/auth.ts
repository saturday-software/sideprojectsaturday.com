const COOKIE_NAME = "sps_admin";
const COOKIE_VALUE = "authenticated";

export function isAdmin(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  return cookie.includes(`${COOKIE_NAME}=${COOKIE_VALUE}`);
}

export function setAdminCookie(): string {
  return `${COOKIE_NAME}=${COOKIE_VALUE}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`;
}
