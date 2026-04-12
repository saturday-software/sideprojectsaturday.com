import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { setAdminCookie } from "../../../lib/auth";

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const password = formData.get("password")?.toString();

  if (password !== env.ADMIN_PASSWORD) {
    return redirect("/admin?error=Invalid password");
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin?message=Logged in",
      "Set-Cookie": setAdminCookie(),
    },
  });
};
