/* EduGhaf on Cloudflare Workers: /api/* goes to the API, everything else is the website (static assets). */
import { onRequest } from "../functions/api/[[path]].js";

const VERSION = "2026-11-02 · login-fix";
const TEXT = /^(text\/|application\/(javascript|json|xml)|image\/svg\+xml)/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/version") return new Response("EduGhaf " + VERSION +
      "\nDatabase: " + (env.DB ? "connected" : "NOT connected") +
      "\nAdmin password (ADMIN_PASSWORD): " + (env.ADMIN_PASSWORD ? "set (" + String(env.ADMIN_PASSWORD).trim().length + " characters)" : "NOT set") +
      "\nAdmin username: " + String(env.ADMIN_USER || "laura").trim().toLowerCase() +
      "\nStudent password (STUDENT_PASSWORD): " + (env.STUDENT_PASSWORD ? "set" : "not set (default Meadows2026)"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const path = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
      return onRequest({ request, env, ctx, params: { path } });
    }
    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get("Content-Type") || "";
    if (TEXT.test(type) && !/charset/i.test(type)) {   // Arabic text needs UTF-8 on every page and script
      const r = new Response(res.body, res);
      r.headers.set("Content-Type", type + "; charset=utf-8");
      return r;
    }
    return res;
  }
};
