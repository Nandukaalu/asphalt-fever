import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CHAMP_CALENDAR,
  CHAMP_FIELD,
  POINTS_TABLE,
  POLE_POINT,
  FASTEST_LAP_POINT,
  computeAwards,
  driverStandings,
  gapToNextPosition,
  isFinaleRound,
  isSeasonOver,
  loadSeason,
  saveSeason,
  setNextRoundSetup,
  startSeason,
  takePendingResult,
  teamStandings,
  type ChampStanding,
  type RoundResult,
  type Season,
  type TeamStanding,
} from "@/lib/championship";
import {
  TEAMS,
  teamByChampName,
  teamById,
  playerTeamProfile,
  playerReputation,
  generateContractOffers,
  loadContractTeamId,
  saveContractTeamId,
  saveStoredReputation,
  type ContractOffer,
  type TeamProfile,
} from "@/lib/teams";
import { forecastForRace } from "@/lib/weatherEvolution";

export const Route = createFileRoute("/championship")({
  component: ChampionshipPage,
  head: () => ({
    meta: [
      { title: "Championship — Apex GP" },
      { name: "description", content: "Compete across a full season of Grands Prix. Drivers' & Constructors' titles, qualifying, finale ceremony." },
    ],
  }),
});

type View =
  | "intro"        // first-time start screen
  | "calendar"     // season hub
  | "preview"      // race weekend preview
  | "post-race"    // results overlay shown after takePendingResult
  | "contracts"    // contract offer screen after finale before new season
  | "finale-awards"; // season over ceremony

function ChampionshipPage() {
  const navigate = useNavigate();
  const [season, setSeason] = useState<Season | null>(null);
  const [view, setView] = useState<View>("intro");
  const [pending, setPending] = useState<RoundResult | null>(null);
  const [tab, setTab] = useState<"drivers" | "constructors">("drivers");

  // Boot: load season, consume pending result, route to right view
  useEffect(() => {
    const existing = loadSeason();
    let nextSeason = existing;
    const p = takePendingResult();
    if (p && nextSeason) {
      // Append round result, advance round
      nextSeason = {
        ...nextSeason,
        results: [...nextSeason.results, p],
        currentRound: nextSeason.currentRound + 1,
      };
      saveSeason(nextSeason);
      setPending(p);
      setSeason(nextSeason);
      if (isSeasonOver(nextSeason)) setView("finale-awards");
      else setView("post-race");
      return;
    }
    if (existing) {
      setSeason(existing);
      setView(isSeasonOver(existing) ? "finale-awards" : "calendar");
    } else {
      setView("intro");
    }
  }, []);

  const standings = useMemo(() => (season ? driverStandings(season) : []), [season]);
  const teams = useMemo(() => (season ? teamStandings(season) : []), [season]);

  // ---------------- INTRO ----------------
  if (view === "intro" || !season) {
    return <IntroScreen onStart={(driverId, name) => {
      const s = startSeason(driverId, name);
      setSeason(s);
      setView("calendar");
    }} />;
  }

  // ---------------- FINALE AWARDS ----------------
  if (view === "finale-awards") {
    return (
      <FinaleAwards
        season={season}
        onReset={() => {
          // Persist reputation before season is wiped
          saveStoredReputation(playerReputation(season));
          setView("contracts");
        }}
      />
    );
  }

  // ---------------- CONTRACT OFFERS (between seasons) ----------------
  if (view === "contracts") {
    return (
      <ContractOffersScreen
        season={season}
        onSign={(teamId) => {
          saveContractTeamId(teamId);
          // Award signing bonus credits to wallet
          try {
            const team = teamById(teamId);
            const bonus = team ? Math.round(800 + team.rating.prestige * 25) : 1000;
            const raw = localStorage.getItem("af-wallet-v1");
            const cur = raw ? JSON.parse(raw) : { credits: 0 };
            localStorage.setItem("af-wallet-v1", JSON.stringify({ ...cur, credits: (Number(cur.credits) || 0) + bonus }));
          } catch {}
          saveSeason(null);
          setSeason(null);
          setView("intro");
        }}
        onDecline={() => {
          saveSeason(null);
          setSeason(null);
          setView("intro");
        }}
      />
    );
  }

  // ---------------- POST-RACE OVERLAY ----------------
  if (view === "post-race" && pending) {
    return (
      <PostRaceSummary
        season={season}
        result={pending}
        onContinue={() => {
          setPending(null);
          setView(isSeasonOver(season) ? "finale-awards" : "calendar");
        }}
      />
    );
  }

  // ---------------- PREVIEW ----------------
  if (view === "preview") {
    return (
      <WeekendPreview
        season={season}
        standings={standings}
        onBack={() => setView("calendar")}
        onStart={() => {
          const r = CHAMP_CALENDAR[season.currentRound];
          setNextRoundSetup({
            round: season.currentRound,
            trackId: r.id,
            laps: r.laps,
            weather: r.weather,
            playerDriverId: season.playerDriverId,
          });
          navigate({ to: "/play" });
        }}
      />
    );
  }

  // ---------------- CALENDAR (HUB) ----------------
  return (
    <CalendarHub
      season={season}
      standings={standings}
      teams={teams}
      tab={tab}
      onTab={setTab}
      onNextRound={() => setView("preview")}
      onResetSeason={() => {
        if (!confirm("Abandon current season and start over?")) return;
        saveSeason(null);
        setSeason(null);
        setView("intro");
      }}
    />
  );
}

/* ============================================================
 * INTRO SCREEN
 * ============================================================ */
function IntroScreen({ onStart }: { onStart: (driverId: string, name: string) => void }) {
  const [driverId, setDriverId] = useState<string>(CHAMP_FIELD[2].id);
  const [name, setName] = useState<string>(() => {
    if (typeof window === "undefined") return "Driver";
    return localStorage.getItem("apex-name") || "Driver";
  });
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#06060d] via-[#0a0218] to-black text-white relative overflow-hidden">
      {/* spotlights */}
      <div className="absolute inset-0 pointer-events-none opacity-40"
        style={{ background: "radial-gradient(ellipse at 20% 10%, #ef4444 0%, transparent 40%), radial-gradient(ellipse at 80% 15%, #3b82f6 0%, transparent 45%)" }} />
      <div className="relative max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="text-white/50 hover:text-white text-xs uppercase tracking-widest">← Home</Link>
        <div className="text-[10px] uppercase tracking-[0.5em] text-red-400/80 mt-8">Apex GP Presents</div>
        <h1 className="text-5xl sm:text-7xl font-black leading-none mt-2">
          WORLD<br/>CHAMPIONSHIP
        </h1>
        <p className="text-white/70 mt-4 max-w-xl">
          {CHAMP_CALENDAR.length} Grands Prix. One Drivers' title, one Constructors' title.
          Qualifying decides the grid. Points decide the legend.
        </p>

        <div className="mt-10 p-5 border border-white/10 bg-black/40 backdrop-blur">
          <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">Driver name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 20))}
            className="w-full bg-black/50 border border-white/15 px-3 py-2 text-lg font-bold focus:outline-none focus:border-red-500"
          />

          <div className="text-[10px] uppercase tracking-widest text-white/50 mt-5 mb-2">Choose your team</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CHAMP_FIELD.map((d) => {
              const sel = d.id === driverId;
              return (
                <button
                  key={d.id}
                  onClick={() => setDriverId(d.id)}
                  className={`p-2 text-left border-2 transition ${sel ? "border-red-500 bg-red-500/10" : "border-white/15 hover:border-white/40 bg-black/40"}`}
                >
                  <div className="h-8 mb-1 flex items-center justify-center text-xs font-black" style={{ background: d.color, color: "#000" }}>#{d.number}</div>
                  <div className="text-[11px] font-bold truncate">{d.name}</div>
                  <div className="text-[9px] text-white/60 truncate">{d.team}</div>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => onStart(driverId, name.trim() || "Driver")}
          className="mt-8 w-full sm:w-auto px-12 py-5 bg-red-600 hover:bg-red-500 text-white font-black tracking-widest uppercase shadow-[0_0_60px_rgba(220,0,0,0.5)]"
        >
          Begin Season →
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * CALENDAR HUB
 * ============================================================ */
function CalendarHub({ season, standings, teams, tab, onTab, onNextRound, onResetSeason }: {
  season: Season;
  standings: ChampStanding[];
  teams: TeamStanding[];
  tab: "drivers" | "constructors";
  onTab: (t: "drivers" | "constructors") => void;
  onNextRound: () => void;
  onResetSeason: () => void;
}) {
  const nextRound = CHAMP_CALENDAR[season.currentRound];
  const playerStanding = standings.find((s) => s.isPlayer);
  const playerPos = standings.findIndex((s) => s.isPlayer) + 1;
  const gap = gapToNextPosition(season);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#06060d] to-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="text-white/50 hover:text-white text-xs uppercase tracking-widest">← Home</Link>
          <button onClick={onResetSeason} className="text-white/40 hover:text-red-400 text-[10px] uppercase tracking-widest underline">
            Reset Season
          </button>
        </div>

        <div className="text-[10px] uppercase tracking-[0.4em] text-red-400/80">Apex GP World Championship</div>
        <h1 className="text-3xl sm:text-5xl font-black mt-1">Season Calendar</h1>

        {/* Player snapshot */}
        {playerStanding && (
          <div className="mt-4 p-4 border border-white/10 bg-gradient-to-r from-red-600/20 via-red-600/5 to-transparent">
            <div className="flex flex-wrap items-baseline gap-6">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/50">Your position</div>
                <div className="text-3xl font-black">P{playerPos} <span className="text-white/40 text-base">/ {standings.length}</span></div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/50">Points</div>
                <div className="text-3xl font-black text-red-400">{playerStanding.points}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/50">Wins / Podiums / Poles / FL</div>
                <div className="text-lg font-bold">{playerStanding.wins} · {playerStanding.podiums} · {playerStanding.poles} · {playerStanding.fastestLaps}</div>
              </div>
              {gap && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-white/50">To P{gap.positionAbove} ({gap.nameAbove})</div>
                  <div className="text-lg font-bold text-yellow-300">+{gap.gap} pts</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Next round CTA */}
        {nextRound && (
          <div className="mt-5 p-5 border-2 border-red-500/60 bg-gradient-to-br from-red-600/20 to-black">
            <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-white/60">
              Round {season.currentRound + 1} of {CHAMP_CALENDAR.length}
              {isFinaleRound(season.currentRound) && (
                <span className="px-2 py-0.5 bg-yellow-400 text-black font-black tracking-widest">SEASON FINALE</span>
              )}
            </div>
            <div className="text-2xl sm:text-3xl font-black mt-1">{nextRound.flag} {nextRound.name}</div>
            <div className="text-white/60 text-sm">{nextRound.country} · {nextRound.laps} laps · {nextRound.weather}</div>
            <button onClick={onNextRound} className="mt-3 px-6 py-3 bg-red-600 hover:bg-red-500 font-black tracking-widest uppercase">
              Enter Race Weekend →
            </button>
          </div>
        )}

        {/* Standings */}
        <div className="mt-8">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => onTab("drivers")}
              className={`px-4 py-2 text-xs uppercase tracking-widest font-bold border ${tab === "drivers" ? "bg-white text-black border-white" : "border-white/20 text-white/70 hover:text-white"}`}
            >Drivers</button>
            <button
              onClick={() => onTab("constructors")}
              className={`px-4 py-2 text-xs uppercase tracking-widest font-bold border ${tab === "constructors" ? "bg-white text-black border-white" : "border-white/20 text-white/70 hover:text-white"}`}
            >Constructors</button>
          </div>

          {tab === "drivers" ? (
            <DriverStandingsTable rows={standings} />
          ) : (
            <TeamStandingsTable rows={teams} />
          )}
        </div>

        {/* Calendar list */}
        <h2 className="mt-10 text-xl font-black uppercase tracking-widest text-white/80">Full Calendar</h2>
        <div className="mt-3 grid gap-2">
          {CHAMP_CALENDAR.map((r, i) => {
            const done = i < season.currentRound;
            const next = i === season.currentRound;
            const finale = isFinaleRound(i);
            const result = season.results[i];
            return (
              <div key={r.id} className={`p-3 flex items-center gap-3 border ${next ? "border-red-500 bg-red-500/10" : done ? "border-white/10 bg-white/5" : "border-white/10 bg-black/40"}`}>
                <div className="w-8 text-white/40 font-black tabular-nums">{i + 1}</div>
                <div className="text-2xl">{r.flag}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{r.name} {finale && <span className="ml-1 text-[9px] tracking-widest text-yellow-400">FINALE</span>}</div>
                  <div className="text-[11px] text-white/50">{r.country} · {r.laps} laps · {r.weather}</div>
                </div>
                {done && result && (
                  <div className="text-right text-xs">
                    <div className="text-white/50">P{result.playerPosition ?? "—"}</div>
                    <div className="text-red-400 font-bold">+{result.playerPoints ?? 0}</div>
                  </div>
                )}
                {next && <div className="text-[10px] text-red-300 uppercase tracking-widest">Next</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DriverStandingsTable({ rows }: { rows: ChampStanding[] }) {
  return (
    <div className="border border-white/10 bg-black/40">
      <div className="grid grid-cols-[36px_1fr_60px_50px_50px_50px_70px] gap-2 px-3 py-2 bg-white/5 text-[10px] uppercase tracking-widest text-white/60">
        <span>#</span><span>Driver</span><span className="text-right">W</span><span className="text-right">Pod</span><span className="text-right">Pol</span><span className="text-right">FL</span><span className="text-right">Pts</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.id} className={`grid grid-cols-[36px_1fr_60px_50px_50px_50px_70px] gap-2 items-center px-3 py-2 border-t border-white/5 text-sm ${r.isPlayer ? "bg-red-600/20" : ""}`}>
          <span className="text-white/50 tabular-nums">{i + 1}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-2 h-4" style={{ background: r.color }} />
            <span className="truncate font-semibold">{r.name}</span>
            <span className="text-[10px] text-white/40 truncate">{r.team}</span>
          </span>
          <span className="text-right tabular-nums">{r.wins}</span>
          <span className="text-right tabular-nums">{r.podiums}</span>
          <span className="text-right tabular-nums">{r.poles}</span>
          <span className="text-right tabular-nums">{r.fastestLaps}</span>
          <span className="text-right tabular-nums font-black text-red-400">{r.points}</span>
        </div>
      ))}
    </div>
  );
}

function TeamStandingsTable({ rows }: { rows: TeamStanding[] }) {
  return (
    <div className="border border-white/10 bg-black/40">
      <div className="grid grid-cols-[36px_1fr_60px_70px] gap-2 px-3 py-2 bg-white/5 text-[10px] uppercase tracking-widest text-white/60">
        <span>#</span><span>Constructor</span><span className="text-right">W</span><span className="text-right">Pts</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.team} className="grid grid-cols-[36px_1fr_60px_70px] gap-2 items-center px-3 py-2 border-t border-white/5 text-sm">
          <span className="text-white/50 tabular-nums">{i + 1}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="inline-block w-2 h-4" style={{ background: r.color }} />
            <span className="truncate font-semibold">{r.team}</span>
          </span>
          <span className="text-right tabular-nums">{r.wins}</span>
          <span className="text-right tabular-nums font-black text-red-400">{r.points}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
 * WEEKEND PREVIEW
 * ============================================================ */
function WeekendPreview({ season, standings, onBack, onStart }: {
  season: Season;
  standings: ChampStanding[];
  onBack: () => void;
  onStart: () => void;
}) {
  const r = CHAMP_CALENDAR[season.currentRound];
  const finale = isFinaleRound(season.currentRound);
  const top3 = standings.slice(0, 3);
  const player = standings.find((s) => s.isPlayer);
  // Pick a rival: nearest in points but not the player
  const rival = useMemo(() => {
    if (!player) return null;
    const idx = standings.findIndex((s) => s.isPlayer);
    return standings[idx - 1] ?? standings[idx + 1] ?? null;
  }, [standings, player]);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-black via-[#0a0218] to-black text-white relative overflow-hidden">
      {finale && (
        <div className="absolute inset-0 pointer-events-none opacity-50"
          style={{ background: "radial-gradient(ellipse at 50% 0%, #facc15 0%, transparent 40%)" }} />
      )}
      <div className="relative max-w-3xl mx-auto px-4 py-8">
        <button onClick={onBack} className="text-white/50 hover:text-white text-xs uppercase tracking-widest">← Calendar</button>

        <div className="text-[10px] uppercase tracking-[0.4em] text-white/60 mt-6">
          Round {season.currentRound + 1} of {CHAMP_CALENDAR.length}{finale && " · Season Finale"}
        </div>
        <div className="text-5xl sm:text-6xl mt-1 leading-none">{r.flag}</div>
        <h1 className="text-3xl sm:text-5xl font-black leading-none mt-2">{r.name}</h1>
        <div className="text-white/60 mt-1">{r.country} · {r.laps} laps · Weather: {r.weather}</div>

        {finale && (
          <div className="mt-4 p-3 border-2 border-yellow-400 bg-yellow-400/10">
            <div className="text-yellow-300 font-black tracking-widest uppercase">Championship Decider</div>
            <div className="text-sm text-white/80">Larger crowds. Bigger stakes. The title is on the line.</div>
          </div>
        )}

        {/* Team objective + weather forecast */}
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          {(() => {
            const t = playerTeamProfile(season);
            if (!t) return null;
            return (
              <div className="p-4 border border-white/10 bg-black/40">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Team Briefing</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-block w-3 h-5" style={{ background: t.color }} />
                  <div className="font-black">{t.name}</div>
                </div>
                <div className="text-[11px] italic text-white/60 mt-1">"{t.motto}"</div>
                <div className="mt-2 text-sm">Objective: <b className="text-yellow-300">{t.seasonTarget}</b></div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-widest text-white/60">
                  <div>Top spd<div className="text-white text-base font-black">{t.rating.topSpeed}</div></div>
                  <div>Handling<div className="text-white text-base font-black">{t.rating.handling}</div></div>
                  <div>Reliab.<div className="text-white text-base font-black">{t.rating.reliability}</div></div>
                </div>
              </div>
            );
          })()}
          <div className="p-4 border border-white/10 bg-black/40">
            <div className="text-[10px] uppercase tracking-widest text-white/50">Weather Forecast</div>
            <div className="text-sm mt-1 leading-relaxed">{forecastForRace(r.weather)}</div>
            <div className="text-[10px] text-white/40 mt-2">Conditions may evolve during the race.</div>
          </div>
        </div>

        {/* Championship battle */}
        <div className="mt-6 grid sm:grid-cols-2 gap-3">
          <div className="p-4 border border-white/10 bg-black/40">
            <div className="text-[10px] uppercase tracking-widest text-white/50">Title Contenders</div>
            <div className="mt-2 space-y-1">
              {top3.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`w-5 text-center font-black ${i === 0 ? "text-yellow-300" : i === 1 ? "text-gray-300" : "text-amber-600"}`}>{i + 1}</span>
                    <span className="inline-block w-2 h-3" style={{ background: s.color }} />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="font-black text-red-400">{s.points}</span>
                </div>
              ))}
            </div>
          </div>

          {rival && player && (
            <div className="p-4 border border-fuchsia-400/40 bg-fuchsia-500/10">
              <div className="text-[10px] uppercase tracking-widest text-fuchsia-300">⚔ Rival Watch</div>
              <div className="font-black text-lg mt-1 truncate">{rival.name}</div>
              <div className="text-white/60 text-xs">{rival.team}</div>
              <div className="mt-2 text-sm">
                Gap: <span className={`font-black ${rival.points > player.points ? "text-red-400" : "text-emerald-400"}`}>
                  {rival.points > player.points ? `+${rival.points - player.points}` : `−${player.points - rival.points}`} pts
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Format */}
        <div className="mt-6 p-4 border border-white/10 bg-black/40">
          <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">Race Weekend Format</div>
          <ol className="space-y-2 text-sm">
            <li><span className="text-red-400 font-black">1.</span> <b>Qualifying</b> — 1 flying lap, all cars on track. Fastest lap takes pole. (+{POLE_POINT} pt)</li>
            <li><span className="text-red-400 font-black">2.</span> <b>Main Race</b> — {r.laps} laps. Points {POINTS_TABLE.join(" / ")}.</li>
            <li><span className="text-red-400 font-black">3.</span> <b>Fastest Lap</b> — bonus +{FASTEST_LAP_POINT} pt to the quickest single lap.</li>
          </ol>
        </div>

        <button
          onClick={onStart}
          className="mt-8 w-full sm:w-auto px-12 py-5 bg-red-600 hover:bg-red-500 text-white font-black tracking-widest uppercase shadow-[0_0_60px_rgba(220,0,0,0.5)]"
        >
          Start Qualifying →
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * POST-RACE SUMMARY
 * ============================================================ */
function PostRaceSummary({ season, result, onContinue }: {
  season: Season;
  result: RoundResult;
  onContinue: () => void;
}) {
  const calIdx = season.results.length - 1; // we already appended
  const r = CHAMP_CALENDAR[calIdx];
  const standingsAfter = driverStandings(season);
  // For "before", recompute as if without the latest result
  const standingsBefore = useMemo(() => {
    const trimmed: Season = { ...season, results: season.results.slice(0, -1), currentRound: season.currentRound - 1 };
    return driverStandings(trimmed);
  }, [season]);
  const posBefore = (id: string) => standingsBefore.findIndex((s) => s.id === id) + 1;
  const posAfter  = (id: string) => standingsAfter.findIndex((s) => s.id === id) + 1;

  const player = standingsAfter.find((s) => s.isPlayer);
  const gap = gapToNextPosition(season);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-black to-[#06060d] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-[10px] uppercase tracking-[0.4em] text-white/50">Round {calIdx + 1} Results</div>
        <h1 className="text-3xl sm:text-5xl font-black mt-1">{r?.flag} {r?.name}</h1>

        {/* Player result card */}
        <div className="mt-4 p-4 border-2 border-red-500/60 bg-gradient-to-br from-red-600/20 to-black flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Your finish</div>
            <div className="text-5xl font-black text-red-400">P{result.playerPosition ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Points</div>
            <div className="text-3xl font-black">+{result.playerPoints ?? 0}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Best lap</div>
            <div className="text-2xl font-bold">{result.bestLap ? `${result.bestLap.toFixed(2)}s` : "—"}</div>
          </div>
          {result.pole && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/50">Pole</div>
              <div className="text-sm font-bold">{nameFor(result.pole, season)}</div>
            </div>
          )}
          {result.fastestLap && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-fuchsia-300">⚡ Fastest lap</div>
              <div className="text-sm font-bold">{nameFor(result.fastestLap, season)}</div>
            </div>
          )}
        </div>

        {/* Race classification */}
        <h2 className="mt-6 text-sm uppercase tracking-widest text-white/60">Race Classification</h2>
        <div className="mt-2 border border-white/10 bg-black/40">
          {result.order.map((id, i) => {
            const d = CHAMP_FIELD.find((x) => x.id === id);
            const isPlayer = id === season.playerDriverId;
            const pts = (POINTS_TABLE[i] ?? 0)
              + (id === result.pole ? POLE_POINT : 0)
              + (id === result.fastestLap ? FASTEST_LAP_POINT : 0);
            return (
              <div key={id} className={`grid grid-cols-[40px_1fr_70px] gap-2 items-center px-3 py-2 border-t border-white/5 text-sm ${isPlayer ? "bg-red-600/20" : ""}`}>
                <span className="text-white/50 font-black tabular-nums">{i + 1}</span>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="inline-block w-2 h-4" style={{ background: d?.color }} />
                  <span className="truncate font-semibold">{nameFor(id, season)}</span>
                  {id === result.fastestLap && <span className="text-[9px] px-1 bg-fuchsia-600/40 text-fuchsia-100">FL</span>}
                  {id === result.pole && <span className="text-[9px] px-1 bg-yellow-500/40 text-yellow-100">POLE</span>}
                </span>
                <span className="text-right tabular-nums font-bold text-red-400">+{pts}</span>
              </div>
            );
          })}
        </div>

        {/* Championship change */}
        <h2 className="mt-6 text-sm uppercase tracking-widest text-white/60">Championship Update</h2>
        <div className="mt-2 border border-white/10 bg-black/40">
          {standingsAfter.slice(0, 8).map((s, i) => {
            const before = posBefore(s.id);
            const after = posAfter(s.id);
            const delta = before > 0 ? before - after : 0;
            return (
              <div key={s.id} className={`grid grid-cols-[40px_1fr_50px_70px] gap-2 items-center px-3 py-2 border-t border-white/5 text-sm ${s.isPlayer ? "bg-red-600/20" : ""}`}>
                <span className="text-white/50 font-black tabular-nums">{i + 1}</span>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="inline-block w-2 h-4" style={{ background: s.color }} />
                  <span className="truncate font-semibold">{s.name}</span>
                </span>
                <span className="text-right text-xs">
                  {delta > 0 && <span className="text-emerald-400 font-bold">▲{delta}</span>}
                  {delta < 0 && <span className="text-red-400 font-bold">▼{-delta}</span>}
                  {delta === 0 && before > 0 && <span className="text-white/30">—</span>}
                </span>
                <span className="text-right tabular-nums font-black text-red-400">{s.points}</span>
              </div>
            );
          })}
        </div>

        {player && gap && (
          <div className="mt-4 p-3 border border-yellow-400/30 bg-yellow-400/5 text-sm">
            You need <span className="text-yellow-300 font-black">+{gap.gap} pts</span> to overtake <b>{gap.nameAbove}</b> (P{gap.positionAbove}).
          </div>
        )}

        <button
          onClick={onContinue}
          className="mt-8 w-full sm:w-auto px-10 py-4 bg-red-600 hover:bg-red-500 font-black tracking-widest uppercase"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

function nameFor(id: string, season: Season) {
  const d = CHAMP_FIELD.find((x) => x.id === id);
  if (!d) return id;
  return id === season.playerDriverId ? (season.playerName || d.name) : d.name;
}

/* ============================================================
 * FINALE AWARDS
 * ============================================================ */
function FinaleAwards({ season, onReset }: { season: Season; onReset: () => void }) {
  const awards = useMemo(() => computeAwards(season), [season]);
  if (!awards) return null;
  const { champion, runnerUp, third, mostWins, mostPoles, mostPodiums, mostFastestLaps, constructorChampion } = awards;
  const playerWon = champion.isPlayer;

  return (
    <div className="min-h-[100dvh] relative overflow-hidden text-white"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #2a1850 0%, #07060d 60%, #000 100%)" }}>
      <FireworksBg />
      <div className="relative max-w-4xl mx-auto px-4 py-10">
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.5em] text-yellow-300/80">Season Complete</div>
          <h1 className="text-4xl sm:text-7xl font-black mt-2"
            style={{ color: "#fcd34d", textShadow: "0 0 40px rgba(252,211,77,0.7)" }}>
            WORLD CHAMPION
          </h1>
          <div className="text-5xl sm:text-7xl mt-6">🏆</div>
          <div className="text-3xl sm:text-5xl font-black mt-3" style={{ color: champion.color === "#f3f4f6" ? "#fff" : champion.color }}>
            {champion.name}
          </div>
          <div className="text-white/70 mt-1">{champion.team} · {champion.points} points</div>
          {playerWon && (
            <div className="mt-3 inline-block px-4 py-2 bg-yellow-400 text-black font-black tracking-widest text-sm uppercase">
              That's you. Legendary.
            </div>
          )}
        </div>

        {/* Podium 1-2-3 */}
        <div className="mt-10 grid grid-cols-3 gap-3 items-end max-w-2xl mx-auto">
          <PodiumBlock entry={runnerUp} place={2} />
          <PodiumBlock entry={champion} place={1} />
          <PodiumBlock entry={third} place={3} />
        </div>

        {/* Constructors */}
        <div className="mt-8 p-5 border border-yellow-400/40 bg-yellow-400/10 text-center">
          <div className="text-[10px] uppercase tracking-widest text-yellow-300">Constructors' Champion</div>
          <div className="text-2xl font-black mt-1" style={{ color: constructorChampion.color === "#f3f4f6" ? "#fff" : constructorChampion.color }}>
            {constructorChampion.team}
          </div>
          <div className="text-white/70">{constructorChampion.points} points · {constructorChampion.wins} wins</div>
        </div>

        {/* Awards grid */}
        <h2 className="mt-10 text-xs uppercase tracking-[0.4em] text-white/60 text-center">Season Awards</h2>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          <AwardCard icon="🏁" label="Most Wins"        name={mostWins.name}        value={`${mostWins.wins}`} />
          <AwardCard icon="🎯" label="Most Poles"       name={mostPoles.name}       value={`${mostPoles.poles}`} />
          <AwardCard icon="🥂" label="Most Podiums"     name={mostPodiums.name}     value={`${mostPodiums.podiums}`} />
          <AwardCard icon="⚡" label="Fastest Laps"     name={mostFastestLaps.name} value={`${mostFastestLaps.fastestLaps}`} />
        </div>

        <div className="mt-10 flex flex-wrap gap-3 justify-center">
          <button onClick={onReset} className="px-8 py-4 bg-red-600 hover:bg-red-500 font-black tracking-widest uppercase">
            Start New Season
          </button>
          <Link to="/" className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 font-bold tracking-widest uppercase">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function PodiumBlock({ entry, place }: { entry?: ChampStanding; place: 1 | 2 | 3 }) {
  if (!entry) return <div />;
  const h = place === 1 ? "h-32" : place === 2 ? "h-24" : "h-16";
  const c = place === 1 ? "#fcd34d" : place === 2 ? "#e5e7eb" : "#d97706";
  return (
    <div className="flex flex-col items-center">
      <div className="text-3xl mb-1">{place === 1 ? "🏆" : place === 2 ? "🥈" : "🥉"}</div>
      <div className="text-[10px] uppercase tracking-widest" style={{ color: c }}>P{place}</div>
      <div className="text-xs sm:text-sm font-black text-center truncate w-full px-1" title={entry.name}>{entry.name}</div>
      <div className="text-[10px] text-white/60">{entry.points} pts</div>
      <div className={`${h} w-full mt-2 border-t-4 flex items-start justify-center text-2xl font-black`}
        style={{ background: `linear-gradient(180deg, ${c}33, #0b0b14)`, borderColor: c, color: c, textShadow: `0 0 14px ${c}` }}>
        {place}
      </div>
    </div>
  );
}

function AwardCard({ icon, label, name, value }: { icon: string; label: string; name: string; value: string }) {
  return (
    <div className="p-4 border border-white/10 bg-black/40 flex items-center gap-3">
      <div className="text-3xl">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-white/50">{label}</div>
        <div className="font-bold truncate">{name}</div>
      </div>
      <div className="text-2xl font-black text-yellow-300">{value}</div>
    </div>
  );
}

function FireworksBg() {
  // Lightweight CSS-only sparkles for the finale background.
  const spots = Array.from({ length: 18 }, (_, i) => ({
    left: (i * 137) % 100,
    top:  (i * 47)  % 70,
    delay: (i % 7) * 0.4,
    hue:  (i * 53) % 360,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 opacity-60">
      {spots.map((s, i) => (
        <span key={i} className="absolute block w-2 h-2 rounded-full"
          style={{
            left: `${s.left}%`, top: `${s.top}%`,
            background: `hsl(${s.hue}, 95%, 65%)`,
            boxShadow: `0 0 24px 6px hsl(${s.hue}, 95%, 65%)`,
            animation: `champBurst 2.4s ${s.delay}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes champBurst { 0%,90%,100%{opacity:0; transform:scale(.6)} 50%{opacity:1; transform:scale(1.6)} }`}</style>
    </div>
  );
}

/* ============================================================
 * CONTRACT OFFERS (between seasons)
 * ============================================================ */
function ContractOffersScreen({ season, onSign, onDecline }: {
  season: Season;
  onSign: (teamId: string) => void;
  onDecline: () => void;
}) {
  const rep = playerReputation(season);
  const offers = useMemo(() => generateContractOffers(season), [season]);
  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#06060d] to-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-[10px] uppercase tracking-[0.5em] text-red-400/80">Driver Market</div>
        <h1 className="text-4xl sm:text-5xl font-black mt-1">Contract Offers</h1>
        <p className="text-white/60 mt-2">
          Your season earned you a reputation of <span className="text-yellow-300 font-black">{rep}</span>.
          These teams want to sign you for next season.
        </p>

        <div className="mt-6 grid gap-3">
          {offers.length === 0 && (
            <div className="p-6 border border-white/10 bg-black/40 text-white/60">
              No teams are offering this year. Stay with your current team and prove yourself.
            </div>
          )}
          {offers.map((o) => (
            <div key={o.teamId} className="p-4 border-2 border-white/10 hover:border-red-500/60 transition bg-black/40 flex flex-wrap items-center gap-4">
              <div className="w-12 h-12 flex items-center justify-center font-black text-black" style={{ background: o.color }}>
                {o.teamName.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-[180px]">
                <div className="font-black text-lg">{o.teamName}</div>
                <div className="text-[11px] text-white/50 italic">"{o.motto}"</div>
                <div className="text-xs text-white/70 mt-1">Objective: <b>{o.seasonTarget}</b></div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-white/50">Signing bonus</div>
                <div className="text-yellow-300 font-black">+{o.signingBonus} cr</div>
              </div>
              <button
                onClick={() => onSign(o.teamId)}
                className="px-5 py-3 bg-red-600 hover:bg-red-500 font-black tracking-widest uppercase text-sm"
              >Sign</button>
            </div>
          ))}
        </div>

        <button onClick={onDecline} className="mt-6 text-white/50 hover:text-white text-xs uppercase tracking-widest underline">
          Decline all offers and choose freely
        </button>
      </div>
    </div>
  );
}