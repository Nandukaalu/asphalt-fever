import { useEffect, useRef, useState } from "react";

export type ReplayFrame = { t: number; x: number; z: number; h: number; speed: number };
export type ReplayData = {
  trackName: string;
  driverName: string;
  driverColor: number;
  waypoints: [number, number][];
  frames: ReplayFrame[];
};

export default function ReplayViewer({ data, onClose }: { data: ReplayData; onClose: () => void }) {
  const cvsRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0); // 0..1

  useEffect(() => {
    const cvs = cvsRef.current;
    if (!cvs || data.frames.length < 2) return;
    const ctx = cvs.getContext("2d")!;
    const w = cvs.width = cvs.clientWidth * devicePixelRatio;
    const h = cvs.height = cvs.clientHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Compute bounds from waypoints
    const xs = data.waypoints.map((p) => p[0]);
    const zs = data.waypoints.map((p) => p[1]);
    const minX = Math.min(...xs) - 30, maxX = Math.max(...xs) + 30;
    const minZ = Math.min(...zs) - 30, maxZ = Math.max(...zs) + 30;
    const W = cvs.clientWidth, H = cvs.clientHeight;
    const sx = W / (maxX - minX);
    const sz = H / (maxZ - minZ);
    const s = Math.min(sx, sz);
    const ox = (W - (maxX - minX) * s) / 2;
    const oz = (H - (maxZ - minZ) * s) / 2;
    const tx = (x: number) => ox + (x - minX) * s;
    const tz = (z: number) => oz + (z - minZ) * s;

    const t0 = data.frames[0].t;
    const tEnd = data.frames[data.frames.length - 1].t;
    const totalMs = tEnd - t0;

    let raf = 0;
    let startWall = performance.now();
    let pausedAt = 0; // accumulated paused time
    let lastWall = startWall;

    const draw = (frac: number) => {
      ctx.clearRect(0, 0, W, H);
      // Track outline
      ctx.lineWidth = 18;
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      data.waypoints.forEach((p, i) => {
        const X = tx(p[0]), Z = tz(p[1]);
        if (i === 0) ctx.moveTo(X, Z); else ctx.lineTo(X, Z);
      });
      ctx.closePath(); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();

      // Path so far
      const upTo = Math.max(1, Math.floor(frac * (data.frames.length - 1)));
      ctx.lineWidth = 2;
      ctx.strokeStyle = `#${data.driverColor.toString(16).padStart(6, "0")}`;
      ctx.beginPath();
      for (let i = 0; i <= upTo; i++) {
        const f = data.frames[i];
        const X = tx(f.x), Z = tz(f.z);
        if (i === 0) ctx.moveTo(X, Z); else ctx.lineTo(X, Z);
      }
      ctx.stroke();

      // Car marker
      const f = data.frames[upTo];
      const X = tx(f.x), Z = tz(f.z);
      ctx.save();
      ctx.translate(X, Z);
      ctx.rotate(-f.h);
      ctx.fillStyle = `#${data.driverColor.toString(16).padStart(6, "0")}`;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5, 6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Speed readout
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.fillText(`${Math.round(Math.abs(f.speed) * 3.6 * 1.6)} KM/H`, 12, 20);
    };

    const tick = () => {
      const wall = performance.now();
      if (playing) {
        pausedAt += (wall - lastWall) * speed;
      }
      lastWall = wall;
      const frac = Math.min(1, pausedAt / totalMs);
      setProgress(frac);
      draw(frac);
      if (frac < 1 || !playing) raf = requestAnimationFrame(tick);
      else if (frac >= 1) {
        // restart loop
        pausedAt = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [data, playing, speed]);

  return (
    <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md text-white flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Replay</div>
          <div className="text-2xl font-black">{data.driverName} — {data.trackName}</div>
        </div>
        <button onClick={onClose} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-xs uppercase tracking-widest">Close</button>
      </div>
      <div className="flex-1 relative">
        <canvas ref={cvsRef} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="flex items-center gap-3 px-5 py-3 border-t border-white/10 text-xs">
        <button onClick={() => setPlaying((p) => !p)} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 uppercase tracking-widest font-bold">
          {playing ? "Pause" : "Play"}
        </button>
        {[1, 2, 4].map((s) => (
          <button key={s} onClick={() => setSpeed(s)}
            className={`px-2 py-1 border ${speed === s ? "bg-white text-black border-white" : "border-white/15 text-white/70 hover:text-white"}`}>
            {s}×
          </button>
        ))}
        <div className="flex-1 h-1 bg-white/10 ml-2 overflow-hidden">
          <div className="h-full bg-red-500" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
