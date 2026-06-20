# BackOnline action counter API

A tiny Cloudflare Worker that powers the "X people have taken action" counter on
[backonline.ca](https://backonline.ca). It counts petition signatures and MP
emails **without collecting any personal data**.

## How it works

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/track-action` | `POST` | Records one action. Capped at **one count per visitor per day**. Returns `{ count, counted }`. |
| `/api/action-count` | `GET`  | Returns the current total: `{ count }`. Cached at the edge for 30s. |

- **Counter** — a [Durable Object](https://developers.cloudflare.com/durable-objects/)
  holds the running total. It is strongly consistent and increments atomically,
  so concurrent signs are never lost. (Plain KV is unsuitable for a counter: it
  is eventually consistent and limits same-key writes to ~1/sec.)
- **Rate limit / dedup** — a KV namespace stores one key per visitor per day
  (`rl:<hash>:<YYYY-MM-DD>`) with a 24h TTL. The visitor's IP is **hashed with a
  secret salt and never stored or logged in the clear**; the key auto-expires.

> The counter is social proof, not an audit log. A determined attacker behind
> many IPs (VPNs/Tor) can still nudge it, and KV's eventual consistency allows a
> tiny double-count window. That trade-off is intentional for a public counter.

## One-time setup

You need a free Cloudflare account with the `backonline.ca` zone already on it
(you use Cloudflare's proxy, so it is). Then:

```bash
cd worker
npm install
npx wrangler login

# 1. Create the KV namespace, then paste the printed id into wrangler.toml
#    (the kv_namespaces.id field).
npx wrangler kv namespace create RATELIMIT

# 2. Set the secret salt used to hash IPs (any long random string).
npx wrangler secret put IP_SALT

# 3. Deploy. The first deploy provisions api.backonline.ca (DNS + TLS) too.
npm run deploy
```

That's it — no VPS, Nginx, or systemd. The Worker runs on Cloudflare's free tier.

## Local development

```bash
npm run dev          # serves on http://localhost:8787
curl -X POST http://localhost:8787/api/track-action
curl       http://localhost:8787/api/action-count
```

## Optional: seed a starting number

If you want the counter to start above zero (e.g. signatures gathered before
this existed), set `BASELINE_COUNT` in `wrangler.toml` and redeploy. It is added
on top of the real, API-counted actions.

## Logs

```bash
npm run tail
```
