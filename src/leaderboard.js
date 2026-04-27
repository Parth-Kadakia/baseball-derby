// Client wrapper for /api/score and /api/leaderboard. The backend is
// optional — if the API isn't deployed (e.g. running purely from `npm run
// dev`), submit() returns null and the UI shows a "leaderboard offline" hint.

export async function submitScore({ userId, nickname, teamHue, mode, stats }){
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, nickname, teamHue, mode, stats }),
    });
    if (!res.ok) return { error: `http ${res.status}` };
    return await res.json();
  } catch (err){
    return { error: err.message };
  }
}

export async function fetchLeaderboard(mode, limit = 50){
  try {
    const res = await fetch(`/api/leaderboard?mode=${mode}&limit=${limit}`);
    if (!res.ok) return { error: `http ${res.status}` };
    return await res.json();
  } catch (err){
    return { error: err.message };
  }
}
