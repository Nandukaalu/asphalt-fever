// Championship Mode — pure data + persistence helpers.
// All state lives in localStorage so progress is saved automatically.

export const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const POLE_POINT = 1;
export const FASTEST_LAP_POINT = 1;

export type ChampDriver = {
  id: string;
  name: string;
  team: string;
  color: string;
  number: number;
};

export type ChampTrack = {
  id: string;
  name: string;
  country: string;
  laps: 3 | 5 | 10;
  weather: string;
  flag: string;
};

// 9-round F1-style calendar using existing tracks. Last round = season finale.
export const CHAMP_CALENDAR: ChampTrack[] = [
  { id: "bahrain",     name: "Sakhir Grand Prix",   country: "Bahrain",       laps: 5, weather: "sunset",       flag: "🇧🇭" },
  { id: "silverstone", name: "British Grand Prix",  country: "United Kingdom",laps: 5, weather: "cloudy",       flag: "🇬🇧" },
  { id: "monaco",      name: "Monaco Grand Prix",   country: "Monaco",        laps: 5, weather: "clear-night",  flag: "🇲🇨" },
  { id: "spa",         name: "Belgian Grand Prix",  country: "Belgium",       laps: 5, weather: "rainy-night",  flag: "🇧🇪" },
  { id: "monza",       name: "Italian Grand Prix",  country: "Italy",         laps: 5, weather: "clear-night",  flag: "🇮🇹" },
  { id: "suzuka",      name: "Japanese Grand Prix", country: "Japan",         laps: 5, weather: "cloudy",       flag: "🇯🇵" },
  { id: "cota",        name: "United States GP",    country: "United States", laps: 5, weather: "sunset",       flag: "🇺🇸" },
  { id: "interlagos",  name: "São Paulo Grand Prix",country: "Brazil",        laps: 5, weather: "thunderstorm", flag: "🇧🇷" },
  { id: "singapore",   name: "Singapore Finale",    country: "Singapore",     laps: 5, weather: "clear-night",  flag: "🇸🇬" },
];

export const CHAMP_FIELD: ChampDriver[] = [
  { id: "rosso",   name: "Marco Rossi",  team: "Scuderia Rosso",   color: "#d40000", number: 16 },
  { id: "silver",  name: "James Hale",   team: "Silver Arrows",    color: "#00d2be", number: 44 },
  { id: "azure",   name: "Liam Beck",    team: "Azure Racing",     color: "#1e3a8a", number: 1  },
  { id: "papaya",  name: "Diego Cruz",   team: "Papaya Squad",     color: "#ff8000", number: 4  },
  { id: "verde",   name: "Aiden Walsh",  team: "Verde Works",      color: "#16a34a", number: 11 },
  { id: "cobalt",  name: "Mateo Vidal",  team: "Cobalt Dynamics",  color: "#0ea5e9", number: 23 },
  { id: "violet",  name: "Noah Becker",  team: "Violet Motors",    color: "#7c3aed", number: 77 },
  { id: "crimson", name: "Kenji Aoki",   team: "Crimson Squad",    color: "#b91c1c", number: 31 },
  { id: "ivory",   name: "Lukas Faber",  team: "Ivory Tech",       color: "#f3f4f6", number: 18 },
  { id: "onyx",    name: "Sam Carter",   team: "Onyx Racing",      color: "#0f172a", number: 55 },
];

export type RoundResult = {
  trackId: string;
  order: string[];      // finishing order, driverIds
  pole?: string;        // pole sitter
  fastestLap?: string;  // fastest lap driver
  bestLap?: number;     // player's best lap (s)
  raceTimeSec?: number; // player's race time
  playerPosition?: number;
  playerPoints?: number;
};

export type Season = {
  startedAt: number;
  playerDriverId: string;
  playerName: string;
  currentRound: number;          // 0-indexed next round to race
  results: RoundResult[];
};

const SEASON_KEY  = "af-championship-v1";
const PENDING_KEY = "af-championship-pending"; // written by RacingGame after each round
const NEXT_KEY    = "af-championship-next";    // RacingGame reads this on mount to auto-start

function safe<T>(fn: () => T, fb: T): T { try { return fn(); } catch { return fb; } }

export function loadSeason(): Season | null {
  if (typeof window === "undefined") return null;
  return safe(() => {
    const raw = localStorage.getItem(SEASON_KEY);
    return raw ? (JSON.parse(raw) as Season) : null;
  }, null);
}
export function saveSeason(s: Season | null) {
  if (typeof window === "undefined") return;
  try {
    if (s === null) localStorage.removeItem(SEASON_KEY);
    else localStorage.setItem(SEASON_KEY, JSON.stringify(s));
  } catch {}
}
export function startSeason(playerDriverId: string, playerName: string): Season {
  const s: Season = {
    startedAt: Date.now(),
    playerDriverId,
    playerName,
    currentRound: 0,
    results: [],
  };
  saveSeason(s);
  return s;
}

export type ChampStanding = {
  id: string;
  name: string;
  team: string;
  color: string;
  number: number;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps: number;
  isPlayer: boolean;
};

export function driverStandings(season: Season): ChampStanding[] {
  const map = new Map<string, ChampStanding>();
  for (const d of CHAMP_FIELD) {
    map.set(d.id, {
      id: d.id,
      name: d.id === season.playerDriverId ? (season.playerName || d.name) : d.name,
      team: d.team,
      color: d.color,
      number: d.number,
      points: 0, wins: 0, podiums: 0, poles: 0, fastestLaps: 0,
      isPlayer: d.id === season.playerDriverId,
    });
  }
  for (const r of season.results) {
    r.order.forEach((id, i) => {
      const s = map.get(id);
      if (!s) return;
      s.points += POINTS_TABLE[i] ?? 0;
      if (i === 0) s.wins += 1;
      if (i < 3) s.podiums += 1;
    });
    if (r.pole) {
      const s = map.get(r.pole);
      if (s) { s.poles += 1; s.points += POLE_POINT; }
    }
    if (r.fastestLap) {
      const s = map.get(r.fastestLap);
      if (s) { s.fastestLaps += 1; s.points += FASTEST_LAP_POINT; }
    }
  }
  return [...map.values()].sort((a, b) =>
    b.points - a.points || b.wins - a.wins || b.podiums - a.podiums
  );
}

export type TeamStanding = {
  team: string;
  color: string;
  points: number;
  wins: number;
  drivers: string[];
};

export function teamStandings(season: Season): TeamStanding[] {
  const drv = driverStandings(season);
  const map = new Map<string, TeamStanding>();
  for (const d of drv) {
    const cur = map.get(d.team) ?? { team: d.team, color: d.color, points: 0, wins: 0, drivers: [] };
    cur.points += d.points;
    cur.wins   += d.wins;
    cur.drivers.push(d.name);
    map.set(d.team, cur);
  }
  return [...map.values()].sort((a, b) => b.points - a.points);
}

export function isFinaleRound(roundIdx: number) {
  return roundIdx === CHAMP_CALENDAR.length - 1;
}
export function isSeasonOver(s: Season) {
  return s.currentRound >= CHAMP_CALENDAR.length;
}

// Returns the gap to the next position above the player (in points).
export function gapToNextPosition(season: Season): { positionAbove: number; gap: number; nameAbove: string } | null {
  const st = driverStandings(season);
  const idx = st.findIndex((s) => s.isPlayer);
  if (idx <= 0) return null;
  const me = st[idx];
  const above = st[idx - 1];
  return { positionAbove: idx, gap: above.points - me.points + 1, nameAbove: above.name };
}

// ---- Pending round result handoff (RacingGame → Championship route) ----
export function setPendingResult(r: RoundResult) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(r)); } catch {}
}
export function takePendingResult(): RoundResult | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as RoundResult;
  } catch { return null; }
}
export function peekPendingResult(): RoundResult | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as RoundResult) : null;
  } catch { return null; }
}

// ---- Next-round setup handoff (Championship route → RacingGame) ----
export type NextRoundSetup = {
  round: number;
  trackId: string;
  laps: 3 | 5 | 10;
  weather: string;
  playerDriverId: string;
};
export function setNextRoundSetup(n: NextRoundSetup) {
  try { localStorage.setItem(NEXT_KEY, JSON.stringify(n)); } catch {}
}
export function readNextRoundSetup(): NextRoundSetup | null {
  try {
    const raw = localStorage.getItem(NEXT_KEY);
    return raw ? (JSON.parse(raw) as NextRoundSetup) : null;
  } catch { return null; }
}
export function clearNextRoundSetup() {
  try { localStorage.removeItem(NEXT_KEY); } catch {}
}

// ---- End-of-season awards ----
export type SeasonAwards = {
  champion: ChampStanding;
  runnerUp?: ChampStanding;
  third?: ChampStanding;
  mostWins: ChampStanding;
  mostPoles: ChampStanding;
  mostPodiums: ChampStanding;
  mostFastestLaps: ChampStanding;
  constructorChampion: TeamStanding;
};
export function computeAwards(season: Season): SeasonAwards | null {
  const drv = driverStandings(season);
  if (drv.length === 0) return null;
  const top = (sel: (s: ChampStanding) => number) =>
    [...drv].sort((a, b) => sel(b) - sel(a))[0];
  const teams = teamStandings(season);
  return {
    champion: drv[0],
    runnerUp: drv[1],
    third: drv[2],
    mostWins: top((s) => s.wins),
    mostPoles: top((s) => s.poles),
    mostPodiums: top((s) => s.podiums),
    mostFastestLaps: top((s) => s.fastestLaps),
    constructorChampion: teams[0],
  };
}