// 10 stylized open-world cities. Each describes palette + terrain so the
// procedural world builder can generate a unique-feeling map.

export type CityTerrain = "urban" | "desert" | "coastal" | "highway" | "mountain" | "tunnel" | "beach";

export type CitySpec = {
  id: string;
  name: string;
  country: string;
  /** primary terrain — drives world generator. */
  terrain: CityTerrain;
  /** secondary feature. */
  feature: string;
  palette: {
    sky: string;
    skyNight: string;
    ground: string;
    road: string;
    buildingA: string;
    buildingB: string;
    accent: string; // neon / signage
    fog: string;
  };
  /** Default time of day at session start, 0..24. */
  startHour: number;
  /** Traffic density multiplier (0..1). */
  trafficDensity: number;
  /** Building density (0..1) for procedural generator. */
  buildingDensity: number;
  /** One-line vibe. */
  vibe: string;
};

export const CITIES: CitySpec[] = [
  { id: "tokyo", name: "Tokyo", country: "Japan", terrain: "urban", feature: "Neon skyscrapers & elevated highways",
    palette: { sky: "#1a2a4a", skyNight: "#0a0a1a", ground: "#1a1a22", road: "#222228",
      buildingA: "#2a2a3a", buildingB: "#3a2a4a", accent: "#ff00aa", fog: "#1a1a2a" },
    startHour: 21, trafficDensity: 0.9, buildingDensity: 0.95, vibe: "Cyberpunk neon nightscape" },
  { id: "dubai", name: "Dubai", country: "UAE", terrain: "desert", feature: "Desert highways past glass towers",
    palette: { sky: "#ffb070", skyNight: "#1a1530", ground: "#d4a060", road: "#3a3028",
      buildingA: "#e8e0d0", buildingB: "#c8b890", accent: "#ffd700", fog: "#e8c898" },
    startHour: 17, trafficDensity: 0.4, buildingDensity: 0.55, vibe: "Golden hour over dunes" },
  { id: "monaco", name: "Monaco", country: "Monte Carlo", terrain: "coastal", feature: "Tight harbor switchbacks",
    palette: { sky: "#7ec0e8", skyNight: "#0a1530", ground: "#2a3a4a", road: "#3a3a3a",
      buildingA: "#f5e6c0", buildingB: "#e8c890", accent: "#0099ff", fog: "#a0c0d0" },
    startHour: 11, trafficDensity: 0.3, buildingDensity: 0.7, vibe: "Mediterranean luxury" },
  { id: "newyork", name: "New York", country: "USA", terrain: "urban", feature: "Manhattan grid skyscrapers",
    palette: { sky: "#5a6a7a", skyNight: "#0a0a14", ground: "#202028", road: "#1a1a1a",
      buildingA: "#3a3530", buildingB: "#4a4540", accent: "#ffcc00", fog: "#404550" },
    startHour: 14, trafficDensity: 1.0, buildingDensity: 1.0, vibe: "Yellow cabs and steam" },
  { id: "la", name: "Los Angeles", country: "USA", terrain: "highway", feature: "Palm-lined freeways & hills",
    palette: { sky: "#ff8a60", skyNight: "#1a0a20", ground: "#c8a878", road: "#2a2a2a",
      buildingA: "#f0d8b0", buildingB: "#e0b888", accent: "#ff3366", fog: "#ffaa88" },
    startHour: 19, trafficDensity: 0.7, buildingDensity: 0.5, vibe: "Sunset boulevard" },
  { id: "london", name: "London", country: "UK", terrain: "urban", feature: "Foggy historic streets",
    palette: { sky: "#8090a0", skyNight: "#101820", ground: "#3a3a40", road: "#2a2828",
      buildingA: "#5a5048", buildingB: "#4a3e36", accent: "#cc0033", fog: "#9aa5b0" },
    startHour: 8, trafficDensity: 0.7, buildingDensity: 0.85, vibe: "Misty morning rush" },
  { id: "paris", name: "Paris", country: "France", terrain: "urban", feature: "Boulevards & monuments",
    palette: { sky: "#c0b0d0", skyNight: "#1a1428", ground: "#3a3a3a", road: "#3a3530",
      buildingA: "#e8d8c0", buildingB: "#d0b898", accent: "#ffcc66", fog: "#c0b8c8" },
    startHour: 18, trafficDensity: 0.6, buildingDensity: 0.8, vibe: "Evening lights on the Seine" },
  { id: "geneva", name: "Geneva", country: "Switzerland", terrain: "mountain", feature: "Lakeside alpine roads",
    palette: { sky: "#90c0d8", skyNight: "#0a1830", ground: "#2a4030", road: "#3a3a3a",
      buildingA: "#e0e0e0", buildingB: "#b0c0c8", accent: "#00ccaa", fog: "#a0b8c0" },
    startHour: 10, trafficDensity: 0.25, buildingDensity: 0.35, vibe: "Crisp mountain air" },
  { id: "singapore", name: "Singapore", country: "Singapore", terrain: "tunnel", feature: "Skybridges & marina",
    palette: { sky: "#5a3a7a", skyNight: "#0a0820", ground: "#1a1a22", road: "#202024",
      buildingA: "#2a2030", buildingB: "#3a2a40", accent: "#00ffd5", fog: "#2a2540" },
    startHour: 22, trafficDensity: 0.6, buildingDensity: 0.9, vibe: "Marina bay lights" },
  { id: "miami", name: "Miami", country: "USA", terrain: "beach", feature: "Pastel beaches & causeways",
    palette: { sky: "#5ad0f0", skyNight: "#0a1838", ground: "#e8d090", road: "#2a2a30",
      buildingA: "#ffb0d0", buildingB: "#a0d8f0", accent: "#ff0080", fog: "#a0e0f0" },
    startHour: 16, trafficDensity: 0.55, buildingDensity: 0.65, vibe: "Art Deco coastline" },
];

export const DEFAULT_CITY_ID = "tokyo";

export function cityById(id: string): CitySpec {
  return CITIES.find((c) => c.id === id) ?? CITIES[0];
}

const KEY = "af-freeroam-city";
export function loadSelectedCity(): string {
  if (typeof window === "undefined") return DEFAULT_CITY_ID;
  try { return localStorage.getItem(KEY) ?? DEFAULT_CITY_ID; } catch { return DEFAULT_CITY_ID; }
}
export function saveSelectedCity(id: string) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, id); } catch {}
}