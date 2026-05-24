// Team Market & Contracts — career layer on top of championship driver field.

import {
  CHAMP_FIELD,
  driverStandings,
  type Season,
} from "./championship";

export type TeamRating = {
  /** 0..100 - top speed potential */
  topSpeed: number;
  /** 0..100 - acceleration / cornering grip */
  handling: number;
  /** 0..100 - mechanical reliability (pit-stop clean-stop probability bonus) */
  reliability: number;
  /** 0..100 - overall prestige */
  prestige: number;
};

export type TeamProfile = {
  id: string;
  name: string;
  color: string;
  /** matches a CHAMP_FIELD driver's `team` field */
  champTeam: string;
  motto: string;
  rating: TeamRating;
  /** "P1–P3", "Points", "Top 5", etc. */
  seasonTarget: string;
  /** minimum championship reputation required to receive a contract */
  reputationFloor: number;
};

// Derived from the existing CHAMP_FIELD team strings.
export const TEAMS: TeamProfile[] = [
  { id: "silver",  champTeam: "Silver Arrows",   name: "Silver Arrows",   color: "#00d2be", motto: "Engineered for victory.",
    rating: { topSpeed: 96, handling: 92, reliability: 90, prestige: 98 }, seasonTarget: "Drivers' Championship", reputationFloor: 80 },
  { id: "rosso",   champTeam: "Scuderia Rosso",  name: "Scuderia Rosso",  color: "#d40000", motto: "Passione. Velocità.",
    rating: { topSpeed: 94, handling: 95, reliability: 86, prestige: 96 }, seasonTarget: "P1–P3 in Constructors'", reputationFloor: 75 },
  { id: "azure",   champTeam: "Azure Racing",    name: "Azure Racing",    color: "#1e3a8a", motto: "Precision under pressure.",
    rating: { topSpeed: 90, handling: 91, reliability: 88, prestige: 90 }, seasonTarget: "Race wins, P2 in Constructors'", reputationFloor: 65 },
  { id: "papaya",  champTeam: "Papaya Squad",    name: "Papaya Squad",    color: "#ff8000", motto: "Boldness wins races.",
    rating: { topSpeed: 88, handling: 89, reliability: 82, prestige: 82 }, seasonTarget: "Podium finishes", reputationFloor: 50 },
  { id: "verde",   champTeam: "Verde Works",     name: "Verde Works",     color: "#16a34a", motto: "Engineered in green.",
    rating: { topSpeed: 84, handling: 86, reliability: 84, prestige: 74 }, seasonTarget: "Regular points", reputationFloor: 35 },
  { id: "cobalt",  champTeam: "Cobalt Dynamics", name: "Cobalt Dynamics", color: "#0ea5e9", motto: "Data driven. Driver led.",
    rating: { topSpeed: 82, handling: 80, reliability: 86, prestige: 60 }, seasonTarget: "Top-10 finishes",    reputationFloor: 20 },
  { id: "violet",  champTeam: "Violet Motors",   name: "Violet Motors",   color: "#7c3aed", motto: "Born to overtake.",
    rating: { topSpeed: 78, handling: 82, reliability: 78, prestige: 55 }, seasonTarget: "Top-10 finishes",    reputationFloor: 15 },
  { id: "crimson", champTeam: "Crimson Squad",   name: "Crimson Squad",   color: "#b91c1c", motto: "Risk it for the biscuit.",
    rating: { topSpeed: 76, handling: 78, reliability: 74, prestige: 48 }, seasonTarget: "Score points",       reputationFloor: 8 },
  { id: "ivory",   champTeam: "Ivory Tech",      name: "Ivory Tech",      color: "#f3f4f6", motto: "Tomorrow, today.",
    rating: { topSpeed: 72, handling: 75, reliability: 80, prestige: 40 }, seasonTarget: "Beat your team-mate", reputationFloor: 0 },
  { id: "onyx",    champTeam: "Onyx Racing",     name: "Onyx Racing",     color: "#0f172a", motto: "Grit. Grease. Glory.",
    rating: { topSpeed: 68, handling: 70, reliability: 78, prestige: 32 }, seasonTarget: "Finish every race",   reputationFloor: 0 },
];

export function teamByChampName(name: string): TeamProfile | undefined {
  return TEAMS.find((t) => t.champTeam === name);
}
export function teamById(id: string): TeamProfile | undefined {
  return TEAMS.find((t) => t.id === id);
}

/** Where the player's current car sits in the field, derived from their team. */
export function playerTeamProfile(season: Season | null): TeamProfile | null {
  if (!season) return null;
  // First respect contract override
  const override = loadContractTeamId();
  if (override) {
    const t = teamById(override);
    if (t) return t;
  }
  const d = CHAMP_FIELD.find((d) => d.id === season.playerDriverId);
  if (!d) return null;
  return teamByChampName(d.team) ?? null;
}

/**
 * Performance multipliers a team's rating produces for the racing engine.
 * All values centred near 1.0 so a mid-pack car feels neutral.
 */
export type TeamPerf = {
  topSpeed: number;   // multiplies MAX_SPEED
  accel: number;      // multiplies ACCEL
  handling: number;   // multiplies steering grip
  reliabilityBonus: number; // adds to clean-stop probability roll
};
export function teamPerf(team: TeamProfile | null | undefined): TeamPerf {
  if (!team) return { topSpeed: 1, accel: 1, handling: 1, reliabilityBonus: 0 };
  const norm = (v: number) => (v - 78) / 100; // ~78 is field average
  return {
    topSpeed: 1 + norm(team.rating.topSpeed) * 0.18,
    accel:    1 + norm(team.rating.handling) * 0.20,
    handling: 1 + norm(team.rating.handling) * 0.12,
    reliabilityBonus: norm(team.rating.reliability) * 0.18,
  };
}

/* ---------- Reputation ---------- */

/** Player reputation = own points + bonus per podium / win. 0..100ish. */
export function playerReputation(season: Season | null): number {
  if (!season) return 0;
  const me = driverStandings(season).find((d) => d.isPlayer);
  if (!me) return 0;
  return Math.min(100, Math.round(me.points * 0.7 + me.wins * 4 + me.podiums * 2));
}

/* ---------- Contract offers ---------- */

export type ContractOffer = {
  teamId: string;
  teamName: string;
  color: string;
  seasonTarget: string;
  /** signing bonus in credits */
  signingBonus: number;
  motto: string;
};

/** Generate offers from teams whose floor the player has cleared. */
export function generateContractOffers(season: Season | null): ContractOffer[] {
  const rep = playerReputation(season);
  return TEAMS
    .filter((t) => rep >= t.reputationFloor)
    .sort((a, b) => b.rating.prestige - a.rating.prestige)
    .slice(0, 4)
    .map((t) => ({
      teamId: t.id,
      teamName: t.name,
      color: t.color,
      seasonTarget: t.seasonTarget,
      signingBonus: Math.round(800 + t.rating.prestige * 25),
      motto: t.motto,
    }));
}

/* ---------- Persistence ---------- */

const CONTRACT_KEY = "af-contract-team";
const REP_KEY = "af-reputation";

export function loadContractTeamId(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(CONTRACT_KEY); } catch { return null; }
}
export function saveContractTeamId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(CONTRACT_KEY, id);
    else localStorage.removeItem(CONTRACT_KEY);
  } catch {}
}
export function loadStoredReputation(): number {
  if (typeof window === "undefined") return 0;
  try { return Number(localStorage.getItem(REP_KEY) ?? "0") || 0; } catch { return 0; }
}
export function saveStoredReputation(rep: number) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(REP_KEY, String(Math.round(rep))); } catch {}
}