import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/customize")({
  component: CustomizePage,
  head: () => ({
    meta: [
      { title: "Create Your Driver & Car — Asphalt Fever" },
      { name: "description", content: "Build your signature driver and dream machine. Pick liveries, neons, helmets and more." },
    ],
  }),
});

type Profile = {
  name: string;
  skin: string;
  outfit: string;
  helmet: string;
  number: number;
};
type CarBuild = {
  bodyColor: string;
  rim: string;
  neon: string;
  decal: string;
  style: string;
};
type DriverEntry = {
  id: string;
  profile: Profile;
  car: CarBuild;
  updatedAt: number;
};
type Garage = {
  drivers: DriverEntry[];
  activeId: string;
};

const SKINS = ["#f5d5b8", "#e0a878", "#9a6b4a", "#5a3a2a"];
const OUTFITS = ["#ff6a1a", "#22d3ee", "#ec4899", "#10b981", "#a855f7", "#facc15"];
const HELMETS = ["Carbon", "Chrome", "Matte Black", "Neon Tiger", "Hyper Red", "Ice Blue"];
const RIMS = ["Five-Spoke", "Mesh", "Turbofan", "Concave", "Split-Spoke"];
const NEONS = ["#ff1493", "#22d3ee", "#a855f7", "#22c55e", "#facc15", "#ff6a1a", "none"];
const DECALS = ["Stripes", "Flames", "Camo", "Tribal", "Carbon", "None"];
const STYLES = ["Balanced", "Top Speed", "Acceleration", "Grip", "Drift"];

const GARAGE_KEY = "af-garage-v1";

function defaultProfile(): Profile {
  return { name: "Apex", skin: SKINS[1], outfit: OUTFITS[0], helmet: HELMETS[0], number: 7 };
}
function defaultCar(): CarBuild {
  return { bodyColor: "#ff6a1a", rim: RIMS[0], neon: NEONS[1], decal: DECALS[0], style: STYLES[0] };
}
function newId() {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
function makeDriver(partial?: Partial<Profile>): DriverEntry {
  return { id: newId(), profile: { ...defaultProfile(), ...partial }, car: defaultCar(), updatedAt: Date.now() };
}

function loadGarage(): Garage {
  try {
    const raw = localStorage.getItem(GARAGE_KEY);
    if (raw) {
      const g = JSON.parse(raw) as Garage;
      if (g.drivers && g.drivers.length) return g;
    }
    // Migrate from legacy single profile/car
    const lp = localStorage.getItem("af-profile");
    const lc = localStorage.getItem("af-car");
    if (lp || lc) {
      const d: DriverEntry = {
        id: newId(),
        profile: lp ? { ...defaultProfile(), ...JSON.parse(lp) } : defaultProfile(),
        car: lc ? { ...defaultCar(), ...JSON.parse(lc) } : defaultCar(),
        updatedAt: Date.now(),
      };
      return { drivers: [d], activeId: d.id };
    }
  } catch {}
  const first = makeDriver();
  return { drivers: [first], activeId: first.id };
}

function saveGarage(g: Garage) {
  try {
    localStorage.setItem(GARAGE_KEY, JSON.stringify(g));
    const active = g.drivers.find((d) => d.id === g.activeId) ?? g.drivers[0];
    if (active) {
      localStorage.setItem("af-profile", JSON.stringify(active.profile));
      localStorage.setItem("af-car", JSON.stringify(active.car));
      localStorage.setItem("af-active-driver-id", active.id);
    }
  } catch {}
}

function CustomizePage() {
  const [tab, setTab] = useState<"driver" | "car">("driver");
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [garage, setGarage] = useState<Garage>(() => ({ drivers: [makeDriver()], activeId: "" }));

  useEffect(() => {
    setGarage(loadGarage());
    setLoaded(true);
  }, []);

  // Auto-save (debounced) on every change
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      saveGarage(garage);
      setSavedAt(Date.now());
    }, 200);
    return () => clearTimeout(t);
  }, [garage, loaded]);

  const active = useMemo(
    () => garage.drivers.find((d) => d.id === garage.activeId) ?? garage.drivers[0],
    [garage]
  );

  function updateActive(mut: (d: DriverEntry) => DriverEntry) {
    setGarage((g) => ({
      ...g,
      drivers: g.drivers.map((d) => (d.id === g.activeId ? { ...mut(d), updatedAt: Date.now() } : d)),
    }));
  }
  function setProfile(next: Profile) {
    updateActive((d) => ({ ...d, profile: next }));
  }
  function setCar(next: CarBuild) {
    updateActive((d) => ({ ...d, car: next }));
  }
  function selectDriver(id: string) {
    setGarage((g) => ({ ...g, activeId: id }));
  }
  function addDriver() {
    const d = makeDriver({ name: `Driver ${garage.drivers.length + 1}`, number: Math.floor(Math.random() * 99) });
    setGarage((g) => ({ drivers: [...g.drivers, d], activeId: d.id }));
  }
  function deleteDriver(id: string) {
    setGarage((g) => {
      const drivers = g.drivers.filter((d) => d.id !== id);
      if (drivers.length === 0) {
        const fresh = makeDriver();
        return { drivers: [fresh], activeId: fresh.id };
      }
      const activeId = g.activeId === id ? drivers[0].id : g.activeId;
      return { drivers, activeId };
    });
  }
  function duplicateDriver(id: string) {
    setGarage((g) => {
      const src = g.drivers.find((d) => d.id === id);
      if (!src) return g;
      const copy: DriverEntry = {
        ...src,
        id: newId(),
        profile: { ...src.profile, name: src.profile.name + " ②" },
        updatedAt: Date.now(),
      };
      return { drivers: [...g.drivers, copy], activeId: copy.id };
    });
  }

  if (!active) return null;
  const profile = active.profile;
  const car = active.car;

  return (
    <div className="min-h-screen bg-hero text-foreground">
      <header className="sticky top-0 z-40 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="font-display font-black text-lg sm:text-xl tracking-widest text-gradient-primary">
            ASPHALT FEVER
          </Link>
          <div className="flex gap-2 items-center">
            <span className="hidden sm:inline-flex items-center px-3 text-[10px] font-display uppercase tracking-widest text-muted-foreground">
              {savedAt ? `✓ Saved ${new Date(savedAt).toLocaleTimeString()}` : "Auto-save on"}
            </span>
            <button
              onClick={() => { saveGarage(garage); setSavedAt(Date.now()); }}
              className="tap-target px-4 sm:px-5 rounded-full bg-primary text-primary-foreground font-display text-xs sm:text-sm uppercase tracking-widest hover:scale-105 transition-transform shadow-neon"
            >
              Save
            </button>
            <Link
              to="/play"
              className="tap-target px-4 sm:px-5 flex items-center rounded-full glass font-display text-xs sm:text-sm uppercase tracking-widest hover:shadow-cyan transition-all"
            >
              Race ▶
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight">
          <span className="text-gradient-primary">Your</span>{" "}
          <span className="shimmer-text">Garage</span>
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Create multiple drivers — each one keeps its own car, livery and setup. Selecting a driver loads their build instantly.
        </p>

        {/* Driver list */}
        <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
          {garage.drivers.map((d) => {
            const isActive = d.id === garage.activeId;
            return (
              <button
                key={d.id}
                onClick={() => selectDriver(d.id)}
                className={`group flex-shrink-0 rounded-2xl px-4 py-3 text-left border transition-all min-w-[170px] ${
                  isActive ? "border-primary bg-primary/15 shadow-neon" : "border-border glass hover:border-primary/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-8 h-8 rounded-full border border-white/20 flex-shrink-0"
                    style={{ background: d.car.bodyColor, boxShadow: d.car.neon !== "none" ? `0 0 12px ${d.car.neon}` : undefined }}
                  />
                  <div className="min-w-0">
                    <div className="font-display uppercase tracking-widest text-sm truncate">{d.profile.name || "Driver"}</div>
                    <div className="text-[10px] text-muted-foreground">#{d.profile.number} • {d.car.style}</div>
                  </div>
                </div>
              </button>
            );
          })}
          <button
            onClick={addDriver}
            className="tap-target flex-shrink-0 rounded-2xl px-5 border-2 border-dashed border-border hover:border-primary text-muted-foreground hover:text-foreground font-display uppercase tracking-widest text-xs transition-all"
          >
            + New Driver
          </button>
        </div>
        <div className="mt-2 flex gap-2 text-[10px] font-display uppercase tracking-widest">
          <button onClick={() => duplicateDriver(active.id)} className="text-muted-foreground hover:text-foreground">Duplicate</button>
          <span className="text-border">•</span>
          <button onClick={() => deleteDriver(active.id)} className="text-muted-foreground hover:text-destructive">Delete this driver</button>
        </div>

        <div className="mt-6 inline-flex p-1 rounded-full glass">
          {(["driver", "car"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`tap-target px-5 sm:px-7 rounded-full font-display text-xs sm:text-sm uppercase tracking-widest transition-all ${
                tab === t ? "bg-primary text-primary-foreground shadow-neon" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "driver" ? "Driver" : "Car"}
            </button>
          ))}
        </div>

        <div className="mt-8 grid lg:grid-cols-[1.1fr_1fr] gap-6 lg:gap-10">
          {/* Preview */}
          <div className="glass rounded-3xl p-6 sm:p-10 grid-bg relative overflow-hidden min-h-[420px] flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none" />
            {tab === "driver" ? <DriverPreview profile={profile} /> : <CarPreview car={car} />}
          </div>

          {/* Controls */}
          <div className="space-y-5">
            {tab === "driver" ? (
              <>
                <Field label="Driver Name">
                  <input
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value.slice(0, 16) })}
                    className="w-full bg-input border border-border rounded-xl px-4 py-3 font-display tracking-wider text-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </Field>
                <Field label="Race Number">
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={profile.number}
                    onChange={(e) => setProfile({ ...profile, number: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })}
                    className="w-full bg-input border border-border rounded-xl px-4 py-3 font-display tracking-wider text-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </Field>
                <Field label="Skin Tone">
                  <Swatches values={SKINS} active={profile.skin} onPick={(v) => setProfile({ ...profile, skin: v })} />
                </Field>
                <Field label="Racing Suit Color">
                  <Swatches values={OUTFITS} active={profile.outfit} onPick={(v) => setProfile({ ...profile, outfit: v })} />
                </Field>
                <Field label="Helmet Style">
                  <Chips values={HELMETS} active={profile.helmet} onPick={(v) => setProfile({ ...profile, helmet: v })} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Body Color">
                  <Swatches values={[...OUTFITS, "#0f172a", "#f3f4f6"]} active={car.bodyColor} onPick={(v) => setCar({ ...car, bodyColor: v })} />
                </Field>
                <Field label="Wheels / Rims">
                  <Chips values={RIMS} active={car.rim} onPick={(v) => setCar({ ...car, rim: v })} />
                </Field>
                <Field label="Neon Underglow">
                  <div className="flex flex-wrap gap-2">
                    {NEONS.map((n) => (
                      <button
                        key={n}
                        onClick={() => setCar({ ...car, neon: n })}
                        className={`tap-target px-4 rounded-full text-xs font-display uppercase tracking-widest border transition-all ${
                          car.neon === n ? "border-primary scale-105" : "border-border hover:border-primary/60"
                        }`}
                        style={n !== "none" ? { boxShadow: `0 0 18px ${n}80, inset 0 0 12px ${n}40` } : undefined}
                      >
                        {n === "none" ? "Off" : ""}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Decals / Livery">
                  <Chips values={DECALS} active={car.decal} onPick={(v) => setCar({ ...car, decal: v })} />
                </Field>
                <Field label="Performance Style">
                  <Chips values={STYLES} active={car.style} onPick={(v) => setCar({ ...car, style: v })} />
                </Field>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="animate-slide-up">
      <div className="text-xs font-display uppercase tracking-[0.25em] text-muted-foreground mb-2">{label}</div>
      {children}
    </div>
  );
}
function Swatches({ values, active, onPick }: { values: string[]; active: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {values.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          aria-label={c}
          className={`tap-target w-12 h-12 rounded-xl border-2 transition-all hover:scale-110 ${
            active === c ? "border-primary shadow-neon scale-110" : "border-border"
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
function Chips({ values, active, onPick }: { values: string[]; active: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => (
        <button
          key={v}
          onClick={() => onPick(v)}
          className={`tap-target px-4 rounded-full text-xs font-display uppercase tracking-widest border transition-all ${
            active === v
              ? "border-primary bg-primary/15 text-foreground shadow-neon"
              : "border-border text-muted-foreground hover:text-foreground hover:border-primary/60"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function DriverPreview({ profile }: { profile: Profile }) {
  return (
    <div className="relative flex flex-col items-center gap-4">
      <div className="relative">
        <div
          className="w-44 h-44 sm:w-56 sm:h-56 rounded-[40%] relative animate-pulse-glow"
          style={{ background: `radial-gradient(circle at 35% 30%, #ffffff30, ${profile.outfit} 70%)` }}
        >
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-10 sm:h-12 rounded-md bg-black/80 border border-white/10" />
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-32 h-4 rounded-full bg-black/60 blur-sm" />
        </div>
        <div className="absolute inset-x-10 top-[58%] h-6 rounded" style={{ background: profile.skin, opacity: 0.6 }} />
      </div>
      <div
        className="w-56 sm:w-72 h-32 rounded-t-3xl"
        style={{ background: `linear-gradient(180deg, ${profile.outfit}, ${profile.outfit}cc)`, boxShadow: `0 0 40px ${profile.outfit}60` }}
      >
        <div className="flex justify-center pt-3 font-display text-3xl text-white drop-shadow">{profile.number}</div>
      </div>
      <div className="font-display uppercase tracking-[0.3em] text-lg text-gradient-primary">{profile.name || "Driver"}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-widest">{profile.helmet} Helmet</div>
    </div>
  );
}

function CarPreview({ car }: { car: CarBuild }) {
  return (
    <div className="relative flex flex-col items-center gap-6">
      <div className="relative w-[280px] sm:w-[360px] h-32 sm:h-40">
        {car.neon !== "none" && (
          <div className="absolute inset-x-4 -bottom-4 h-12 rounded-full blur-2xl" style={{ background: car.neon, opacity: 0.6 }} />
        )}
        <div
          className="absolute inset-x-0 top-6 bottom-8 rounded-[28px] shadow-2xl"
          style={{
            background: `linear-gradient(180deg, ${car.bodyColor}, ${car.bodyColor}aa)`,
            boxShadow: `0 20px 60px ${car.bodyColor}40, inset 0 -10px 30px #00000060`,
          }}
        >
          <div className="absolute inset-x-12 top-2 h-6 sm:h-8 rounded-t-2xl bg-gradient-to-b from-cyan-300/40 to-black/60" />
          {car.decal !== "None" && <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-2 rounded bg-white/40" />}
        </div>
        <Wheel x="left-4" />
        <Wheel x="right-4" />
      </div>
      <div className="text-center">
        <div className="font-display uppercase tracking-[0.3em] text-lg text-gradient-accent">{car.style}</div>
        <div className="text-xs text-muted-foreground mt-1 uppercase tracking-widest">{car.rim} • {car.decal}</div>
      </div>
    </div>
  );
}
function Wheel({ x }: { x: string }) {
  return (
    <div className={`absolute ${x} -bottom-2 w-12 h-12 rounded-full bg-zinc-900 border-4 border-zinc-700 flex items-center justify-center`}>
      <div className="w-4 h-4 rounded-full bg-zinc-500" />
    </div>
  );
}
