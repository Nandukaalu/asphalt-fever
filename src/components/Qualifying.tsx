import { useEffect, useMemo, useRef, useState } from "react";

type Driver = { id: string; name: string; team: string; primary: number; number: number };

type Props = {
  drivers: Driver[];          // all 10 drivers including player
  playerDriverId: string;
  playerName: string;
  trackName: string;
  onComplete: (gridOrder: string[]) => void;
  onCancel: () => void;
};

type Row = {
  driverId: string;
  name: string;
  team: string;
  color: string;
  number: number;
  isPlayer: boolean;
  // sectors (sec) — undefined until completed
  s1?: number;
  s2?: number;
  s3?: number;
  total?: number;
  // simulation timing
  startAt: number;             // ms when their lap begins
  targetTotal: number;         // simulated total (AI). For player it's filled in live.
  done: boolean;
};

const SECTOR_FRACTIONS = [0.32, 0.36, 0.32]; // weight of each sector in a base lap

function hex(n: number) { return "#" + n.toString(16).padStart(6, "0"); }
function fmt(t?: number) {
  if (t === undefined) return "—";
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(3);
  return m > 0 ? `${m}:${s.padStart(6, "0")}` : s;
}
function gap(t?: number, leader?: number) {
  if (t === undefined || leader === undefined) return "";
  if (t === leader) return "LEADER";
  return `+${(t - leader).toFixed(3)}`;
}

export default function Qualifying({ drivers, playerDriverId, playerName, trackName, onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<"countdown" | "running" | "results">("countdown");
  const [count, setCount] = useState(5);
  const [, force] = useState(0);
  const tick = () => force((n) => n + 1);

  // Player input state
  const pushRef = useRef(false);
  const [pushing, setPushing] = useState(false);
  const [playerStarted, setPlayerStarted] = useState(false);
  const [playerSector, setPlayerSector] = useState(0); // 0..3 (3 = done)
  const playerStartRef = useRef<number>(0);
  const playerSectorStartRef = useRef<number>(0);
  const playerSectorsRef = useRef<number[]>([]);
  // Sample push intensity through the sector (0..1 average)
  const pushSamplesRef = useRef<{ on: number; total: number }>({ on: 0, total: 0 });

  // Build initial rows
  const rowsRef = useRef<Row[]>([]);
  const fastestLapRef = useRef<number>(72); // seconds (will set after init)

  useEffect(() => {
    // Base lap time depends on track; we don't know its length here, pick a flavor.
    const base = 70 + (trackName.length % 7); // 70..76s flavored variance
    fastestLapRef.current = base;
    const start = performance.now() + 5200; // align with countdown end
    rowsRef.current = drivers.map((d, i) => {
      const isPlayer = d.id === playerDriverId;
      // AI skill: perlin-ish from id; gives ~ -1.5..+2.5s spread vs base
      const skill = ((d.id.charCodeAt(0) * 31 + d.id.charCodeAt(d.id.length - 1) * 17) % 100) / 100;
      const variance = (Math.sin(i * 9.13 + d.number) + 1) * 0.5; // 0..1
      const target = base + (-1.2 + skill * 3.0) + (variance - 0.5) * 1.4;
      return {
        driverId: d.id,
        name: isPlayer ? playerName : d.name,
        team: d.team,
        color: hex(d.primary),
        number: d.number,
        isPlayer,
        startAt: start + i * 600, // staggered out-laps
        targetTotal: isPlayer ? base : target,
        done: false,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count <= 0) { setPhase("running"); return; }
    const id = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, count]);

  // Main loop: simulate AI sectors live + drive player's lap
  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const rows = rowsRef.current;
      let allDone = true;
      for (const r of rows) {
        if (r.done) continue;
        if (now < r.startAt) { allDone = false; continue; }
        if (r.isPlayer) {
          // Player lap is driven via Push input — handled below in the dedicated effect.
          if (!playerStarted) {
            setPlayerStarted(true);
            playerStartRef.current = now;
            playerSectorStartRef.current = now;
            pushSamplesRef.current = { on: 0, total: 0 };
          }
          // Sample pushing
          pushSamplesRef.current.total += 1;
          if (pushRef.current) pushSamplesRef.current.on += 1;
          allDone = false;
        } else {
          // AI: progress sectors over real time matching their target lap
          const elapsed = (now - r.startAt) / 1000;
          const target = r.targetTotal;
          const s1End = target * SECTOR_FRACTIONS[0];
          const s2End = s1End + target * SECTOR_FRACTIONS[1];
          if (r.s1 === undefined && elapsed >= s1End) {
            r.s1 = +(s1End + (Math.random() - 0.5) * 0.05).toFixed(3);
          }
          if (r.s2 === undefined && elapsed >= s2End) {
            r.s2 = +(target * SECTOR_FRACTIONS[1] + (Math.random() - 0.5) * 0.05).toFixed(3);
          }
          if (elapsed >= target) {
            r.s3 = +(target * SECTOR_FRACTIONS[2] + (Math.random() - 0.5) * 0.05).toFixed(3);
            r.total = +((r.s1! + r.s2! + r.s3!)).toFixed(3);
            r.done = true;
          } else {
            allDone = false;
          }
        }
      }
      tick();
      if (allDone) {
        const sorted = [...rows].sort((a, b) => (a.total ?? 999) - (b.total ?? 999));
        setPhase("results");
        // brief delay then forward grid
        setTimeout(() => onComplete(sorted.map((r) => r.driverId)), 4200);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Player sector progression: each sector base = base * fraction; push reduces by up to 4%, no push penalises by up to 5%.
  useEffect(() => {
    if (phase !== "running" || !playerStarted) return;
    if (playerSector >= 3) return;
    const base = fastestLapRef.current * SECTOR_FRACTIONS[playerSector];
    // Aim ~ base seconds for this sector. We call the lap "done" when wallclock matches.
    const expectedEnd = playerSectorStartRef.current + base * 1000;
    let raf = 0;
    const check = () => {
      const now = performance.now();
      // Update live partials in player row for the leaderboard
      const r = rowsRef.current.find((x) => x.isPlayer)!;
      if (now >= expectedEnd) {
        const samples = pushSamplesRef.current;
        const ratio = samples.total > 0 ? samples.on / samples.total : 0;
        // -4% if you push the whole sector, +5% if you never push.
        const mult = 1 - 0.04 * ratio + 0.05 * (1 - ratio);
        const sectorTime = +(base * mult).toFixed(3);
        if (playerSector === 0) r.s1 = sectorTime;
        else if (playerSector === 1) r.s2 = sectorTime;
        else r.s3 = sectorTime;
        if (playerSector === 2) {
          r.total = +((r.s1! + r.s2! + r.s3!)).toFixed(3);
          r.done = true;
        }
        playerSectorStartRef.current = now;
        pushSamplesRef.current = { on: 0, total: 0 };
        setPlayerSector((s) => s + 1);
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [phase, playerStarted, playerSector]);

  const sortedRows = useMemo(() => {
    return [...rowsRef.current].sort((a, b) => {
      const at = a.total ?? (a.s2 !== undefined ? 200 : a.s1 !== undefined ? 300 : 999);
      const bt = b.total ?? (b.s2 !== undefined ? 200 : b.s1 !== undefined ? 300 : 999);
      return at - bt;
    });
    // re-sort each render via tick()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsRef.current.map((r) => `${r.s1}-${r.s2}-${r.s3}-${r.total}`).join("|")]);

  const fastest = sortedRows.find((r) => r.total !== undefined)?.total;
  const playerRow = rowsRef.current.find((r) => r.isPlayer);
  const liveLap = playerStarted && !playerRow?.done
    ? ((performance.now() - playerStartRef.current) / 1000)
    : undefined;

  const setPush = (v: boolean) => { pushRef.current = v; setPushing(v); };

  return (
    <div className="fixed inset-0 z-40 bg-gradient-to-b from-black via-[#0a0014] to-black overflow-y-auto">
      <div className="relative max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-red-400">Qualifying Session</div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">{trackName} GP</h1>
          </div>
          <button
            onClick={onCancel}
            className="text-xs uppercase tracking-widest text-white/50 hover:text-white"
          >Abandon</button>
        </div>

        {/* Countdown */}
        {phase === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-xs uppercase tracking-[0.6em] text-red-400 mb-3">Track is hot in</div>
              <div className="text-[10rem] sm:text-[14rem] font-black text-white leading-none drop-shadow-[0_0_60px_rgba(220,0,0,0.6)]">
                {count > 0 ? count : "GO"}
              </div>
            </div>
          </div>
        )}

        {phase !== "countdown" && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-4">
            {/* Live Timing Tower */}
            <div className="bg-black/60 border border-white/10 backdrop-blur-md">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-gradient-to-r from-red-600/30 to-transparent">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] uppercase tracking-[0.3em] text-white/80">Live Qualifying</span>
                </div>
                <div className="text-[10px] tabular-nums text-white/60">
                  {fastest ? <>POLE <span className="text-fuchsia-300 font-bold">{fmt(fastest)}</span></> : "—"}
                </div>
              </div>

              <div className="grid grid-cols-[24px_18px_1fr_56px_56px_56px_72px] gap-1 px-3 pt-2 pb-1 text-[8px] uppercase tracking-widest text-white/40">
                <div>P</div><div></div><div>Driver</div>
                <div className="text-right">S1</div>
                <div className="text-right">S2</div>
                <div className="text-right">S3</div>
                <div className="text-right">Lap / Gap</div>
              </div>

              <ul className="font-mono">
                {sortedRows.map((r, i) => {
                  const isFastest = r.total !== undefined && r.total === fastest;
                  return (
                    <li
                      key={r.driverId}
                      className={`grid grid-cols-[24px_18px_1fr_56px_56px_56px_72px] gap-1 items-center px-3 py-1.5 border-t border-white/5 transition-colors
                        ${r.isPlayer ? "bg-red-600/25" : "hover:bg-white/5"}
                        ${isFastest ? "shadow-[inset_0_0_20px_rgba(232,121,249,0.25)]" : ""}`}
                    >
                      <div className={`text-sm font-black tabular-nums ${i === 0 ? "text-yellow-300" : "text-white/90"}`}>{i + 1}</div>
                      <div className="w-3 h-5 rounded-[2px]" style={{ background: r.color, boxShadow: `0 0 6px ${r.color}aa` }} />
                      <div className="flex items-baseline gap-1 min-w-0">
                        <span className="text-[9px] text-white/40 tabular-nums">{r.number}</span>
                        <span className={`truncate text-xs font-bold ${r.isPlayer ? "text-white" : "text-white/85"}`}>
                          {r.name}
                        </span>
                      </div>
                      <div className="text-right text-[10px] tabular-nums text-white/70">{r.s1?.toFixed(3) ?? "—"}</div>
                      <div className="text-right text-[10px] tabular-nums text-white/70">{r.s2?.toFixed(3) ?? "—"}</div>
                      <div className="text-right text-[10px] tabular-nums text-white/70">{r.s3?.toFixed(3) ?? "—"}</div>
                      <div className={`text-right text-[11px] tabular-nums font-bold ${isFastest ? "text-fuchsia-300 drop-shadow-[0_0_4px_rgba(232,121,249,0.7)]" : i === 0 ? "text-yellow-300" : "text-white/85"}`}>
                        {r.total !== undefined ? (i === 0 ? fmt(r.total) : gap(r.total, fastest)) : "—"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Player cockpit */}
            <div className="bg-black/60 border border-white/10 backdrop-blur-md p-4 flex flex-col gap-3">
              <div>
                <div className="text-[9px] uppercase tracking-[0.3em] text-white/50">Your Lap</div>
                <div className="font-mono text-3xl font-black text-white tabular-nums">
                  {playerRow?.done ? fmt(playerRow.total) : liveLap !== undefined ? liveLap.toFixed(2) : "—"}
                </div>
                <div className="flex gap-2 mt-2">
                  {[0, 1, 2].map((i) => {
                    const v = i === 0 ? playerRow?.s1 : i === 1 ? playerRow?.s2 : playerRow?.s3;
                    const active = playerSector === i && playerStarted && !playerRow?.done;
                    return (
                      <div key={i} className={`flex-1 px-2 py-1 border ${active ? "border-fuchsia-400 bg-fuchsia-500/20 animate-pulse" : "border-white/10 bg-white/5"}`}>
                        <div className="text-[8px] uppercase tracking-widest text-white/40">S{i + 1}</div>
                        <div className="font-mono text-xs tabular-nums text-white">{v?.toFixed(3) ?? (active ? "···" : "—")}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PUSH button */}
              {phase === "running" && playerStarted && !playerRow?.done && (
                <button
                  onPointerDown={(e) => { e.preventDefault(); setPush(true); }}
                  onPointerUp={() => setPush(false)}
                  onPointerLeave={() => setPush(false)}
                  onPointerCancel={() => setPush(false)}
                  className={`select-none touch-none mt-2 h-32 rounded-lg font-black text-2xl tracking-[0.3em] uppercase border-2 transition-all
                    ${pushing
                      ? "bg-gradient-to-b from-fuchsia-500 to-red-600 border-fuchsia-300 text-white shadow-[0_0_40px_rgba(232,121,249,0.6)]"
                      : "bg-white/5 border-white/20 text-white/80 hover:bg-white/10"}`}
                >
                  {pushing ? "ON IT" : "PUSH"}
                </button>
              )}
              {phase === "running" && !playerStarted && (
                <div className="text-center text-xs text-white/60 mt-4 animate-pulse">
                  Out-lap… your hot lap begins shortly
                </div>
              )}
              {playerRow?.done && phase !== "results" && (
                <div className="text-center text-xs text-white/60 mt-2">Lap set. Watching the rest of the field…</div>
              )}

              <div className="text-[10px] text-white/40 leading-relaxed mt-auto">
                Hold PUSH through fast sectors to extract pace. Lift in tight corners to keep the car planted — over-pushing in slow sections costs more time than it gains.
              </div>
            </div>
          </div>
        )}

        {phase === "results" && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center pointer-events-none">
            <div className="text-center pointer-events-auto">
              <div className="text-[10px] uppercase tracking-[0.5em] text-fuchsia-300 mb-2">Qualifying Complete</div>
              <div className="text-5xl sm:text-7xl font-black text-white drop-shadow-[0_0_40px_rgba(232,121,249,0.6)]">Starting Grid Set</div>
              <div className="text-sm text-white/60 mt-3">Pole position: <span className="text-fuchsia-300 font-bold">{sortedRows[0]?.name}</span> — {fmt(sortedRows[0]?.total)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}