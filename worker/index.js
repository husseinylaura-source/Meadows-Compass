/* EduGhaf on Cloudflare Workers: /api/* goes to the API, everything else is the website (static assets). */
import { onRequest } from "../functions/api/[[path]].js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const path = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
      return onRequest({ request, env, ctx, params: { path } });
    }
    return env.ASSETS.fetch(request);
  }
};
