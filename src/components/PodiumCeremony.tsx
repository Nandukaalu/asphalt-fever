import { useEffect, useMemo, useRef, useState } from "react";

export type PodiumEntry = {
  id: string;
  name: string;
  team?: string;
  color: string; // hex like #ff0000
  number?: number;
  bestLap?: number;
  points: number;
  isPlayer: boolean;
};

type Props = {
  entries: PodiumEntry[]; // length >= 1, sorted P1, P2, P3, ...
  trackName: string;
  fastestLapId?: string;
  onClose: () => void;
};

// --- WebAudio: synthesized crowd + victory fanfare (no asset deps) ---
function useCelebrationAudio(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    ctxRef.current = ctx;

    // Crowd: filtered pink-ish noise with slow modulation
    const bufSize = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(bp).connect(noiseGain).connect(ctx.destination);
    noise.start();
    noiseGain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.4);

    // Slow LFO on crowd volume for "waves of cheering"
    const lfoTimer = setInterval(() => {
      if (stopped) return;
      const t = ctx.currentTime;
      const v = 0.18 + Math.random() * 0.18;
      noiseGain.gain.cancelScheduledValues(t);
      noiseGain.gain.linearRampToValueAtTime(v, t + 0.6 + Math.random() * 0.8);
    }, 1200);

    // Fanfare: simple major triad + flourish
    const playNote = (freq: number, start: number, dur: number, gain = 0.18) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      o.connect(lp).connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur + 0.05);
    };
    // C-E-G-C fanfare
    const seq: [number, number, number][] = [
      [261.63, 0.0, 0.28],
      [329.63, 0.18, 0.28],
      [392.0, 0.36, 0.28],
      [523.25, 0.55, 0.9],
      [659.25, 0.55, 0.9],
      [783.99, 0.55, 1.1],
    ];
    seq.forEach(([f, s, d]) => playNote(f, s, d));
    // Repeat softer flourish a few seconds in
    setTimeout(() => {
      if (stopped) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playNote(f, i * 0.1, 0.6, 0.12));
    }, 4000);

    stopRef.current = () => {
      stopped = true;
      clearInterval(lfoTimer);
      try {
        const t = ctx.currentTime;
        noiseGain.gain.cancelScheduledValues(t);
        noiseGain.gain.linearRampToValueAtTime(0, t + 0.4);
        setTimeout(() => ctx.close(), 600);
      } catch {}
    };
    return () => stopRef.current?.();
  }, [active]);
}

// --- Confetti canvas (mobile-friendly) ---
function ConfettiCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    const colors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899", "#facc15", "#ffffff"];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = reduced ? 60 : Math.min(220, Math.floor((c.width * c.height) / 14000));
    const parts = Array.from({ length: N }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * -c.height,
      vx: (Math.random() - 0.5) * 1.6 * dpr,
      vy: (1 + Math.random() * 2.2) * dpr,
      r: (2 + Math.random() * 4) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      color: colors[(Math.random() * colors.length) | 0],
      shape: Math.random() < 0.5 ? "rect" : "circ",
    }));
    const tick = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > c.height + 20) {
          p.y = -20;
          p.x = Math.random() * c.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// --- Random fireworks bursts ---
function Fireworks() {
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; hue: number }[]>([]);
  useEffect(() => {
    let id = 0;
    const i = setInterval(() => {
      const b = { id: id++, x: 10 + Math.random() * 80, y: 10 + Math.random() * 40, hue: (Math.random() * 360) | 0 };
      setBursts((p) => [...p, b].slice(-6));
      setTimeout(() => setBursts((p) => p.filter((x) => x.id !== b.id)), 1100);
    }, 650);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0">
      {bursts.map((b) => (
        <div
          key={b.id}
          className="absolute"
          style={{ left: `${b.x}%`, top: `${b.y}%`, transform: "translate(-50%,-50%)" }}
        >
          {Array.from({ length: 18 }).map((_, i) => {
            const a = (i / 18) * Math.PI * 2;
            const dx = Math.cos(a) * 80;
            const dy = Math.sin(a) * 80;
            return (
              <span
                key={i}
                className="absolute block w-1.5 h-1.5 rounded-full"
                style={{
                  background: `hsl(${b.hue}, 95%, 65%)`,
                  boxShadow: `0 0 12px hsl(${b.hue}, 95%, 65%)`,
                  animation: "fwBurst 1s ease-out forwards",
                  // @ts-ignore custom props
                  "--dx": `${dx}px`,
                  "--dy": `${dy}px`,
                }}
              />
            );
          })}
        </div>
      ))}
      <style>{`@keyframes fwBurst { from { transform: translate(0,0); opacity:1 } to { transform: translate(var(--dx), var(--dy)); opacity:0 } }`}</style>
    </div>
  );
}

// --- Camera flashes around the podium ---
function CameraFlashes() {
  const spots = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({
      left: 4 + (i / 14) * 92 + (Math.random() * 4 - 2),
      top: 55 + Math.random() * 35,
      delay: Math.random() * 4,
      dur: 2 + Math.random() * 3,
    })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      {spots.map((s, i) => (
        <span
          key={i}
          className="absolute block w-2 h-2 rounded-full bg-white"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            filter: "blur(1px)",
            boxShadow: "0 0 24px 6px rgba(255,255,255,0.9)",
            animation: `flashPop ${s.dur}s ${s.delay}s infinite`,
            opacity: 0,
          }}
        />
      ))}
      <style>{`@keyframes flashPop { 0%,92%,100%{opacity:0; transform:scale(.6)} 94%{opacity:1; transform:scale(1.4)} 96%{opacity:.4} }`}</style>
    </div>
  );
}

// --- A single car silhouette parked beside the podium ---
function ParkedCar({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <svg viewBox="0 0 120 40" className="w-28 sm:w-36" style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <defs>
        <linearGradient id={`g${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="36" rx="55" ry="3" fill="#000" opacity="0.5" />
      <path d="M5 30 L20 18 L45 14 L75 14 L98 22 L115 26 L115 32 Q115 34 113 34 L7 34 Q5 34 5 32 Z" fill={`url(#g${color})`} stroke="#000" strokeWidth="0.7" />
      <path d="M28 22 L46 17 L70 17 L86 22 Z" fill="#0b1220" opacity="0.85" />
      <circle cx="30" cy="34" r="5" fill="#0a0a0a" />
      <circle cx="30" cy="34" r="2" fill="#444" />
      <circle cx="92" cy="34" r="5" fill="#0a0a0a" />
      <circle cx="92" cy="34" r="2" fill="#444" />
      <rect x="100" y="20" width="6" height="3" fill="#fff" opacity="0.6" />
    </svg>
  );
}

// --- Trophy SVG with animated sparkles ---
function Trophy({ size = "lg", goldness = 1 }: { size?: "sm" | "md" | "lg"; goldness?: number }) {
  const cls = size === "lg" ? "w-20 sm:w-24" : size === "md" ? "w-14" : "w-11";
  const gold = goldness === 1 ? "#fcd34d" : goldness === 0.85 ? "#e5e7eb" : "#d97706";
  const dark = goldness === 1 ? "#a16207" : goldness === 0.85 ? "#6b7280" : "#7c2d12";
  return (
    <div className="relative inline-block">
      <svg viewBox="0 0 64 80" className={cls}>
        <defs>
          <linearGradient id={`t${gold}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={gold} />
            <stop offset="1" stopColor={dark} />
          </linearGradient>
        </defs>
        <path d="M10 8 H54 V22 Q54 40 32 44 Q10 40 10 22 Z" fill={`url(#t${gold})`} stroke="#000" strokeOpacity=".4" />
        <path d="M10 12 Q2 14 4 24 Q6 32 14 30" fill="none" stroke={gold} strokeWidth="3" />
        <path d="M54 12 Q62 14 60 24 Q58 32 50 30" fill="none" stroke={gold} strokeWidth="3" />
        <rect x="28" y="44" width="8" height="12" fill={dark} />
        <rect x="18" y="56" width="28" height="6" fill={gold} />
        <rect x="14" y="62" width="36" height="8" rx="1" fill={dark} />
      </svg>
      {/* sparkles */}
      <span className="absolute -top-1 -right-1 text-yellow-200" style={{ animation: "spark 1.4s infinite" }}>✦</span>
      <span className="absolute -top-2 left-1 text-yellow-100" style={{ animation: "spark 1.8s .3s infinite" }}>✦</span>
      <style>{`@keyframes spark { 0%,100%{opacity:.2; transform:scale(.7)} 50%{opacity:1; transform:scale(1.3)} }`}</style>
    </div>
  );
}

// --- A stylized driver figurine ---
function DriverFigure({ color, lifting }: { color: string; lifting: boolean }) {
  return (
    <div className="relative flex flex-col items-center" style={{ animation: "cheer 1.6s ease-in-out infinite" }}>
      <svg viewBox="0 0 60 110" className="w-16 sm:w-20">
        {/* head */}
        <circle cx="30" cy="14" r="10" fill="#f1c27d" stroke="#000" strokeOpacity=".3" />
        {/* helmet visor strip */}
        <rect x="20" y="11" width="20" height="4" fill="#0b1220" />
        {/* body / suit */}
        <path d="M14 26 L46 26 L50 70 L10 70 Z" fill={color} stroke="#000" strokeOpacity=".4" />
        <path d="M18 38 L42 38 L43 50 L17 50 Z" fill="#fff" opacity=".15" />
        {/* legs */}
        <rect x="18" y="70" width="10" height="36" fill="#111" />
        <rect x="32" y="70" width="10" height="36" fill="#111" />
        {/* arms (raised) */}
        <g style={{ transformOrigin: "20px 30px", transform: lifting ? "rotate(-25deg)" : "rotate(-50deg)" }}>
          <rect x="6" y="26" width="8" height="26" rx="3" fill={color} />
        </g>
        <g style={{ transformOrigin: "40px 30px", transform: lifting ? "rotate(25deg)" : "rotate(50deg)" }}>
          <rect x="46" y="26" width="8" height="26" rx="3" fill={color} />
        </g>
      </svg>
      <style>{`@keyframes cheer { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }`}</style>
    </div>
  );
}

export default function PodiumCeremony({ entries, trackName, fastestLapId, onClose }: Props) {
  const top3 = entries.slice(0, 3);
  const p1 = top3[0];
  const p2 = top3[1];
  const p3 = top3[2];
  useCelebrationAudio(true);
  const [slowmo, setSlowmo] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSlowmo(false), 2200);
    return () => clearTimeout(t);
  }, []);

  const PodiumBlock = ({ entry, height, place, delay }: { entry?: PodiumEntry; height: string; place: 1 | 2 | 3; delay: number }) => {
    if (!entry) return <div className={`${height} w-1/3`} />;
    const placeColor = place === 1 ? "#fcd34d" : place === 2 ? "#e5e7eb" : "#d97706";
    return (
      <div className="flex flex-col items-center justify-end flex-1 min-w-0" style={{ animation: `rise .9s ${delay}s both` }}>
        {/* spotlight for winner */}
        {place === 1 && (
          <div className="absolute pointer-events-none" style={{ top: 0, height: "100%", width: "26%", left: "37%", background: "radial-gradient(ellipse at center top, rgba(252,211,77,.35), transparent 60%)" }} />
        )}
        <DriverFigure color={entry.color} lifting={place === 1} />
        <div className="mt-1 mb-2 flex items-center gap-2">
          <Trophy size={place === 1 ? "lg" : place === 2 ? "md" : "sm"} goldness={place === 1 ? 1 : place === 2 ? 0.85 : 0.5} />
        </div>
        <div className="text-center mb-1 px-1 w-full">
          <div className="text-[10px] uppercase tracking-widest" style={{ color: placeColor }}>P{place}</div>
          <div className="text-xs sm:text-sm font-black truncate" title={entry.name}>{entry.name}</div>
          {entry.team && <div className="text-[10px] text-white/60 truncate">{entry.team}</div>}
          <div className="text-[10px] text-white/80 mt-0.5">
            {entry.bestLap && entry.bestLap > 0 ? `${entry.bestLap.toFixed(2)}s` : "—"}
            <span className="ml-2 text-red-300 font-bold">+{entry.points}</span>
          </div>
        </div>
        <div
          className="w-full border-t-4 flex items-start justify-center text-3xl sm:text-5xl font-black"
          style={{
            height,
            background: `linear-gradient(180deg, ${placeColor}33, #0b0b14)`,
            borderColor: placeColor,
            boxShadow: place === 1 ? `0 -8px 40px ${placeColor}88` : `0 -4px 20px ${placeColor}55`,
          }}
        >
          <span style={{ color: placeColor, textShadow: `0 0 18px ${placeColor}` }}>{place}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-40 overflow-hidden text-white" style={{ background: "radial-gradient(ellipse at 50% 30%, #1f1530 0%, #07060d 60%, #000 100%)" }}>
      {/* Crowd silhouettes */}
      <div className="absolute left-0 right-0 bottom-0 h-40 pointer-events-none opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at 10% 80%, #000 0 22px, transparent 24px)," +
            "radial-gradient(ellipse at 22% 75%, #000 0 26px, transparent 28px)," +
            "radial-gradient(ellipse at 34% 80%, #000 0 22px, transparent 24px)," +
            "radial-gradient(ellipse at 46% 76%, #000 0 28px, transparent 30px)," +
            "radial-gradient(ellipse at 58% 80%, #000 0 22px, transparent 24px)," +
            "radial-gradient(ellipse at 70% 75%, #000 0 26px, transparent 28px)," +
            "radial-gradient(ellipse at 82% 80%, #000 0 22px, transparent 24px)," +
            "radial-gradient(ellipse at 94% 76%, #000 0 28px, transparent 30px)," +
            "linear-gradient(180deg, transparent, rgba(0,0,0,0.7))",
        }}
      />

      <CameraFlashes />
      <Fireworks />
      <ConfettiCanvas />

      {/* Winner banner */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 text-center" style={{ animation: "bannerIn .8s .3s both" }}>
        <div className="text-[10px] uppercase tracking-[0.4em] text-white/60">{trackName} • Podium</div>
        <div className="text-2xl sm:text-4xl font-black" style={{ color: "#fcd34d", textShadow: "0 0 24px #fcd34d99" }}>
          🏆 {p1?.name ?? "—"} Wins!
        </div>
        {p1?.team && <div className="text-xs text-white/70 tracking-widest uppercase">{p1.team}</div>}
      </div>

      {/* Parked cars */}
      <div className="absolute left-2 sm:left-6 bottom-32 opacity-90" style={{ animation: "fadeIn 1.2s .6s both" }}>
        {p2 && <ParkedCar color={p2.color} />}
      </div>
      <div className="absolute right-2 sm:right-6 bottom-32 opacity-90" style={{ animation: "fadeIn 1.2s .8s both" }}>
        {p3 && <ParkedCar color={p3.color} flip />}
      </div>

      {/* Podium row */}
      <div className="absolute inset-x-0 bottom-16 sm:bottom-20 px-3 sm:px-10 flex items-end gap-2 sm:gap-4 max-w-3xl mx-auto">
        <PodiumBlock entry={p2} height="120px" place={2} delay={0.5} />
        <PodiumBlock entry={p1} height="180px" place={1} delay={0.2} />
        <PodiumBlock entry={p3} height="95px" place={3} delay={0.8} />
      </div>

      {/* Fastest lap badge */}
      {fastestLapId && (
        <div className="absolute top-24 sm:top-28 left-4 text-[10px] uppercase tracking-widest bg-fuchsia-600/30 border border-fuchsia-400/60 px-2 py-1">
          Fastest Lap: <span className="font-bold text-fuchsia-200">{entries.find(e => e.id === fastestLapId)?.name ?? "—"}</span>
        </div>
      )}

      {/* Slow-mo vignette overlay during intro */}
      {slowmo && (
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)",
          animation: "vignette 2.2s ease-out forwards",
        }} />
      )}

      <button onClick={onClose} className="absolute top-3 right-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-xs uppercase tracking-widest">
        Skip
      </button>
      <button onClick={onClose} className="absolute bottom-3 left-1/2 -translate-x-1/2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold tracking-widest uppercase">
        Continue
      </button>

      <style>{`
        @keyframes rise { from { transform: translateY(60px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes bannerIn { from { transform: translate(-50%, -30px); opacity: 0 } to { transform: translate(-50%, 0); opacity: 1 } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vignette { from { opacity: 1 } to { opacity: 0 } }
      `}</style>
    </div>
  );
}