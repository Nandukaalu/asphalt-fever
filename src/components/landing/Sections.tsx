import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Reveal from "./Reveal";
import { supabase } from "@/integrations/supabase/client";

export function SectionTitle({ kicker, title, subtitle }: { kicker: string; title: React.ReactNode; subtitle?: string }) {
  return (
    <Reveal>
      <div className="max-w-3xl">
        <div className="text-xs font-display uppercase tracking-[0.4em] text-primary">{kicker}</div>
        <h2 className="mt-3 font-black uppercase leading-[0.95] tracking-tight" style={{ fontSize: "clamp(2rem, 5vw, 3.75rem)" }}>
          {title}
        </h2>
        {subtitle && <p className="mt-4 text-muted-foreground text-base sm:text-lg">{subtitle}</p>}
      </div>
    </Reveal>
  );
}

const CARS = [
  { name: "Scuderia Rosso", team: "Italy", color: "#d40000", accent: "#ffffff", top: 348 },
  { name: "Silver Arrows", team: "Germany", color: "#00d2be", accent: "#0a0a0a", top: 352 },
  { name: "Azure Racing", team: "France", color: "#1e3a8a", accent: "#facc15", top: 345 },
  { name: "Papaya Squad", team: "UK", color: "#ff8000", accent: "#000000", top: 350 },
  { name: "Verde Works", team: "Brazil", color: "#16a34a", accent: "#ffffff", top: 344 },
  { name: "Cobalt Dynamics", team: "USA", color: "#0ea5e9", accent: "#0b1d3a", top: 347 },
];

export function CarsSection() {
  return (
    <section id="cars" className="relative py-24 sm:py-32">
      <div className="absolute inset-0 speed-lines opacity-30 pointer-events-none" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionTitle
          kicker="The Grid"
          title={<><span className="text-gradient-primary">Hand-Crafted</span> Machines</>}
          subtitle="Every car in Asphalt Fever is tuned for character. Pick your team — or build your own."
        />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {CARS.map((c, i) => (
            <Reveal key={c.name} delay={i * 80}>
              <article className="group relative glass rounded-3xl p-6 overflow-hidden hover:-translate-y-2 hover:shadow-neon transition-all duration-500">
                <div
                  className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-40 group-hover:opacity-70 transition-opacity"
                  style={{ background: c.color }}
                />
                <div className="relative h-32 flex items-center justify-center">
                  <div
                    className="w-44 h-16 rounded-2xl relative"
                    style={{
                      background: `linear-gradient(180deg, ${c.color}, ${c.color}aa)`,
                      boxShadow: `0 12px 40px ${c.color}80, inset 0 -6px 12px #00000060`,
                    }}
                  >
                    <div className="absolute inset-x-6 top-1 h-3 rounded bg-cyan-200/30" />
                    <div className="absolute -bottom-2 left-2 w-6 h-6 rounded-full bg-zinc-900 border-2 border-zinc-700" />
                    <div className="absolute -bottom-2 right-2 w-6 h-6 rounded-full bg-zinc-900 border-2 border-zinc-700" />
                  </div>
                </div>
                <div className="relative mt-6 flex items-end justify-between">
                  <div>
                    <div className="font-display text-lg uppercase tracking-wider">{c.name}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-widest mt-1">{c.team}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-2xl text-gradient-primary">{c.top}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">km/h Top</div>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const STANDARD_TRACKS: { id: string; name: string }[] = [
  { id: "silverstone", name: "Silverstone" },
  { id: "monza", name: "Monza" },
  { id: "monaco", name: "Monaco" },
  { id: "spa", name: "Spa" },
  { id: "suzuka", name: "Suzuka" },
  { id: "interlagos", name: "Interlagos" },
  { id: "cota", name: "COTA" },
  { id: "singapore", name: "Singapore" },
  { id: "bahrain", name: "Bahrain" },
];

function formatLap(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

type BestRow = { trackId: string; trackName: string; player: string | null; lap: number | null };

export function LeaderboardSection() {
  const [rows, setRows] = useState<BestRow[]>(
    STANDARD_TRACKS.map((t) => ({ trackId: t.id, trackName: t.name, player: null, lap: null }))
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const ids = STANDARD_TRACKS.map((t) => t.id);
      const { data } = await supabase
        .from("leaderboard_entries")
        .select("player_name, best_lap, track_id")
        .in("track_id", ids)
        .order("best_lap", { ascending: true })
        .limit(2000);
      if (cancelled) return;
      const best = new Map<string, { player: string; lap: number }>();
      for (const r of data ?? []) {
        if (!best.has(r.track_id)) best.set(r.track_id, { player: r.player_name, lap: Number(r.best_lap) });
      }
      setRows(STANDARD_TRACKS.map((t) => {
        const b = best.get(t.id);
        return { trackId: t.id, trackName: t.name, player: b?.player ?? null, lap: b?.lap ?? null };
      }));
    };
    load();
    const ch = supabase
      .channel("home-lb")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leaderboard_entries" }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  return (
    <section id="leaderboard" className="relative py-24 sm:py-32 bg-gradient-to-b from-transparent via-secondary/30 to-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[1fr_1.2fr] gap-10 items-start">
        <SectionTitle
          kicker="Global Standings"
          title={<>Track Record <span className="text-gradient-accent">Holders.</span></>}
          subtitle="The fastest lap ever set on every official circuit. Live from the global leaderboard."
        />
        <Reveal>
          <div className="glass rounded-3xl overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_110px] sm:grid-cols-[140px_1fr_120px] px-5 py-3 text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground border-b border-border/40">
              <span>Track</span><span>Holder</span><span className="text-right">Best Lap</span>
            </div>
            {rows.map((r) => (
              <div
                key={r.trackId}
                className="grid grid-cols-[1fr_1fr_110px] sm:grid-cols-[140px_1fr_120px] px-5 py-4 items-center border-b border-border/20 hover:bg-primary/5 transition-colors"
              >
                <span className="font-display uppercase tracking-wider text-sm sm:text-base text-gradient-primary">{r.trackName}</span>
                <span className="font-display tracking-wider truncate">
                  {r.player ?? <span className="text-muted-foreground/60">Unclaimed</span>}
                </span>
                <span className="text-right font-mono text-sm sm:text-base text-foreground">
                  {r.lap != null ? formatLap(r.lap) : <span className="text-muted-foreground/60">—</span>}
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const SHOTS = [
  { hue: 18, label: "Night Run" },
  { hue: 200, label: "Cockpit" },
  { hue: 320, label: "Tunnel Vision" },
  { hue: 130, label: "Sunset Lap" },
  { hue: 270, label: "Neon City" },
  { hue: 0, label: "Pit Lane" },
];

export function GallerySection() {
  return (
    <section id="gallery" className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionTitle
          kicker="In The Wild"
          title={<><span className="text-gradient-primary">Postcards</span> From The Track</>}
          subtitle="Cinematic moments captured by drivers worldwide."
        />
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {SHOTS.map((s, i) => (
            <Reveal key={s.label} delay={i * 60}>
              <div className="group relative aspect-[4/3] rounded-2xl overflow-hidden cursor-pointer">
                <div
                  className="absolute inset-0 transition-transform duration-700 group-hover:scale-110"
                  style={{
                    background: `linear-gradient(135deg, hsl(${s.hue} 80% 25%), hsl(${(s.hue + 40) % 360} 90% 12%))`,
                  }}
                />
                <div className="absolute inset-0 grid-bg opacity-30" />
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4">
                  <div className="text-[10px] sm:text-xs font-display uppercase tracking-widest text-primary">Lap 03</div>
                  <div className="font-display text-base sm:text-xl">{s.label}</div>
                </div>
                <div className="absolute top-3 right-3 px-2 py-1 rounded-full glass text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                  4K
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const REVIEWS = [
  { name: "Mason R.", role: "Sim Racer", text: "The cockpit feel is unreal — every shift, every brake. Smoothest browser racer I've touched.", rating: 5 },
  { name: "Aiko T.", role: "Esports Coach", text: "We use Asphalt Fever for warmups. Online lobbies are dead-stable and the laps feel honest.", rating: 5 },
  { name: "Diego F.", role: "Streamer", text: "The neon nights, the speed lines, the engine notes. Pure adrenaline. My chat is hooked.", rating: 5 },
];

export function TestimonialsSection() {
  return (
    <section className="relative py-24 sm:py-32 bg-gradient-to-b from-transparent via-secondary/30 to-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionTitle
          kicker="Drivers Talk"
          title={<>Loved By The <span className="text-gradient-accent">Paddock.</span></>}
        />
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {REVIEWS.map((r, i) => (
            <Reveal key={r.name} delay={i * 100}>
              <figure className="glass rounded-3xl p-7 h-full hover:-translate-y-1 hover:shadow-neon transition-all">
                <div className="flex gap-1 text-primary">
                  {Array.from({ length: r.rating }).map((_, j) => (<span key={j}>★</span>))}
                </div>
                <blockquote className="mt-4 text-base sm:text-lg leading-relaxed">"{r.text}"</blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full"
                    style={{ background: `conic-gradient(from ${i * 90}deg, var(--neon-orange), var(--neon-cyan), var(--neon-magenta), var(--neon-orange))` }}
                  />
                  <div>
                    <div className="font-display uppercase tracking-wider text-sm">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.role}</div>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AboutSection() {
  const features = [
    { t: "Real Circuits", d: "Hand-tuned layouts inspired by the world's greatest tracks." },
    { t: "Online Lobbies", d: "Race friends with private room codes — no signup required." },
    { t: "Career Mode", d: "Climb the season standings across every venue." },
    { t: "Custom Builds", d: "Forge your driver and machine, your way." },
  ];
  return (
    <section id="about" className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        <SectionTitle
          kicker="The Game"
          title={<>Built For The <span className="text-gradient-primary">Apex Hunter.</span></>}
          subtitle="Asphalt Fever is a love letter to motorsport. A cinematic, browser-native racer that boots in seconds — and lets you chase that perfect lap for hours."
        />
        <div className="grid sm:grid-cols-2 gap-4">
          {features.map((f, i) => (
            <Reveal key={f.t} delay={i * 80}>
              <div className="glass rounded-2xl p-5 h-full hover:shadow-cyan transition-all">
                <div className="text-2xl mb-2">⚡</div>
                <div className="font-display uppercase tracking-wider">{f.t}</div>
                <p className="text-sm text-muted-foreground mt-1">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CtaSection() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl p-8 sm:p-16 text-center bg-gradient-to-br from-primary/30 via-background to-accent/20 border border-primary/40 shadow-neon">
            <div className="absolute inset-0 grid-bg opacity-30" />
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/30 blur-[120px]" />
            <div className="relative">
              <div className="text-xs font-display uppercase tracking-[0.4em] text-primary">Lights Out</div>
              <h2 className="mt-4 font-black uppercase leading-none" style={{ fontSize: "clamp(2.25rem, 7vw, 5rem)" }}>
                <span className="shimmer-text">Start Your Engine.</span>
              </h2>
              <p className="mt-5 text-muted-foreground max-w-xl mx-auto">
                One click. No download. Just you, the grid, and the perfect lap.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  to="/play"
                  className="tap-target px-9 inline-flex items-center rounded-full bg-primary text-primary-foreground font-display uppercase tracking-widest text-sm shadow-neon hover:scale-105 transition-transform animate-pulse-glow"
                >
                  Play Free Now
                </Link>
                <Link
                  to="/customize"
                  className="tap-target px-9 inline-flex items-center rounded-full glass font-display uppercase tracking-widest text-sm hover:shadow-cyan transition-all"
                >
                  Build Your Driver
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
        <footer className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="font-display uppercase tracking-widest">© Asphalt Fever</div>
          <div className="uppercase tracking-widest">Built for the apex hunter.</div>
        </footer>
      </div>
    </section>
  );
}