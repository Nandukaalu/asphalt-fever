import { useEffect, useMemo, useState } from "react";
import { fetchTopByLap, fetchTopByWins, weekAgoISO, type LBEntry } from "@/lib/leaderboard";
import { supabase } from "@/integrations/supabase/client";

type Props = { onClose: () => void; tracks: { id: string; name: string }[] };

export default function Leaderboard({ onClose, tracks }: Props) {
  const [tab, setTab] = useState<"lap" | "wins">("lap");
  const [scope, setScope] = useState<"weekly" | "all">("weekly");
  const [trackId, setTrackId] = useState<string>("all");
  const [lapRows, setLapRows] = useState<LBEntry[]>([]);
  const [winRows, setWinRows] = useState<{ player_name: string; wins: number; bestRace: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const sinceISO = useMemo(() => (scope === "weekly" ? weekAgoISO() : undefined), [scope]);

  const reload = async () => {
    setLoading(true); setErr("");
    try {
      if (tab === "lap") {
        const rows = await fetchTopByLap({ trackId, sinceISO, limit: 50 });
        setLapRows(rows);
      } else {
        const rows = await fetchTopByWins({ sinceISO, limit: 50 });
        setWinRows(rows);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [tab, scope, trackId]);

  // Realtime: refresh on insert
  useEffect(() => {
    const ch = supabase
      .channel("lb-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leaderboard_entries" }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [tab, scope, trackId]);

  return (
    <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md text-white flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Global</div>
          <div className="text-2xl font-black">Leaderboard</div>
        </div>
        <button onClick={onClose} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-xs uppercase tracking-widest">Close</button>
      </div>

      <div className="flex flex-wrap gap-2 px-5 pt-4 items-center">
        <div className="flex">
          {(["lap", "wins"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs uppercase tracking-widest border ${tab === t ? "bg-red-600 border-red-500" : "border-white/15 text-white/60 hover:text-white"}`}>
              {t === "lap" ? "Fastest Lap" : "Most Wins"}
            </button>
          ))}
        </div>
        <div className="flex ml-2">
          {(["weekly", "all"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-3 py-1.5 text-xs uppercase tracking-widest border ${scope === s ? "bg-white text-black border-white" : "border-white/15 text-white/60 hover:text-white"}`}>
              {s === "weekly" ? "This Week" : "All Time"}
            </button>
          ))}
        </div>
        {tab === "lap" && (
          <select value={trackId} onChange={(e) => setTrackId(e.target.value)}
            className="ml-2 bg-black/60 border border-white/15 text-xs px-2 py-1.5 uppercase tracking-widest">
            <option value="all">All tracks</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <button onClick={reload} className="ml-auto text-xs uppercase tracking-widest text-white/60 hover:text-white">↻ Refresh</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {err && <div className="text-red-400 text-sm">{err}</div>}
        {loading && <div className="text-white/50 text-sm">Loading…</div>}
        {!loading && tab === "lap" && (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-white/50">
              <tr><th className="text-left py-2 w-10">#</th><th className="text-left">Player</th><th className="text-left hidden sm:table-cell">Track</th><th className="text-right">Best lap</th></tr>
            </thead>
            <tbody>
              {lapRows.length === 0 && <tr><td colSpan={4} className="text-white/40 py-6 text-center">No entries yet — be the first.</td></tr>}
              {lapRows.map((r, i) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="py-2 text-white/60">{i + 1}</td>
                  <td className="font-bold">{r.player_name}</td>
                  <td className="hidden sm:table-cell text-white/60">{tracks.find((t) => t.id === r.track_id)?.name ?? r.track_id}</td>
                  <td className="text-right tabular-nums text-red-400 font-bold">{r.best_lap.toFixed(2)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && tab === "wins" && (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-white/50">
              <tr><th className="text-left py-2 w-10">#</th><th className="text-left">Player</th><th className="text-right">Wins</th><th className="text-right hidden sm:table-cell">Best race</th></tr>
            </thead>
            <tbody>
              {winRows.length === 0 && <tr><td colSpan={4} className="text-white/40 py-6 text-center">No wins recorded yet.</td></tr>}
              {winRows.map((r, i) => (
                <tr key={r.player_name} className="border-t border-white/5">
                  <td className="py-2 text-white/60">{i + 1}</td>
                  <td className="font-bold">{r.player_name}</td>
                  <td className="text-right tabular-nums text-yellow-300 font-bold">{r.wins}</td>
                  <td className="text-right tabular-nums hidden sm:table-cell text-white/60">{Number.isFinite(r.bestRace) ? `${r.bestRace.toFixed(1)}s` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
