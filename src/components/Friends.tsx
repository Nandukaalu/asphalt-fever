import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Trophy, UserPlus, Check, X, Users, Search } from "lucide-react";
import { toast } from "sonner";

type Profile = { user_id: string; username: string; display_name: string | null };
type Friendship = { id: string; requester_id: string; addressee_id: string; status: "pending" | "accepted" | "blocked"; requester?: Profile; addressee?: Profile };
type Rank = { user_id: string; username: string; best_lap: number; wins: number };

export function FriendsPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"friends" | "requests" | "find" | "ranks">("friends");
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    const rows = (data ?? []) as Friendship[];
    const ids = Array.from(new Set(rows.flatMap(r => [r.requester_id, r.addressee_id])));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, username, display_name").in("user_id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.user_id, p as Profile]));
      rows.forEach(r => { r.requester = map.get(r.requester_id); r.addressee = map.get(r.addressee_id); });
    }
    setFriendships(rows);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("friendships-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const accepted = friendships.filter(f => f.status === "accepted");
  const incoming = friendships.filter(f => f.status === "pending" && f.addressee_id === user?.id);
  const outgoing = friendships.filter(f => f.status === "pending" && f.requester_id === user?.id);

  const search = async () => {
    if (!searchQ.trim() || !user) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, display_name")
      .ilike("username", `%${searchQ.trim()}%`)
      .neq("user_id", user.id)
      .limit(20);
    setSearchResults((data ?? []) as Profile[]);
  };

  const sendRequest = async (addresseeId: string) => {
    if (!user) return;
    const { error } = await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: addresseeId, status: "pending" });
    if (error) toast.error(error.message); else { toast.success("Request sent"); load(); }
  };
  const respond = async (id: string, status: "accepted" | "blocked") => {
    const { error } = await supabase.from("friendships").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else load();
  };
  const removeFriend = async (id: string) => {
    await supabase.from("friendships").delete().eq("id", id);
    load();
  };

  const loadRanks = useCallback(async () => {
    const friendIds = accepted.map(f => f.requester_id === user?.id ? f.addressee_id : f.requester_id);
    if (!user || friendIds.length === 0) { setRanks([]); return; }
    const allIds = [...friendIds, user.id];
    const { data: profs } = await supabase.from("profiles").select("user_id, username").in("user_id", allIds);
    const profMap = new Map((profs ?? []).map((p: any) => [p.user_id, p.username as string]));
    // Aggregate from leaderboard by player_name (legacy) — best effort
    const usernames = Array.from(profMap.values());
    const { data: lb } = await supabase
      .from("leaderboard_entries")
      .select("player_name, best_lap, won")
      .in("player_name", usernames);
    const agg = new Map<string, { best: number; wins: number }>();
    (lb ?? []).forEach((row: any) => {
      const cur = agg.get(row.player_name) || { best: Infinity, wins: 0 };
      cur.best = Math.min(cur.best, Number(row.best_lap));
      if (row.won) cur.wins += 1;
      agg.set(row.player_name, cur);
    });
    const list: Rank[] = allIds.map(uid => {
      const username = profMap.get(uid) ?? "—";
      const a = agg.get(username) || { best: Infinity, wins: 0 };
      return { user_id: uid, username, best_lap: a.best, wins: a.wins };
    }).sort((a, b) => a.best_lap - b.best_lap);
    setRanks(list);
  }, [user, accepted]);

  useEffect(() => { if (tab === "ranks") loadRanks(); }, [tab, loadRanks]);

  const otherProfile = (f: Friendship): Profile | undefined =>
    f.requester_id === user?.id ? f.addressee : f.requester;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-950 border border-white/10 w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2 text-white font-display tracking-widest uppercase"><Users size={18}/> Friends</div>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X size={20}/></button>
        </div>
        <div className="flex border-b border-white/10 text-xs uppercase tracking-widest">
          {(["friends","requests","find","ranks"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 ${tab === t ? "bg-red-600/20 text-red-400 border-b-2 border-red-500" : "text-white/50 hover:text-white"}`}>
              {t === "requests" ? `Requests${incoming.length ? ` (${incoming.length})` : ""}` : t}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto p-4 space-y-2 flex-1">
          {tab === "friends" && (accepted.length === 0 ? <Empty text="No friends yet. Find players in the Find tab." /> :
            accepted.map(f => {
              const p = otherProfile(f);
              return (
                <Row key={f.id} title={p?.display_name || p?.username || "Player"} subtitle={`@${p?.username}`}>
                  <button onClick={() => removeFriend(f.id)} className="text-xs text-white/50 hover:text-red-400 uppercase tracking-widest">Remove</button>
                </Row>
              );
            }))}

          {tab === "requests" && (
            <>
              {incoming.length === 0 && outgoing.length === 0 && <Empty text="No pending requests." />}
              {incoming.map(f => (
                <Row key={f.id} title={f.requester?.display_name || f.requester?.username || "Player"} subtitle={`@${f.requester?.username} • wants to be friends`}>
                  <button onClick={() => respond(f.id, "accepted")} className="p-1.5 bg-green-600/30 hover:bg-green-600/60 text-green-300 rounded"><Check size={16}/></button>
                  <button onClick={() => removeFriend(f.id)} className="p-1.5 bg-red-600/30 hover:bg-red-600/60 text-red-300 rounded"><X size={16}/></button>
                </Row>
              ))}
              {outgoing.map(f => (
                <Row key={f.id} title={f.addressee?.display_name || f.addressee?.username || "Player"} subtitle={`@${f.addressee?.username} • request sent`}>
                  <button onClick={() => removeFriend(f.id)} className="text-xs text-white/50 hover:text-red-400 uppercase tracking-widest">Cancel</button>
                </Row>
              ))}
            </>
          )}

          {tab === "find" && (
            <>
              <div className="flex gap-2 mb-3">
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}
                  placeholder="Search by username..." className="flex-1 bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500"/>
                <button onClick={search} className="px-3 bg-red-600 hover:bg-red-500 text-white"><Search size={16}/></button>
              </div>
              {searchResults.length === 0 && <Empty text="Search for a player by username."/>}
              {searchResults.map(p => {
                const existing = friendships.find(f => f.requester_id === p.user_id || f.addressee_id === p.user_id);
                return (
                  <Row key={p.user_id} title={p.display_name || p.username} subtitle={`@${p.username}`}>
                    {existing ? (
                      <span className="text-xs text-white/40 uppercase tracking-widest">{existing.status}</span>
                    ) : (
                      <button onClick={() => sendRequest(p.user_id)} className="p-1.5 bg-red-600/30 hover:bg-red-600/60 text-red-300 rounded"><UserPlus size={16}/></button>
                    )}
                  </Row>
                );
              })}
            </>
          )}

          {tab === "ranks" && (ranks.length === 0 ? <Empty text="Add friends to see rankings."/> :
            ranks.map((r, i) => (
              <Row key={r.user_id} title={`#${i + 1} ${r.username}`} subtitle={r.best_lap === Infinity ? "no lap recorded" : `best lap ${r.best_lap.toFixed(3)}s • ${r.wins} wins`}>
                {i === 0 && <Trophy size={16} className="text-amber-400"/>}
              </Row>
            )))}
        </div>
      </div>
    </div>
  );
}

function Row({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 bg-black/40 border border-white/10 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-white text-sm font-bold truncate">{title}</div>
        {subtitle && <div className="text-white/50 text-xs truncate">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="text-center text-white/40 text-sm py-10">{text}</div>;
}
