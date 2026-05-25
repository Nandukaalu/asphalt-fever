// Dynamic weather state machine. Evolves wetness, visibility and a label
// during a race so the gameplay layer can read live values + emit engineer warnings.

import { maybeSay, ENGINEER_LINES } from "./raceEngineer";

export type WeatherPhase =
  | "dry" | "cloudy" | "drizzle" | "rain" | "storm" | "fog" | "drying";

export type WeatherSnapshot = {
  phase: WeatherPhase;
  /** 0..1 amount of water on track */
  wetness: number;
  /** 0..1, 1 = perfect visibility */
  visibility: number;
  /** 0..1 of racing line that has dried back out */
  dryLine: number;
  label: string;
};

export type WeatherEvolution = {
  step: (dtSec: number, raceProgress: number, totalLaps: number) => WeatherSnapshot;
  current: () => WeatherSnapshot;
  forecast: () => string;
};

const PHASE_LABELS: Record<WeatherPhase, string> = {
  dry: "Dry",
  cloudy: "Overcast",
  drizzle: "Light Rain",
  rain: "Heavy Rain",
  storm: "Thunderstorm",
  fog: "Fog",
  drying: "Drying Track",
};

/** Build a script of phase transitions for the race based on starting weather. */
function buildScript(startId: string): { atProgress: number; phase: WeatherPhase; warn?: string }[] {
  const s = startId;
  // "Dramatic & strategic" weather — at least one transition per race.
  if (s.includes("thunder") || s === "storm") {
    return [
      { atProgress: 0.0, phase: "storm" },
      { atProgress: 0.45, phase: "rain", warn: ENGINEER_LINES.rainEasing() },
      { atProgress: 0.8, phase: "drying", warn: ENGINEER_LINES.dryingUp() },
    ];
  }
  if (s.includes("rain")) {
    return [
      { atProgress: 0.0, phase: "rain" },
      { atProgress: 0.4, phase: "storm", warn: ENGINEER_LINES.rainHeavier() },
      { atProgress: 0.75, phase: "drizzle", warn: ENGINEER_LINES.rainEasing() },
    ];
  }
  if (s.includes("fog")) {
    return [
      { atProgress: 0.0, phase: "fog" },
      { atProgress: 0.5, phase: "cloudy", warn: ENGINEER_LINES.dryingUp() },
      { atProgress: 0.85, phase: "drizzle", warn: ENGINEER_LINES.rainNow() },
    ];
  }
  if (s.includes("cloud") || s === "sunset") {
    return [
      { atProgress: 0.0, phase: "cloudy" },
      { atProgress: 0.3, phase: "drizzle", warn: ENGINEER_LINES.rainSoon(1) },
      { atProgress: 0.55, phase: "rain", warn: ENGINEER_LINES.rainHeavier() },
      { atProgress: 0.85, phase: "drying", warn: ENGINEER_LINES.dryingUp() },
    ];
  }
  // Clear / night / default — chance to develop weather
  return [
    { atProgress: 0.0, phase: "dry" },
    { atProgress: 0.35, phase: "cloudy", warn: ENGINEER_LINES.rainSoon(2) },
    { atProgress: 0.6, phase: "drizzle", warn: ENGINEER_LINES.rainNow() },
    { atProgress: 0.9, phase: "drying", warn: ENGINEER_LINES.dryingUp() },
  ];
}

function phaseTargets(p: WeatherPhase) {
  switch (p) {
    case "dry":     return { wet: 0.00, vis: 1.00 };
    case "cloudy":  return { wet: 0.05, vis: 0.95 };
    case "drizzle": return { wet: 0.45, vis: 0.85 };
    case "rain":    return { wet: 0.80, vis: 0.70 };
    case "storm":   return { wet: 1.00, vis: 0.50 };
    case "fog":     return { wet: 0.10, vis: 0.40 };
    case "drying":  return { wet: 0.20, vis: 0.92 };
  }
}

export function createWeatherEvolution(startId: string): WeatherEvolution {
  const script = buildScript(startId);
  let phase: WeatherPhase = script[0].phase;
  let wet = phaseTargets(phase).wet;
  let vis = phaseTargets(phase).vis;
  let dryLine = phase === "dry" ? 1 : 0;
  let firedWarn = new Set<number>();
  let preAnnounced = new Set<number>();

  const wetterThan = (a: WeatherPhase, b: WeatherPhase) =>
    phaseTargets(a).wet > phaseTargets(b).wet + 0.05;

  const current = (): WeatherSnapshot => ({
    phase, wetness: wet, visibility: vis, dryLine,
    label: PHASE_LABELS[phase],
  });

  const step: WeatherEvolution["step"] = (dt, raceProgress, totalLaps) => {
    const frac = totalLaps > 0 ? Math.min(1, raceProgress / totalLaps) : 0;
    const lapSpan = totalLaps > 0 ? 1 / totalLaps : 0.2;

    // Pre-announce the NEXT scripted phase ~1 lap before it actually flips,
    // so the engineer's "rain in 1 lap" lines up with the real change.
    for (let i = 0; i < script.length; i++) {
      const s = script[i];
      if (preAnnounced.has(i)) continue;
      const lead = s.atProgress - lapSpan;
      if (frac >= lead && frac < s.atProgress) {
        preAnnounced.add(i);
        if (wetterThan(s.phase, phase)) {
          if (s.phase === "storm") maybeSay(`pre:${i}`, ENGINEER_LINES.rainHeavier(), "warn", 1000, 4200);
          else maybeSay(`pre:${i}`, ENGINEER_LINES.rainSoon(1), "warn", 1000, 4200);
        } else if (s.phase === "drying" || s.phase === "dry") {
          maybeSay(`pre:${i}`, ENGINEER_LINES.rainEasing(), "good", 1000, 4200);
        }
      }
    }

    // Find latest scripted phase whose threshold has passed
    let active = script[0];
    for (let i = 0; i < script.length; i++) {
      if (frac >= script[i].atProgress) active = script[i];
    }
    if (active.phase !== phase) {
      const prev = phase;
      phase = active.phase;
      // Fire "it's happening now" callouts that match the new state.
      const idx = script.indexOf(active);
      firedWarn.add(idx);
      if (phase === "storm") {
        maybeSay("weather:storm", ENGINEER_LINES.thunder(), "alert", 1000, 4200);
      } else if (phase === "rain" || phase === "drizzle") {
        if (wetterThan(phase, prev)) maybeSay(`now:${idx}`, ENGINEER_LINES.rainNow(), "warn", 1000, 4200);
        else maybeSay(`now:${idx}`, ENGINEER_LINES.rainEasing(), "good", 1000, 4200);
      } else if (phase === "fog") {
        maybeSay("weather:fog", ENGINEER_LINES.fogIn(), "warn", 1000, 4200);
      } else if (phase === "drying" || phase === "dry") {
        maybeSay(`now:${idx}`, ENGINEER_LINES.dryingUp(), "good", 1000, 4200);
      }
    }
    // Smoothly ease toward target wetness / visibility
    const tgt = phaseTargets(phase);
    const ease = Math.min(1, dt * 0.5);
    wet += (tgt.wet - wet) * ease;
    vis += (tgt.vis - vis) * ease;
    // Dry line forms when wet decreasing
    if (phase === "drying" || phase === "dry") {
      dryLine += (1 - dryLine) * Math.min(1, dt * 0.25);
    } else {
      dryLine += (0 - dryLine) * Math.min(1, dt * 0.15);
    }
    return current();
  };

  const forecast = () => {
    return script
      .map((s) => `${Math.round(s.atProgress * 100)}% ${PHASE_LABELS[s.phase]}`)
      .join(" → ");
  };

  return { step, current, forecast };
}

/** Standalone forecast for the weekend preview screen. */
export function forecastForRace(startId: string): string {
  return createWeatherEvolution(startId).forecast();
}