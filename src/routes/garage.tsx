import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/garage")({
  component: GaragePage,
  head: () => ({
    meta: [
      { title: "The Garage — Asphalt Fever" },
      { name: "description", content: "Step inside your personal high-end garage. Walk around your car, customize every detail, tune performance, and enter Showroom mode." },
    ],
  }),
});

// ---------- Types ----------
type Profile = { name: string; skin: string; outfit: string; helmet: string; number: number };
type CarBuild = {
  bodyColor: string; rim: string; neon: string; decal: string; style: string;
  tint?: number; plate?: string; interior?: string;
};
type DriverEntry = { id: string; profile: Profile; car: CarBuild; updatedAt: number };
type Garage = { drivers: DriverEntry[]; activeId: string };
type Tuning = { engine: number; turbo: number; handling: number; brakes: number; suspension: number; tires: "Sport" | "Slick" | "All-Weather" | "Drift" };
type Wallet = { credits: number };

// ---------- Storage ----------
const GARAGE_KEY = "af-garage-v1";
const TUNING_KEY = "af-tuning-v1";
const WALLET_KEY = "af-wallet-v1";

const RIMS = ["Five-Spoke", "Mesh", "Turbofan", "Concave", "Split-Spoke"];
const NEONS = ["#ff1493", "#22d3ee", "#a855f7", "#22c55e", "#facc15", "#ff6a1a", "none"];
const DECALS = ["Stripes", "Flames", "Camo", "Tribal", "Carbon", "None"];
const PAINTS = ["#ff6a1a","#22d3ee","#ec4899","#10b981","#a855f7","#facc15","#0f172a","#f3f4f6","#dc2626","#0ea5e9"];
const INTERIORS = ["#0a0a0a", "#7f1d1d", "#1e3a8a", "#f5d5b8", "#3b3b3b"];
const TIRE_OPTS: Tuning["tires"][] = ["Sport", "Slick", "All-Weather", "Drift"];

function loadJSON<T>(k: string, fallback: T): T {
  try { const r = localStorage.getItem(k); return r ? { ...fallback, ...JSON.parse(r) } : fallback; } catch { return fallback; }
}
function saveJSON(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

function loadGarage(): Garage | null {
  try {
    const raw = localStorage.getItem(GARAGE_KEY);
    if (raw) { const g = JSON.parse(raw) as Garage; if (g.drivers?.length) return g; }
  } catch {}
  return null;
}

// ---------- Audio (procedural) ----------
function useGarageAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const ambientRef = useRef<{ stop: () => void } | null>(null);
  const enabledRef = useRef(false);

  const ensure = () => {
    if (!ctxRef.current) {
      const C = (window.AudioContext || (window as any).webkitAudioContext);
      if (!C) return null;
      ctxRef.current = new C();
    }
    return ctxRef.current;
  };

  const startAmbient = () => {
    const ctx = ensure(); if (!ctx) return;
    if (ambientRef.current) return;
    enabledRef.current = true;
    // Pink-ish noise low rumble + occasional clinks
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99 * b0 + 0.0555 * white;
      b1 = 0.96 * b1 + 0.0750 * white;
      b2 = 0.86 * b2 + 0.1538 * white;
      data[i] = (b0 + b1 + b2) * 0.15;
    }
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 280;
    const gain = ctx.createGain(); gain.gain.value = 0.05;
    src.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
    src.start();

    // periodic metallic clink
    const interval = window.setInterval(() => {
      if (!enabledRef.current) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = "triangle";
      o.frequency.setValueAtTime(900 + Math.random() * 600, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.04, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.55);
    }, 6500);

    ambientRef.current = {
      stop: () => {
        try { src.stop(); } catch {}
        clearInterval(interval);
        ambientRef.current = null;
        enabledRef.current = false;
      },
    };
  };
  const stopAmbient = () => ambientRef.current?.stop();

  const revEngine = (intensity = 1) => {
    const ctx = ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(60, t);
    o.frequency.exponentialRampToValueAtTime(180 + 120 * intensity, t + 0.25);
    o.frequency.exponentialRampToValueAtTime(80, t + 1.2);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(1600, t + 0.3);
    lp.frequency.linearRampToValueAtTime(600, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(lp); lp.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 1.35);

    // exhaust pop
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
    noise.buffer = buf;
    const ng = ctx.createGain(); ng.gain.value = 0.25;
    noise.connect(ng); ng.connect(ctx.destination);
    noise.start(t + 0.05);
  };

  const click = () => {
    const ctx = ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "square";
    o.frequency.setValueAtTime(1200, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.09);
  };

  useEffect(() => () => stopAmbient(), []);

  return { startAmbient, stopAmbient, revEngine, click };
}

// ---------- Page ----------
function GaragePage() {
  const [garage, setGarage] = useState<Garage | null>(null);
  const [tuning, setTuning] = useState<Tuning>(() =>
    loadJSON<Tuning>(TUNING_KEY, { engine: 3, turbo: 2, handling: 4, brakes: 3, suspension: 3, tires: "Sport" })
  );
  const [wallet, setWallet] = useState<Wallet>(() => loadJSON<Wallet>(WALLET_KEY, { credits: 24500 }));
  const infiniteRef = useRef(false);
  try { infiniteRef.current = localStorage.getItem("af-infinite-credits") === "true"; } catch {}
  const [infiniteMode, setInfiniteMode] = useState(infiniteRef.current);
  const [tab, setTab] = useState<"paint" | "wheels" | "neon" | "decals" | "interior" | "tune" | "showroom">("paint");
  const [angle, setAngle] = useState(35); // rotation Y degrees
  const [zoom, setZoom] = useState(1);
  const [headlights, setHeadlights] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [neonOn, setNeonOn] = useState(true);
  const [showroom, setShowroom] = useState(false);
  const [photoFlash, setPhotoFlash] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const audio = useGarageAudio();
  const dragRef = useRef<{ x: number; angle: number } | null>(null);

  // load garage client-only
  useEffect(() => {
    const g = loadGarage();
    setGarage(g ?? {
      drivers: [{
        id: "default", updatedAt: Date.now(),
        profile: { name: "Apex", skin: "#e0a878", outfit: "#ff6a1a", helmet: "Carbon", number: 7 },
        car: { bodyColor: "#ff6a1a", rim: "Five-Spoke", neon: "#22d3ee", decal: "Stripes", style: "Balanced", tint: 40, plate: "AF-001", interior: "#0a0a0a" },
      }], activeId: "default",
    });
  }, []);

  const active = useMemo(() => garage?.drivers.find(d => d.id === garage.activeId) ?? garage?.drivers[0] ?? null, [garage]);
  const car = active?.car;

  // autosave
  useEffect(() => { if (garage) { saveJSON(GARAGE_KEY, garage); setSavedAt(Date.now()); } }, [garage]);
  useEffect(() => { saveJSON(TUNING_KEY, tuning); setSavedAt(Date.now()); }, [tuning]);
  useEffect(() => { saveJSON(WALLET_KEY, wallet); }, [wallet]);

  // Infinite credits toggle (Ctrl+Shift+I)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        const next = !infiniteRef.current;
        infiniteRef.current = next;
        setInfiniteMode(next);
        try { localStorage.setItem("af-infinite-credits", String(next)); } catch {}
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // showroom auto-rotate
  useEffect(() => {
    if (!showroom) return;
    let raf = 0; let last = performance.now();
    const loop = (t: number) => {
      const dt = (t - last) / 1000; last = t;
      setAngle(a => (a + dt * 18) % 360);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showroom]);

  // audio toggle
  useEffect(() => {
    if (audioOn) audio.startAmbient(); else audio.stopAmbient();
  }, [audioOn, audio]);

  function updateCar(p: Partial<CarBuild>) {
    setGarage(g => g ? ({
      ...g,
      drivers: g.drivers.map(d => d.id === g.activeId ? { ...d, car: { ...d.car, ...p }, updatedAt: Date.now() } : d),
    }) : g);
    audio.click();
    // mirror legacy single key for game
    try { localStorage.setItem("af-car", JSON.stringify({ ...car, ...p })); } catch {}
  }

  function upgrade(field: keyof Omit<Tuning, "tires">) {
    setTuning(t => {
      const cur = t[field]; if (cur >= 10) return t;
      const cost = 800 + cur * 400;
      if (!infiniteMode && wallet.credits < cost) return t;
      if (!infiniteMode) setWallet(w => ({ credits: w.credits - cost }));
      audio.click();
      return { ...t, [field]: cur + 1 };
    });
  }

  function snapshot() {
    setPhotoFlash(true);
    setTimeout(() => setPhotoFlash(false), 350);
    audio.click();
    // iPad easter egg: enable infinite credits for one race only
    try {
      const ua = navigator.userAgent || "";
      const isIpad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
      if (isIpad && !infiniteRef.current) {
        localStorage.setItem("af-tuning-pre-infinite", JSON.stringify(tuning));
        localStorage.setItem("af-wallet-pre-infinite", JSON.stringify(wallet));
        localStorage.setItem("af-infinite-credits", "true");
        localStorage.setItem("af-infinite-oneshot", "true");
        infiniteRef.current = true;
        setInfiniteMode(true);
      }
    } catch {}
  }

  // drag rotate
  function onPointerDown(e: React.PointerEvent) {
    if (showroom) return;
    dragRef.current = { x: e.clientX, angle };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    setAngle(dragRef.current.angle + dx * 0.5);
  }
  function onPointerUp() { dragRef.current = null; }

  if (!active || !car) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading garage…</div>;
  }

  const totalPower = Math.round(60 + tuning.engine * 6 + tuning.turbo * 4);
  const totalGrip = Math.round(50 + tuning.handling * 5 + (tuning.tires === "Slick" ? 10 : tuning.tires === "Drift" ? -5 : 0));
  const totalBrakes = Math.round(50 + tuning.brakes * 5);
  const totalRide = Math.round(50 + tuning.suspension * 5);

  return (
    <div className="min-h-screen text-foreground relative overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 30%, oklch(0.18 0.04 265) 0%, oklch(0.06 0.02 265) 70%)" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="font-display font-black text-lg sm:text-xl tracking-widest text-gradient-primary">ASPHALT FEVER</Link>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-display tracking-widest uppercase">
              <span className="text-accent">◆</span>
              <span className="text-foreground">{infiniteMode ? "∞" : wallet.credits.toLocaleString()}</span>
              <span className="text-muted-foreground">CR</span>
              {infiniteMode && <span className="text-[9px] text-accent ml-1">VIP</span>}
            </div>
            <button onClick={() => setAudioOn(v => !v)} title="Ambient sound"
              className={`tap-target px-3 rounded-full text-xs font-display uppercase tracking-widest border transition-all ${audioOn ? "border-accent bg-accent/15" : "border-border text-muted-foreground"}`}>
              {audioOn ? "🔊" : "🔈"}
            </button>
            <Link to="/customize" className="tap-target px-4 rounded-full glass font-display text-xs uppercase tracking-widest hover:shadow-cyan transition-all">Driver</Link>
            <Link to="/play" className="tap-target px-4 rounded-full bg-primary text-primary-foreground font-display text-xs uppercase tracking-widest hover:scale-105 transition-transform shadow-neon">Race ▶</Link>
          </div>
        </div>
      </header>

      {/* Stage */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 pb-28">
        <div className="grid lg:grid-cols-[1fr_360px] gap-4 lg:gap-6">
          {/* Garage stage */}
          <div className="relative rounded-3xl overflow-hidden border border-border" style={{ minHeight: 480, height: "calc(100svh - 220px)" }}>
            <GarageStage
              car={car}
              angle={angle}
              zoom={zoom}
              headlights={headlights}
              doorsOpen={doorsOpen}
              neonOn={neonOn}
              showroom={showroom}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />

            {/* Photo flash */}
            {photoFlash && <div className="absolute inset-0 bg-white animate-[fade-out_0.35s_ease-out] pointer-events-none" />}

            {/* Top stats overlay */}
            <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none">
              <div className="glass rounded-2xl px-3 py-2 pointer-events-auto">
                <div className="text-[10px] font-display uppercase tracking-[0.25em] text-muted-foreground">Now Viewing</div>
                <div className="font-display text-sm tracking-widest text-gradient-accent">{active.profile.name} • #{active.profile.number}</div>
              </div>
              <div className="glass rounded-2xl px-3 py-2 text-right pointer-events-auto">
                <div className="text-[10px] font-display uppercase tracking-[0.25em] text-muted-foreground">{car.style}</div>
                <div className="font-display text-sm">{totalPower} BHP • {totalGrip} GRIP</div>
              </div>
            </div>

            {/* Bottom interactive controls */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2 justify-center">
              <StageBtn label="Rev" icon="🏁" onClick={() => { audio.revEngine(0.8 + tuning.engine * 0.1); }} />
              <StageBtn label={headlights ? "Lights On" : "Lights"} icon="💡" active={headlights} onClick={() => setHeadlights(v => !v)} />
              <StageBtn label={doorsOpen ? "Close Doors" : "Open Doors"} icon="🚪" active={doorsOpen} onClick={() => setDoorsOpen(v => !v)} />
              <StageBtn label="Neon" icon="✨" active={neonOn} onClick={() => setNeonOn(v => !v)} />
              <StageBtn label="Rotate" icon="↻" onClick={() => setAngle(a => a + 45)} />
              <StageBtn label={`Zoom ${zoom.toFixed(1)}x`} icon="🔍" onClick={() => setZoom(z => z >= 1.6 ? 0.9 : +(z + 0.15).toFixed(2))} />
              <StageBtn label={showroom ? "Exit Showroom" : "Showroom"} icon="🎬" active={showroom} onClick={() => setShowroom(v => !v)} />
              <StageBtn label="Photo" icon="📸" onClick={snapshot} />
            </div>
          </div>

          {/* Side panel */}
          <aside className="glass rounded-3xl p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display text-base uppercase tracking-widest">{car.style} Build</div>
                <div className="text-[10px] font-display uppercase tracking-[0.25em] text-muted-foreground">
                  {savedAt ? `✓ Auto-saved ${new Date(savedAt).toLocaleTimeString()}` : "Auto-save on"}
                </div>
              </div>
              <Link to="/customize" className="text-[10px] font-display uppercase tracking-widest text-accent hover:underline">Drivers →</Link>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-1.5">
              {(["paint","wheels","neon","decals","interior","tune","showroom"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`tap-target px-3 rounded-full text-[11px] font-display uppercase tracking-widest border transition-all ${tab === t ? "border-primary bg-primary/15 shadow-neon" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {t}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
              {tab === "paint" && (
                <>
                  <Section label="Paint Color">
                    <Swatches values={PAINTS} active={car.bodyColor} onPick={(v) => updateCar({ bodyColor: v })} />
                  </Section>
                  <Section label="License Plate">
                    <input value={car.plate ?? ""} maxLength={8}
                      onChange={(e) => updateCar({ plate: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })}
                      className="w-full bg-input border border-border rounded-xl px-4 py-3 font-display tracking-[0.3em] text-lg text-center focus:outline-none focus:ring-2 focus:ring-primary" />
                  </Section>
                </>
              )}
              {tab === "wheels" && (
                <Section label="Rims"><Chips values={RIMS} active={car.rim} onPick={(v) => updateCar({ rim: v })} /></Section>
              )}
              {tab === "neon" && (
                <Section label="Neon Underglow">
                  <div className="flex flex-wrap gap-2">
                    {NEONS.map(n => (
                      <button key={n} onClick={() => updateCar({ neon: n })}
                        className={`tap-target h-10 px-4 rounded-full text-xs font-display uppercase tracking-widest border transition-all ${car.neon === n ? "border-primary scale-105" : "border-border hover:border-primary/60"}`}
                        style={n !== "none" ? { boxShadow: `0 0 18px ${n}80, inset 0 0 12px ${n}40` } : undefined}>
                        {n === "none" ? "Off" : ""}
                      </button>
                    ))}
                  </div>
                </Section>
              )}
              {tab === "decals" && (
                <Section label="Decals / Livery"><Chips values={DECALS} active={car.decal} onPick={(v) => updateCar({ decal: v })} /></Section>
              )}
              {tab === "interior" && (
                <>
                  <Section label="Interior Color">
                    <Swatches values={INTERIORS} active={car.interior ?? INTERIORS[0]} onPick={(v) => updateCar({ interior: v })} />
                  </Section>
                  <Section label={`Window Tint — ${car.tint ?? 40}%`}>
                    <input type="range" min={0} max={90} value={car.tint ?? 40}
                      onChange={(e) => updateCar({ tint: Number(e.target.value) })}
                      className="w-full accent-primary" />
                  </Section>
                </>
              )}
              {tab === "tune" && (
                <div className="space-y-3">
                  <TuneRow label="Engine" value={tuning.engine} max={10} cost={800 + tuning.engine * 400} onUpgrade={() => upgrade("engine")} free={infiniteMode} />
                  <TuneRow label="Turbo" value={tuning.turbo} max={10} cost={800 + tuning.turbo * 400} onUpgrade={() => upgrade("turbo")} free={infiniteMode} />
                  <TuneRow label="Handling" value={tuning.handling} max={10} cost={800 + tuning.handling * 400} onUpgrade={() => upgrade("handling")} free={infiniteMode} />
                  <TuneRow label="Brakes" value={tuning.brakes} max={10} cost={800 + tuning.brakes * 400} onUpgrade={() => upgrade("brakes")} free={infiniteMode} />
                  <TuneRow label="Suspension" value={tuning.suspension} max={10} cost={800 + tuning.suspension * 400} onUpgrade={() => upgrade("suspension")} free={infiniteMode} />
                  <Section label="Tires">
                    <Chips values={TIRE_OPTS as unknown as string[]} active={tuning.tires} onPick={(v) => { setTuning(t => ({ ...t, tires: v as Tuning["tires"] })); audio.click(); }} />
                  </Section>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <StatBar label="Power" value={totalPower} />
                    <StatBar label="Grip" value={totalGrip} />
                    <StatBar label="Brakes" value={totalBrakes} />
                    <StatBar label="Ride" value={totalRide} />
                  </div>
                </div>
              )}
              {tab === "showroom" && (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p className="font-display uppercase tracking-widest text-foreground text-xs">Cinematic Showroom</p>
                  <p>Dramatic lighting, slow cinematic rotation, and a clean stage for capturing your build.</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setShowroom(true)} className="tap-target px-4 rounded-full bg-accent text-accent-foreground font-display text-xs uppercase tracking-widest shadow-cyan">Enter Showroom</button>
                    <button onClick={snapshot} className="tap-target px-4 rounded-full glass font-display text-xs uppercase tracking-widest">📸 Photo Mode</button>
                    <button onClick={() => setAudioOn(true)} className="tap-target px-4 rounded-full glass font-display text-xs uppercase tracking-widest">🎵 Music</button>
                  </div>
                  <p className="text-xs">Tip: drag the car to rotate. Tap Rev to hear the engine.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ---------- Sub components ----------
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-display uppercase tracking-[0.25em] text-muted-foreground mb-2">{label}</div>
      {children}
    </div>
  );
}
function Swatches({ values, active, onPick }: { values: string[]; active: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map(c => (
        <button key={c} onClick={() => onPick(c)} aria-label={c}
          className={`tap-target w-10 h-10 rounded-xl border-2 transition-all hover:scale-110 ${active === c ? "border-primary shadow-neon scale-110" : "border-border"}`}
          style={{ background: c }} />
      ))}
    </div>
  );
}
function Chips({ values, active, onPick }: { values: string[]; active: string; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map(v => (
        <button key={v} onClick={() => onPick(v)}
          className={`tap-target px-3 rounded-full text-[11px] font-display uppercase tracking-widest border transition-all ${active === v ? "border-primary bg-primary/15 text-foreground shadow-neon" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/60"}`}>
          {v}
        </button>
      ))}
    </div>
  );
}
function StageBtn({ label, icon, active, onClick }: { label: string; icon: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`tap-target px-3 sm:px-4 rounded-full text-[11px] font-display uppercase tracking-widest border backdrop-blur-md transition-all ${active ? "border-accent bg-accent/20 text-foreground shadow-cyan" : "border-white/15 bg-black/40 text-foreground/90 hover:border-primary/60"}`}>
      <span className="mr-1.5">{icon}</span>{label}
    </button>
  );
}
function TuneRow({ label, value, max, cost, onUpgrade, free }: { label: string; value: number; max: number; cost: number; onUpgrade: () => void; free?: boolean }) {
  const pct = (value / max) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] font-display uppercase tracking-[0.25em] text-foreground">{label}</div>
        <button onClick={onUpgrade} disabled={value >= max}
          className="tap-target px-2.5 rounded-full text-[10px] font-display uppercase tracking-widest border border-primary/60 bg-primary/10 hover:bg-primary/25 disabled:opacity-40 disabled:cursor-not-allowed">
          {value >= max ? "Max" : free ? "+ FREE" : `+ ${cost} CR`}
        </button>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--primary), var(--accent))" }} />
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground font-display tracking-widest">LVL {value} / {max}</div>
    </div>
  );
}
function StatBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="rounded-xl border border-border bg-black/20 p-2">
      <div className="text-[10px] font-display uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-lg text-gradient-primary">{value}</span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--accent), var(--primary))" }} />
      </div>
    </div>
  );
}

// ---------- 3D Garage Stage (CSS 3D) ----------
function GarageStage(props: {
  car: CarBuild;
  angle: number; zoom: number;
  headlights: boolean; doorsOpen: boolean; neonOn: boolean; showroom: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  const { car, angle, zoom, headlights, doorsOpen, neonOn, showroom } = props;
  const tint = car.tint ?? 40;

  return (
    <div
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerUp}
      className="absolute inset-0 cursor-grab active:cursor-grabbing select-none"
      style={{
        perspective: "1400px",
        background: showroom
          ? "radial-gradient(ellipse at 50% 60%, #1a1d28 0%, #050608 80%)"
          : "linear-gradient(180deg, #0b0d14 0%, #0e1119 40%, #1a1a22 100%)",
      }}
    >
      {/* Background mechanics / tools silhouette */}
      {!showroom && <GarageBackdrop />}

      {/* Ceiling spotlights */}
      <div className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
        style={{
          background: showroom
            ? "radial-gradient(ellipse 60% 70% at 50% 0%, rgba(255,255,255,0.18), transparent 70%)"
            : "radial-gradient(ellipse 40% 50% at 25% 0%, rgba(255,180,120,0.12), transparent 70%), radial-gradient(ellipse 40% 50% at 75% 0%, rgba(120,200,255,0.12), transparent 70%)",
        }} />

      {/* Floor */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
        style={{
          background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.6))",
        }} />
      <div className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none opacity-40"
        style={{
          background:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 80px), repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 80px)",
          transform: "perspective(800px) rotateX(70deg)",
          transformOrigin: "bottom",
          maskImage: "linear-gradient(180deg, transparent, black 30%, black)",
        }} />

      {/* Headlight cones on floor */}
      {headlights && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[8%] w-[120%] h-[40%] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(255,250,220,0.35), transparent 65%)",
            filter: "blur(2px)",
          }} />
      )}

      {/* Stage / turntable */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative"
          style={{
            transform: `scale(${zoom})`,
            transition: "transform 0.4s ease",
            transformStyle: "preserve-3d",
          }}
        >
          {/* Turntable disc */}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              bottom: -40,
              width: 520,
              height: 120,
              borderRadius: "50%",
              background: "radial-gradient(ellipse at center, rgba(255,255,255,0.06), transparent 70%)",
              boxShadow: "0 0 80px rgba(0,0,0,0.6) inset",
              transform: `rotateX(70deg)`,
            }}
          />

          {/* Car rotates */}
          <div
            style={{
              transform: `rotateY(${angle}deg)`,
              transition: showroom ? "none" : "transform 0.15s linear",
              transformStyle: "preserve-3d",
            }}
          >
            <Car3D car={car} headlights={headlights} doorsOpen={doorsOpen} neonOn={neonOn} tint={tint} />
          </div>
        </div>
      </div>

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%)" }} />
    </div>
  );
}

function GarageBackdrop() {
  return (
    <div className="absolute inset-0 pointer-events-none opacity-70">
      {/* Back wall panels */}
      <div className="absolute inset-x-0 top-0 h-[60%]" style={{
        background: "repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 110px)",
      }} />

      {/* Sweeping ceiling spotlight */}
      <div className="absolute -top-10 left-0 right-0 h-[70%] animate-spotlight-sweep"
        style={{
          background: "radial-gradient(ellipse 28% 80% at 50% 0%, rgba(255,236,200,0.18), transparent 60%)",
          filter: "blur(6px)",
        }} />

      {/* Garage door (top) — slides up on mount */}
      <div className="absolute top-0 left-[8%] right-[8%] h-[18%] origin-top animate-garage-door"
        style={{
          background: "repeating-linear-gradient(0deg, #1a1a1f 0 8px, #0f0f12 8px 14px)",
          borderBottom: "2px solid rgba(255,255,255,0.08)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
        }} />

      {/* Tool cabinets */}
      <div className="absolute left-4 bottom-[35%] w-24 h-32 rounded-md bg-zinc-900/80 border border-zinc-700 flex flex-col">
        <div className="flex-1 border-b border-zinc-700/60" />
        <div className="flex-1 border-b border-zinc-700/60" />
        <div className="flex-1" />
      </div>
      <div className="absolute right-6 bottom-[35%] w-28 h-36 rounded-md bg-zinc-900/80 border border-zinc-700">
        <div className="absolute inset-2 grid grid-cols-3 gap-1 opacity-60">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-zinc-700/60 rounded-sm" />
          ))}
        </div>
      </div>
      {/* Tire stack */}
      <div className="absolute right-44 bottom-[34%] flex flex-col items-center">
        {[0,1,2].map(i => <div key={i} className="w-16 h-3 rounded-full bg-black border border-zinc-700 -mt-0.5" />)}
      </div>

      {/* Race monitors — live-ish telemetry */}
      <div className="absolute left-[6%] top-[14%] w-40 h-24 rounded-md border border-cyan-400/30 bg-black/70 p-2 animate-monitor-flicker"
        style={{ boxShadow: "0 0 18px rgba(34,211,238,0.18) inset" }}>
        <div className="text-[8px] font-display tracking-widest text-cyan-300/80">TELEMETRY</div>
        <div className="mt-1 grid grid-cols-2 gap-1 text-[8px] text-cyan-200/70 font-mono">
          <div>LAP <span className="text-cyan-300">1:23.4</span></div>
          <div>BEST <span className="text-cyan-300">1:22.9</span></div>
          <div>TYRE <span className="text-amber-300">82°C</span></div>
          <div>FUEL <span className="text-cyan-300">68%</span></div>
        </div>
        <div className="absolute bottom-1 left-2 right-2 h-1 rounded-full bg-cyan-400/20 overflow-hidden">
          <div className="h-full w-2/3 bg-cyan-400/70" />
        </div>
      </div>
      <div className="absolute right-[6%] top-[14%] w-40 h-24 rounded-md border border-orange-400/30 bg-black/70 p-2 animate-monitor-flicker"
        style={{ boxShadow: "0 0 18px rgba(255,106,26,0.18) inset", animationDelay: "1.4s" }}>
        <div className="text-[8px] font-display tracking-widest text-orange-300/80">STRATEGY</div>
        <div className="mt-1 text-[8px] text-orange-200/80 font-mono leading-tight">
          <div>STINT 1 — MEDIUMS</div>
          <div>PIT WINDOW L14-L18</div>
          <div>GAP AHEAD +1.234s</div>
          <div>WEATHER DRY → RAIN</div>
        </div>
      </div>

      {/* Trophy shelf */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[8%] flex gap-3 items-end">
        {["#ffd44a", "#cfd2d6", "#c08b57"].map((c, i) => (
          <div key={i} className="flex flex-col items-center" style={{ opacity: 0.85 }}>
            <div className="w-3 h-4 rounded-t-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
            <div className="w-5 h-1.5 -mt-0.5" style={{ background: c }} />
            <div className="w-4 h-1 bg-zinc-800 mt-0.5" />
          </div>
        ))}
      </div>

      {/* Team banner */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[22%] w-44 h-6 flex items-center justify-center rounded-sm"
        style={{
          background: "linear-gradient(90deg, rgba(255,106,26,0.85), rgba(34,211,238,0.85))",
          boxShadow: "0 0 18px rgba(255,106,26,0.35)",
        }}>
        <span className="text-[10px] font-display tracking-[0.4em] text-black/80">APEX RACING</span>
      </div>

      {/* Mechanic 1 — working on car (wrench animation) */}
      <div className="absolute left-[28%] bottom-[18%] flex flex-col items-center animate-mechanic-bob">
        <div className="w-3 h-3 rounded-full bg-amber-200" />
        <div className="w-5 h-7 -mt-0.5 rounded-sm" style={{ background: "linear-gradient(180deg,#ea580c,#c2410c)" }} />
        <div className="flex gap-0.5">
          <div className="w-1.5 h-4 bg-zinc-700" />
          <div className="w-1.5 h-4 bg-zinc-700" />
        </div>
        <div className="absolute -right-3 top-3 w-3 h-0.5 bg-zinc-400 origin-left animate-wrench-spin" />
      </div>

      {/* Mechanic 2 — inspecting engine */}
      <div className="absolute right-[30%] bottom-[18%] flex flex-col items-center animate-mechanic-bob"
        style={{ animationDelay: "0.2s" }}>
        <div className="w-3 h-3 rounded-full bg-amber-100" />
        <div className="w-5 h-7 -mt-0.5 rounded-sm" style={{ background: "linear-gradient(180deg,#0e7490,#155e75)" }} />
        <div className="flex gap-0.5">
          <div className="w-1.5 h-4 bg-zinc-700" />
          <div className="w-1.5 h-4 bg-zinc-700" />
        </div>
      </div>

      {/* Mechanic 3 — walking across garage */}
      <div className="absolute left-0 right-0 bottom-[12%] pointer-events-none">
        <div className="w-6 animate-mechanic-walk" style={{ willChange: "transform" }}>
          <div className="flex flex-col items-center animate-mechanic-bob">
            <div className="w-3 h-3 rounded-full bg-amber-200" />
            <div className="w-5 h-7 -mt-0.5 rounded-sm" style={{ background: "linear-gradient(180deg,#a855f7,#7e22ce)" }} />
            <div className="flex gap-0.5">
              <div className="w-1.5 h-4 bg-zinc-700" />
              <div className="w-1.5 h-4 bg-zinc-700" />
            </div>
          </div>
        </div>
      </div>

      {/* Neon sign */}
      <div className="absolute left-1/2 -translate-x-1/2 top-6 font-display tracking-[0.5em] text-xs"
        style={{ color: "oklch(0.78 0.18 200)", textShadow: "0 0 12px oklch(0.78 0.18 200), 0 0 28px oklch(0.78 0.18 200 / 0.6)" }}>
        APEX GARAGE
      </div>
    </div>
  );
}

function Car3D({ car, headlights, doorsOpen, neonOn, tint }: { car: CarBuild; headlights: boolean; doorsOpen: boolean; neonOn: boolean; tint: number }) {
  const body = car.bodyColor;
  const neon = car.neon;
  const windowAlpha = 0.2 + tint / 150;

  return (
    <div style={{ width: 460, height: 180, position: "relative", transformStyle: "preserve-3d" }}>
      {/* Underglow */}
      {neonOn && neon !== "none" && (
        <div className="absolute left-4 right-4 -bottom-3 h-10 rounded-full blur-2xl"
          style={{ background: neon, opacity: 0.7 }} />
      )}
      {/* Reflection on floor */}
      <div className="absolute left-6 right-6 -bottom-1 h-3 rounded-full blur-md"
        style={{ background: `${body}80`, opacity: 0.5 }} />

      {/* Body */}
      <div className="absolute inset-x-0 top-6 bottom-10 rounded-[36px]"
        style={{
          background: `linear-gradient(180deg, ${body}, ${body}b0 60%, ${body}80)`,
          boxShadow: `inset 0 -16px 36px rgba(0,0,0,0.55), inset 0 12px 20px rgba(255,255,255,0.18), 0 30px 60px rgba(0,0,0,0.5)`,
        }}>
        {/* Roof / windows */}
        <div className="absolute inset-x-16 top-1 bottom-10 rounded-t-[28px]"
          style={{
            background: `linear-gradient(180deg, rgba(180,220,255,${0.45 - windowAlpha * 0.4}), rgba(0,0,0,${0.55 + windowAlpha * 0.3}))`,
            boxShadow: "inset 0 0 24px rgba(0,0,0,0.45)",
          }} />
        {/* Decal */}
        {car.decal !== "None" && (
          <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-2 rounded"
            style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.7), rgba(255,255,255,0.2))" }} />
        )}
        {/* Specular highlight */}
        <div className="absolute inset-x-10 top-2 h-3 rounded-full opacity-60"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)" }} />
        {/* License plate */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-1 px-2 py-0.5 text-[10px] font-display tracking-[0.3em] rounded-sm bg-white text-black border border-zinc-300">
          {car.plate || "AF-001"}
        </div>
      </div>

      {/* Doors (cosmetic open) */}
      {doorsOpen && (
        <>
          <div className="absolute top-12 left-[40%] w-14 h-16 rounded-md"
            style={{
              background: `linear-gradient(180deg, ${body}, ${body}90)`,
              transform: "rotateY(-55deg) translateZ(20px)",
              transformOrigin: "left center",
              boxShadow: "0 10px 20px rgba(0,0,0,0.5)",
            }} />
          <div className="absolute top-12 right-[40%] w-14 h-16 rounded-md"
            style={{
              background: `linear-gradient(180deg, ${body}, ${body}90)`,
              transform: "rotateY(55deg) translateZ(20px)",
              transformOrigin: "right center",
              boxShadow: "0 10px 20px rgba(0,0,0,0.5)",
            }} />
        </>
      )}

      {/* Headlights */}
      <div className="absolute left-1 top-12 w-6 h-3 rounded-full"
        style={{
          background: headlights ? "radial-gradient(circle, #fffce8, #fff7c2)" : "rgba(255,255,255,0.4)",
          boxShadow: headlights ? "0 0 30px #fff7c2, 0 0 60px #fff7c2" : "none",
        }} />
      <div className="absolute right-1 top-12 w-6 h-3 rounded-full"
        style={{
          background: headlights ? "radial-gradient(circle, #fffce8, #fff7c2)" : "rgba(255,255,255,0.4)",
          boxShadow: headlights ? "0 0 30px #fff7c2, 0 0 60px #fff7c2" : "none",
        }} />
      {/* Taillights */}
      <div className="absolute right-1 bottom-12 w-5 h-2 rounded-full" style={{ background: "#ff3b3b", boxShadow: "0 0 12px #ff3b3b" }} />
      <div className="absolute left-1 bottom-12 w-5 h-2 rounded-full" style={{ background: "#ff3b3b", boxShadow: "0 0 12px #ff3b3b" }} />

      {/* Wheels */}
      <Wheel pos="left-4 bottom-0" />
      <Wheel pos="right-4 bottom-0" />
    </div>
  );
}

function Wheel({ pos }: { pos: string }) {
  return (
    <div className={`absolute ${pos} w-14 h-14 rounded-full bg-zinc-900 border-4 border-zinc-700 flex items-center justify-center`}
      style={{ boxShadow: "0 6px 14px rgba(0,0,0,0.6)" }}>
      <div className="w-5 h-5 rounded-full bg-zinc-500" />
      <div className="absolute inset-1 rounded-full border border-zinc-600/60" />
    </div>
  );
}