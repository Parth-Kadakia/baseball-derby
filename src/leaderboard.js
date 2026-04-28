// Client wrapper for /api/score and /api/leaderboard. The backend is
// optional — if the API isn't deployed (e.g. running purely from `npm run
// dev`), submit() returns null and the UI shows a "leaderboard offline" hint.

// Try to read a JSON body from a non-OK response so we can show the actual
// API error message instead of a generic "http 503". Falls back to the bare
// status if the body isn't JSON (e.g. Vite dev server returning HTML 404).
async function readErrorBody(res){
  try {
    const j = await res.json();
    return {
      error: j.error || `http ${res.status}`,
      message: j.message,
      hint: j.hint,
    };
  } catch {
    return { error: `http ${res.status}` };
  }
}

export async function submitScore({ userId, nickname, teamHue, mode, stats }){
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, nickname, teamHue, mode, stats }),
    });
    if (!res.ok) return await readErrorBody(res);
    return await res.json();
  } catch (err){
    return { error: err.message };
  }
}

export async function fetchLeaderboard(mode, limit = 50){
  try {
    const res = await fetch(`/api/leaderboard?mode=${mode}&limit=${limit}`);
    if (!res.ok) return await readErrorBody(res);
    return await res.json();
  } catch (err){
    return { error: err.message };
  }
}
