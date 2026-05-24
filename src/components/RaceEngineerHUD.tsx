import { useEffect, useRef, useState } from "react";
import { onEngineer, type EngineerMessage } from "@/lib/raceEngineer";

/**
 * Race Engineer subtitle overlay.
 * - Subscribes to the global engineer event bus.
 * - Plays a short radio-beep on each new message (Web Audio).
 * - Auto-dismisses after `ttl`.
 */
export default function RaceEngineerHUD() {
  const [queue, setQueue] = useState<EngineerMessage[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const unsub = onEngineer((m) => {
      setQueue((q) => [...q.slice(-2), m]);
      playRadioBeep(ctxRef);
      const ttl = m.ttl ?? 4200;
      window.setTimeout(() => {
        setQueue((q) => q.filter((x) => x.id !== m.id));
      }, ttl);
    });
    return () => { unsub(); };
  }, []);

  if (queue.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-3 bottom-24 z-40 flex flex-col gap-1 max-w-[min(78vw,420px)]">
      {queue.map((m) => (
        <div
          key={m.id}
          className={
            "px-3 py-2 rounded-md backdrop-blur-md border text-[12px] sm:text-sm font-medium animate-fade-in shadow-lg " +
            toneClass(m.tone)
          }
        >
          <span className="text-[10px] uppercase tracking-widest opacity-70 mr-2">
            ◉ Engineer
          </span>
          {m.text}
        </div>
      ))}
    </div>
  );
}

function toneClass(t: EngineerMessage["tone"]) {
  switch (t) {
    case "good":  return "bg-emerald-500/15 border-emerald-400/40 text-emerald-100";
    case "warn":  return "bg-amber-500/15 border-amber-400/40 text-amber-100";
    case "alert": return "bg-red-500/20 border-red-400/50 text-red-100";
    default:      return "bg-black/55 border-white/15 text-white";
  }
}

function playRadioBeep(ctxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    if (typeof window === "undefined") return;
    if (!ctxRef.current) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AC) return;
      ctxRef.current = new AC();
    }
    const ctx = ctxRef.current!;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    // Two-tone radio click
    [
      { f: 1200, t: t0,       d: 0.07, g: 0.10 },
      { f: 880,  t: t0 + 0.08,d: 0.10, g: 0.09 },
    ].forEach(({ f, t, d, g }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(g, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + d + 0.02);
    });
  } catch {}
}