// POST /api/score — submit a run.
//
// Body:
//   { userId, nickname, teamHue, mode: 'derby'|'career', stats: {...} }
//
// Stores a per-user record (with best-ever for each leaderboard) and updates
// the global sorted-set leaderboards. Returns the user's new rank.
//
// Anti-cheat is intentionally light (friends-only game): we cap submissions
// per IP per minute and clamp absurd values. If you go public, sign scores
// server-side or move the simulation to the server.

import { Redis } from '@upstash/redis';

// Lazy init so a misconfigured deployment returns a clean 503 instead of
// crashing the function at boot (which surfaces as a generic 500).
//
// The Vercel-Upstash integration injects KV_REST_API_URL / KV_REST_API_TOKEN
// (legacy from when Vercel KV was first-party). Manual Upstash setup uses
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. We support both.
let _redis = null;
function getRedis(){
  if (_redis) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL  || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

// --- limits ---
const MAX_DERBY_HR        = 50;     // far above any plausible 1:30 derby
const MAX_DERBY_DIST_FT   = 700;
const MAX_CAREER_STREAK   = 1000;
const MAX_CAREER_LEVEL    = 50;
const MAX_NICKNAME_LEN    = 16;
const RATE_LIMIT_MAX      = 10;     // requests
const RATE_LIMIT_WINDOW_S = 60;     // per minute

function clamp(n, lo, hi){ n = +n; if (!Number.isFinite(n)) return lo; return Math.max(lo, Math.min(hi, n)); }
function cleanNickname(s){
  if (typeof s !== 'string') return 'ANON';
  // Strip everything that isn't ASCII letter/digit/space/dash/underscore.
  const t = s.replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, MAX_NICKNAME_LEN);
  return t || 'ANON';
}

export default async function handler(req, res){
  if (req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const redis = getRedis();
  if (!redis){
    return res.status(503).json({
      error: 'leaderboard not configured',
      hint: 'Connect Upstash Redis in the Vercel project Storage tab, then redeploy.',
    });
  }

  // Wrap everything from here on so any Redis hiccup surfaces as a clean 503
  // with a useful message instead of a generic 500.
  try {

  // Rate limit per IP using Redis incr + expire.
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] || 'unknown').trim();
  const rlKey = `rl:score:${ip}`;
  const count = await redis.incr(rlKey);
  if (count === 1) await redis.expire(rlKey, RATE_LIMIT_WINDOW_S);
  if (count > RATE_LIMIT_MAX){
    return res.status(429).json({ error: 'rate limited, slow down' });
  }

  let body = req.body;
  if (typeof body === 'string'){ try { body = JSON.parse(body); } catch { body = {}; } }
  const { userId, nickname, teamHue, mode, stats } = body || {};

  if (!userId || typeof userId !== 'string' || userId.length < 8 || userId.length > 64){
    return res.status(400).json({ error: 'bad userId' });
  }
  if (mode !== 'derby' && mode !== 'career'){
    return res.status(400).json({ error: 'bad mode' });
  }
  if (!stats || typeof stats !== 'object'){
    return res.status(400).json({ error: 'bad stats' });
  }

  const cleanName = cleanNickname(nickname);
  const teamHueClean = clamp(teamHue ?? 220, 0, 360);

  const userKey = `user:${userId}`;
  const lbKey   = mode === 'derby' ? 'lb:derby' : 'lb:career';

  // Per-mode primary score for the leaderboard sorted set:
  //   derby  → HRs (tiebreak: longest, encoded into fractional part)
  //   career → streak (tiebreak: level)
  let primary = 0;
  if (mode === 'derby'){
    const hrs     = clamp(stats.hrs,     0, MAX_DERBY_HR);
    const longest = clamp(stats.longest, 0, MAX_DERBY_DIST_FT);
    primary = hrs + longest / 1000;       // 7 HR + 412 ft → 7.412
    await redis.hset(userKey, {
      nickname: cleanName,
      teamHue:  teamHueClean,
      bestDerbyHRs:     Math.max(stats.hrs|0,     +(await redis.hget(userKey, 'bestDerbyHRs')) || 0),
      bestDerbyLongest: Math.max(stats.longest|0, +(await redis.hget(userKey, 'bestDerbyLongest')) || 0),
      lastSubmittedAt:  Date.now(),
    });
  } else {
    const streak = clamp(stats.streak, 0, MAX_CAREER_STREAK);
    const level  = clamp(stats.level,  1, MAX_CAREER_LEVEL);
    primary = streak + level / 100;       // 17 streak + LV 4 → 17.04
    await redis.hset(userKey, {
      nickname: cleanName,
      teamHue:  teamHueClean,
      bestCareerStreak: Math.max(stats.streak|0, +(await redis.hget(userKey, 'bestCareerStreak')) || 0),
      bestCareerLevel:  Math.max(stats.level|0,  +(await redis.hget(userKey, 'bestCareerLevel')) || 0),
      lastSubmittedAt:  Date.now(),
    });
  }

  // Update leaderboard only when this run beats the user's prior best.
  const prior = await redis.zscore(lbKey, userId);
  if (prior == null || +prior < primary){
    await redis.zadd(lbKey, { score: primary, member: userId });
  }

  // Player rank (descending → 0 = top).
  const rank = await redis.zrevrank(lbKey, userId);
  const total = await redis.zcard(lbKey);

  return res.status(200).json({
    ok: true,
    nickname: cleanName,
    rank: rank == null ? null : rank + 1,
    totalPlayers: total,
    score: primary,
  });

  } catch (err){
    console.error('score handler failed:', err);
    return res.status(503).json({
      error: 'leaderboard temporarily unavailable',
      detail: err?.message ?? String(err),
    });
  }
}
