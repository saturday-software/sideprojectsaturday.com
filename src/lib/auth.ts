import { ActionError } from "astro:actions";

const COOKIE_NAME = "sps_admin";
const COOKIE_VALUE = "authenticated";

export function isAdmin(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  return cookie.includes(`${COOKIE_NAME}=${COOKIE_VALUE}`);
}

export function requireAdmin(cookies: import("astro").AstroCookies) {
  const value = cookies.get(COOKIE_NAME)?.value;
  if (value !== COOKIE_VALUE) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
}
