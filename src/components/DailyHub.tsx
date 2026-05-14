import { useEffect, useState } from "react";
import {
  loadDaily, claimChallenge, claimLogin, purchaseCosmetic,
  getChallengeMeta, isComplete, streakLoginReward,
  COSMETICS, type DailyState,
} from "@/lib/dailyRewards";

export default function DailyHub({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<DailyState>(() => loadDaily());
  const [tab, setTab] = useState<"challenges" | "rewards">("challenges");
  const [toast, setToast] = useState<string>("");

  // Auto-popup login bonus first time the hub opens today
  const [loginPopup, setLoginPopup] = useState<{ coins: number; streak: number } | null>(null);
  useEffect(() => {
    const r = claimLogin();
    setState(r.state);
    if (!r.alreadyClaimed) setLoginPopup({ coins: r.coins, streak: r.state.streak });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1800);
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Daily Hub</div>
          <div className="text-2xl font-black">Challenges & Rewards</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-yellow-400/15 border border-yellow-400/40 text-yellow-300 font-bold tabular-nums">
            ◆ {state.coins.toLocaleString()}
          </div>
          <div className="px-3 py-1.5 bg-orange-500/15 border border-orange-400/40 text-orange-300 font-bold">
            🔥 {state.streak}d
          </div>
          <button onClick={onClose} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-xs uppercase tracking-widest">
            Close
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 pt-4">
        {(["challenges", "rewards"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs uppercase tracking-widest border-b-2 ${
              tab === t ? "border-red-500 text-white" : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === "challenges" && (
          <div className="grid sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
            {state.challenges.map((c) => {
              const meta = getChallengeMeta(c.id);
              const done = isComplete(c);
              const pct = Math.min(100, Math.round((c.progress / meta.target) * 100));
              return (
                <div key={c.id} className={`p-4 border ${c.claimed ? "border-green-500/40 bg-green-500/5" : done ? "border-yellow-400/50 bg-yellow-400/5" : "border-white/10 bg-white/5"}`}>
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{meta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold">{meta.label}</div>
                      <div className="text-xs text-white/60">{meta.desc}</div>
                    </div>
                    <div className="text-yellow-300 font-bold whitespace-nowrap">+{meta.reward} ◆</div>
                  </div>
                  <div className="mt-3 h-1.5 bg-white/10 overflow-hidden">
                    <div className={`h-full ${done ? "bg-yellow-400" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-white/50 tabular-nums">
                      {meta.id === "race-time"
                        ? done ? "Done" : `Best: under ${meta.target}s`
                        : `${c.progress}/${meta.target} ${meta.unit}`}
                    </span>
                    <button
                      disabled={!done || c.claimed}
                      onClick={() => { setState(claimChallenge(c.id)); showToast(`+${meta.reward} coins`); }}
                      className={`px-3 py-1 text-[10px] uppercase tracking-widest border ${
                        c.claimed ? "border-green-500/40 text-green-400 bg-green-500/10"
                        : done ? "border-yellow-400 text-black bg-yellow-400 hover:bg-yellow-300"
                        : "border-white/15 text-white/40"
                      }`}
                    >
                      {c.claimed ? "Claimed" : done ? "Claim" : "In progress"}
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="sm:col-span-2 mt-2 p-4 border border-orange-400/30 bg-orange-500/5">
              <div className="text-xs uppercase tracking-widest text-orange-300/80 mb-1">Login Streak</div>
              <div className="font-bold">Day {state.streak} — next bonus: +{streakLoginReward(state.streak + 1)} ◆</div>
              <div className="text-xs text-white/60 mt-1">Log in tomorrow to keep your streak alive. 3/7/14-day streaks unlock exclusive liveries.</div>
            </div>
          </div>
        )}

        {tab === "rewards" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {COSMETICS.map((cos) => {
              const owned = state.unlocked.includes(cos.id);
              const isExclusive = cos.kind === "exclusive";
              const canBuy = !owned && !isExclusive && state.coins >= cos.cost;
              return (
                <div key={cos.id} className={`p-3 border ${owned ? "border-green-500/40 bg-green-500/5" : isExclusive ? "border-fuchsia-400/40 bg-fuchsia-500/5" : "border-white/10 bg-white/5"}`}>
                  <div
                    className="aspect-square mb-2 border border-white/10 flex items-center justify-center text-2xl"
                    style={{
                      background: cos.color
                        ? `radial-gradient(circle at 50% 60%, ${cos.color}88, transparent 70%)`
                        : "linear-gradient(135deg,#222,#000)",
                    }}
                  >
                    {cos.kind === "neon" ? "◉" : cos.kind === "decal" ? "▰" : cos.kind === "rim" ? "◎" : "✦"}
                  </div>
                  <div className="text-xs font-bold leading-tight">{cos.label}</div>
                  <div className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{cos.kind}</div>
                  <button
                    disabled={owned || !canBuy}
                    onClick={() => {
                      const r = purchaseCosmetic(cos.id);
                      setState(r.state);
                      showToast(r.ok ? "Unlocked!" : (r.reason ?? "Locked"));
                    }}
                    className={`mt-2 w-full px-2 py-1 text-[10px] uppercase tracking-widest border ${
                      owned ? "border-green-500/40 text-green-400 bg-green-500/10"
                      : isExclusive ? "border-fuchsia-400/40 text-fuchsia-300 bg-fuchsia-500/10"
                      : canBuy ? "border-yellow-400 text-black bg-yellow-400 hover:bg-yellow-300"
                      : "border-white/15 text-white/40"
                    }`}
                  >
                    {owned ? "Owned"
                      : isExclusive ? `Streak ${cos.streak}d`
                      : `${cos.cost} ◆`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Login popup */}
      {loginPopup && (
        <div className="absolute inset-0 z-40 bg-black/80 flex items-center justify-center px-6">
          <div className="max-w-sm w-full bg-gradient-to-b from-yellow-500/20 to-black border border-yellow-400/40 p-6 text-center">
            <div className="text-5xl mb-2">🎁</div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-yellow-300/80">Daily Login</div>
            <div className="text-3xl font-black mt-1">+{loginPopup.coins} Coins</div>
            <div className="text-sm text-white/70 mt-2">Day {loginPopup.streak} streak 🔥</div>
            <button
              onClick={() => setLoginPopup(null)}
              className="mt-5 w-full px-5 py-3 bg-yellow-400 text-black font-black tracking-widest uppercase hover:bg-yellow-300"
            >
              Collect
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white text-black text-xs uppercase tracking-widest font-bold">
          {toast}
        </div>
      )}
    </div>
  );
}
