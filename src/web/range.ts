import type { Elysia } from 'elysia';
import { timingSafeEqual } from 'crypto';
import * as db from '../utils/db';

// ─── The Range bridge ─────────────────────────────────────────────────────────
// ctiservers.org's Range leaderboard Worker sells boosters and revives for
// coins. It calls these two routes, server to server, with a shared token:
//
//   GET  /api/range/wallet/:user                     → { balance }
//   POST /api/range/spend { user, amount, ref, reason }
//        → { ok: true, balance } or 402 { error: 'insufficient_funds', balance }
//
// Prices are decided by the Worker; this side only checks the token, the
// user id and that the amount is sane, then deducts once per `ref`.

const TOKEN = Bun.env.RANGE_API_TOKEN ?? '';
const MAX_SPEND = 100_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function authorized(req: Request): boolean {
  const got = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}

const isUserId = (s: unknown): s is string => typeof s === 'string' && /^\d{5,25}$/.test(s);

/** Adds the bridge to `app`. Returns false (and adds nothing) without a usable token. */
export function mountRangeApi(app: Elysia): boolean {
  if (!TOKEN) return false;
  if (TOKEN.length < 16) {
    console.warn('[web] RANGE_API_TOKEN is shorter than 16 characters — Range bridge disabled');
    return false;
  }

  app.get('/api/range/wallet/:user', async ({ request, params }) => {
    if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
    if (!isUserId(params.user)) return json({ error: 'bad_user' }, 400);
    return json({ balance: await db.peekBalance(params.user) });
  });

  app.post('/api/range/spend', async ({ request }) => {
    if (!authorized(request)) return json({ error: 'unauthorized' }, 401);
    let body: any;
    try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad_json' }, 400); }
    const { user, amount, ref, reason } = body ?? {};
    if (!isUserId(user)) return json({ error: 'bad_user' }, 400);
    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_SPEND) return json({ error: 'bad_amount' }, 400);
    if (typeof ref !== 'string' || !/^[\w:.-]{8,128}$/.test(ref)) return json({ error: 'bad_ref' }, 400);

    const res = await db.rangeSpend(user, amount, ref, typeof reason === 'string' ? reason.slice(0, 200) : null);
    if (!res.ok) return json({ error: 'insufficient_funds', balance: res.balance }, 402);
    return json({ ok: true, balance: res.balance });
  });

  console.log('[web] Range bridge enabled at /api/range');
  return true;
}
