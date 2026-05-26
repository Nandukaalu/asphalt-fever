import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import FreeRoam from "@/components/FreeRoam";
import { CARS, loadSelectedCar, saveSelectedCar } from "@/lib/freeroam/cars";
import { CITIES, loadSelectedCity, saveSelectedCity } from "@/lib/freeroam/cities";

export const Route = createFileRoute("/freeroam")({
  component: FreeRoamPage,
  head: () => ({
    meta: [
      { title: "Free Roam — Asphalt Fever" },
      { name: "description", content: "Cruise 10 stylized world cities in 13 performance cars. Dynamic weather, day/night, online ghost cars." },
    ],
  }),
});

function FreeRoamPage() {
  const [cityId, setCityId] = useState<string>(() => loadSelectedCity());
  const [carId, setCarId] = useState<string>(() => loadSelectedCar());
  const [name, setName] = useState<string>(() => {
    if (typeof window === "undefined") return "Player";
    try { return localStorage.getItem("af-name") || "Player"; } catch { return "Player"; }
  });
  const [mp, setMp] = useState(true);
  const [driving, setDriving] = useState(false);

  const start = () => {
    saveSelectedCar(carId);
    saveSelectedCity(cityId);
    try { localStorage.setItem("af-name", name); } catch {}
    setDriving(true);
  };

  if (driving) {
    return (
      <FreeRoam
        cityId={cityId}
        carId={carId}
        playerName={name}
        multiplayer={mp}
        onExit={() => setDriving(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="glass tap-target px-4 rounded-full text-xs font-display uppercase tracking-widest inline-flex items-center">
            ← Home
          </Link>
          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-widest text-gradient-primary">FREE ROAM</h1>
          <div className="w-20" />
        </div>

        {/* Cities */}
        <section className="mb-8">
          <h2 className="font-display uppercase tracking-widest text-sm text-muted-foreground mb-3">City · {CITIES.length} maps</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {CITIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCityId(c.id)}
                className={`text-left p-3 rounded-xl border transition-all ${cityId === c.id ? "border-primary shadow-neon" : "border-border/40 glass hover:border-primary/50"}`}
              >
                <div className="h-16 rounded-md mb-2 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${c.palette.sky}, ${c.palette.skyNight})` }}>
                  <div className="absolute inset-x-0 bottom-0 h-6" style={{ background: c.palette.buildingA }} />
                  <div className="absolute inset-x-0 bottom-0 h-3" style={{ background: c.palette.ground }} />
                  <div className="absolute right-1 top-1 w-2 h-2 rounded-full" style={{ background: c.palette.accent, boxShadow: `0 0 8px ${c.palette.accent}` }} />
                </div>
                <div className="font-display text-sm font-bold">{c.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.country} · {c.terrain}</div>
                <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{c.vibe}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Cars */}
        <section className="mb-8">
          <h2 className="font-display uppercase tracking-widest text-sm text-muted-foreground mb-3">Vehicle · {CARS.length} cars</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {CARS.map((c) => (
              <button
                key={c.id}
                onClick={() => setCarId(c.id)}
                className={`text-left p-3 rounded-xl border transition-all ${carId === c.id ? "border-primary shadow-neon" : "border-border/40 glass hover:border-primary/50"}`}
              >
                <div className="h-12 rounded-md mb-2 flex items-end px-2" style={{ background: `linear-gradient(135deg, ${c.color}, ${c.accent})` }}>
                  <div className="w-full h-3 rounded-sm" style={{ background: c.accent }} />
                </div>
                <div className="font-display text-sm font-bold truncate">{c.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.brand} · {c.category}</div>
                <div className="text-[10px] text-muted-foreground mt-1 grid grid-cols-3 gap-1">
                  <span>SPD {Math.round(c.topSpeed * 3.6)}</span>
                  <span>ACC {c.accel}</span>
                  <span>HND {c.handling.toFixed(2)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Options */}
        <section className="glass rounded-xl p-4 mb-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <label className="text-xs font-display uppercase tracking-widest text-muted-foreground">Driver</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              className="bg-background border border-border/40 rounded-md px-3 py-2 text-sm flex-1 sm:w-40"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={mp} onChange={(e) => setMp(e.target.checked)} />
            <span className="text-xs font-display uppercase tracking-widest">Multiplayer cruise</span>
          </label>
          <button
            onClick={start}
            className="tap-target px-8 rounded-full bg-primary text-primary-foreground font-display uppercase tracking-widest text-sm shadow-neon hover:scale-105 transition-transform"
          >
            Drive
          </button>
        </section>

        <p className="text-[11px] text-muted-foreground text-center">
          Activities: drift zones · speed cameras · time trials · collectibles · viewpoints · car meets · photo spots
        </p>
      </div>
    </div>
  );
}