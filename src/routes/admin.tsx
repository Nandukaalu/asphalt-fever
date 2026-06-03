import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  adminCheck,
  adminResetLeaderboard,
  adminPurgeInvalid,
  adminStats,
  adminAnnounce,
  adminDeleteEntry,
} from "@/lib/admin.functions";

const ADMIN_EMAIL = "paarth376@gmail.com";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — Asphalt Fever" }, { name: "robots", content: "noindex" }] }),
});

type Stats = Awaited<ReturnType<typeof adminStats>>;

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const check = useServerFn(adminCheck);
  const reset = useServerFn(adminResetLeaderboard);
  const purge = useServerFn(adminPurgeInvalid);
  const stats = useServerFn(adminStats);
  const announce = useServerFn(adminAnnounce);
  const delEntry = useServerFn(adminDeleteEntry);

  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Stats | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Hard gate
  useEffect(() => {
    if (loading) return;
    const email = user?.email?.toLowerCase();
    if (!user || email !== ADMIN_EMAIL) {
      navigate({ to: "/" });
      return;
    }
    check()
      .then(() => setReady(true))
      .catch(() => navigate({ to: "/" }));
  }, [user, loading, navigate, check]);

  const refresh = async () => {
    try { setData(await stats()); }
    catch (e: any) { toast.error(e?.message ?? "Failed to load stats"); }
  };
  useEffect(() => { if (ready) refresh(); /* eslint-disable-next-line */ }, [ready]);

  if (loading || !ready) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center text-sm tracking-widest uppercase text-white/40">Verifying access…</div>;
  }

  const doReset = async () => {
    if (!confirm("Wipe ALL leaderboard entries? This cannot be undone.")) return;
    setBusy(true);
    try { const r = await reset(); toast.success(`Deleted ${r.deleted} entries`); refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };
  const doPurge = async () => {
    setBusy(true);
    try { const r = await purge(); toast.success(`Purged ${r.deleted} invalid entries`); refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };
  const doAnnounce = async () => {
    const m = msg.trim();
    if (!m) return;
    setBusy(true);
    try { await announce({ data: { message: m } }); toast.success("Announcement posted"); setMsg(""); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };
  const doDelete = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    try { await delEntry({ data: { id } }); refresh(); toast.success("Deleted"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Restricted</div>
          <h1 className="text-2xl font-black">Admin Console</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50">{user?.email}</span>
          <Link to="/" className="text-xs uppercase tracking-widest px-3 py-1.5 border border-white/15 hover:bg-white/10">Exit</Link>
        </div>
      </header>

      <main className="p-6 grid gap-6 lg:grid-cols-3">
        {/* Quick stats */}
        <section className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Profiles" value={data?.profileCount ?? "—"} />
          <Stat label="Leaderboard entries" value={data?.entryCount ?? "—"} />
          <Stat label="Lobby members" value={data?.memberCount ?? "—"} />
          <Stat label="Active lobbies" value={data?.lobbies.length ?? "—"} />
        </section>

        {/* Leaderboard tools */}
        <section className="lg:col-span-1 border border-white/10 p-5 space-y-3 bg-white/[0.02]">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/70">Leaderboard</h2>
          <button disabled={busy} onClick={doReset} className="w-full px-3 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs uppercase tracking-widest font-bold">Reset entire leaderboard</button>
          <button disabled={busy} onClick={doPurge} className="w-full px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-xs uppercase tracking-widest">Purge invalid entries</button>
          <p className="text-[11px] text-white/40 leading-relaxed">Invalid = lap &lt; 8s or race &lt; 10s. Validation trigger now blocks new bad data automatically.</p>
        </section>

        {/* Announcement */}
        <section className="lg:col-span-2 border border-white/10 p-5 space-y-3 bg-white/[0.02]">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/70">Server announcement</h2>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value.slice(0, 280))}
            placeholder="Broadcast a message to all players…"
            className="w-full h-24 bg-black/40 border border-white/15 px-3 py-2 text-sm resize-none focus:outline-none focus:border-white/40"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/40">{msg.length}/280</span>
            <button disabled={busy || !msg.trim()} onClick={doAnnounce} className="px-4 py-2 bg-white text-black hover:bg-white/90 disabled:opacity-40 text-xs uppercase tracking-widest font-bold">Broadcast</button>
          </div>
        </section>

        {/* Lobbies */}
        <section className="lg:col-span-3 border border-white/10 p-5 space-y-3 bg-white/[0.02]">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/70">Multiplayer lobbies (latest 20)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-white/40">
                <tr><th className="text-left py-2">Name</th><th className="text-left">Track</th><th className="text-left">Status</th><th className="text-right">Max</th><th className="text-right">Created</th></tr>
              </thead>
              <tbody>
                {(data?.lobbies ?? []).length === 0 && <tr><td colSpan={5} className="py-4 text-center text-white/40">No lobbies.</td></tr>}
                {(data?.lobbies ?? []).map((l: any) => (
                  <tr key={l.id} className="border-t border-white/5">
                    <td className="py-2">{l.name}</td>
                    <td className="text-white/60">{l.track_id}</td>
                    <td className="text-white/60">{l.status}</td>
                    <td className="text-right tabular-nums">{l.max_players}</td>
                    <td className="text-right text-white/40 tabular-nums">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent entries */}
        <section className="lg:col-span-3 border border-white/10 p-5 space-y-3 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/70">Recent leaderboard entries</h2>
            <button onClick={refresh} className="text-[11px] uppercase tracking-widest text-white/50 hover:text-white">↻ Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-white/40">
                <tr><th className="text-left py-2">Player</th><th className="text-left">Track</th><th className="text-right">Best lap</th><th className="text-right">Race</th><th className="text-right">Pos</th><th></th></tr>
              </thead>
              <tbody>
                {(data?.recent ?? []).length === 0 && <tr><td colSpan={6} className="py-4 text-center text-white/40">No entries.</td></tr>}
                {(data?.recent ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="py-2 font-bold">{r.player_name}</td>
                    <td className="text-white/60">{r.track_id}</td>
                    <td className="text-right tabular-nums text-red-400">{Number(r.best_lap).toFixed(2)}s</td>
                    <td className="text-right tabular-nums">{Number(r.race_time_sec).toFixed(1)}s</td>
                    <td className="text-right tabular-nums">{r.position}</td>
                    <td className="text-right">
                      <button onClick={() => doDelete(r.id)} className="text-[11px] text-red-400 hover:text-red-300 uppercase tracking-widest">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="border border-white/10 p-4 bg-white/[0.02]">
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{label}</div>
      <div className="text-2xl font-black tabular-nums mt-1">{String(value)}</div>
    </div>
  );
}