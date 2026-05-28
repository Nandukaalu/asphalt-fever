// Graphics quality presets + auto-detection + persistence.
// Used by FreeRoam and (lightly) by RacingGame to scale visual fidelity
// per device. Higher tiers enable shadows, more lights, denser particles
// and post-processing tweaks. Lower tiers strip them out for stable FPS.

export type QualityTier = "low" | "medium" | "high" | "ultra";

export type GraphicsPreset = {
  tier: QualityTier;
  /** renderer.setPixelRatio cap */
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Headlight SpotLights at night */
  dynamicHeadlights: boolean;
  /** Particle counts */
  rainCount: number;
  sparkCount: number;
  smokeCount: number;
  /** Tire spray on wet roads */
  tireSpray: boolean;
  /** Cloud shadows scrolling across ground */
  cloudShadows: boolean;
  /** Lightning flashes during storms */
  lightning: boolean;
  /** Lens flare / sun glare */
  lensFlare: boolean;
  /** Ambient occlusion-style darkening near buildings */
  ambientOcclusion: boolean;
  /** Tone mapping exposure */
  exposure: number;
  /** Fog distance multiplier (lower = thicker fog, hides distant LOD) */
  fogScale: number;
  /** Building draw distance cap */
  drawDistance: number;
};

export const PRESETS: Record<QualityTier, GraphicsPreset> = {
  low: {
    tier: "low",
    pixelRatio: 1.0,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    dynamicHeadlights: false,
    rainCount: 600,
    sparkCount: 40,
    smokeCount: 30,
    tireSpray: false,
    cloudShadows: false,
    lightning: true,
    lensFlare: false,
    ambientOcclusion: false,
    exposure: 1.0,
    fogScale: 0.7,
    drawDistance: 240,
  },
  medium: {
    tier: "medium",
    pixelRatio: 1.25,
    antialias: false,
    shadows: false,
    shadowMapSize: 1024,
    dynamicHeadlights: true,
    rainCount: 1200,
    sparkCount: 60,
    smokeCount: 50,
    tireSpray: true,
    cloudShadows: false,
    lightning: true,
    lensFlare: true,
    ambientOcclusion: false,
    exposure: 1.05,
    fogScale: 0.9,
    drawDistance: 320,
  },
  high: {
    tier: "high",
    pixelRatio: 1.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    dynamicHeadlights: true,
    rainCount: 1800,
    sparkCount: 100,
    smokeCount: 80,
    tireSpray: true,
    cloudShadows: true,
    lightning: true,
    lensFlare: true,
    ambientOcclusion: true,
    exposure: 1.1,
    fogScale: 1.1,
    drawDistance: 420,
  },
  ultra: {
    tier: "ultra",
    pixelRatio: 2.0,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    dynamicHeadlights: true,
    rainCount: 2800,
    sparkCount: 140,
    smokeCount: 120,
    tireSpray: true,
    cloudShadows: true,
    lightning: true,
    lensFlare: true,
    ambientOcclusion: true,
    exposure: 1.15,
    fogScale: 1.3,
    drawDistance: 560,
  },
};

const KEY = "af-graphics-tier";

/** Best-effort auto detection of a sensible default tier. */
export function autoDetectTier(): QualityTier {
  if (typeof window === "undefined") return "medium";
  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const cores = (navigator as any).hardwareConcurrency ?? 4;
  const mem = (navigator as any).deviceMemory ?? 4;
  const dpr = window.devicePixelRatio || 1;

  if (isMobile) {
    if (cores <= 4 || mem <= 3) return "low";
    if (cores >= 8 && mem >= 6) return "high";
    return "medium";
  }
  if (cores >= 8 && mem >= 8 && dpr >= 2) return "ultra";
  if (cores >= 6 && mem >= 6) return "high";
  if (cores >= 4) return "medium";
  return "low";
}

export function loadGraphicsTier(): QualityTier {
  if (typeof window === "undefined") return "medium";
  try {
    const stored = localStorage.getItem(KEY) as QualityTier | null;
    if (stored && stored in PRESETS) return stored;
  } catch { /* noop */ }
  return autoDetectTier();
}

export function saveGraphicsTier(tier: QualityTier) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, tier); } catch { /* noop */ }
}

export function getPreset(tier: QualityTier): GraphicsPreset {
  return PRESETS[tier] ?? PRESETS.medium;
}

export const TIER_LABELS: Record<QualityTier, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  ultra: "Ultra",
};