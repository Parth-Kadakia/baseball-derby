// GET /api/leaderboard?mode=derby|career&limit=100
//
// Returns the top N entries with nicknames hydrated from the user hashes,
// plus the total player count.

import { Redis } from '@upstash/redis';

// Lazy init: missing env vars yield a clean 503 instead of a function-init
// crash that surfaces as a generic 500.
let _redis = null;
function getRedis(){
  if (_redis) return _redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN){
    return null;
  }
  _redis = Redis.fromEnv();
  return _redis;
}

const MAX_LIMIT = 100;

export default async function handler(req, res){
  if (req.method !== 'GET'){
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const redis = getRedis();
  if (!redis){
    return res.status(503).json({
      error: 'leaderboard not configured',
      hint: 'Connect Upstash Redis in the Vercel project Storage tab, then redeploy.',
    });
  }

  const mode = (req.query?.mode ?? '').toString();
  if (mode !== 'derby' && mode !== 'career'){
    return res.status(400).json({ error: 'bad mode' });
  }
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(req.query?.limit ?? '50', 10) || 50));

  const lbKey = mode === 'derby' ? 'lb:derby' : 'lb:career';

  try {
  // Top N user IDs + scores.
  const raw = await redis.zrange(lbKey, 0, limit - 1, { rev: true, withScores: true });
  const entries = [];
  for (let i = 0; i < raw.length; i += 2){
    entries.push({ userId: raw[i], score: +raw[i + 1] });
  }

  // Hydrate nicknames + per-mode best detail in parallel.
  const userHashes = await Promise.all(entries.map(e => redis.hgetall(`user:${e.userId}`)));

  const rows = entries.map((e, idx) => {
    const u = userHashes[idx] || {};
    if (mode === 'derby'){
      // primary = hrs + longest/1000 → split back out cleanly.
      const hrs = Math.floor(e.score);
      const longest = Math.round((e.score - hrs) * 1000);
      return {
        rank: idx + 1,
        nickname: u.nickname || 'ANON',
        teamHue: +u.teamHue || 220,
        hrs,
        longest,
      };
    } else {
      const streak = Math.floor(e.score);
      const level = Math.round((e.score - streak) * 100);
      return {
        rank: idx + 1,
        nickname: u.nickname || 'ANON',
        teamHue: +u.teamHue || 220,
        streak,
        level,
      };
    }
  });

  const total = await redis.zcard(lbKey);

  // Cache for 30s — leaderboards don't change that often and this halves
  // Redis read cost during heavy traffic.
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res.status(200).json({ mode, total, rows });
  } catch (err){
    console.error('leaderboard handler failed:', err);
    return res.status(503).json({
      error: 'leaderboard temporarily unavailable',
      detail: err?.message ?? String(err),
    });
  }
}
