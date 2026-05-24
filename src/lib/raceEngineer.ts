// Race Engineer — central bus for team radio messages.
// Pure DOM events so any component can publish/subscribe without coupling.

export type EngineerTone = "info" | "warn" | "good" | "alert";

export type EngineerMessage = {
  id: string;
  text: string;
  tone: EngineerTone;
  /** auto-dismiss in ms */
  ttl?: number;
};

const EVT = "apex:engineer";

export function sayEngineer(text: string, tone: EngineerTone = "info", ttl = 4200) {
  if (typeof window === "undefined") return;
  const msg: EngineerMessage = {
    id: Math.random().toString(36).slice(2),
    text, tone, ttl,
  };
  window.dispatchEvent(new CustomEvent<EngineerMessage>(EVT, { detail: msg }));
}

export function onEngineer(cb: (m: EngineerMessage) => void) {
  if (typeof window === "undefined") return () => {};
  const h = (e: Event) => cb((e as CustomEvent<EngineerMessage>).detail);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

// Rate-limited helper: only fire `text` if it (or its `key`) hasn't been
// said within `cooldownMs` — keeps the radio from spamming.
const lastSaid = new Map<string, number>();
export function maybeSay(key: string, text: string, tone: EngineerTone, cooldownMs = 8000, ttl = 4000) {
  const now = performance.now();
  const prev = lastSaid.get(key) ?? 0;
  if (now - prev < cooldownMs) return false;
  lastSaid.set(key, now);
  sayEngineer(text, tone, ttl);
  return true;
}

export function resetEngineer() { lastSaid.clear(); }

// Canonical phrasebook so callers stay consistent.
export const ENGINEER_LINES = {
  raceStart:    () => "Lights out. Let's have a clean first lap.",
  finalLap:     () => "This is the final lap. Bring it home.",
  twoToGo:      () => "Two laps to go. Manage the tyres.",
  pushNow:      () => "Push now. We're in a window.",
  fastestLap:   () => "Fastest lap. Beautiful.",
  poleLap:      () => "Provisional pole. Stunning lap.",
  pitNow:       () => "Box this lap. Box, box.",
  pitRecommend: () => "Tyres are gone. Consider boxing.",
  fuelLow:      () => "Fuel is low. Lift and coast where you can.",
  rainSoon:     (laps: number) => `Rain expected in ${laps} lap${laps === 1 ? "" : "s"}.`,
  rainNow:      () => "It's raining. Be careful out there.",
  rainHeavier:  () => "Rain getting heavier. Standing water expected.",
  rainEasing:   () => "Rain is easing. A dry line will form soon.",
  dryingUp:     () => "Track is drying. Watch for grip on the line.",
  fogIn:        () => "Visibility dropping. Eyes up.",
  thunder:      () => "Thunderstorm developing. Stay focused.",
  gainingP:     (p: number) => `You're catching P${p}.`,
  gapAhead:     (sec: number) => `Gap to the car ahead: ${sec.toFixed(1)} seconds.`,
  gapLeader:    (sec: number) => `Gap to the leader: ${sec.toFixed(1)} seconds.`,
  overtake:     () => "Great overtake. Brilliant.",
  lostPlace:    (p: number) => `We've dropped to P${p}. Stay calm.`,
  champUpdate:  (p: number) => `In the championship, you are P${p}. Keep at it.`,
  pitClean:     () => "Clean stop. Good work crew.",
  pitMessy:     () => "We had an issue in the pits. Sorry about that.",
  finishWin:    () => "Race winner! Get in there!",
  finishPodium: (p: number) => `P${p}. On the podium. Well done.`,
  finishMid:    (p: number) => `P${p}. We'll regroup for the next one.`,
};