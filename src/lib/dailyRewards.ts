// Daily Challenges, Login Streak & Rewards system. Local-storage only.
export type ChallengeId =
  | "win-race" | "top-speed" | "drift-distance" | "race-time" | "complete-races";

export type Challenge = {
  id: ChallengeId;
  label: string;
  desc: string;
  icon: string;
  target: number;
  unit: string;
  reward: number; // coins
};

export type Cosmetic = {
  id: string;
  label: string;
  kind: "neon" | "decal" | "rim" | "exclusive";
  color?: string;
  cost: number; // coins, 0 = streak-locked
  streak?: number; // required login streak
};

export const COSMETICS: Cosmetic[] = [
  { id: "neon-magenta", label: "Magenta Underglow", kind: "neon", color: "#ff2bd6", cost: 250 },
  { id: "neon-cyan", label: "Cyan Underglow", kind: "neon", color: "#22e6ff", cost: 250 },
  { id: "neon-lime", label: "Lime Underglow", kind: "neon", color: "#a3ff2b", cost: 350 },
  { id: "neon-violet", label: "Violet Underglow", kind: "neon", color: "#9b5cff", cost: 350 },
  { id: "decal-flames", label: "Flame Decal", kind: "decal", cost: 500 },
  { id: "decal-stripes", label: "Racing Stripes", kind: "decal", cost: 400 },
  { id: "decal-carbon", label: "Carbon Wrap", kind: "decal", cost: 600 },
  { id: "rim-gold", label: "Gold Rims", kind: "rim", cost: 700 },
  { id: "rim-chrome", label: "Chrome Rims", kind: "rim", cost: 550 },
  // Streak exclusives — unlocked via login streak, not coins
  { id: "exc-aurora", label: "Aurora Glow (3-day streak)", kind: "exclusive", color: "#5cffd6", cost: 0, streak: 3 },
  { id: "exc-prism", label: "Prism Wrap (7-day streak)", kind: "exclusive", color: "#ffd76a", cost: 0, streak: 7 },
  { id: "exc-nebula", label: "Nebula Livery (14-day streak)", kind: "exclusive", color: "#ff5ca8", cost: 0, streak: 14 },
];

const POOL: Challenge[] = [
  { id: "win-race", label: "Take the Win", desc: "Win a race in any mode", icon: "🏆", target: 1, unit: "win", reward: 150 },
  { id: "top-speed", label: "Speed Demon", desc: "Hit 320 km/h top speed", icon: "⚡", target: 320, unit: "km/h", reward: 120 },
  { id: "drift-distance", label: "Slide Master", desc: "Drift for 250 m total", icon: "💨", target: 250, unit: "m", reward: 100 },
  { id: "race-time", label: "Quick Lap", desc: "Finish a race under 90 s", icon: "⏱", target: 90, unit: "s", reward: 130 },
  { id: "complete-races", label: "Daily Driver", desc: "Complete 3 races", icon: "🏁", target: 3, unit: "races", reward: 80 },
];

export type DailyState = {
  date: string; // yyyy-mm-dd
  challenges: { id: ChallengeId; progress: number; claimed: boolean }[];
  // streak
  streak: number;
  lastLogin: string; // yyyy-mm-dd
  loginClaimed: string; // last day a login bonus was claimed
  coins: number;
  unlocked: string[]; // cosmetic ids
};

const KEY = "af-daily-v1";
const todayStr = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

function pickDaily(date: string): Challenge[] {
  // Deterministic 3 challenges from POOL based on date hash.
  let h = 0;
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) | 0;
  const idxs = new Set<number>();
  let i = 0;
  while (idxs.size < 3) {
    idxs.add(Math.abs(h + i * 7) % POOL.length);
    i++;
    if (i > 50) break;
  }
  return [...idxs].map((k) => POOL[k]);
}

export function loadDaily(): DailyState {
  if (typeof window === "undefined") {
    return { date: todayStr(), challenges: [], streak: 0, lastLogin: "", loginClaimed: "", coins: 0, unlocked: [] };
  }
  let s: DailyState | null = null;
  try { const raw = localStorage.getItem(KEY); if (raw) s = JSON.parse(raw); } catch {}
  const today = todayStr();
  if (!s) {
    s = { date: today, challenges: [], streak: 0, lastLogin: "", loginClaimed: "", coins: 0, unlocked: [] };
  }
  // Roll daily challenges
  if (s.date !== today) {
    s.date = today;
    s.challenges = pickDaily(today).map((c) => ({ id: c.id, progress: 0, claimed: false }));
  }
  if (s.challenges.length === 0) {
    s.challenges = pickDaily(today).map((c) => ({ id: c.id, progress: 0, claimed: false }));
  }
  // Streak update on first load of a new calendar day
  if (s.lastLogin !== today) {
    if (s.lastLogin === yesterdayStr()) s.streak = s.streak + 1;
    else if (s.lastLogin === "") s.streak = 1;
    else s.streak = 1; // missed a day, reset
    s.lastLogin = today;
  }
  saveDaily(s);
  return s;
}

export function saveDaily(s: DailyState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function getChallengeMeta(id: ChallengeId): Challenge {
  return POOL.find((c) => c.id === id)!;
}

// Called after a race finishes
export type RaceSummary = {
  won: boolean;
  topSpeedKmh: number;
  raceTimeSec: number;
  driftDistanceM: number;
};

export function recordRace(summary: RaceSummary): DailyState {
  const s = loadDaily();
  for (const c of s.challenges) {
    if (c.claimed) continue;
    const meta = getChallengeMeta(c.id);
    let next = c.progress;
    switch (c.id) {
      case "win-race": if (summary.won) next = Math.min(meta.target, c.progress + 1); break;
      case "top-speed": next = Math.max(c.progress, Math.round(summary.topSpeedKmh)); break;
      case "drift-distance": next = Math.min(meta.target, c.progress + Math.round(summary.driftDistanceM)); break;
      case "race-time":
        // For "under X seconds" → progress = 1 if condition met (target acts as threshold)
        if (summary.raceTimeSec > 0 && summary.raceTimeSec <= meta.target) next = meta.target;
        break;
      case "complete-races": next = Math.min(meta.target, c.progress + 1); break;
    }
    c.progress = next;
  }
  saveDaily(s);
  return s;
}

export function isComplete(state: DailyState["challenges"][number]): boolean {
  const meta = getChallengeMeta(state.id);
  if (meta.id === "race-time") return state.progress >= meta.target;
  if (meta.id === "top-speed") return state.progress >= meta.target;
  return state.progress >= meta.target;
}

export function claimChallenge(id: ChallengeId): DailyState {
  const s = loadDaily();
  const c = s.challenges.find((x) => x.id === id);
  if (!c || c.claimed) return s;
  if (!isComplete(c)) return s;
  c.claimed = true;
  s.coins += getChallengeMeta(id).reward;
  saveDaily(s);
  return s;
}

export function streakLoginReward(streak: number): number {
  // Tiered: 1d=25, 2d=50, 3d=100, 4d=120, 5d=150, 6d=180, 7d+=250
  const map = [0, 25, 50, 100, 120, 150, 180, 250];
  return map[Math.min(streak, 7)] ?? 250;
}

export function claimLogin(): { state: DailyState; coins: number; alreadyClaimed: boolean } {
  const s = loadDaily();
  const today = todayStr();
  if (s.loginClaimed === today) return { state: s, coins: 0, alreadyClaimed: true };
  const reward = streakLoginReward(s.streak);
  s.coins += reward;
  s.loginClaimed = today;
  // Auto-unlock streak-exclusive cosmetics
  for (const cos of COSMETICS) {
    if (cos.kind === "exclusive" && cos.streak && s.streak >= cos.streak && !s.unlocked.includes(cos.id)) {
      s.unlocked.push(cos.id);
    }
  }
  saveDaily(s);
  return { state: s, coins: reward, alreadyClaimed: false };
}

export function purchaseCosmetic(id: string): { state: DailyState; ok: boolean; reason?: string } {
  const s = loadDaily();
  const cos = COSMETICS.find((c) => c.id === id);
  if (!cos) return { state: s, ok: false, reason: "Unknown" };
  if (s.unlocked.includes(id)) return { state: s, ok: false, reason: "Already owned" };
  if (cos.kind === "exclusive") return { state: s, ok: false, reason: "Streak unlock only" };
  if (s.coins < cos.cost) return { state: s, ok: false, reason: "Not enough coins" };
  s.coins -= cos.cost;
  s.unlocked.push(id);
  saveDaily(s);
  return { state: s, ok: true };
}
