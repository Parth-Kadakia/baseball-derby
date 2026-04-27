// Local persistence for player profile + career/derby stats. JSON-serialized
// so it can sync to the leaderboard backend later without schema rework.

const KEY = 'diamondstorm.save.v1';

function emptyProfile(){
  return {
    version: 1,
    nickname: '',
    teamHue: 220,
    derby: {
      gamesPlayed: 0,
      bestHRs: 0,
      bestDistance: 0,
      bestScore: 0,
    },
    career: {
      runs: 0,           // total careers played
      bestStreak: 0,     // longest no-strikeout streak
      currentStreak: 0,
      totalAtBats: 0,
      totalHits: 0,
      totalHRs: 0,
      level: 1,
    },
    lastSubmittedRun: null,   // for the leaderboard
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function loadProfile(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProfile();
    const obj = JSON.parse(raw);
    return Object.assign(emptyProfile(), obj);
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(profile){
  profile.updatedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch (err){
    console.warn('save failed', err);
  }
}

// Convenience updaters — caller mutates and we save.
export function recordDerbyRun(profile, { score, hrs, longestHR }){
  profile.derby.gamesPlayed++;
  if (hrs > profile.derby.bestHRs) profile.derby.bestHRs = hrs;
  if (longestHR > profile.derby.bestDistance) profile.derby.bestDistance = longestHR;
  if (score > profile.derby.bestScore) profile.derby.bestScore = score;
  saveProfile(profile);
}

export function recordCareerRun(profile, { atBats, hits, hrs, finalLevel, streak }){
  profile.career.runs++;
  profile.career.totalAtBats += atBats;
  profile.career.totalHits += hits;
  profile.career.totalHRs += hrs;
  profile.career.level = Math.max(profile.career.level, finalLevel);
  if (streak > profile.career.bestStreak) profile.career.bestStreak = streak;
  profile.career.currentStreak = streak;
  saveProfile(profile);
}
