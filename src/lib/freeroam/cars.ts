// Free Roam vehicle roster — 13 performance cars inspired by real brands.
// Each has unique tuning constants the driving sim reads each frame.

export type CarSpec = {
  id: string;
  name: string;
  brand: string;
  category: "Hypercar" | "Supercar" | "Sports" | "Sedan" | "JDM" | "Muscle";
  color: string;
  accent: string;
  /** m/s top speed (1 m/s ≈ 3.6 km/h). Range ~70 (sedan) to 130 (hypercar). */
  topSpeed: number;
  /** m/s² peak acceleration. */
  accel: number;
  /** m/s² peak braking deceleration. */
  braking: number;
  /** 1 = neutral; >1 = sharper steering. */
  handling: number;
  /** 1 = neutral grip; <1 = drifty. */
  grip: number;
  /** kg, affects momentum / collision push. */
  weight: number;
  /** Engine sound profile — synthesized in Web Audio. */
  engine: "v12" | "v10" | "v8" | "flat6" | "i6" | "i4-turbo" | "ev";
  /** Visual body shape preset for the low-poly renderer. */
  body: "hyper" | "super" | "coupe" | "sedan" | "jdm" | "muscle";
};

export const CARS: CarSpec[] = [
  { id: "vey",  brand: "Bugatti",       name: "Veyronix Chiron",  category: "Hypercar",
    color: "#1a3a8a", accent: "#000000", topSpeed: 130, accel: 16, braking: 24, handling: 0.92, grip: 1.05, weight: 1995, engine: "v12", body: "hyper" },
  { id: "lf",   brand: "Ferrari",       name: "Scuderia LF-90",   category: "Hypercar",
    color: "#d40000", accent: "#1a1a1a", topSpeed: 122, accel: 17, braking: 24, handling: 1.10, grip: 1.08, weight: 1485, engine: "v12", body: "hyper" },
  { id: "rev",  brand: "Lamborghini",   name: "Revuelta SVJ",     category: "Hypercar",
    color: "#ffb000", accent: "#000000", topSpeed: 120, accel: 17, braking: 23, handling: 1.05, grip: 1.06, weight: 1525, engine: "v12", body: "hyper" },
  { id: "spd",  brand: "McLaren",       name: "Speedtail 720",    category: "Hypercar",
    color: "#ff8000", accent: "#0a0a0a", topSpeed: 125, accel: 17, braking: 23, handling: 1.08, grip: 1.07, weight: 1430, engine: "v8", body: "hyper" },
  { id: "agr",  brand: "Koenigsegg",    name: "Agera Jesko",      category: "Hypercar",
    color: "#e8e8e8", accent: "#003366", topSpeed: 132, accel: 18, braking: 25, handling: 1.06, grip: 1.10, weight: 1420, engine: "v8", body: "hyper" },
  { id: "gt3",  brand: "Porsche",       name: "Carrera GT3 RS",   category: "Supercar",
    color: "#f0e030", accent: "#0a0a0a", topSpeed: 110, accel: 15, braking: 24, handling: 1.18, grip: 1.15, weight: 1430, engine: "flat6", body: "super" },
  { id: "van",  brand: "Aston Martin",  name: "Vantage Valkyrie", category: "Supercar",
    color: "#0d3b25", accent: "#c0a060", topSpeed: 115, accel: 15, braking: 22, handling: 1.05, grip: 1.05, weight: 1530, engine: "v12", body: "super" },
  { id: "amg",  brand: "Mercedes-AMG",  name: "AMG One Black",    category: "Supercar",
    color: "#1a1a1a", accent: "#9b9b9b", topSpeed: 118, accel: 16, braking: 23, handling: 1.10, grip: 1.08, weight: 1635, engine: "v8", body: "super" },
  { id: "m4",   brand: "BMW",           name: "M4 CSL",           category: "Sports",
    color: "#4a0e0e", accent: "#ffffff", topSpeed: 96,  accel: 13, braking: 21, handling: 1.20, grip: 1.10, weight: 1625, engine: "i6", body: "coupe" },
  { id: "rs7",  brand: "Audi",          name: "RS7 Performance",  category: "Sedan",
    color: "#2a2a2a", accent: "#c0c0c0", topSpeed: 92,  accel: 12, braking: 20, handling: 1.00, grip: 1.05, weight: 2050, engine: "v8", body: "sedan" },
  { id: "gtr",  brand: "Nissan",        name: "GT-R Nismo",       category: "JDM",
    color: "#c8d6e8", accent: "#d40000", topSpeed: 100, accel: 14, braking: 21, handling: 1.12, grip: 1.10, weight: 1740, engine: "i6", body: "jdm" },
  { id: "sup",  brand: "Toyota",        name: "Supra MK-V GT",    category: "JDM",
    color: "#d97706", accent: "#1a1a1a", topSpeed: 92,  accel: 13, braking: 20, handling: 1.15, grip: 1.05, weight: 1495, engine: "i6", body: "jdm" },
  { id: "vet",  brand: "Chevrolet",     name: "Corvette Z06",     category: "Muscle",
    color: "#fff200", accent: "#0a0a0a", topSpeed: 108, accel: 15, braking: 22, handling: 1.05, grip: 1.02, weight: 1560, engine: "v8", body: "muscle" },
];

export const DEFAULT_CAR_ID = "rev";

export function carById(id: string): CarSpec {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

/* Persistence */
const KEY = "af-freeroam-car";
export function loadSelectedCar(): string {
  if (typeof window === "undefined") return DEFAULT_CAR_ID;
  try { return localStorage.getItem(KEY) ?? DEFAULT_CAR_ID; } catch { return DEFAULT_CAR_ID; }
}
export function saveSelectedCar(id: string) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, id); } catch {}
}