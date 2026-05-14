import { useMemo } from "react";

export type LiveEntry = {
  id: string;
  name: string;
  team?: string;
  color: string;     // hex like "#ff0000"
  number?: number;
  position: number;
  lap: number;       // current lap (1..totalLaps)
  lastLap?: number;  // seconds, optional
  bestLap?: number;  // seconds, optional
  gap: string;       // "—" | "+0.124" | "+1 LAP"
  isPlayer: boolean;
  isFastestLap: boolean;
};

type Props = {
  entries: LiveEntry[];
  totalLaps: number;
  fastestLap?: number;
};

export default function LiveTiming({ entries, totalLaps, fastestLap }: Props) {
  const sorted = useMemo(() => [...entries].sort((a, b) => a.position - b.position), [entries]);

  return (
    <div
      className="absolute z-10 select-none pointer-events-none font-mono text-white
                 right-2 top-20 sm:right-3 sm:top-24
                 w-[212px] sm:w-[260px]
                 bg-black/55 backdrop-blur-md border border-white/10
                 shadow-[0_0_30px_rgba(220,0,0,0.18)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/10
                      bg-gradient-to-r from-red-600/30 to-transparent">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] uppercase tracking-[0.25em] text-white/80">Live Timing</span>
        </div>
        <div className="text-[10px] tabular-nums text-white/70">
          LAP <span className="text-white font-bold">{Math.min(totalLaps, sorted.find(e => e.isPlayer)?.lap ?? 1)}</span>
          <span className="text-white/40">/{totalLaps}</span>
        </div>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[18px_14px_1fr_44px_44px] gap-1 px-2 pt-1.5 pb-1
                      text-[8px] uppercase tracking-widest text-white/40">
        <div>P</div>
        <div></div>
        <div>Driver</div>
        <div className="text-right">Last</div>
        <div className="text-right">Gap</div>
      </div>

      {/* Rows */}
      <ul className="max-h-[60vh] overflow-hidden">
        {sorted.map((e) => {
          const fastest = e.isFastestLap && e.bestLap && fastestLap && e.bestLap === fastestLap;
          return (
            <li
              key={e.id}
              className={`grid grid-cols-[18px_14px_1fr_44px_44px] gap-1 items-center px-2 py-1
                          border-t border-white/5 transition-colors duration-300
                          ${e.isPlayer ? "bg-red-600/25" : "hover:bg-white/5"}`}
            >
              <div className={`text-[11px] font-black tabular-nums ${e.position === 1 ? "text-yellow-300" : "text-white/90"}`}>
                {e.position}
              </div>
              <div
                className="w-2.5 h-4 rounded-[2px]"
                style={{ background: e.color, boxShadow: `0 0 6px ${e.color}aa` }}
              />
              <div className="flex items-baseline gap-1 min-w-0">
                {typeof e.number === "number" && (
                  <span className="text-[9px] text-white/40 tabular-nums">{e.number}</span>
                )}
                <span className={`truncate text-[11px] font-bold ${e.isPlayer ? "text-white" : "text-white/85"}`}>
                  {abbr(e.name)}
                </span>
              </div>
              <div className={`text-right text-[10px] tabular-nums ${fastest ? "text-fuchsia-300 drop-shadow-[0_0_4px_rgba(232,121,249,0.7)]" : "text-white/70"}`}>
                {e.lastLap ? e.lastLap.toFixed(2) : "—"}
              </div>
              <div className={`text-right text-[10px] tabular-nums ${e.position === 1 ? "text-yellow-300" : "text-white/60"}`}>
                {e.gap}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer: fastest lap badge */}
      {fastestLap && fastestLap > 0 && (
        <div className="px-2 py-1 border-t border-white/10 flex items-center justify-between
                        bg-fuchsia-600/15">
          <span className="text-[9px] uppercase tracking-widest text-fuchsia-300">Fastest Lap</span>
          <span className="text-[10px] tabular-nums text-fuchsia-200 font-bold">{fastestLap.toFixed(3)}s</span>
        </div>
      )}
    </div>
  );
}

function abbr(name: string) {
  // "Marco Rossi" -> "M. ROSSI"
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].toUpperCase().slice(0, 8);
  const last = parts[parts.length - 1].toUpperCase();
  return `${parts[0][0]}. ${last}`;
}
