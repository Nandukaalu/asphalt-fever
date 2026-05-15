import { supabase } from "@/integrations/supabase/client";

export type LBEntry = {
  id: string;
  player_name: string;
  driver_id: string;
  track_id: string;
  weather_id: string;
  best_lap: number;
  race_time_sec: number;
  position: number;
  won: boolean;
  created_at: string;
};

export async function submitLeaderboard(e: Omit<LBEntry, "id" | "created_at">) {
  return supabase.from("leaderboard_entries").insert(e);
}

export async function fetchTopByLap(opts: { trackId?: string; sinceISO?: string; limit?: number }) {
  let q = supabase
    .from("leaderboard_entries")
    .select("*")
    .order("best_lap", { ascending: true })
    .limit(opts.limit ?? 50);
  if (opts.trackId && opts.trackId !== "all") q = q.eq("track_id", opts.trackId);
  else q = q.not("track_id", "like", "custom-%");
  if (opts.sinceISO) q = q.gte("created_at", opts.sinceISO);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LBEntry[];
}

export async function fetchTopByWins(opts: { sinceISO?: string; limit?: number }) {
  // Aggregate client-side from a recent slice (no SQL agg available client-side).
  let q = supabase
    .from("leaderboard_entries")
    .select("player_name, won, race_time_sec, created_at")
    .eq("won", true)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (opts.sinceISO) q = q.gte("created_at", opts.sinceISO);
  const { data, error } = await q;
  if (error) throw error;
  const by = new Map<string, { player_name: string; wins: number; bestRace: number }>();
  for (const r of data ?? []) {
    const cur = by.get(r.player_name) ?? { player_name: r.player_name, wins: 0, bestRace: Infinity };
    cur.wins += 1;
    if (r.race_time_sec < cur.bestRace) cur.bestRace = r.race_time_sec;
    by.set(r.player_name, cur);
  }
  return [...by.values()].sort((a, b) => b.wins - a.wins).slice(0, opts.limit ?? 50);
}

export function weekAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}
