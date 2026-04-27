// GET /api/leaderboard?mode=derby|career&limit=100
//
// Returns the top N entries with nicknames hydrated from the user hashes,
// plus the total player count.

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const MAX_LIMIT = 100;

export default async function handler(req, res){
  if (req.method !== 'GET'){
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const mode = (req.query?.mode ?? '').toString();
  if (mode !== 'derby' && mode !== 'career'){
    return res.status(400).json({ error: 'bad mode' });
  }
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(req.query?.limit ?? '50', 10) || 50));

  const lbKey = mode === 'derby' ? 'lb:derby' : 'lb:career';

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
}
