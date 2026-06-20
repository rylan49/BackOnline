// BackOnline action counter API (Cloudflare Worker)
//
// Routes:
//   POST /api/track-action  -> records one action, max 1 per visitor per UTC day, returns { count, counted }
//   GET  /api/action-count  -> returns the current total, { count }
//
// Storage:
//   COUNTER   - Durable Object holding the atomic, strongly-consistent total.
//               (KV is the wrong tool for a counter: it is eventually consistent
//                and caps same-key writes at ~1/sec, so concurrent signs are lost.)
//   RATELIMIT - KV namespace used only for per-visitor daily dedup, where KV's
//               native per-key TTL is exactly what we want.
//
// Privacy: the visitor IP is never stored or logged. It is hashed (SHA-256 with a
// secret salt) solely to build a dedup key that auto-expires after 24h.

const ALLOWED_ORIGINS = new Set([
  "https://backonline.ca",
  "https://www.backonline.ca",
]);

const DEFAULT_ORIGIN = "https://backonline.ca";

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, origin, init) {
  init = init || {};
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: Object.assign(
      { "Content-Type": "application/json" },
      corsHeaders(origin),
      init.headers || {}
    ),
  });
}

async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(salt + ":" + ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function utcDay() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD in UTC
}

async function readCount(stub) {
  const res = await stub.fetch("https://counter/read");
  return Number(await res.text());
}

async function incrementCount(stub) {
  const res = await stub.fetch("https://counter/increment", { method: "POST" });
  return Number(await res.text());
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const stub = env.COUNTER.get(env.COUNTER.idFromName("global"));
    const baseline = Number(env.BASELINE_COUNT || 0);

    // GET /api/action-count
    if (url.pathname === "/api/action-count" && request.method === "GET") {
      const count = await readCount(stub);
      return json({ count: count + baseline }, origin, {
        headers: { "Cache-Control": "public, max-age=30" },
      });
    }

    // POST /api/track-action
    if (url.pathname === "/api/track-action" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "";
      const key = "rl:" + (await hashIp(ip, env.IP_SALT || DEFAULT_ORIGIN)) + ":" + utcDay();

      // Already counted this visitor today — return the total unchanged.
      if (await env.RATELIMIT.get(key)) {
        const count = await readCount(stub);
        return json({ count: count + baseline, counted: false }, origin);
      }

      // Reserve the daily slot (expires in 24h), then increment the real total.
      await env.RATELIMIT.put(key, "1", { expirationTtl: 86400 });
      const count = await incrementCount(stub);
      return json({ count: count + baseline, counted: true }, origin);
    }

    return json({ error: "not found" }, origin, { status: 404 });
  },
};

// Durable Object: the single source of truth for the total.
export class Counter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/increment") {
      // The DO serializes requests, so this read-modify-write is atomic.
      const count = ((await this.state.storage.get("count")) || 0) + 1;
      await this.state.storage.put("count", count);
      return new Response(String(count));
    }

    const count = (await this.state.storage.get("count")) || 0;
    return new Response(String(count));
  }
}
