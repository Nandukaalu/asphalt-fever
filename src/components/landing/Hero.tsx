import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export default function Hero() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const onScroll = () => setY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-hero flex items-center pt-24 pb-16">
      {/* Animated grid floor */}
      <div
        className="absolute inset-0 grid-bg opacity-40"
        style={{ transform: `translateY(${y * 0.2}px)` }}
      />
      {/* Speed streaks */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute h-[2px] w-40 bg-gradient-to-r from-transparent via-primary to-transparent animate-streak"
            style={{
              top: `${10 + i * 15}%`,
              animationDelay: `${i * 0.4}s`,
              opacity: 0.4,
            }}
          />
        ))}
      </div>
      {/* Glow blobs */}
      <div className="absolute -top-32 -left-20 w-[480px] h-[480px] rounded-full bg-primary/30 blur-[120px]" />
      <div className="absolute -bottom-32 -right-20 w-[520px] h-[520px] rounded-full bg-accent/20 blur-[140px]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 w-full">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 glass rounded-full pl-2 pr-4 py-1.5 mb-6 animate-slide-up">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
            <span className="text-xs font-display uppercase tracking-[0.3em] text-muted-foreground">
              Season 1 — Live Now
            </span>
          </div>
          <h1
            className="font-display font-black uppercase leading-[0.9] tracking-tight animate-slide-up"
            style={{ fontSize: "clamp(2.75rem, 9vw, 7.5rem)" }}
          >
            <span className="block text-foreground">Burn the</span>
            <span className="block shimmer-text">Asphalt.</span>
            <span className="block text-gradient-primary">Own the Night.</span>
          </h1>
          <p
            className="mt-6 text-base sm:text-xl text-muted-foreground max-w-2xl animate-slide-up"
            style={{ animationDelay: "0.15s" }}
          >
            Asphalt Fever is a cinematic 3D racer built for the cockpit. Real circuits.
            Online lobbies. Custom cars. One mission — the perfect lap.
          </p>
          <div
            className="mt-8 flex flex-wrap gap-3 sm:gap-4 animate-slide-up"
            style={{ animationDelay: "0.3s" }}
          >
            <Link
              to="/play"
              className="group tap-target px-7 sm:px-9 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground font-display uppercase tracking-widest text-sm shadow-neon hover:scale-105 transition-transform"
            >
              Play Now
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              to="/customize"
              className="tap-target px-7 sm:px-9 inline-flex items-center gap-2 rounded-full glass font-display uppercase tracking-widest text-sm hover:shadow-cyan transition-all"
            >
              Build Your Car
            </Link>
          </div>

          <div className="mt-14 grid grid-cols-3 gap-3 sm:gap-6 max-w-xl">
            {[
              { v: "60fps", l: "Cockpit View" },
              { v: "10+", l: "Real Circuits" },
              { v: "8P", l: "Online Lobbies" },
            ].map((s) => (
              <div key={s.l} className="glass rounded-2xl px-3 sm:px-5 py-3 sm:py-4 text-center hover:shadow-neon transition-all hover:-translate-y-1">
                <div className="font-display text-xl sm:text-3xl text-gradient-primary">{s.v}</div>
                <div className="text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground mt-1">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.4em] text-muted-foreground flex flex-col items-center gap-2 animate-pulse">
        Scroll
        <span className="w-px h-8 bg-gradient-to-b from-foreground to-transparent" />
      </div>
    </section>
  );
}