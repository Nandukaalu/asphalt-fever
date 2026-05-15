import { useEffect, useState } from "react";

export type GridDriver = { id: string; name: string; team: string; color: string };

export function CinematicIntro({
  trackName, country, drivers, playerId, onDone,
}: {
  trackName: string;
  country: string;
  drivers: GridDriver[];
  playerId: string;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1400);
    const t2 = setTimeout(() => setPhase(2), 2900);
    const t3 = setTimeout(() => setPhase(3), 4600);
    const t4 = setTimeout(() => onDone(), 5400);
    return () => { [t1,t2,t3,t4].forEach(clearTimeout); };
  }, [onDone]);

  const top3 = drivers.slice(0, 3);

  return (
    <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden bg-black">
      {/* Animated flyover backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(220,0,0,0.18),transparent_70%)]" />
      <div className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(115deg,transparent 30%,rgba(255,255,255,0.06) 50%,transparent 70%)",
          animation: "intro-sweep 5.4s linear forwards",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg,rgba(255,255,255,0.08) 0 2px,transparent 2px 80px)",
          animation: "intro-rush 5.4s linear forwards",
          transform: "perspective(600px) rotateX(60deg)",
          transformOrigin: "top",
        }}
      />

      {/* Phase 0 — Track presentation */}
      {phase === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center animate-fade-in">
          <div className="text-fuchsia-400/80 text-xs tracking-[0.5em] uppercase font-display">Round • Live</div>
          <div className="mt-3 text-white text-6xl md:text-8xl font-black tracking-tight font-display">{trackName}</div>
          <div className="mt-2 text-white/60 text-sm tracking-[0.4em] uppercase">{country}</div>
        </div>
      )}

      {/* Phase 1 — Top of grid */}
      {phase === 1 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center animate-fade-in">
          <div className="text-red-400 text-xs tracking-[0.5em] uppercase font-display mb-6">Starting Grid</div>
          <div className="space-y-2 w-[min(440px,90vw)]">
            {top3.map((d, i) => (
              <div key={d.id} className="flex items-center gap-3 bg-black/60 border-l-4 px-4 py-3 backdrop-blur"
                style={{ borderColor: d.color, animation: `intro-slide 0.5s ease-out ${i * 0.15}s both` }}>
                <div className="text-white/40 text-2xl font-black w-8 font-display">P{i + 1}</div>
                <div className="flex-1">
                  <div className="text-white text-lg font-bold uppercase tracking-wide">{d.name}{d.id === playerId && <span className="ml-2 text-xs text-red-400">YOU</span>}</div>
                  <div className="text-white/50 text-xs uppercase tracking-widest">{d.team}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 2 — Player intro */}
      {phase === 2 && (() => {
        const me = drivers.find(d => d.id === playerId);
        if (!me) return null;
        const myIdx = drivers.findIndex(d => d.id === playerId);
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center animate-fade-in">
            <div className="text-white/40 text-xs tracking-[0.5em] uppercase mb-3">Driver</div>
            <div className="text-white text-7xl md:text-9xl font-black tracking-tight font-display"
              style={{ textShadow: `0 0 40px ${me.color}aa` }}>{me.name}</div>
            <div className="mt-3 text-white/70 text-base tracking-[0.4em] uppercase">{me.team}</div>
            <div className="mt-4 text-2xl font-black font-display" style={{ color: me.color }}>P{myIdx + 1} ON THE GRID</div>
          </div>
        );
      })()}

      {/* Phase 3 — Lights out warning */}
      {phase === 3 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center animate-fade-in">
          <div className="text-white/50 text-xs tracking-[0.5em] uppercase mb-4">Formation Complete</div>
          <div className="flex gap-2 mb-6">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="w-6 h-6 rounded-full bg-red-600 shadow-[0_0_20px_rgba(220,0,0,0.8)]"
                style={{ animation: `intro-light 0.4s ease-out ${i * 0.08}s both` }} />
            ))}
          </div>
          <div className="text-white text-5xl md:text-7xl font-black font-display tracking-tight">LIGHTS OUT</div>
        </div>
      )}

      <style>{`
        @keyframes intro-sweep { 0% { transform: translateX(-30%); opacity: 0 } 30% { opacity: 1 } 100% { transform: translateX(30%); opacity: 0 } }
        @keyframes intro-rush { from { background-position: 0 0 } to { background-position: 600px 0 } }
        @keyframes intro-slide { from { opacity: 0; transform: translateX(-30px) } to { opacity: 1; transform: translateX(0) } }
        @keyframes intro-light { from { opacity: 0; transform: scale(0.5) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </div>
  );
}
