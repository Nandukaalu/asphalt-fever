import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import DailyHub from "./DailyHub";
import { recordRace } from "@/lib/dailyRewards";
import Leaderboard from "./Leaderboard";
import ReplayViewer, { type ReplayData, type ReplayFrame } from "./ReplayViewer";
import { submitLeaderboard } from "@/lib/leaderboard";
import LiveTiming, { type LiveEntry } from "./LiveTiming";
import { CinematicIntro, type GridDriver } from "./CinematicIntro";
import { FriendsPanel } from "./Friends";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import PodiumCeremony, { type PodiumEntry } from "./PodiumCeremony";

// ---------------- Types ----------------
type Driver = {
  id: string;
  name: string;
  team: string;
  primary: number; // car body color
  secondary: number; // accent
  number: number;
};

type TrackDef = {
  id: string;
  name: string;
  country: string;
  waypoints: [number, number][]; // x, z
  laps: number;
};

type CareerSave = {
  driverId: string;
  points: number;
  completed: Record<string, { bestLap: number; position: number; points: number }>;
  standings: Record<string, number>; // driverId -> total season points
  rounds: { trackId: string; order: string[] }[]; // finishing order per round
};

type Mode = "quick" | "career" | "multi";

type RemotePlayer = {
  id: string;
  name: string;
  driverId: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  progress: number;
  lastUpdate: number;
};

type LobbyPlayer = {
  id: string;
  name: string;
  driverId: string;
  isHost: boolean;
};

// ---------------- Data ----------------
const DRIVERS: Driver[] = [
  { id: "rosso", name: "Marco Rossi", team: "Scuderia Rosso", primary: 0xd40000, secondary: 0xffffff, number: 16 },
  { id: "silver", name: "James Hale", team: "Silver Arrows", primary: 0x00d2be, secondary: 0x111111, number: 44 },
  { id: "azure", name: "Liam Beck", team: "Azure Racing", primary: 0x1e3a8a, secondary: 0xfacc15, number: 1 },
  { id: "papaya", name: "Diego Cruz", team: "Papaya Squad", primary: 0xff8000, secondary: 0x000000, number: 4 },
  { id: "verde", name: "Aiden Walsh", team: "Verde Works", primary: 0x16a34a, secondary: 0xffffff, number: 11 },
  { id: "cobalt", name: "Mateo Vidal", team: "Cobalt Dynamics", primary: 0x0ea5e9, secondary: 0x0b1d3a, number: 23 },
  { id: "violet", name: "Noah Becker", team: "Violet Motors", primary: 0x7c3aed, secondary: 0xfde68a, number: 77 },
  { id: "crimson", name: "Kenji Aoki", team: "Crimson Squad", primary: 0xb91c1c, secondary: 0x111111, number: 31 },
  { id: "ivory", name: "Lukas Faber", team: "Ivory Tech", primary: 0xf3f4f6, secondary: 0x111111, number: 18 },
  { id: "onyx", name: "Sam Carter", team: "Onyx Racing", primary: 0x0f172a, secondary: 0xfbbf24, number: 55 },
];

// ---------------- Weather ----------------
export type WeatherId =
  | "clear-night"
  | "rainy-night"
  | "foggy-night"
  | "sunset"
  | "thunderstorm"
  | "cloudy";

type WeatherDef = {
  id: WeatherId;
  label: string;
  blurb: string;
  icon: string;
  // sky gradient stops (top -> bottom)
  sky: string[];
  starDensity: number; // 0..1
  fog: { color: number; density: number };
  hemi: { sky: number; ground: number; intensity: number };
  sun: { color: number; intensity: number; pos: [number, number, number] };
  rim: { color: number; intensity: number };
  exposure: number;
  rain: number; // 0..1 droplet density
  lightning: boolean;
  wet: boolean;
  night: boolean; // headlights on
};

export const WEATHERS: WeatherDef[] = [
  {
    id: "clear-night", label: "Clear Night", blurb: "Crisp stars, neon city",
    icon: "✦",
    sky: ["#02030a", "#0a0a26", "#1a1452", "#2d1a6e", "#48227a", "#6a2da3"],
    starDensity: 1,
    fog: { color: 0x0a0820, density: 0.0012 },
    hemi: { sky: 0x6a4adf, ground: 0x0a0820, intensity: 0.45 },
    sun: { color: 0x9b6dff, intensity: 0.55, pos: [200, 220, -180] },
    rim: { color: 0x22d3ee, intensity: 0.7 },
    exposure: 1.0, rain: 0, lightning: false, wet: false, night: true,
  },
  {
    id: "rainy-night", label: "Rainy Night", blurb: "Wet asphalt, falling rain",
    icon: "🌧",
    sky: ["#020308", "#06081a", "#0d1430", "#1a2147", "#28305c", "#3a4470"],
    starDensity: 0.1,
    fog: { color: 0x0a1020, density: 0.006 },
    hemi: { sky: 0x4a6aa0, ground: 0x05080f, intensity: 0.35 },
    sun: { color: 0x6080b0, intensity: 0.3, pos: [-150, 250, -200] },
    rim: { color: 0x40b8ff, intensity: 0.55 },
    exposure: 0.85, rain: 1, lightning: false, wet: true, night: true,
  },
  {
    id: "foggy-night", label: "Foggy Night", blurb: "Low visibility haze",
    icon: "🌫",
    sky: ["#0a0a14", "#15151f", "#22222e", "#2e2e3c", "#3a3a4a", "#444454"],
    starDensity: 0.15,
    fog: { color: 0x2a2a38, density: 0.013 },
    hemi: { sky: 0x6f7a92, ground: 0x1a1a24, intensity: 0.55 },
    sun: { color: 0x8090a8, intensity: 0.4, pos: [100, 200, 150] },
    rim: { color: 0x90c0ff, intensity: 0.4 },
    exposure: 0.95, rain: 0, lightning: false, wet: false, night: true,
  },
  {
    id: "sunset", label: "Sunset", blurb: "Golden hour at the strip",
    icon: "☀",
    sky: ["#0d0820", "#33124a", "#7a1f5c", "#d63b6a", "#ff8a3d", "#ffd089"],
    starDensity: 0.2,
    fog: { color: 0xff8a4a, density: 0.0014 },
    hemi: { sky: 0xff8a5a, ground: 0x4a1a3a, intensity: 0.7 },
    sun: { color: 0xffb070, intensity: 1.4, pos: [280, 180, -240] },
    rim: { color: 0xff66cc, intensity: 0.55 },
    exposure: 1.15, rain: 0, lightning: false, wet: false, night: false,
  },
  {
    id: "thunderstorm", label: "Thunderstorm", blurb: "Heavy rain & lightning",
    icon: "⚡",
    sky: ["#01020a", "#040820", "#091230", "#101a40", "#162250", "#1f2c60"],
    starDensity: 0,
    fog: { color: 0x070b1c, density: 0.009 },
    hemi: { sky: 0x3a4870, ground: 0x040614, intensity: 0.3 },
    sun: { color: 0x4060a0, intensity: 0.25, pos: [-200, 300, -100] },
    rim: { color: 0x60a0ff, intensity: 0.4 },
    exposure: 0.8, rain: 1.4, lightning: true, wet: true, night: true,
  },
  {
    id: "cloudy", label: "Cloudy", blurb: "Overcast atmosphere",
    icon: "☁",
    sky: ["#1a1f2e", "#2a3142", "#3a4256", "#4a5268", "#5a637a", "#6c768e"],
    starDensity: 0,
    fog: { color: 0x4a5268, density: 0.0035 },
    hemi: { sky: 0x9aa8c0, ground: 0x2a3040, intensity: 0.85 },
    sun: { color: 0xc0c8d8, intensity: 0.7, pos: [180, 260, 120] },
    rim: { color: 0xa0b4d0, intensity: 0.35 },
    exposure: 1.0, rain: 0, lightning: false, wet: false, night: false,
  },
];
const WEATHER_KEY = "af-weather-v1";
function loadWeather(): WeatherId {
  if (typeof window === "undefined") return "clear-night";
  const v = localStorage.getItem(WEATHER_KEY) as WeatherId | null;
  return WEATHERS.find((w) => w.id === v)?.id ?? "clear-night";
}

// ---- Custom garage drivers (from /customize page) ----
function hexToInt(hex: string, fallback: number): number {
  if (!hex || typeof hex !== "string") return fallback;
  const s = hex.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
  return Number.isFinite(n) ? n : fallback;
}
function loadCustomDrivers(): { drivers: Driver[]; activeId: string | null } {
  if (typeof window === "undefined") return { drivers: [], activeId: null };
  try {
    const raw = localStorage.getItem("af-garage-v1");
    if (!raw) return { drivers: [], activeId: null };
    const g = JSON.parse(raw) as {
      drivers: Array<{ id: string; profile: { name: string; number: number; outfit: string }; car: { bodyColor: string; style: string; neon: string } }>;
      activeId: string;
    };
    const drivers: Driver[] = (g.drivers || []).map((d) => ({
      id: `custom:${d.id}`,
      name: d.profile?.name || "Custom",
      team: `My Garage • ${d.car?.style ?? "Custom"}`,
      primary: hexToInt(d.car?.bodyColor, 0xff6a1a),
      secondary: hexToInt(d.car?.neon && d.car.neon !== "none" ? d.car.neon : d.profile?.outfit, 0xffffff),
      number: Math.max(0, Math.min(99, Number(d.profile?.number ?? 7))),
    }));
    return { drivers, activeId: g.activeId ? `custom:${g.activeId}` : null };
  } catch {
    return { drivers: [], activeId: null };
  }
}

// Hand-tuned waypoint loops inspired by real circuits (not actual layouts).
const TRACKS: TrackDef[] = [
  {
    id: "silverstone",
    name: "Silverstone",
    country: "UK",
    laps: 15,
    waypoints: [
      [0, 0], [0, -220], [110, -330], [280, -360], [410, -280], [380, -120],
      [290, -30], [380, 95], [350, 250], [190, 345], [0, 345], [-190, 315],
      [-345, 190], [-380, 0], [-280, -140], [-130, -95],
    ],
  },
  {
    id: "monza",
    name: "Monza",
    country: "Italy",
    laps: 15,
    waypoints: [
      [0, 0], [0, -320], [60, -470], [60, -570], [190, -600], [320, -540],
      [350, -380], [320, -190], [380, -30], [380, 190], [255, 320],
      [60, 350], [-130, 320], [-255, 190], [-285, 0], [-190, -130],
    ],
  },
  {
    id: "monaco",
    name: "Monaco",
    country: "Monte Carlo",
    laps: 15,
    waypoints: [
      [0, 0], [35, -110], [110, -160], [200, -145], [260, -75], [330, -35],
      [365, 55], [330, 145], [220, 200], [110, 250], [0, 285], [-110, 250],
      [-200, 180], [-255, 90], [-235, 0], [-165, -75], [-90, -90],
    ],
  },
  {
    id: "spa",
    name: "Spa",
    country: "Belgium",
    laps: 15,
    waypoints: [
      [0, 0], [0, -190], [95, -320], [255, -380], [410, -320], [505, -160],
      [475, 0], [380, 95], [445, 255], [350, 415], [160, 445], [-65, 380],
      [-255, 285], [-410, 130], [-445, -65], [-350, -220], [-190, -190], [-65, -95],
    ],
  },
  {
    id: "suzuka",
    name: "Suzuka",
    country: "Japan",
    laps: 15,
    waypoints: [
      [0, 0], [0, -180], [110, -290], [240, -260], [340, -160], [290, -40],
      [180, 30], [80, 130], [180, 240], [320, 290], [410, 200], [410, 60],
      [340, -360], [200, -440], [40, -440], [-130, -380], [-260, -240],
      [-320, -90], [-280, 80], [-180, 180], [-90, 95],
    ],
  },
  {
    id: "interlagos",
    name: "Interlagos",
    country: "Brazil",
    laps: 15,
    waypoints: [
      [0, 0], [-90, -120], [-220, -180], [-340, -140], [-410, -30],
      [-360, 110], [-220, 180], [-60, 200], [110, 240], [260, 220],
      [360, 130], [380, -20], [310, -160], [180, -240], [60, -190],
    ],
  },
  {
    id: "cota",
    name: "Circuit of Americas",
    country: "USA",
    laps: 15,
    waypoints: [
      [0, 0], [40, -160], [180, -260], [280, -180], [220, -60], [320, 30],
      [430, -40], [490, -180], [430, -340], [280, -420], [110, -440],
      [-70, -400], [-220, -310], [-330, -180], [-380, -20], [-340, 140],
      [-220, 230], [-80, 240], [40, 170],
    ],
  },
  {
    id: "singapore",
    name: "Singapore",
    country: "Marina Bay",
    laps: 15,
    waypoints: [
      [0, 0], [80, -90], [180, -120], [280, -90], [360, 10], [380, 140],
      [310, 240], [180, 290], [40, 280], [-90, 240], [-200, 160],
      [-260, 40], [-240, -90], [-160, -180], [-60, -180],
    ],
  },
  {
    id: "bahrain",
    name: "Bahrain",
    country: "Sakhir",
    laps: 15,
    waypoints: [
      [0, 0], [60, -160], [200, -220], [340, -180], [430, -60],
      [430, 100], [340, 230], [200, 290], [40, 280], [-110, 230],
      [-240, 130], [-300, -10], [-260, -150], [-150, -200], [-60, -130],
    ],
  },
];

const SAVE_KEY = "apex-gp-career-v1";
const CUSTOM_TRACKS_KEY = "apex-gp-custom-tracks-v1";

function loadCustomTracks(): TrackDef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_TRACKS_KEY);
    return raw ? (JSON.parse(raw) as TrackDef[]) : [];
  } catch { return []; }
}
function saveCustomTracks(list: TrackDef[]) {
  try { localStorage.setItem(CUSTOM_TRACKS_KEY, JSON.stringify(list)); } catch {}
}

function loadSave(): CareerSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as CareerSave) : null;
  } catch {
    return null;
  }
}
function writeSave(s: CareerSave) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch {}
}

// ---------------- Component ----------------
export default function RacingGame() {
  const { user, profile, signOut } = useAuth();
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState({ speed: 0, gear: 1, lap: 1, totalLaps: 3, lapTime: 0, bestLap: 0, position: 1 });
  const [liveBoard, setLiveBoard] = useState<LiveEntry[]>([]);
  const [fastestLapTime, setFastestLapTime] = useState<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  // Pit stops
  const [pitStops, setPitStops] = useState(0);
  const [pitRequested, setPitRequested] = useState(false);
  const [pitActive, setPitActive] = useState(false); // currently in pit box
  const [pitProgress, setPitProgress] = useState(0); // 0..1
  const [pitTimeLeft, setPitTimeLeft] = useState(0);
  const [pitStatus, setPitStatus] = useState("Clean stop");
  const [tyreWearHud, setTyreWearHud] = useState(0);
  const pitRequestedRef = useRef(false);
  const pitActiveRef = useRef(false);
  const pitStopsRef = useRef(0);
  useEffect(() => { pitRequestedRef.current = pitRequested; }, [pitRequested]);
  useEffect(() => { pitActiveRef.current = pitActive; }, [pitActive]);
  useEffect(() => { pitStopsRef.current = pitStops; }, [pitStops]);
  const [screen, setScreen] = useState<"menu" | "multi" | "driver" | "track" | "editor" | "lobby" | "racing" | "result">("menu");
  const [qualifyingGrid, setQualifyingGrid] = useState<string[] | null>(null);
  const qualifyingGridRef = useRef<string[] | null>(null);
  useEffect(() => { qualifyingGridRef.current = qualifyingGrid; }, [qualifyingGrid]);
  const [sessionMode, setSessionMode] = useState<"qualifying" | "race">("race");
  const sessionModeRef = useRef<"qualifying" | "race">("race");
  useEffect(() => { sessionModeRef.current = sessionMode; }, [sessionMode]);
  // Cinematic race intro
  const [introOpen, setIntroOpen] = useState(false);
  const introMsRef = useRef<number>(0);
  const [mode, setMode] = useState<Mode>("quick");
  const [customDrivers, setCustomDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState<string>(DRIVERS[0].id);
  const [trackId, setTrackId] = useState<string>(TRACKS[0].id);
  const [lapsChoice, setLapsChoice] = useState<3 | 5 | 10>(5);
  const [weatherId, setWeatherId] = useState<WeatherId>(() => loadWeather());
  useEffect(() => { try { localStorage.setItem(WEATHER_KEY, weatherId); } catch {} }, [weatherId]);
  const [career, setCareer] = useState<CareerSave | null>(null);
  const [result, setResult] = useState<{ position: number; bestLap: number; points: number; credits: number } | null>(null);
  const [classification, setClassification] = useState<PodiumEntry[]>([]);
  const [fastestLapId, setFastestLapId] = useState<string | undefined>(undefined);
  const [showPodium, setShowPodium] = useState(false);
  const [customTracks, setCustomTracks] = useState<TrackDef[]>([]);
  const [showDaily, setShowDaily] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const lastReplayFramesRef = useRef<ReplayFrame[]>([]);
  const touchRef = useRef({ accel: false, brake: false, steer: 0, handbrake: false });

  // -------- Multiplayer state --------
  const [roomCode, setRoomCode] = useState<string>("");
  const [playerName, setPlayerName] = useState<string>(() => {
    if (typeof window === "undefined") return "Driver";
    return localStorage.getItem("apex-name") || `Driver${Math.floor(Math.random() * 900 + 100)}`;
  });
  const [isHost, setIsHost] = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const playerIdRef = useRef<string>("");
  if (!playerIdRef.current && typeof window !== "undefined") {
    playerIdRef.current = Math.random().toString(36).slice(2, 10);
  }
  const channelRef = useRef<RealtimeChannel | null>(null);
  const remotesRef = useRef<Map<string, RemotePlayer>>(new Map());
  const startSignalRef = useRef<boolean>(false);

  useEffect(() => {
    try { localStorage.setItem("apex-name", playerName); } catch {}
  }, [playerName]);

  // Sync username from authenticated profile
  useEffect(() => {
    if (profile?.username) setPlayerName(profile.display_name || profile.username);
  }, [profile?.username, profile?.display_name]);

  useEffect(() => { setCareer(loadSave()); }, []);

  // Trigger cinematic intro when entering single-player race (not qualifying, not multi)
  useEffect(() => {
    if (screen !== "racing") return;
    if (sessionMode !== "race") return;
    if (mode === "multi") return;
    introMsRef.current = 5500;
    setIntroOpen(true);
    const t = setTimeout(() => setIntroOpen(false), 5400);
    return () => clearTimeout(t);
  }, [screen, sessionMode, mode]);
  useEffect(() => { setCustomTracks(loadCustomTracks()); }, []);
  useEffect(() => {
    const apply = () => {
      const { drivers, activeId } = loadCustomDrivers();
      setCustomDrivers(drivers);
      if (activeId && drivers.some((d) => d.id === activeId)) setDriverId(activeId);
    };
    apply();
    const onStorage = (e: StorageEvent) => { if (e.key === "af-garage-v1") apply(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", apply);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", apply);
    };
  }, []);

  const allDrivers = useMemo(() => [...customDrivers, ...DRIVERS], [customDrivers]);
  const driver = useMemo(
    () => allDrivers.find((d) => d.id === driverId) ?? allDrivers[0],
    [allDrivers, driverId]
  );
  const allTracks = useMemo(() => [...TRACKS, ...customTracks], [customTracks]);
  const track = useMemo(() => allTracks.find((t) => t.id === trackId) ?? TRACKS[0], [allTracks, trackId]);

  // -------- Multiplayer helpers --------
  function leaveRoom() {
    const ch = channelRef.current;
    if (ch) {
      try { supabase.removeChannel(ch); } catch {}
    }
    channelRef.current = null;
    remotesRef.current.clear();
    setLobbyPlayers([]);
    setIsHost(false);
    setRoomCode("");
    startSignalRef.current = false;
  }

  function joinChannel(code: string, asHost: boolean, initialDriverId: string, initialTrackId: string) {
    const ch = supabase.channel(`race-${code}`, {
      config: { presence: { key: playerIdRef.current }, broadcast: { self: false } },
    });
    channelRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, Array<{ name: string; driverId: string; isHost: boolean; trackId?: string; laps?: 3 | 5 | 10; weatherId?: WeatherId }>>;
      const players: LobbyPlayer[] = [];
      let hostTrackId: string | undefined;
      let hostLaps: 3 | 5 | 10 | undefined;
      let hostWeather: WeatherId | undefined;
      for (const [pid, metas] of Object.entries(state)) {
        const meta = metas[0];
        if (!meta) continue;
        players.push({ id: pid, name: meta.name, driverId: meta.driverId, isHost: !!meta.isHost });
        if (meta.isHost) {
          if (meta.trackId) hostTrackId = meta.trackId;
          if (meta.laps) hostLaps = meta.laps;
          if (meta.weatherId) hostWeather = meta.weatherId;
        }
      }
      players.sort((a, b) => (a.isHost === b.isHost ? a.name.localeCompare(b.name) : a.isHost ? -1 : 1));
      setLobbyPlayers(players);
      if (!asHost && hostTrackId) setTrackId(hostTrackId);
      if (!asHost && hostLaps) setLapsChoice(hostLaps);
      if (!asHost && hostWeather) setWeatherId(hostWeather);
    });

    ch.on("broadcast", { event: "start" }, (payload: any) => {
      const p = payload?.payload as { trackId?: string; weatherId?: WeatherId; laps?: 3 | 5 | 10 } | undefined;
      if (p?.trackId) setTrackId(p.trackId);
      if (p?.weatherId) setWeatherId(p.weatherId);
      if (p?.laps) setLapsChoice(p.laps);
      startSignalRef.current = true;
      setResult(null);
      setScreen("racing");
    });

    ch.on("broadcast", { event: "pos" }, (payload: any) => {
      const p = payload.payload as RemotePlayer;
      if (!p || p.id === playerIdRef.current) return;
      const existing = remotesRef.current.get(p.id);
      remotesRef.current.set(p.id, { ...p, lastUpdate: performance.now() });
      // keep prior driverId/name if missing
      if (existing && !p.name) remotesRef.current.get(p.id)!.name = existing.name;
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({
          name: playerName,
          driverId: initialDriverId,
          isHost: asHost,
          trackId: asHost ? initialTrackId : undefined,
          laps: asHost ? lapsChoice : undefined,
          weatherId: asHost ? weatherId : undefined,
        });
      }
    });
  }

  async function updatePresence(extra: { driverId?: string; trackId?: string; laps?: 3 | 5 | 10; weatherId?: WeatherId }) {
    const ch = channelRef.current;
    if (!ch) return;
    await ch.track({
      name: playerName,
      driverId: extra.driverId ?? driverId,
      isHost,
      trackId: isHost ? (extra.trackId ?? trackId) : undefined,
      laps: isHost ? (extra.laps ?? lapsChoice) : undefined,
      weatherId: isHost ? (extra.weatherId ?? weatherId) : undefined,
    });
  }

  function broadcastStart() {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "start", payload: { trackId, weatherId, laps: lapsChoice } });
    setResult(null);
    setScreen("racing");
  }

  function genCode() {
    return Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  // Cleanup channel when component unmounts
  useEffect(() => {
    return () => { leaveRoom(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============ Three.js race loop ============
  useEffect(() => {
    if (screen !== "racing") return;
    const sessionModeLocal = sessionModeRef.current;
    const isQualifying = sessionModeLocal === "qualifying";
    const mount = mountRef.current!;
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const revertInfiniteGarage = () => {
      try {
        const preT = localStorage.getItem("af-tuning-pre-infinite");
        const preW = localStorage.getItem("af-wallet-pre-infinite");
        if (preT) localStorage.setItem("af-tuning-v1", preT);
        if (preW) localStorage.setItem("af-wallet-v1", preW);
        localStorage.removeItem("af-infinite-credits");
        localStorage.removeItem("af-infinite-oneshot");
        localStorage.removeItem("af-tuning-pre-infinite");
        localStorage.removeItem("af-wallet-pre-infinite");
      } catch {}
    };

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const W = WEATHERS.find((w) => w.id === weatherId) ?? WEATHERS[0];
    renderer.toneMappingExposure = W.exposure;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Weather-driven sky gradient
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 8; skyCanvas.height = 512;
    const sctx0 = skyCanvas.getContext("2d")!;
    const grd = sctx0.createLinearGradient(0, 0, 0, 512);
    const stops = W.sky;
    stops.forEach((c, i) => grd.addColorStop(i / (stops.length - 1), c));
    sctx0.fillStyle = grd;
    sctx0.fillRect(0, 0, 8, 512);
    // Stars (weather-scaled)
    const starCount = Math.floor(110 * W.starDensity);
    for (let i = 0; i < starCount; i++) {
      const y = Math.random() * 200;
      sctx0.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
      sctx0.fillRect(Math.random() * 8, y, 1, 1);
    }
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(2000, 32, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false }),
    );
    scene.add(skyDome);
    scene.fog = new THREE.FogExp2(W.fog.color, W.fog.density);

    const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 3000);

    const hemi = new THREE.HemisphereLight(W.hemi.sky, W.hemi.ground, W.hemi.intensity);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(W.sun.color, W.sun.intensity);
    sun.position.set(W.sun.pos[0], W.sun.pos[1], W.sun.pos[2]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -300;
    sun.shadow.camera.right = 300;
    sun.shadow.camera.top = 300;
    sun.shadow.camera.bottom = -300;
    sun.shadow.camera.far = 800;
    scene.add(sun);
    // Cool rim light
    const rim = new THREE.DirectionalLight(W.rim.color, W.rim.intensity);
    rim.position.set(-200, 120, 200);
    scene.add(rim);

    // Lightning flashes (thunderstorm)
    const lightningLight = new THREE.DirectionalLight(0xeaf6ff, 0);
    lightningLight.position.set(0, 400, 0);
    scene.add(lightningLight);
    let lightningTimer = 2 + Math.random() * 4;
    let lightningFlash = 0;

    // ---------- Futuristic environment (updaters tick each frame) ----------
    const envUpdaters: ((t: number) => void)[] = [];

    // ---------- Track ----------
    const waypoints = track.waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(waypoints, true, "centripetal", 0.5);
    const TRACK_WIDTH = 24;
    const SEGMENTS = 700;

    const trackPositions: number[] = [];
    const trackUVs: number[] = [];
    const trackIndices: number[] = [];
    const kerbLeftPos: number[] = [];
    const kerbRightPos: number[] = [];
    const kerbIdx: number[] = [];
    const wallLeftPos: number[] = [];
    const wallRightPos: number[] = [];
    const wallIdx: number[] = [];
    const centerline: THREE.Vector3[] = [];

    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const p = curve.getPointAt(t);
      const tg = curve.getTangentAt(t).normalize();
      const n = new THREE.Vector3(-tg.z, 0, tg.x);
      centerline.push(p);

      const left = p.clone().addScaledVector(n, TRACK_WIDTH / 2);
      const right = p.clone().addScaledVector(n, -TRACK_WIDTH / 2);
      trackPositions.push(left.x, 0.02, left.z, right.x, 0.02, right.z);
      trackUVs.push(0, t * 100, 1, t * 100);

      kerbLeftPos.push(
        p.x + n.x * (TRACK_WIDTH / 2), 0.03, p.z + n.z * (TRACK_WIDTH / 2),
        p.x + n.x * (TRACK_WIDTH / 2 + 1.2), 0.03, p.z + n.z * (TRACK_WIDTH / 2 + 1.2)
      );
      kerbRightPos.push(
        p.x - n.x * (TRACK_WIDTH / 2), 0.03, p.z - n.z * (TRACK_WIDTH / 2),
        p.x - n.x * (TRACK_WIDTH / 2 + 1.2), 0.03, p.z - n.z * (TRACK_WIDTH / 2 + 1.2)
      );

      // wall ribbons (just outside kerbs, with height)
      const wallOff = TRACK_WIDTH / 2 + 2.5;
      const wallH = 1.5;
      wallLeftPos.push(
        p.x + n.x * wallOff, 0, p.z + n.z * wallOff,
        p.x + n.x * wallOff, wallH, p.z + n.z * wallOff
      );
      wallRightPos.push(
        p.x - n.x * wallOff, 0, p.z - n.z * wallOff,
        p.x - n.x * wallOff, wallH, p.z - n.z * wallOff
      );

      if (i < SEGMENTS) {
        const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
        trackIndices.push(a, c, b, b, c, d);
        kerbIdx.push(a, c, b, b, c, d);
        wallIdx.push(a, c, b, b, c, d);
      }
    }

    const trackGeo = new THREE.BufferGeometry();
    trackGeo.setAttribute("position", new THREE.Float32BufferAttribute(trackPositions, 3));
    trackGeo.setAttribute("uv", new THREE.Float32BufferAttribute(trackUVs, 2));
    trackGeo.setIndex(trackIndices);
    trackGeo.computeVertexNormals();
    const trackMesh = new THREE.Mesh(trackGeo, new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.85 }));
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);

    // Kerb texture
    const kerbCanvas = document.createElement("canvas");
    kerbCanvas.width = 64; kerbCanvas.height = 64;
    const kctx = kerbCanvas.getContext("2d")!;
    for (let i = 0; i < 8; i++) { kctx.fillStyle = i % 2 === 0 ? "#e11d2c" : "#fff"; kctx.fillRect(0, i * 8, 64, 8); }
    const kerbTex = new THREE.CanvasTexture(kerbCanvas);
    kerbTex.wrapS = kerbTex.wrapT = THREE.RepeatWrapping;
    function makeRibbon(pos: number[], idx: number[], mat: THREE.Material) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const uvs: number[] = [];
      for (let i = 0; i < pos.length / 6; i++) uvs.push(0, i / 8, 1, i / 8);
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      scene.add(m);
      return m;
    }
    makeRibbon(kerbLeftPos, kerbIdx, new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7, side: THREE.DoubleSide }));
    makeRibbon(kerbRightPos, kerbIdx, new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7, side: THREE.DoubleSide }));

    // Walls (visible barriers — also used for collision check via centerline distance)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.8, side: THREE.DoubleSide });
    makeRibbon(wallLeftPos, wallIdx, wallMat);
    makeRibbon(wallRightPos, wallIdx, wallMat);
    // Red stripe on top of walls
    const stripeMat = new THREE.LineBasicMaterial({ color: 0xe11d2c });
    const lTop: THREE.Vector3[] = [];
    const rTop: THREE.Vector3[] = [];
    for (let i = 0; i < wallLeftPos.length; i += 6) {
      lTop.push(new THREE.Vector3(wallLeftPos[i + 3], wallLeftPos[i + 4] + 0.02, wallLeftPos[i + 5]));
      rTop.push(new THREE.Vector3(wallRightPos[i + 3], wallRightPos[i + 4] + 0.02, wallRightPos[i + 5]));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(lTop), stripeMat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rTop), stripeMat));

    // Dark reflective ground with neon hex/grid pattern
    const groundCanvas = document.createElement("canvas");
    groundCanvas.width = 512; groundCanvas.height = 512;
    const gctx = groundCanvas.getContext("2d")!;
    gctx.fillStyle = "#0a0612";
    gctx.fillRect(0, 0, 512, 512);
    gctx.strokeStyle = "rgba(34,211,238,0.35)";
    gctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      const p = (i / 16) * 512;
      gctx.beginPath(); gctx.moveTo(p, 0); gctx.lineTo(p, 512); gctx.stroke();
      gctx.beginPath(); gctx.moveTo(0, p); gctx.lineTo(512, p); gctx.stroke();
    }
    gctx.strokeStyle = "rgba(236,72,153,0.18)";
    for (let i = 0; i < 64; i++) {
      gctx.strokeRect(Math.random() * 480, Math.random() * 480, 8 + Math.random() * 24, 8 + Math.random() * 24);
    }
    const groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(40, 40);
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshStandardMaterial({ map: groundTex, color: 0x14091e, roughness: 0.6, metalness: 0.3 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    scene.add(grass);

    // Start/finish line
    const sfCanvas = document.createElement("canvas");
    sfCanvas.width = 128; sfCanvas.height = 16;
    const sctx = sfCanvas.getContext("2d")!;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
      sctx.fillStyle = (x + y) % 2 === 0 ? "#fff" : "#000";
      sctx.fillRect(x * 8, y * 8, 8, 8);
    }
    const sfTex = new THREE.CanvasTexture(sfCanvas);
    const startLine = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 2), new THREE.MeshBasicMaterial({ map: sfTex }));
    startLine.rotation.x = -Math.PI / 2;
    const sfTan = curve.getTangentAt(0).normalize();
    startLine.position.copy(curve.getPointAt(0)).setY(0.05);
    startLine.rotation.z = -Math.atan2(sfTan.z, sfTan.x);
    scene.add(startLine);

    // ===== Pit lane + pit boxes (parallel strip on +n side of start/finish) =====
    const pitN = new THREE.Vector3(-sfTan.z, 0, sfTan.x); // outward normal at start
    const pitForward = new THREE.Vector3(sfTan.x, 0, sfTan.z); // along racing direction
    const pitOffset = TRACK_WIDTH / 2 + 7;
    const pitCenter = curve.getPointAt(0).clone().addScaledVector(pitN, pitOffset);
    const pitHeading = Math.atan2(sfTan.x, sfTan.z); // matches startHeading convention
    // Pit lane asphalt strip
    const pitStripGeo = new THREE.PlaneGeometry(104, 6);
    const pitStrip = new THREE.Mesh(
      pitStripGeo,
      new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.85, metalness: 0.05 }),
    );
    pitStrip.rotation.x = -Math.PI / 2;
    pitStrip.rotation.z = -Math.atan2(sfTan.z, sfTan.x);
    pitStrip.position.copy(pitCenter).setY(0.04);
    pitStrip.receiveShadow = true;
    scene.add(pitStrip);
    // White lane edge stripes
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(104, 0.18),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.rotation.z = -Math.atan2(sfTan.z, sfTan.x);
      stripe.position.copy(pitCenter).addScaledVector(pitN, side * 3).setY(0.05);
      scene.add(stripe);
    }
    // Three pit boxes (white squares) + small garage walls behind
    const garageMat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.7, metalness: 0.3, emissive: 0x22d3ee, emissiveIntensity: 0.05 });
    const pitBoxPositions: THREE.Vector3[] = [];
    for (let i = -1; i <= 1; i++) {
      const center = pitCenter.clone().addScaledVector(pitForward, i * 9);
      pitBoxPositions.push(center.clone());
      // Box outline (white square)
      const box = new THREE.Mesh(
        new THREE.PlaneGeometry(5.4, 5.4),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }),
      );
      box.rotation.x = -Math.PI / 2;
      box.rotation.z = -Math.atan2(sfTan.z, sfTan.x);
      box.position.copy(center).addScaledVector(pitN, 0).setY(0.06);
      scene.add(box);
      // Garage wall behind box
      const wall = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 1.2), garageMat);
      wall.position.copy(center).addScaledVector(pitN, 4.2).setY(2);
      wall.lookAt(center.x, 2, center.z);
      wall.castShadow = true;
      scene.add(wall);
      // Garage number light strip
      const lite = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.15, 0.05),
        new THREE.MeshBasicMaterial({ color: i === 0 ? 0xff6a1a : 0x22d3ee }),
      );
      lite.position.copy(center).addScaledVector(pitN, 3.7).setY(3.4);
      lite.lookAt(center.x, 3.4, center.z);
      scene.add(lite);
    }
    // Player's box = middle one
    const pitBoxPos = pitBoxPositions[1].clone();
    const pitBoxHeading = pitHeading;
    const pitEntryPos = pitCenter.clone().addScaledVector(pitForward, -48);
    const pitExitPos = pitCenter.clone().addScaledVector(pitForward, 48);
    const trackRejoinPos = curve.getPointAt(0.06);

    // Separate pit-lane entry/exit gates so stops visibly use their own lane.
    const gateMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.8 });
    for (const [gatePos, label] of [[pitEntryPos, "PIT IN"], [pitExitPos, "PIT OUT"]] as const) {
      const gate = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.45), gateMat.clone());
      gate.rotation.x = -Math.PI / 2;
      gate.rotation.z = -Math.atan2(sfTan.z, sfTan.x);
      gate.position.copy(gatePos).setY(0.075);
      scene.add(gate);
      const labelCv = document.createElement("canvas");
      labelCv.width = 160; labelCv.height = 48;
      const lctx = labelCv.getContext("2d")!;
      lctx.fillStyle = "rgba(0,0,0,0.72)"; lctx.fillRect(0, 0, 160, 48);
      lctx.fillStyle = "#facc15"; lctx.font = "bold 24px sans-serif"; lctx.textAlign = "center"; lctx.textBaseline = "middle";
      lctx.fillText(label, 80, 25);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(labelCv), transparent: true }));
      sign.position.copy(gatePos).addScaledVector(pitN, 5.2).setY(2.5);
      sign.lookAt(curve.getPointAt(0).x, 2.5, curve.getPointAt(0).z);
      scene.add(sign);
    }

    // ===== Pit crew + jack + spare tires (animated during pit stop) =====
    const pitCrewGroup = new THREE.Group();
    pitCrewGroup.visible = false;
    scene.add(pitCrewGroup);
    // Jack (low slim red box that lifts the car)
    const jack = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.15, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0x550000, roughness: 0.4 }),
    );
    jack.castShadow = true;
    pitCrewGroup.add(jack);
    // 2 crew capsules (orange suits) on each side
    const crewMembers: THREE.Group[] = [];
    const suit = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.5, emissive: 0x331100, emissiveIntensity: 0.5 });
    const helmet = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
      const cm = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, 0.3), suit);
      torso.position.y = 0.65; torso.castShadow = true; cm.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), helmet);
      head.position.y = 1.15; head.castShadow = true; cm.add(head);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.25), suit);
      legs.position.y = 0.3; cm.add(legs);
      pitCrewGroup.add(cm);
      crewMembers.push(cm);
    }
    // Spare tire stacks on each side (4 fresh tires shown swapping in)
    const spareTireMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.95 });
    const spareTires: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.32, 16), spareTireMat);
      t.rotation.z = Math.PI / 2;
      pitCrewGroup.add(t);
      spareTires.push(t);
    }
    // Place the pit crew group at the player's box, oriented along pit lane
    pitCrewGroup.position.copy(pitBoxPos);
    pitCrewGroup.rotation.y = pitBoxHeading;
    // Local placement of jack/crew/tires (relative to car at pit box, facing +Z forward)
    jack.position.set(0, 0.08, 0); // under car center
    crewMembers[0].position.set(-1.4, 0, 1.2);  // front-left
    crewMembers[1].position.set(1.4, 0, 1.2);   // front-right
    crewMembers[2].position.set(-1.4, 0, -1.2); // rear-left
    crewMembers[3].position.set(1.4, 0, -1.2);  // rear-right
    crewMembers.forEach((c) => c.lookAt(0, 0.5, 0));

    // Track pit lift Y for the player car (set by animate loop)
    let pitLiftY = 0;

    // ===== TV / media cars — event-timed (pit stops + podium) =====
    type MediaCar = {
      group: THREE.Group;
      startPos: THREE.Vector3;
      heading: number;
      length: number; // pit-lane parametric travel length
      light: THREE.PointLight;
      flash: THREE.Mesh; // camera flash plate on roof
      blink: number;
    };
    const mediaCue = { active: false, t0: 0, mode: "idle" as "idle" | "pit" | "podium" };
    const mediaCars: MediaCar[] = [];
    {
      const liveryColors = [0xffffff, 0x111111, 0x22d3ee];
      const tag = ["TV", "MEDIA", "LIVE"];
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({
          color: liveryColors[i], roughness: 0.45, metalness: 0.55,
          emissive: i === 2 ? 0x0a1a22 : 0x000000, emissiveIntensity: 0.3,
        });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 4.0), bodyMat);
        body.position.y = 0.7; body.castShadow = true; g.add(body);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 1.9),
          new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.3, metalness: 0.9 }));
        cab.position.set(0, 1.5, -0.2); g.add(cab);
        // Camera rig on roof
        const rig = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.8),
          new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.6 }));
        rig.position.set(0, 2.1, 0.4); g.add(rig);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.5, 12),
          new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.9 }));
        lens.rotation.z = Math.PI / 2; lens.position.set(0, 2.1, 0.95); g.add(lens);
        // "TV" sign on side
        const signCv = document.createElement("canvas");
        signCv.width = 128; signCv.height = 64;
        const sctx2 = signCv.getContext("2d")!;
        sctx2.fillStyle = "#ef1a2a"; sctx2.fillRect(0, 0, 128, 64);
        sctx2.fillStyle = "#fff"; sctx2.font = "bold 36px sans-serif";
        sctx2.textAlign = "center"; sctx2.textBaseline = "middle";
        sctx2.fillText(tag[i], 64, 34);
        const signTex = new THREE.CanvasTexture(signCv);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7),
          new THREE.MeshBasicMaterial({ map: signTex }));
        sign.position.set(0.91, 0.95, 0.2); sign.rotation.y = Math.PI / 2; g.add(sign);
        const sign2 = sign.clone();
        sign2.position.x = -0.91; sign2.rotation.y = -Math.PI / 2; g.add(sign2);
        // Wheels
        const wMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
        const wGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 14);
        [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]].forEach(([x, z]) => {
          const w = new THREE.Mesh(wGeo, wMat);
          w.rotation.z = Math.PI / 2; w.position.set(x, 0.34, z); g.add(w);
        });
        // Camera flash plate
        const flash = new THREE.Mesh(
          new THREE.PlaneGeometry(0.6, 0.3),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
        );
        flash.position.set(0, 2.45, 0.7); flash.rotation.x = -Math.PI / 3; g.add(flash);
        const light = new THREE.PointLight(0x99e6ff, 0, 14, 2);
        light.position.set(0, 3, 0); g.add(light);

        // Parked along pit lane, behind the garage wall
        const startPos = pitCenter.clone()
          .addScaledVector(pitForward, -20 + i * 6)
          .addScaledVector(pitN, 8.5);
        g.position.copy(startPos);
        g.rotation.y = pitHeading;
        g.visible = true;
        scene.add(g);
        mediaCars.push({ group: g, startPos, heading: pitHeading, length: 46, light, flash, blink: Math.random() * 6 });
      }
    }

    // Grandstands (dark with neon edge)
    const standMat = new THREE.MeshStandardMaterial({ color: 0x1a1428, roughness: 0.6, metalness: 0.4, emissive: 0x22d3ee, emissiveIntensity: 0.08 });
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const p = curve.getPointAt(t);
      const tg = curve.getTangentAt(t).normalize();
      const n = new THREE.Vector3(-tg.z, 0, tg.x);
      const pos = p.clone().addScaledVector(n, -(TRACK_WIDTH / 2 + 28));
      const stand = new THREE.Mesh(new THREE.BoxGeometry(36, 9, 6), standMat);
      stand.position.set(pos.x, 4.5, pos.z);
      stand.lookAt(p.x, 4.5, p.z);
      stand.castShadow = true; stand.receiveShadow = true;
      scene.add(stand);
    }

    // ===== Trackside atmosphere: marshals, crowd, photographers, sparks, chopper =====
    {
      const NEON = [0xff1493, 0x22d3ee, 0xa855f7, 0xff6a1a, 0x22c55e, 0xffd166];

      // --- Marshal posts (figure + waving flag) ---
      type Marshal = { flag: THREE.Mesh; arm: THREE.Group; phase: number; mat: THREE.MeshBasicMaterial };
      const marshals: Marshal[] = [];
      const flagGeo = new THREE.PlaneGeometry(1.6, 1.0, 6, 1);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0x331100, emissiveIntensity: 0.4, roughness: 0.6 });
      const headMat = new THREE.MeshStandardMaterial({ color: 0xffe0bd, roughness: 0.7 });
      const MARSHAL_COUNT = 10;
      for (let i = 0; i < MARSHAL_COUNT; i++) {
        const t = (i / MARSHAL_COUNT + 0.015) % 1;
        const p = curve.getPointAt(t);
        const tg = curve.getTangentAt(t).normalize();
        const n = new THREE.Vector3(-tg.z, 0, tg.x);
        const side = i % 2 === 0 ? 1 : -1;
        const pos = p.clone().addScaledVector(n, side * (TRACK_WIDTH / 2 + 4.5));
        const grp = new THREE.Group();
        grp.position.set(pos.x, 0, pos.z);
        grp.lookAt(p.x, 0, p.z);
        // Post platform
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 0.2, 1.6),
          new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0xffcc00, emissiveIntensity: 0.15, roughness: 0.7 }),
        );
        post.position.y = 0.1;
        grp.add(post);
        // Body
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.8, 0.3), bodyMat);
        torso.position.set(-0.3, 0.7, 0); torso.castShadow = true; grp.add(torso);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), headMat);
        head.position.set(-0.3, 1.25, 0); grp.add(head);
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.65, 0.25), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
        legs.position.set(-0.3, 0.32, 0); grp.add(legs);
        // Arm + flag (yellow most of the time; chequered marshal at i==0)
        const arm = new THREE.Group();
        arm.position.set(-0.1, 1.05, 0);
        grp.add(arm);
        const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), bodyMat);
        armMesh.position.set(0.35, 0, 0); armMesh.rotation.z = -Math.PI / 2;
        arm.add(armMesh);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
        pole.position.set(0.7, 0.6, 0);
        arm.add(pole);
        const checker = i === 0;
        const flagMat = new THREE.MeshBasicMaterial({
          color: checker ? 0xffffff : 0xffd60a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.95,
        });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(1.5, 1.0, 0);
        arm.add(flag);
        scene.add(grp);
        marshals.push({ flag, arm, phase: Math.random() * Math.PI * 2, mat: flagMat });
      }
      envUpdaters.push((tt) => {
        for (const m of marshals) {
          // wave flag (wind + arm motion)
          m.arm.rotation.z = Math.sin(tt * 0.004 + m.phase) * 0.35;
          const posAttr = m.flag.geometry.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            posAttr.setZ(i, Math.sin(tt * 0.008 + x * 1.8 + m.phase) * 0.18 * (x + 0.8));
          }
          posAttr.needsUpdate = true;
        }
      });

      // --- Crowd in grandstands (instanced) ---
      const crowdGeo = new THREE.BoxGeometry(0.5, 0.9, 0.4);
      const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: false, roughness: 0.9 });
      const CROWD = 14 * 60; // 14 stands * 60 spectators
      const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, CROWD);
      crowd.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CROWD * 3), 3);
      const cdummy = new THREE.Object3D();
      const ccol = new THREE.Color();
      const crowdBaseY: number[] = [];
      let ci = 0;
      for (let s = 0; s < 14; s++) {
        const tt = s / 14;
        const p = curve.getPointAt(tt);
        const tg = curve.getTangentAt(tt).normalize();
        const n = new THREE.Vector3(-tg.z, 0, tg.x);
        const standPos = p.clone().addScaledVector(n, -(TRACK_WIDTH / 2 + 28));
        const right = new THREE.Vector3(tg.x, 0, tg.z);
        for (let r = 0; r < 6; r++) {
          for (let c2 = 0; c2 < 10; c2++) {
            const ox = (c2 - 4.5) * 3.2;
            const oy = 1.2 + r * 1.3;
            const oz = -2 + r * 0.6;
            const wp = standPos.clone()
              .addScaledVector(right, ox)
              .addScaledVector(n, oz);
            cdummy.position.set(wp.x, oy, wp.z);
            cdummy.rotation.y = Math.atan2(p.x - wp.x, p.z - wp.z);
            cdummy.scale.set(1, 1, 1);
            cdummy.updateMatrix();
            crowd.setMatrixAt(ci, cdummy.matrix);
            ccol.setHex(NEON[(Math.random() * NEON.length) | 0]);
            crowd.setColorAt(ci, ccol);
            crowdBaseY.push(oy);
            ci++;
          }
        }
      }
      crowd.instanceMatrix.needsUpdate = true;
      // Use vertex colors via setColorAt
      crowdMat.onBeforeCompile = () => {};
      scene.add(crowd);
      const tmpMat = new THREE.Matrix4();
      const tmpPos = new THREE.Vector3();
      const tmpQuat = new THREE.Quaternion();
      const tmpScale = new THREE.Vector3();
      envUpdaters.push((tt) => {
        // Subtle bob — update only every other frame to save CPU
        if ((((tt * 0.06) | 0) & 1) === 0) return;
        for (let i = 0; i < CROWD; i += 3) {
          crowd.getMatrixAt(i, tmpMat);
          tmpMat.decompose(tmpPos, tmpQuat, tmpScale);
          tmpPos.y = crowdBaseY[i] + Math.sin(tt * 0.006 + i) * 0.12;
          tmpMat.compose(tmpPos, tmpQuat, tmpScale);
          crowd.setMatrixAt(i, tmpMat);
        }
        crowd.instanceMatrix.needsUpdate = true;
      });

      // --- Camera flashes from crowd ---
      const flashGeo = new THREE.SphereGeometry(0.7, 6, 6);
      const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const FLASHES = 18;
      const flashes: { mesh: THREE.Mesh; t: number; life: number }[] = [];
      for (let i = 0; i < FLASHES; i++) {
        const m = new THREE.Mesh(flashGeo, flashMat.clone());
        const stand = (Math.random() * 14) | 0;
        const tt = stand / 14;
        const p = curve.getPointAt(tt);
        const tg = curve.getTangentAt(tt).normalize();
        const n = new THREE.Vector3(-tg.z, 0, tg.x);
        const pos = p.clone().addScaledVector(n, -(TRACK_WIDTH / 2 + 26));
        m.position.set(pos.x + (Math.random() - 0.5) * 28, 4 + Math.random() * 6, pos.z + (Math.random() - 0.5) * 6);
        scene.add(m);
        flashes.push({ mesh: m, t: Math.random() * 4000, life: 0 });
      }
      envUpdaters.push((tt) => {
        for (const f of flashes) {
          if (tt > f.t) {
            f.life = 120;
            f.t = tt + 600 + Math.random() * 4000;
          }
          const mat = f.mesh.material as THREE.MeshBasicMaterial;
          if (f.life > 0) {
            mat.opacity = f.life / 120;
            f.life -= 16;
          } else {
            mat.opacity = 0;
          }
        }
      });

      // --- Photographers (trackside, with occasional flash) ---
      type Photog = { flash: THREE.Mesh; mat: THREE.MeshBasicMaterial; next: number };
      const photogs: Photog[] = [];
      for (let i = 0; i < 8; i++) {
        const tt = (i / 8 + 0.06) % 1;
        const p = curve.getPointAt(tt);
        const tg = curve.getTangentAt(tt).normalize();
        const n = new THREE.Vector3(-tg.z, 0, tg.x);
        const side = i % 2 === 0 ? 1 : -1;
        const pos = p.clone().addScaledVector(n, side * (TRACK_WIDTH / 2 + 3.2));
        const g = new THREE.Group();
        g.position.set(pos.x, 0, pos.z);
        g.lookAt(p.x, 1, p.z);
        const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), new THREE.MeshStandardMaterial({ color: 0xffe600, emissive: 0x222200 }));
        vest.position.y = 0.7; g.add(vest);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), headMat);
        head.position.y = 1.25; g.add(head);
        const cam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        cam.position.set(0, 1.15, 0.35); g.add(cam);
        const fmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        const flash = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 6), fmat);
        flash.position.set(0, 1.15, 0.7);
        g.add(flash);
        scene.add(g);
        photogs.push({ flash, mat: fmat, next: Math.random() * 5000 });
      }
      envUpdaters.push((tt) => {
        for (const ph of photogs) {
          if (tt > ph.next) {
            ph.mat.opacity = 1;
            ph.next = tt + 1500 + Math.random() * 5000;
          } else {
            ph.mat.opacity *= 0.85;
          }
        }
      });

      // --- Helicopter + spotlight circling overhead ---
      const heliGroup = new THREE.Group();
      const heliBody = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.9, 2.2, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0xff2222, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.6 }),
      );
      heliBody.rotation.z = Math.PI / 2;
      heliGroup.add(heliBody);
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.25, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x111122 }),
      );
      tail.position.set(-1.8, 0, 0);
      heliGroup.add(tail);
      const rotor = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 0.05, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x222222, transparent: true, opacity: 0.6 }),
      );
      rotor.position.y = 0.6;
      heliGroup.add(rotor);
      const heliBeam = new THREE.SpotLight(0xffffff, 2.5, 240, Math.PI / 12, 0.5, 1);
      heliBeam.position.set(0, -0.5, 0);
      const heliTarget = new THREE.Object3D();
      heliGroup.add(heliBeam, heliTarget);
      heliBeam.target = heliTarget;
      heliGroup.position.set(0, 80, 0);
      scene.add(heliGroup);
      envUpdaters.push((tt) => {
        const ang = tt * 0.00025;
        const r = 220;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        heliGroup.position.set(x, 70 + Math.sin(tt * 0.0008) * 4, z);
        heliGroup.rotation.y = -ang + Math.PI / 2;
        rotor.rotation.y += 0.6;
        heliTarget.position.set(-x * 0.2, -70, -z * 0.2);
      });

      // --- Flashing warning lights at hazard zones ---
      const warnGroups: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number }[] = [];
      for (let i = 0; i < 6; i++) {
        const tt = (i / 6 + 0.5 / 6) % 1;
        const p = curve.getPointAt(tt);
        const tg = curve.getTangentAt(tt).normalize();
        const n = new THREE.Vector3(-tg.z, 0, tg.x);
        for (const side of [-1, 1]) {
          const pos = p.clone().addScaledVector(n, side * (TRACK_WIDTH / 2 + 2.5));
          const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9 });
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), mat);
          m.position.set(pos.x, 2.2, pos.z);
          scene.add(m);
          warnGroups.push({ mesh: m, mat, phase: Math.random() * Math.PI * 2 });
        }
      }
      envUpdaters.push((tt) => {
        for (const w of warnGroups) {
          w.mat.opacity = 0.25 + (Math.sin(tt * 0.012 + w.phase) * 0.5 + 0.5) * 0.7;
        }
      });

      // --- Ambient sparks pool (random trackside emissions) ---
      const SPARK_COUNT = 200;
      const sparkGeo = new THREE.BufferGeometry();
      const sparkPos = new Float32Array(SPARK_COUNT * 3);
      const sparkVel = new Float32Array(SPARK_COUNT * 3);
      const sparkLife = new Float32Array(SPARK_COUNT);
      for (let i = 0; i < SPARK_COUNT; i++) sparkLife[i] = 0;
      sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
      const sparkPoints = new THREE.Points(
        sparkGeo,
        new THREE.PointsMaterial({ size: 0.6, color: 0xffcc66, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      scene.add(sparkPoints);
      let sparkCursor = 0;
      let nextSparkBurst = 0;
      envUpdaters.push((tt) => {
        // Emit a burst near a random track location occasionally
        if (tt > nextSparkBurst) {
          nextSparkBurst = tt + 200 + Math.random() * 1200;
          const t0 = Math.random();
          const p = curve.getPointAt(t0);
          const tg = curve.getTangentAt(t0).normalize();
          const n = new THREE.Vector3(-tg.z, 0, tg.x);
          const side = Math.random() < 0.5 ? 1 : -1;
          const ep = p.clone().addScaledVector(n, side * (TRACK_WIDTH / 2 - 0.5));
          for (let k = 0; k < 14; k++) {
            const i = sparkCursor;
            sparkPos[i * 3] = ep.x;
            sparkPos[i * 3 + 1] = 0.4;
            sparkPos[i * 3 + 2] = ep.z;
            sparkVel[i * 3] = (Math.random() - 0.5) * 0.6 - tg.x * 0.4;
            sparkVel[i * 3 + 1] = Math.random() * 0.4 + 0.1;
            sparkVel[i * 3 + 2] = (Math.random() - 0.5) * 0.6 - tg.z * 0.4;
            sparkLife[i] = 1;
            sparkCursor = (sparkCursor + 1) % SPARK_COUNT;
          }
        }
        // Integrate
        for (let i = 0; i < SPARK_COUNT; i++) {
          if (sparkLife[i] <= 0) continue;
          sparkPos[i * 3] += sparkVel[i * 3];
          sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1];
          sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2];
          sparkVel[i * 3 + 1] -= 0.03;
          sparkLife[i] -= 0.04;
          if (sparkPos[i * 3 + 1] < 0.05) sparkLife[i] = 0;
        }
        sparkGeo.attributes.position.needsUpdate = true;
      });

      // --- Trackside banner flags on poles (wind) ---
      type Banner = { mesh: THREE.Mesh; phase: number };
      const banners: Banner[] = [];
      const banGeo = new THREE.PlaneGeometry(2.2, 1.2, 6, 1);
      for (let i = 0; i < 18; i++) {
        const tt = (i / 18) % 1;
        const p = curve.getPointAt(tt);
        const tg = curve.getTangentAt(tt).normalize();
        const n = new THREE.Vector3(-tg.z, 0, tg.x);
        const side = i % 2 === 0 ? 1 : -1;
        const pos = p.clone().addScaledVector(n, side * (TRACK_WIDTH / 2 + 7));
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 6, 6),
          new THREE.MeshStandardMaterial({ color: 0x888888 }),
        );
        pole.position.set(pos.x, 3, pos.z);
        scene.add(pole);
        const col = NEON[i % NEON.length];
        const ban = new THREE.Mesh(
          banGeo,
          new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
        );
        ban.position.set(pos.x + tg.x * 1.2, 5.0, pos.z + tg.z * 1.2);
        ban.lookAt(p.x, 5.0, p.z);
        scene.add(ban);
        banners.push({ mesh: ban, phase: Math.random() * Math.PI * 2 });
      }
      envUpdaters.push((tt) => {
        for (const b of banners) {
          const posAttr = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            posAttr.setZ(i, Math.sin(tt * 0.006 + x * 1.4 + b.phase) * 0.22 * (x + 1.1));
          }
          posAttr.needsUpdate = true;
        }
      });
    }

    // ===== Futuristic city skyline (instanced for perf) =====
    const NEON_COLORS = [0xff1493, 0x22d3ee, 0xa855f7, 0xff6a1a, 0x22c55e, 0xffd166];
    const bldGeo = new THREE.BoxGeometry(1, 1, 1);
    const bldMat = new THREE.MeshStandardMaterial({ color: 0x0c0820, roughness: 0.5, metalness: 0.6 });
    const BLD_COUNT = 220;
    const buildings = new THREE.InstancedMesh(bldGeo, bldMat, BLD_COUNT);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < BLD_COUNT; i++) {
      const ring = i < 140 ? 0 : 1;
      const a = (i / BLD_COUNT) * Math.PI * 2 + Math.random() * 0.2;
      const r = ring === 0 ? 520 + Math.random() * 220 : 880 + Math.random() * 380;
      const w = 18 + Math.random() * 38;
      const d = 18 + Math.random() * 38;
      const h = 40 + Math.random() * (ring === 0 ? 140 : 220);
      dummy.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      buildings.setMatrixAt(i, dummy.matrix);
    }
    scene.add(buildings);

    // Neon "window" lights — instanced points in front of skyline
    const winGeo = new THREE.BufferGeometry();
    const WIN_COUNT = 1800;
    const winPos = new Float32Array(WIN_COUNT * 3);
    const winCol = new Float32Array(WIN_COUNT * 3);
    const c = new THREE.Color();
    for (let i = 0; i < WIN_COUNT; i++) {
      const ring = Math.random() < 0.6 ? 0 : 1;
      const a = Math.random() * Math.PI * 2;
      const r = ring === 0 ? 520 + Math.random() * 240 : 880 + Math.random() * 380;
      const y = 8 + Math.random() * (ring === 0 ? 140 : 220);
      winPos[i * 3] = Math.cos(a) * r;
      winPos[i * 3 + 1] = y;
      winPos[i * 3 + 2] = Math.sin(a) * r;
      c.setHex(NEON_COLORS[(Math.random() * NEON_COLORS.length) | 0]);
      winCol[i * 3] = c.r; winCol[i * 3 + 1] = c.g; winCol[i * 3 + 2] = c.b;
    }
    winGeo.setAttribute("position", new THREE.BufferAttribute(winPos, 3));
    winGeo.setAttribute("color", new THREE.BufferAttribute(winCol, 3));
    const windows = new THREE.Points(
      winGeo,
      new THREE.PointsMaterial({ size: 2.4, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    scene.add(windows);
    envUpdaters.push((t) => {
      const m = windows.material as THREE.PointsMaterial;
      m.opacity = 0.7 + Math.sin(t * 0.003) * 0.2;
    });

    // ===== Distant mountain silhouette =====
    const mtnShape = new THREE.Shape();
    mtnShape.moveTo(-1500, 0);
    let mx = -1500;
    while (mx < 1500) {
      const step = 60 + Math.random() * 120;
      mx += step;
      mtnShape.lineTo(mx, 80 + Math.random() * 220);
      mx += step;
      mtnShape.lineTo(mx, 40 + Math.random() * 160);
    }
    mtnShape.lineTo(1500, 0);
    mtnShape.lineTo(-1500, 0);
    const mtnGeo = new THREE.ShapeGeometry(mtnShape);
    const mtnMat = new THREE.MeshBasicMaterial({ color: 0x140822, fog: false });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(mtnGeo, mtnMat);
      const a = (i / 4) * Math.PI * 2;
      m.position.set(Math.cos(a) * 1700, 0, Math.sin(a) * 1700);
      m.lookAt(0, 0, 0);
      scene.add(m);
    }

    // ===== Holographic billboards around the track =====
    const bbGeo = new THREE.PlaneGeometry(28, 14);
    for (let i = 0; i < 8; i++) {
      const t = (i / 8 + 0.04) % 1;
      const p = curve.getPointAt(t);
      const tg = curve.getTangentAt(t).normalize();
      const n = new THREE.Vector3(-tg.z, 0, tg.x);
      const pos = p.clone().addScaledVector(n, TRACK_WIDTH / 2 + 70);
      const color = NEON_COLORS[i % NEON_COLORS.length];
      const bbMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
      const bb = new THREE.Mesh(bbGeo, bbMat);
      bb.position.set(pos.x, 16, pos.z);
      bb.lookAt(p.x, 16, p.z);
      scene.add(bb);
      // Support pylon
      const pyl = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 16, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x111122, emissive: color, emissiveIntensity: 0.3 }),
      );
      pyl.position.set(pos.x, 8, pos.z);
      scene.add(pyl);
      const phase = Math.random() * Math.PI * 2;
      envUpdaters.push((tt) => {
        bbMat.opacity = 0.35 + (Math.sin(tt * 0.004 + phase) * 0.5 + 0.5) * 0.4;
      });
    }

    // ===== Sci-fi pylons (replacing trees) — neon obelisks =====
    const pylonGeo = new THREE.CylinderGeometry(0.6, 1.2, 14, 6);
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 320 + Math.random() * 160;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const col = NEON_COLORS[(Math.random() * NEON_COLORS.length) | 0];
      const m = new THREE.Mesh(
        pylonGeo,
        new THREE.MeshStandardMaterial({ color: 0x0a0815, emissive: col, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.6 }),
      );
      m.position.set(x, 7, z);
      scene.add(m);
    }

    // ===== Flying drones / hover-cars =====
    type Flyer = { mesh: THREE.Mesh; light: THREE.PointLight; r: number; y: number; speed: number; phase: number };
    const flyers: Flyer[] = [];
    const droneGeo = new THREE.SphereGeometry(1.4, 8, 6);
    for (let i = 0; i < 14; i++) {
      const col = NEON_COLORS[i % NEON_COLORS.length];
      const mat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, emissive: col, emissiveIntensity: 1.4 });
      const m = new THREE.Mesh(droneGeo, mat);
      const trail = new THREE.Mesh(
        new THREE.BoxGeometry(8, 0.3, 0.3),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      m.add(trail);
      trail.position.x = -5;
      const r = 250 + Math.random() * 600;
      const y = 30 + Math.random() * 90;
      const speed = (0.0002 + Math.random() * 0.0006) * (Math.random() < 0.5 ? -1 : 1);
      const phase = Math.random() * Math.PI * 2;
      m.position.set(Math.cos(phase) * r, y, Math.sin(phase) * r);
      scene.add(m);
      flyers.push({ mesh: m, light: null as unknown as THREE.PointLight, r, y, speed, phase });
    }
    envUpdaters.push((tt) => {
      for (const f of flyers) {
        const ang = f.phase + tt * f.speed;
        const x = Math.cos(ang) * f.r;
        const z = Math.sin(ang) * f.r;
        f.mesh.position.set(x, f.y + Math.sin(tt * 0.001 + f.phase) * 2, z);
        // Face direction of travel
        f.mesh.rotation.y = -ang + (f.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    });

    // ===== Atmospheric particles (floating embers / dust) =====
    const partCount = 350;
    const partGeo = new THREE.BufferGeometry();
    const partPos = new Float32Array(partCount * 3);
    for (let i = 0; i < partCount; i++) {
      partPos[i * 3] = (Math.random() - 0.5) * 800;
      partPos[i * 3 + 1] = Math.random() * 80;
      partPos[i * 3 + 2] = (Math.random() - 0.5) * 800;
    }
    partGeo.setAttribute("position", new THREE.BufferAttribute(partPos, 3));
    const particles = new THREE.Points(
      partGeo,
      new THREE.PointsMaterial({ size: 0.6, color: 0xff8a3d, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    scene.add(particles);
    envUpdaters.push((tt) => {
      const arr = partGeo.attributes.position.array as Float32Array;
      for (let i = 1; i < arr.length; i += 3) {
        arr[i] += 0.04;
        if (arr[i] > 90) arr[i] = 0;
      }
      partGeo.attributes.position.needsUpdate = true;
      particles.position.x = camera.position.x;
      particles.position.z = camera.position.z;
      void tt;
    });

    // Cones (trackside obstacles with hitboxes)
    type Cone = { mesh: THREE.Mesh; pos: THREE.Vector3; alive: boolean };
    const cones: Cone[] = [];
    const coneGeo = new THREE.ConeGeometry(0.4, 1.0, 8);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff7a00 });
    for (let i = 0; i < 30; i++) {
      const t = (i / 30 + 0.03) % 1;
      const p = curve.getPointAt(t);
      const tg = curve.getTangentAt(t).normalize();
      const n = new THREE.Vector3(-tg.z, 0, tg.x);
      const side = i % 2 === 0 ? 1 : -1;
      const off = TRACK_WIDTH / 2 - 1.5;
      const cp = p.clone().addScaledVector(n, side * off);
      const m = new THREE.Mesh(coneGeo, coneMat);
      m.position.set(cp.x, 0.5, cp.z);
      m.castShadow = true;
      scene.add(m);
      cones.push({ mesh: m, pos: cp.clone(), alive: true });
    }

    // ---------- Build car helper ----------
    function buildCar(d: Driver): { group: THREE.Group; wheels: THREE.Mesh[]; steeringGroup: THREE.Group } {
      const g = new THREE.Group();
      const primary = new THREE.MeshStandardMaterial({ color: d.primary, roughness: 0.35, metalness: 0.4 });
      const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
      const accent = new THREE.MeshStandardMaterial({ color: d.secondary, roughness: 0.5 });
      const tyre = new THREE.MeshStandardMaterial({ color: 0x191919, roughness: 0.95 });

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 3.2), primary);
      body.position.y = 0.4; body.castShadow = true; g.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 8), primary);
      nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.35, 2.0); nose.castShadow = true; g.add(nose);
      const fWing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.5), black);
      fWing.position.set(0, 0.18, 2.55); g.add(fWing);
      const fWingTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.35), accent);
      fWingTop.position.set(0, 0.28, 2.55); g.add(fWingTop);
      const rWP1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.4), black);
      rWP1.position.set(-0.35, 0.7, -1.7); g.add(rWP1);
      const rWP2 = rWP1.clone(); rWP2.position.x = 0.35; g.add(rWP2);
      const rWing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.45), primary);
      rWing.position.set(0, 1.0, -1.7); rWing.castShadow = true; g.add(rWing);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 16, Math.PI), black);
      halo.rotation.y = Math.PI / 2; halo.position.set(0, 0.85, 0.3); g.add(halo);
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 1.6), primary);
      cover.position.set(0, 0.7, -0.6); cover.castShadow = true; g.add(cover);
      const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.7), black);
      cockpit.position.set(0, 0.7, 0.4); g.add(cockpit);

      const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.32, 20);
      const wheels: THREE.Mesh[] = [];
      const wp: [number, number, number][] = [[-0.75, 0.36, 1.3], [0.75, 0.36, 1.3], [-0.78, 0.36, -1.3], [0.78, 0.36, -1.3]];
      wp.forEach(([x, y, z]) => {
        const w = new THREE.Mesh(wheelGeo, tyre);
        w.rotation.z = Math.PI / 2; w.position.set(x, y, z); w.castShadow = true;
        wheels.push(w); g.add(w);
      });

      // Steering wheel
      const sg = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      sg.add(ring);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      sg.add(bar);
      sg.position.set(0, 0.72, 0.55); sg.rotation.x = -Math.PI / 2.6;
      g.add(sg);

      return { group: g, wheels, steeringGroup: sg };
    }

    // Player car
    const player = buildCar(driver);
    scene.add(player.group);

    // ----- Headlights (when night) -----
    const headlightTarget = new THREE.Object3D();
    headlightTarget.position.set(0, 0, 30);
    player.group.add(headlightTarget);
    const headlights: THREE.SpotLight[] = [];
    if (W.night) {
      for (const x of [-0.35, 0.35]) {
        const sl = new THREE.SpotLight(0xfff4d0, 4.5, 90, Math.PI / 7, 0.55, 1.2);
        sl.position.set(x, 0.45, 2.1);
        sl.target = headlightTarget;
        player.group.add(sl);
        headlights.push(sl);
      }
    }

    // ----- Exhaust glow (point light + emissive plane) -----
    const exhaustLight = new THREE.PointLight(0xff7a1a, 0, 6, 2);
    exhaustLight.position.set(0, 0.45, -1.85);
    player.group.add(exhaustLight);
    const exhaustMat = new THREE.MeshBasicMaterial({
      color: 0xff8a3d, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const exhaustMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), exhaustMat);
    exhaustMesh.position.set(0, 0.42, -1.85);
    player.group.add(exhaustMesh);

    // ----- Rain particles -----
    let rainPoints: THREE.Points | null = null;
    let rainPositions: Float32Array | null = null;
    const RAIN_COUNT = W.rain > 0 ? Math.floor(1500 * Math.min(W.rain, 1.5)) : 0;
    if (RAIN_COUNT > 0) {
      rainPositions = new Float32Array(RAIN_COUNT * 3);
      for (let i = 0; i < RAIN_COUNT; i++) {
        rainPositions[i * 3 + 0] = (Math.random() - 0.5) * 280;
        rainPositions[i * 3 + 1] = Math.random() * 90;
        rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 280;
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
      const rm = new THREE.PointsMaterial({
        color: 0xb8d8ff, size: 0.55, transparent: true,
        opacity: 0.55, depthWrite: false,
      });
      rainPoints = new THREE.Points(rg, rm);
      scene.add(rainPoints);
    }

    // ----- Tire smoke pool -----
    const SMOKE_COUNT = 80;
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0xeeeeee, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const smokeGeo = new THREE.PlaneGeometry(0.9, 0.9);
    type Puff = { mesh: THREE.Mesh; life: number; maxLife: number; rise: number; baseOpacity: number };
    const smokes: Puff[] = [];
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const m = new THREE.Mesh(smokeGeo, smokeMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      smokes.push({ mesh: m, life: 0, maxLife: 1, rise: 0, baseOpacity: 0.75 });
    }
    let smokeIdx = 0;
    function spawnSmoke(
      x: number,
      z: number,
      opts?: { color?: number; life?: number; scale?: number; opacity?: number; rise?: number; y?: number },
    ) {
      const p = smokes[smokeIdx++ % SMOKE_COUNT];
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(opts?.color ?? 0xeeeeee);
      p.mesh.position.set(x, opts?.y ?? 0.05, z);
      p.mesh.scale.setScalar((opts?.scale ?? 1) * (0.6 + Math.random() * 0.4));
      p.life = opts?.life ?? (0.8 + Math.random() * 0.4);
      p.maxLife = p.life;
      p.rise = opts?.rise ?? 0;
      p.baseOpacity = opts?.opacity ?? 0.75;
      p.mesh.visible = true;
      mat.opacity = p.baseOpacity;
    }

    // Wet road darkening overlay (simple ambient tint via fog already; bump exposure dn if wet)
    // Grid placement helper — slot 0 is pole, behind start/finish, staggered L/R
    const totalCurveLen = curve.getLength();
    const GRID_LONG = 7.5;
    const GRID_LAT = 3.2;
    function gridSlot(slot: number) {
      const row = Math.floor(slot / 2);
      const side = slot % 2 === 0 ? 1 : -1;
      const backDist = 5 + row * GRID_LONG;
      let backT = 1 - backDist / totalCurveLen;
      while (backT < 0) backT += 1;
      const p = curve.getPointAt(backT);
      const tg = curve.getTangentAt(backT).normalize();
      const n = new THREE.Vector3(-tg.z, 0, tg.x);
      return {
        x: p.x + n.x * side * GRID_LAT,
        z: p.z + n.z * side * GRID_LAT,
        heading: Math.atan2(tg.x, tg.z),
        t: backT,
      };
    }
    const isMulti = mode === "multi";
    const qGrid = qualifyingGridRef.current;
    let playerSlot = 4;
    if (isMulti) {
      const idx = lobbyPlayers.findIndex((p) => p.id === playerIdRef.current);
      playerSlot = idx >= 0 ? idx : 0;
    } else if (qGrid && qGrid.length) {
      const idx = qGrid.indexOf(driver.id);
      playerSlot = idx >= 0 ? idx : 0;
    }
    const pSlot = gridSlot(playerSlot);
    const startHeading = pSlot.heading;
    player.group.position.set(pSlot.x, 0, pSlot.z);
    player.group.rotation.y = startHeading;

    // AI cars (other drivers)
    type AI = {
      car: ReturnType<typeof buildCar>;
      t: number;
      speed: number;
      lap: number;
      lapStart: number;
      lastLap: number;
      bestLap: number;
      prevT: number;
    };
    const MAX_SPEED_PREVIEW = 78;
    const AI_SPEED = MAX_SPEED_PREVIEW * 0.88; // identical pace for fairness
    const ais: (AI & { driver: Driver; offset: number })[] = [];
    if (!isMulti) {
      // Order AI by qualifying grid (skip player); fall back to default order.
      const ordered = qGrid && qGrid.length
        ? qGrid.map((id) => DRIVERS.find((d) => d.id === id)).filter((d): d is Driver => !!d && d.id !== driver.id)
        : DRIVERS.filter((d) => d.id !== driver.id);
      let next = 0;
      ordered.forEach((d) => {
        if (next === playerSlot) next++;
        const slot = next++;
        const g = gridSlot(slot);
        const c = buildCar(d);
        scene.add(c.group);
        c.group.position.set(g.x, 0, g.z);
        c.group.rotation.y = g.heading;
        const lateral = (slot % 2 === 0 ? 1 : -1) * GRID_LAT;
        ais.push({
          car: c, t: g.t, speed: AI_SPEED, driver: d, offset: lateral,
          lap: 1, lapStart: 0, lastLap: 0, bestLap: 0, prevT: g.t,
        });
      });
    }

    // Remote multiplayer cars (mesh per remote player id)
    const remoteCars = new Map<string, ReturnType<typeof buildCar>>();
    function ensureRemoteCar(p: RemotePlayer) {
      let car = remoteCars.get(p.id);
      if (!car) {
        const drv = DRIVERS.find((d) => d.id === p.driverId) ?? DRIVERS[0];
        car = buildCar(drv);
        scene.add(car.group);
        remoteCars.set(p.id, car);
      }
      return car;
    }
    function disposeRemoteCar(id: string) {
      const car = remoteCars.get(id);
      if (car) {
        scene.remove(car.group);
        remoteCars.delete(id);
      }
    }

    let lastBroadcast = 0;

    // ---------- Input ----------
    const keys: Record<string, boolean> = {};
    let camMode: "chase" | "cockpit" = "chase";
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (k === "c") camMode = camMode === "chase" ? "cockpit" : "chase";
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ---------- Physics state ----------
    let speed = 0;
    let lateralVel = 0; // sideways velocity for slide
    let heading = startHeading;
    const carPos = new THREE.Vector3().copy(player.group.position);
    let steering = 0;
    let lap = 1;
    const totalLaps = isQualifying ? 1 : lapsChoice;
    let lapStart = performance.now();
    let bestLap = 0;
    let prevT = pSlot.t;
    let firstCross = false;
    let raceFinished = false;
    let raceProgress = 0; // total fraction
    // Sector validation — player must hit sectors 1,2,3 in order before
    // the start/finish line counts as a completed lap. Prevents driving
    // backwards across the line for a free lap.
    let nextSector = 1; // 1 -> 0.25, 2 -> 0.5, 3 -> 0.75, 4 -> finish

    // Advanced physics: tire temp/wear, body weight transfer, camera trauma
    let tireTemp = 0.3;       // 0..1 (cold..overheated). Sweet spot ~0.55
    let tireWear = 0;         // 0..1 (fresh..bald)
    let bodyPitch = 0;        // visual pitch (accel/brake)
    let bodyRoll = 0;         // visual roll (cornering)
    let camTrauma = 0;        // adds to shake (impacts, hydroplaning)


    // ---------- Pit-stop session state ----------
    const requiredStops = isQualifying ? 0 : (lapsChoice === 10 ? 2 : lapsChoice === 5 ? 1 : 0);
    setPitStops(0); setPitRequested(false); setPitActive(false); setPitProgress(0); setPitTimeLeft(0); setPitStatus("Clean stop"); setTyreWearHud(0);
    pitStopsRef.current = 0; pitRequestedRef.current = false; pitActiveRef.current = false;
    let pitBoxStart = 0; // ms when current pit stop began
    let pitDurationMs = 5000;
    let pitIssue: "clean" | "slow-gun" | "stuck-tyre" | "unsafe-delay" = "clean";

    function closestT(pos: THREE.Vector3) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < centerline.length; i++) {
        const dx = centerline[i].x - pos.x;
        const dz = centerline[i].z - pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      return { t: best / centerline.length, dist: Math.sqrt(bestD), idx: best };
    }
    function isInPitLane(pos: THREE.Vector3) {
      const dx = pos.x - pitCenter.x;
      const dz = pos.z - pitCenter.z;
      const along = dx * pitForward.x + dz * pitForward.z;
      const side = dx * pitN.x + dz * pitN.z;
      return Math.abs(along) <= 54 && Math.abs(side) <= 4.8;
    }

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Load garage tuning so upgrades actually affect the car on track
    let tune: { engine: number; turbo: number; handling: number; brakes: number; suspension: number; tires: string } =
      { engine: 3, turbo: 2, handling: 4, brakes: 3, suspension: 3, tires: "Sport" };
    try {
      const r = localStorage.getItem("af-tuning-v1");
      if (r) tune = { ...tune, ...JSON.parse(r) };
    } catch {}
    // One-shot infinite-credits easter egg: tuning is loaded above so buffs apply
    // for this race, then the saved garage is restored before rewards are paid.
    try {
      if (!isQualifying && localStorage.getItem("af-infinite-oneshot") === "true") revertInfiniteGarage();
    } catch {}
    const tireGrip =
      tune.tires === "Slick" ? 1.15 :
      tune.tires === "Drift" ? 0.88 :
      tune.tires === "All-Weather" ? 0.95 : 1.0;
    const tireWearRate =
      tune.tires === "Slick" ? 0.018 :
      tune.tires === "Drift" ? 0.013 :
      tune.tires === "All-Weather" ? 0.009 : 0.011;
    const wetGripBonus = tune.tires === "All-Weather" ? 0.1 : tune.tires === "Slick" ? -0.18 : 0;
    // Constants (derived from tuning)
    const MAX_SPEED = 78 + tune.turbo * 2.2;            // turbo → higher top speed
    const ACCEL = 24 + tune.engine * 1.6;               // engine → faster acceleration
    const BRAKE = 60 + tune.brakes * 3.5;               // brakes → harder braking
    const DRAG = 0.7;
    const OFF_TRACK_DRAG = Math.max(4, 8 - tune.suspension * 0.35); // suspension → less penalty off-track
    const STEER_RATE = (2.7 + tune.handling * 0.09) * tireGrip;     // handling + tires → cornering
    const WALL_LIMIT = TRACK_WIDTH / 2 + 2.3;

    let last = performance.now();
    let raf = 0;
    let hudTick = 0;
    const introMs = introMsRef.current;
    introMsRef.current = 0;
    const raceStartAt = last + 3800 + introMs;
    let lastCountdownShown = 99;
    setCountdown(introMs > 0 ? null : 3);

    // Session stats for daily challenges
    let sessTopSpeedKmh = 0;
    let sessDriftDist = 0;

    // Replay capture: sample at ~10 Hz
    const replayFrames: ReplayFrame[] = [];
    let lastReplaySample = 0;

    // Lap tracking for remote multiplayer racers (by player id)
    type RemoteLap = { lap: number; lapStart: number; lastLap: number; bestLap: number; prevProg: number };
    const remoteLap = new Map<string, RemoteLap>();

    // Estimated lap time used for converting progress-gap into seconds
    const lapTimeEst = curveLength(curve) / AI_SPEED;

    const animate = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Animate futuristic environment
      for (let i = 0; i < envUpdaters.length; i++) envUpdaters[i](now);

      // ---------- Pre-race countdown: hold cars on the grid ----------
      const preRace = now < raceStartAt;
      if (preRace) {
        const remaining = Math.ceil((raceStartAt - now) / 1000);
        const shown = remaining > 0 ? remaining : 0; // 0 == GO
        if (shown !== lastCountdownShown && shown <= 3) {
          lastCountdownShown = shown;
          setCountdown(shown);
        }
        // Lock player on grid
        speed = 0;
        lateralVel = 0;
        player.group.position.set(pSlot.x, 0, pSlot.z);
        player.group.rotation.y = startHeading;
        // Lock AI cars on their grid slots
        if (!isMulti) ais.forEach((ai) => {
          ai.car.group.position.set(
            ai.car.group.position.x,
            0,
            ai.car.group.position.z,
          );
        });
        // Camera follow during countdown
        const back = new THREE.Vector3(0, 4.5, -10).applyEuler(new THREE.Euler(0, startHeading, 0));
        const camWorld = player.group.position.clone().add(back);
        camera.position.lerp(camWorld, 0.2);
        camera.lookAt(player.group.position.x + Math.sin(startHeading) * 12, 1.5, player.group.position.z + Math.cos(startHeading) * 12);
        renderer.render(scene, camera);
        lapStart = now;
        raf = requestAnimationFrame(animate);
        return;
      } else if (lastCountdownShown !== -1) {
        lastCountdownShown = -1;
        setCountdown(null);
      }

      const t = touchRef.current;
      const inPit = pitActiveRef.current;

      // ---------- TV/Media car cue driver ----------
      const wantMode: typeof mediaCue.mode = raceFinished ? "podium" : (inPit ? "pit" : "idle");
      if (wantMode !== mediaCue.mode) {
        mediaCue.mode = wantMode;
        mediaCue.active = wantMode !== "idle";
        mediaCue.t0 = now;
      }
      {
        const elapsed = (now - mediaCue.t0) / 1000;
        for (let mi = 0; mi < mediaCars.length; mi++) {
          const mc = mediaCars[mi];
          const stagger = mi * 0.6;
          if (mediaCue.active) {
            // Drive forward along pit lane direction with stagger
            const speedMc = mediaCue.mode === "podium" ? 7 : 5;
            const dist = Math.max(0, (elapsed - stagger)) * speedMc;
            // Loop along pit lane length
            const loop = ((dist % mc.length) + mc.length) % mc.length;
            mc.group.position.set(
              mc.startPos.x + Math.sin(mc.heading) * loop,
              0,
              mc.startPos.z + Math.cos(mc.heading) * loop,
            );
            // Light + occasional camera flash
            mc.light.intensity = 1.4;
            mc.blink += dt;
            const fmat = mc.flash.material as THREE.MeshBasicMaterial;
            if (mc.blink > 0.6 + Math.random() * 0.8) {
              fmat.opacity = 1;
              mc.blink = 0;
            } else {
              fmat.opacity = Math.max(0, fmat.opacity - dt * 3.5);
            }
          } else {
            // Glide back to parked pose
            mc.group.position.lerp(mc.startPos, Math.min(1, dt * 1.2));
            mc.light.intensity = 0;
            (mc.flash.material as THREE.MeshBasicMaterial).opacity = 0;
          }
        }
      }

      const accel = !raceFinished && !inPit && (keys["w"] || keys["arrowup"] || t.accel);
      const brake = !raceFinished && !inPit && (keys["s"] || keys["arrowdown"] || t.brake);
      const leftKey = keys["a"] || keys["arrowleft"];
      const rightKey = keys["d"] || keys["arrowright"];
      const handbrake = !inPit && (keys[" "] || t.handbrake);

      // ---------- Pit stop in progress: hold car in box, run timer ----------
      if (inPit) {
        speed = 0;
        lateralVel = 0;
        const elapsed = now - pitBoxStart;
        const prog = Math.min(1, elapsed / pitDurationMs);
        setPitTimeLeft(Math.max(0, (pitDurationMs - elapsed) / 1000));
        setPitProgress(prog);
        // Drive into pit box, get serviced, drive back out
        pitCrewGroup.visible = prog > 0.12 && prog < 0.92;
        if (prog < 0.18) {
          // Phase 1: glide diagonally into the pit box
          const k = Math.min(1, dt * 4);
          carPos.x += (pitBoxPos.x - carPos.x) * k;
          carPos.z += (pitBoxPos.z - carPos.z) * k;
          // Rotate heading toward pit heading
          let dh = pitBoxHeading - heading;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          heading += dh * Math.min(1, dt * 5);
          pitLiftY = 0;
        } else if (prog < 0.85) {
          // Phase 2: serviced — locked in box, jack lifts car, tires swap
          carPos.x = pitBoxPos.x;
          carPos.z = pitBoxPos.z;
          heading = pitBoxHeading;
          const lp = (prog - 0.18) / 0.67; // 0..1
          let lift = 0;
          if (lp < 0.18) lift = (lp / 0.18) * 0.32;
          else if (lp > 0.82) lift = ((1 - lp) / 0.18) * 0.32;
          else lift = 0.32;
          pitLiftY = lift;
          jack.position.y = 0.08 + lift * 0.6;
          jack.scale.y = 1 + lift * 2.2;
          // Tire swap window: hide old wheels, show fresh tires moving in
          const swapping = lp > 0.35 && lp < 0.65;
          player.wheels.forEach((w) => (w.visible = !swapping));
          // Animate spare tires flying into wheel positions
          const wp: [number, number][] = [[-0.75, 1.3], [0.75, 1.3], [-0.78, -1.3], [0.78, -1.3]];
          spareTires.forEach((tt, i) => {
            const target = wp[i];
            const startX = target[0] * 2.2;
            const t01 = swapping ? (lp - 0.35) / 0.3 : (lp < 0.35 ? 0 : 1);
            tt.visible = lp > 0.3 && lp < 0.7;
            tt.position.set(
              startX + (target[0] - startX) * t01,
              0.36 + lift,
              target[1],
            );
          });
          // Crew bobbing while working
          crewMembers.forEach((c, i) => {
            c.position.y = Math.abs(Math.sin(now * 0.012 + i)) * 0.08;
          });
        } else {
          // Phase 3: jack down, drive out of pit lane back onto track
          pitLiftY = 0;
          jack.position.y = 0.08;
          jack.scale.y = 1;
          spareTires.forEach((tt) => (tt.visible = false));
          player.wheels.forEach((w) => (w.visible = true));
          const exit = prog < 0.95 ? pitExitPos : trackRejoinPos;
          const k = Math.min(1, dt * 4);
          carPos.x += (exit.x - carPos.x) * k;
          carPos.z += (exit.z - carPos.z) * k;
        }
        if (elapsed >= pitDurationMs) {
          pitStopsRef.current += 1;
          setPitStops(pitStopsRef.current);
          pitActiveRef.current = false;
          setPitActive(false);
          setPitProgress(0);
          setPitTimeLeft(0);
          setPitRequested(false);
          pitRequestedRef.current = false;
          speed = 8;
          tireWear = 0;
          setTyreWearHud(0);
          pitLiftY = 0;
          carPos.copy(pitExitPos);
          heading = pitBoxHeading;
          pitCrewGroup.visible = false;
          spareTires.forEach((tt) => (tt.visible = false));
          player.wheels.forEach((w) => (w.visible = true));
        }
      }

      const keySteer = (leftKey ? 1 : 0) - (rightKey ? 1 : 0);
      const steerInput = keySteer !== 0 ? keySteer : -t.steer;
      steering += (steerInput - steering) * Math.min(1, dt * 6);

      // ---------- Standard physics (no weather/tire modifiers) ----------
      const wetness = W.wet ? Math.min(1, W.rain || 0.55) : 0;
      const speedFrac = Math.abs(speed) / MAX_SPEED;
      const hydro = Math.max(0, wetness - 0.65) * Math.max(0, speedFrac - 0.55);
      const slipWear = Math.min(1, Math.abs(lateralVel) / 24 + (handbrake ? 0.45 : 0));
      const wearLoad = speedFrac * 0.45 + Math.abs(steering) * speedFrac * 0.35 + slipWear * 0.35;
      if (!inPit && !preRace && !raceFinished) tireWear = Math.min(1, tireWear + tireWearRate * wearLoad * dt);
      tireTemp += ((accel ? 0.2 : 0) + speedFrac * 0.45 + Math.abs(steering) * 0.15 - tireTemp) * Math.min(1, dt * 0.35);
      const wearGrip = Math.max(0.48, 1 - tireWear * 0.46);
      const weatherGrip = Math.max(0.55, 1 - wetness * 0.2 + wetGripBonus - hydro * 0.35);
      const gripNow = wearGrip * weatherGrip;
      if (accel) speed += ACCEL * (0.82 + gripNow * 0.18) * dt;
      if (brake) speed -= BRAKE * (0.65 + gripNow * 0.35) * dt;
      if (!accel && !brake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), DRAG * dt * 6);
      if (handbrake) speed *= Math.pow(0.05, dt);
      speed = Math.max(-15, Math.min(MAX_SPEED * (0.82 + wearGrip * 0.18), speed));

      const ct = closestT(carPos);
      const inPitLaneNow = isInPitLane(carPos);
      if (!inPit && !inPitLaneNow && ct.dist > TRACK_WIDTH / 2 + 1.5) {
        speed -= Math.sign(speed) * Math.min(Math.abs(speed), OFF_TRACK_DRAG * dt);
      }

      // Heading + lateral slide physics (classic feel)
      const speedFactor = Math.min(1, Math.abs(speed) / 12);
      const turnRate = STEER_RATE * gripNow * speedFactor * (speed >= 0 ? 1 : -1);
      const dHeading = steering * turnRate * dt;
      heading += dHeading;
      const lateralAccel = -dHeading * speed * (0.6 + (1 - gripNow) * 0.45);
      lateralVel += lateralAccel;
      lateralVel *= Math.pow(Math.max(0.04, 0.16 + (1 - gripNow) * 0.55), dt);

      // Move forward + sideways
      const fx = Math.sin(heading), fz = Math.cos(heading);
      const sx = Math.cos(heading), sz = -Math.sin(heading);
      carPos.x += fx * speed * dt + sx * lateralVel * dt;
      carPos.z += fz * speed * dt + sz * lateralVel * dt;

      // Wall collision: push back inside, lose speed
      const ct2 = closestT(carPos);
      if (!inPit && !inPitLaneNow && ct2.dist > WALL_LIMIT) {
        const center = centerline[ct2.idx];
        const dx = carPos.x - center.x;
        const dz = carPos.z - center.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const nx = dx / len, nz = dz / len;
        carPos.x = center.x + nx * WALL_LIMIT;
        carPos.z = center.z + nz * WALL_LIMIT;
        const impact = Math.min(1, Math.abs(speed) / MAX_SPEED);
        speed *= 0.88 - impact * 0.05;
        lateralVel *= -0.25;
        // Sparks while scraping
        for (let s = 0; s < 4; s++) {
          spawnSmoke(carPos.x + (Math.random() - 0.5) * 0.6, carPos.z + (Math.random() - 0.5) * 0.6, {
            color: 0xffb648, life: 0.25 + Math.random() * 0.2, scale: 0.35, opacity: 0.9, y: 0.3,
          });
        }
      }

      // Cone collisions (hitboxes)
      for (const c of cones) {
        if (!c.alive) continue;
        const dx = carPos.x - c.pos.x;
        const dz = carPos.z - c.pos.z;
        if (dx * dx + dz * dz < 1.2 * 1.2) {
          c.alive = false;
          c.mesh.rotation.x = Math.PI / 3;
          c.mesh.position.y = 0.2;
          speed *= 0.9;
        }
      }

      player.group.position.set(carPos.x, pitLiftY, carPos.z);
      // Flat car orientation (classic feel — no weight transfer)
      bodyPitch = 0;
      bodyRoll = 0;
      player.group.rotation.set(0, heading, 0);

      const wheelSpin = (speed * dt) / 0.36;
      player.wheels.forEach((w) => (w.rotation.x += wheelSpin));
      player.wheels[0].rotation.y = steering * 0.4;
      player.wheels[1].rotation.y = steering * 0.4;
      player.steeringGroup.rotation.z = -steering * 0.9;

      // Sector detection — count forward crossings of 0.25 / 0.5 / 0.75
      // in strict order. dt small means it's a real forward cross, not a wrap.
      if (nextSector <= 3) {
        const thr = nextSector * 0.25;
        if (prevT < thr && ct2.t >= thr && (ct2.t - prevT) < 0.5) {
          nextSector++;
        }
      }

      // Lap detection — first crossing of start line just arms the timer.
      // Subsequent crossings only count as a completed lap when all 4 sectors
      // were hit in order (prevents reverse-into-finish-line exploit).
      if (prevT > 0.9 && ct2.t < 0.1) {
        if (!firstCross) {
          firstCross = true;
          lapStart = now;
          nextSector = 1;
        } else if (nextSector > 3) {
          const lapTime = (now - lapStart) / 1000;
          if (bestLap === 0 || lapTime < bestLap) bestLap = lapTime;
          lap++;
          lapStart = now;
          nextSector = 1;
          if (lap > totalLaps && !raceFinished) {
            raceFinished = true;
          }
          // Begin a pit stop if requested and the race isn't over yet
          if (!isQualifying && pitRequestedRef.current && !raceFinished && !pitActiveRef.current) {
            const roll = Math.random();
            pitIssue = roll < 0.62 ? "clean" : roll < 0.8 ? "slow-gun" : roll < 0.93 ? "stuck-tyre" : "unsafe-delay";
            pitDurationMs = 4300 + Math.round(tireWear * 1200) + (
              pitIssue === "slow-gun" ? 1800 : pitIssue === "stuck-tyre" ? 3200 : pitIssue === "unsafe-delay" ? 4500 : 0
            );
            setPitStatus(
              pitIssue === "slow-gun" ? "Wheel gun delay" :
              pitIssue === "stuck-tyre" ? "Stuck tyre" :
              pitIssue === "unsafe-delay" ? "Held for traffic" : "Clean stop"
            );
            pitActiveRef.current = true;
            setPitActive(true);
            carPos.copy(pitEntryPos);
            heading = pitBoxHeading;
            speed = 6;
            pitBoxStart = now;
            setPitProgress(0);
            setPitTimeLeft(pitDurationMs / 1000);
          }
        }
        // If sectors weren't all hit, the line crossing is ignored — no lap.
      }
      prevT = ct2.t;
      raceProgress = (lap - 1) + ct2.t;

      // ---------- AI ----------
      const cLen = curveLength(curve);
      if (!isMulti) ais.forEach((ai) => {
        if (ai.lapStart === 0) ai.lapStart = raceStartAt;
        ai.t += (ai.speed * dt) / cLen;
        if (ai.t >= 1) ai.t -= 1;
        // Lap wrap detection (t crosses 1->0)
        if (ai.prevT > 0.9 && ai.t < 0.1) {
          const lt = (now - ai.lapStart) / 1000;
          ai.lastLap = lt;
          if (ai.bestLap === 0 || lt < ai.bestLap) ai.bestLap = lt;
          ai.lapStart = now;
          ai.lap++;
        }
        ai.prevT = ai.t;
        const ap = curve.getPointAt(ai.t);
        const atan = curve.getTangentAt(ai.t).normalize();
        const an = new THREE.Vector3(-atan.z, 0, atan.x);
        const px = ap.x + an.x * ai.offset;
        const pz = ap.z + an.z * ai.offset;
        ai.car.group.position.set(px, 0, pz);
        ai.car.group.rotation.y = Math.atan2(atan.x, atan.z);
        ai.car.wheels.forEach((w) => (w.rotation.x += (ai.speed * dt) / 0.36));

        // Hitbox vs player car
        const ddx = carPos.x - px;
        const ddz = carPos.z - pz;
        const distSq = ddx * ddx + ddz * ddz;
        if (distSq < 2.5 * 2.5) {
          const len = Math.sqrt(distSq) || 1;
          const nx = ddx / len, nz = ddz / len;
          const overlap = 2.5 - len;
          carPos.x += nx * overlap;
          carPos.z += nz * overlap;
          speed *= 0.78;
          lateralVel += (nx * Math.cos(heading) - nz * Math.sin(heading)) * 1.5;
          ai.speed = AI_SPEED * 0.85;
        } else {
          ai.speed += (AI_SPEED - ai.speed) * Math.min(1, dt * 0.5);
        }
      });

      // ---------- Remote multiplayer cars ----------
      if (isMulti) {
        const nowMs = performance.now();
        const stale: string[] = [];
        remotesRef.current.forEach((rp, id) => {
          if (nowMs - rp.lastUpdate > 8000) { stale.push(id); return; }
          const car = ensureRemoteCar(rp);
          // Lap tracking from incoming progress
          let rl = remoteLap.get(id);
          if (!rl) {
            rl = { lap: 1, lapStart: raceStartAt, lastLap: 0, bestLap: 0, prevProg: rp.progress };
            remoteLap.set(id, rl);
          }
          const newLap = Math.floor(rp.progress) + 1;
          if (newLap > rl.lap) {
            const lt = (now - rl.lapStart) / 1000;
            if (lt > 1) { // sanity
              rl.lastLap = lt;
              if (rl.bestLap === 0 || lt < rl.bestLap) rl.bestLap = lt;
            }
            rl.lapStart = now;
            rl.lap = newLap;
          }
          rl.prevProg = rp.progress;
          // Smooth interpolation toward last received pose
          car.group.position.x += (rp.x - car.group.position.x) * Math.min(1, dt * 12);
          car.group.position.z += (rp.z - car.group.position.z) * Math.min(1, dt * 12);
          // shortest-arc heading lerp
          let dh = rp.heading - car.group.rotation.y;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          car.group.rotation.y += dh * Math.min(1, dt * 12);
          car.wheels.forEach((w) => (w.rotation.x += (rp.speed * dt) / 0.36));

          // Hitbox vs player
          const ddx = carPos.x - car.group.position.x;
          const ddz = carPos.z - car.group.position.z;
          const dSq = ddx * ddx + ddz * ddz;
          if (dSq < 2.5 * 2.5) {
            const len = Math.sqrt(dSq) || 1;
            const nx = ddx / len, nz = ddz / len;
            const overlap = 2.5 - len;
            carPos.x += nx * overlap;
            carPos.z += nz * overlap;
            speed *= 0.78;
          }
        });
        stale.forEach((id) => { remotesRef.current.delete(id); disposeRemoteCar(id); });

        // Broadcast our pose ~15 Hz
        if (channelRef.current && now - lastBroadcast > 65) {
          lastBroadcast = now;
          channelRef.current.send({
            type: "broadcast",
            event: "pos",
            payload: {
              id: playerIdRef.current,
              name: playerName,
              driverId: driver.id,
              x: carPos.x,
              z: carPos.z,
              heading,
              speed,
              progress: raceProgress,
              lastUpdate: 0,
            } as RemotePlayer,
          });
        }
      }

      // Position calc — sort all cars by total progress
      let position = 1;
      const playerLapFrac = raceProgress % 1;
      const effectiveProgress = raceProgress;
      if (isMulti) {
        remotesRef.current.forEach((rp) => {
          if (rp.progress > effectiveProgress) position++;
        });
      } else {
        ais.forEach((ai) => {
          const aiLapEst = Math.floor(raceProgress) + (ai.t < playerLapFrac - 0.5 ? 1 : ai.t > playerLapFrac + 0.5 ? -1 : 0);
          const aiProg = aiLapEst + ai.t;
          if (aiProg > effectiveProgress) position++;
        });
      }

      // ---------- Camera ----------
      let camWorld: THREE.Vector3;
      let lookY = 1.0;
      if (camMode === "chase") {
        // Chase cam: behind & above car
        const back = new THREE.Vector3(0, 4.5, -10).applyEuler(new THREE.Euler(0, heading, 0));
        camWorld = player.group.position.clone().add(back);
        lookY = 1.5;
      } else {
        const off = new THREE.Vector3(0, 1.05, -0.4).applyEuler(new THREE.Euler(0, heading, 0));
        camWorld = player.group.position.clone().add(off);
      }
      // Subtle camera shake from speed only (classic feel)
      camTrauma = 0;
      const shake = (Math.abs(speed) / MAX_SPEED) * 0.04;
      camWorld.x += (Math.random() - 0.5) * shake;
      camWorld.y += (Math.random() - 0.5) * shake * 0.7;
      camWorld.z += (Math.random() - 0.5) * shake * 0.4;
      camera.position.lerp(camWorld, camMode === "chase" ? 0.15 : 0.5);
      const lookTarget = new THREE.Vector3(
        player.group.position.x + Math.sin(heading) * 12,
        lookY,
        player.group.position.z + Math.cos(heading) * 12
      );
      camera.lookAt(lookTarget);
      const targetFov = (camMode === "chase" ? 65 : 72) + (Math.abs(speed) / MAX_SPEED) * 16;
      camera.fov += (targetFov - camera.fov) * 0.08;
      camera.updateProjectionMatrix();

      // ---------- Weather + visual FX ----------
      // Rain — fall + follow camera
      if (rainPoints && rainPositions) {
        const cx = camera.position.x, cz = camera.position.z;
        const fall = 110 * dt * (W.rain > 1 ? 1.4 : 1);
        for (let i = 0; i < rainPositions.length; i += 3) {
          rainPositions[i + 1] -= fall;
          if (rainPositions[i + 1] < 0) {
            rainPositions[i + 1] = 80 + Math.random() * 20;
            rainPositions[i + 0] = cx + (Math.random() - 0.5) * 240;
            rainPositions[i + 2] = cz + (Math.random() - 0.5) * 240;
          }
        }
        (rainPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }

      // Lightning
      if (W.lightning) {
        lightningTimer -= dt;
        if (lightningTimer <= 0) {
          lightningFlash = 1;
          lightningTimer = 3 + Math.random() * 6;
        }
        if (lightningFlash > 0) {
          lightningFlash = Math.max(0, lightningFlash - dt * 5);
          lightningLight.intensity = lightningFlash * 4;
        }
      }

      // Exhaust glow scales with throttle + speed
      const accelInput = (keys["w"] || keys["arrowup"] || touchRef.current.accel) ? 1 : 0;
      const exhaustT = accelInput * Math.min(1, Math.abs(speed) / MAX_SPEED + 0.2);
      exhaustLight.intensity += (exhaustT * 5 - exhaustLight.intensity) * Math.min(1, dt * 8);
      exhaustMat.opacity += (exhaustT * 0.85 - exhaustMat.opacity) * Math.min(1, dt * 8);
      exhaustMesh.scale.setScalar(0.7 + exhaustT * 0.6 + Math.random() * 0.05);

      // Tire smoke when drifting / handbraking at speed
      const drifting =
        (Math.abs(lateralVel) > 5 || keys[" "] || touchRef.current.handbrake) &&
        Math.abs(speed) > 12;
      if (drifting) {
        // spawn at rear wheels
        const back = new THREE.Vector3(0, 0, -1.3).applyEuler(new THREE.Euler(0, heading, 0));
        const sideR = new THREE.Vector3(0.8, 0, 0).applyEuler(new THREE.Euler(0, heading, 0));
        spawnSmoke(carPos.x + back.x + sideR.x, carPos.z + back.z + sideR.z);
        spawnSmoke(carPos.x + back.x - sideR.x, carPos.z + back.z - sideR.z);
        // Track drift distance in meters (m/s * dt) — physics speed is roughly m/s scale
        sessDriftDist += Math.abs(speed) * dt;
      }
      // Water spray on wet track at speed (and extra during hydroplaning)
      if (wetness > 0.15 && Math.abs(speed) > 14) {
        const back = new THREE.Vector3(0, 0, -1.1).applyEuler(new THREE.Euler(0, heading, 0));
        const sideR = new THREE.Vector3(0.8, 0, 0).applyEuler(new THREE.Euler(0, heading, 0));
        const sprayCount = hydro > 0 ? 3 : 1;
        for (let s = 0; s < sprayCount; s++) {
          spawnSmoke(carPos.x + back.x + sideR.x, carPos.z + back.z + sideR.z, {
            color: 0xbcd0e0, life: 0.45, scale: 0.7, opacity: 0.55, rise: 1.8, y: 0.2,
          });
          spawnSmoke(carPos.x + back.x - sideR.x, carPos.z + back.z - sideR.z, {
            color: 0xbcd0e0, life: 0.45, scale: 0.7, opacity: 0.55, rise: 1.8, y: 0.2,
          });
        }
      }
      for (const p of smokes) {
        if (!p.mesh.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.mesh.visible = false; continue; }
        const k = p.life / p.maxLife;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.baseOpacity * k;
        p.mesh.scale.x += dt * 1.2;
        p.mesh.scale.y += dt * 1.2;
        if (p.rise) p.mesh.position.y += p.rise * dt * k;
      }

      // HUD
      hudTick++;
      if (hudTick % 5 === 0) {
        const kmh = Math.abs(speed) * 3.6 * 1.6;
        const gear = Math.max(1, Math.min(8, Math.floor((Math.abs(speed) / MAX_SPEED) * 8) + 1));
        if (kmh > sessTopSpeedKmh) sessTopSpeedKmh = kmh;
        setHud({
          speed: Math.round(kmh),
          gear,
          lap: Math.min(lap, totalLaps),
          totalLaps,
          lapTime: (now - lapStart) / 1000,
          bestLap,
          position,
        });

        // -------- Live timing tower --------
        const toHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
        type Row = {
          id: string; name: string; team?: string; color: string; number?: number;
          progress: number; lap: number; lastLap?: number; bestLap?: number; isPlayer: boolean;
        };
        const rows: Row[] = [];
        rows.push({
          id: driver.id, name: playerName || driver.name, team: driver.team,
          color: toHex(driver.primary), number: driver.number,
          progress: raceProgress,
          lap: Math.min(lap, totalLaps),
          lastLap: undefined, bestLap: bestLap > 0 ? bestLap : undefined,
          isPlayer: true,
        });
        if (isMulti) {
          remotesRef.current.forEach((rp, id) => {
            const drv = DRIVERS.find((d) => d.id === rp.driverId) ?? DRIVERS[0];
            const rl = remoteLap.get(id);
            rows.push({
              id: `r:${id}`, name: rp.name || drv.name, team: drv.team,
              color: toHex(drv.primary), number: drv.number,
              progress: rp.progress,
              lap: Math.min(totalLaps, rl?.lap ?? 1),
              lastLap: rl && rl.lastLap > 0 ? rl.lastLap : undefined,
              bestLap: rl && rl.bestLap > 0 ? rl.bestLap : undefined,
              isPlayer: false,
            });
          });
        } else {
          ais.forEach((ai) => {
            const aiLapEst = Math.floor(raceProgress) + (ai.t < playerLapFrac - 0.5 ? 1 : ai.t > playerLapFrac + 0.5 ? -1 : 0);
            rows.push({
              id: ai.driver.id, name: ai.driver.name, team: ai.driver.team,
              color: toHex(ai.driver.primary), number: ai.driver.number,
              progress: aiLapEst + ai.t,
              lap: Math.min(totalLaps, ai.lap),
              lastLap: ai.lastLap > 0 ? ai.lastLap : undefined,
              bestLap: ai.bestLap > 0 ? ai.bestLap : undefined,
              isPlayer: false,
            });
          });
        }
        if (isQualifying) {
          // Sort by best lap ascending (no lap = bottom)
          rows.sort((a, b) => (a.bestLap ?? 9999) - (b.bestLap ?? 9999));
        } else {
          rows.sort((a, b) => b.progress - a.progress);
        }
        const leaderProg = rows[0]?.progress ?? 0;
        const poleLap = isQualifying ? rows[0]?.bestLap : undefined;
        // Fastest lap across the field
        let fl = 0;
        rows.forEach((r) => { if (r.bestLap && (fl === 0 || r.bestLap < fl)) fl = r.bestLap; });
        const entries: LiveEntry[] = rows.map((r, i) => {
          let gap = "—";
          if (isQualifying) {
            if (r.bestLap === undefined) gap = "NO TIME";
            else if (i > 0 && poleLap) gap = `+${(r.bestLap - poleLap).toFixed(3)}`;
          } else {
            const dProg = leaderProg - r.progress;
            if (i > 0) {
              const lapsBehind = Math.floor(dProg);
              if (lapsBehind >= 1) gap = `+${lapsBehind} LAP`;
              else gap = `+${(dProg * lapTimeEst).toFixed(2)}`;
            }
          }
          return {
            id: r.id, name: r.name, team: r.team, color: r.color, number: r.number,
            position: i + 1, lap: r.lap, lastLap: r.lastLap, bestLap: r.bestLap,
            gap, isPlayer: r.isPlayer,
            isFastestLap: !!(fl > 0 && r.bestLap === fl),
          };
        });
        setLiveBoard(entries);
        setFastestLapTime(fl);
      }

      // Replay sampling (~10 Hz, capped)
      if (now - lastReplaySample > 100 && replayFrames.length < 4000) {
        lastReplaySample = now;
        replayFrames.push({ t: now, x: carPos.x, z: carPos.z, h: heading, speed });
      }

      renderer.render(scene, camera);

      if (isQualifying) {
        // Qualifying ends when player has set a lap AND every AI has set a lap.
        const playerDone = bestLap > 0;
        const aisDone = isMulti ? true : ais.every((a) => a.bestLap > 0);
        if (playerDone && aisDone) {
          // Build starting grid: fastest lap first.
          const standings: { id: string; t: number }[] = [
            { id: driver.id, t: bestLap },
            ...ais.map((a) => ({ id: a.driver.id, t: a.bestLap })),
          ];
          standings.sort((a, b) => a.t - b.t);
          setQualifyingGrid(standings.map((s) => s.id));
          setSessionMode("race"); // triggers effect re-run for the actual race
          return;
        }
        raf = requestAnimationFrame(animate);
        return;
      }

      if (raceFinished) {
        const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
        // Pit-stop penalty: +5s per missed mandatory stop, applied to position
        const missed = Math.max(0, requiredStops - pitStopsRef.current);
        const PIT_PENALTY_S = 5;
        const penaltyS = missed * PIT_PENALTY_S;
        let adjustedPosition = position;
        if (penaltyS > 0) {
          // Re-score by subtracting penalty-equivalent progress from player
          const penaltyProg = penaltyS / lapTimeEst;
          const playerProgPenalised = raceProgress - penaltyProg;
          let dropped = 0;
          if (!isMulti) {
            ais.forEach((ai) => {
              const aiLapEst = Math.floor(raceProgress) + (ai.t < playerLapFrac - 0.5 ? 1 : ai.t > playerLapFrac + 0.5 ? -1 : 0);
              if ((aiLapEst + ai.t) > playerProgPenalised && (aiLapEst + ai.t) <= raceProgress) dropped += 1;
            });
          }
          adjustedPosition = Math.min(10, position + dropped);
        }
        const points = POINTS[adjustedPosition - 1] ?? 0;
        // Credit reward (used in /garage). Base by finishing position, bonus for podium/win.
        const POS_CREDITS = [1200, 900, 700, 550, 450, 400, 350, 300, 250, 200];
        const baseCredits = POS_CREDITS[adjustedPosition - 1] ?? 150;
        const winBonus = adjustedPosition === 1 ? 500 : adjustedPosition <= 3 ? 200 : 0;
        const creditsEarned = Math.max(50, Math.round(baseCredits + winBonus));
        try {
          const raw = localStorage.getItem("af-wallet-v1");
          const cur = raw ? JSON.parse(raw) : { credits: 0 };
          const next = { ...cur, credits: (Number(cur.credits) || 0) + creditsEarned };
          localStorage.setItem("af-wallet-v1", JSON.stringify(next));
        } catch {}
        // Record daily-challenge progress for this race
        const finalRaceTime = Math.max(0, (now - raceStartAt) / 1000) + penaltyS;
        try {
          recordRace({
            won: adjustedPosition === 1,
            topSpeedKmh: sessTopSpeedKmh,
            raceTimeSec: finalRaceTime,
            driftDistanceM: sessDriftDist,
          });
        } catch {}
        // Save replay
        lastReplayFramesRef.current = replayFrames.slice();
        // Submit to global leaderboard (best lap > 0 means at least one lap completed)
        if (bestLap > 0) {
          submitLeaderboard({
            player_name: playerName,
            driver_id: driver.id,
            track_id: track.id,
            weather_id: weatherId,
            best_lap: Number(bestLap.toFixed(3)),
            race_time_sec: Number(finalRaceTime.toFixed(2)),
            position: adjustedPosition,
            won: adjustedPosition === 1,
          }).catch(() => {});
        }
        // Compute final order of every car on the grid
        const standingsList: { id: string; prog: number }[] = [
          { id: driver.id, prog: raceProgress + 0.0001 },
        ];
        if (isMulti) {
          remotesRef.current.forEach((rp) => {
            standingsList.push({ id: rp.driverId, prog: rp.progress });
          });
        } else {
          ais.forEach((ai) => {
            const aiLapEst = Math.floor(raceProgress) + (ai.t < playerLapFrac - 0.5 ? 1 : ai.t > playerLapFrac + 0.5 ? -1 : 0);
            standingsList.push({ id: ai.driver.id, prog: aiLapEst + ai.t });
          });
        }
        standingsList.sort((a, b) => b.prog - a.prog);
        const order = standingsList.map((s) => s.id);
        setResult({ position: adjustedPosition, bestLap, points, credits: creditsEarned });
        {
          const toHex2 = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
          const lapsByDriver = new Map<string, number>();
          lapsByDriver.set(driver.id, bestLap);
          if (isMulti) {
            remotesRef.current.forEach((rp, id) => {
              const rl = remoteLap.get(id);
              if (rl && rl.bestLap > 0) lapsByDriver.set(rp.driverId, rl.bestLap);
            });
          } else {
            ais.forEach((ai) => { if (ai.bestLap > 0) lapsByDriver.set(ai.driver.id, ai.bestLap); });
          }
          let flId: string | undefined;
          let flTime = Infinity;
          lapsByDriver.forEach((t, id) => { if (t > 0 && t < flTime) { flTime = t; flId = id; } });
          setFastestLapId(flId);
          const nameForRemote = new Map<string, string>();
          if (isMulti) remotesRef.current.forEach((rp) => nameForRemote.set(rp.driverId, rp.name || ""));
          const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
          const cls: PodiumEntry[] = order.map((id, i) => {
            const drv = DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];
            const isP = id === driver.id;
            const remoteName = nameForRemote.get(id);
            return {
              id,
              name: isP ? (playerName || drv.name) : (remoteName || drv.name),
              team: drv.team,
              color: toHex2(drv.primary),
              number: drv.number,
              bestLap: lapsByDriver.get(id),
              points: POINTS_TABLE[i] ?? 0,
              isPlayer: isP,
            };
          });
          setClassification(cls);
        }
        if (mode === "career") {
          const cur: CareerSave = loadSave() ?? {
            driverId: driver.id, points: 0, completed: {}, standings: {}, rounds: [],
          };
          cur.driverId = driver.id;
          if (!cur.standings) cur.standings = {};
          if (!cur.rounds) cur.rounds = [];
          const prev = cur.completed[track.id];
          const newBest = prev && prev.bestLap > 0 && prev.bestLap < bestLap ? prev.bestLap : bestLap;
          cur.completed[track.id] = { bestLap: newBest, position: adjustedPosition, points };
          order.forEach((id, i) => {
            const pts = POINTS[i] ?? 0;
            cur.standings[id] = (cur.standings[id] ?? 0) + pts;
          });
          cur.rounds.push({ trackId: track.id, order });
          cur.points = cur.standings[driver.id] ?? 0;
          writeSave(cur);
          setCareer(cur);
        }
        setScreen("result");
        return;
      }

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, sessionMode]);

  // ---------------- Render ----------------
  return (
    <div className="relative w-full overflow-hidden bg-black touch-none" style={{ height: "100dvh" }}>
      <div ref={mountRef} className="absolute inset-0" />

      {screen === "menu" && (
        <MainMenu
          career={career}
          onQuick={() => { setMode("quick"); setScreen("driver"); }}
          onCareer={() => { setMode("career"); setScreen("driver"); }}
          onMulti={() => { setMode("multi"); setScreen("multi"); }}
          onDaily={() => setShowDaily(true)}
          onLeaderboard={() => setShowLeaderboard(true)}
          onReset={() => { try { localStorage.removeItem(SAVE_KEY); } catch {}; setCareer(null); }}
        />
      )}

      {showDaily && <DailyHub onClose={() => setShowDaily(false)} />}
      {showLeaderboard && <Leaderboard onClose={() => setShowLeaderboard(false)} tracks={TRACKS.map((t) => ({ id: t.id, name: t.name }))} />}
      {showReplay && replayData && <ReplayViewer data={replayData} onClose={() => setShowReplay(false)} />}
      {showFriends && <FriendsPanel onClose={() => setShowFriends(false)} />}

      {/* Top-right account/friends bar (visible on menu) */}
      {screen === "menu" && (
        <div className="absolute top-3 right-3 z-40 flex items-center gap-2">
          {user ? (
            <>
              <button
                onClick={() => setShowFriends(true)}
                className="flex items-center gap-1.5 bg-black/60 backdrop-blur border border-white/15 px-3 py-1.5 text-xs uppercase tracking-widest text-white hover:border-red-500"
              >
                <Users size={14}/> Friends
              </button>
              <div className="bg-black/60 backdrop-blur border border-white/15 px-3 py-1.5 text-xs text-white/80">
                @{profile?.username ?? "racer"}
              </div>
              <button
                onClick={() => signOut()}
                className="bg-black/60 backdrop-blur border border-white/15 px-3 py-1.5 text-xs uppercase tracking-widest text-white/70 hover:text-white"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 text-xs uppercase tracking-widest font-bold"
            >
              Sign in
            </Link>
          )}
        </div>
      )}

      {screen === "multi" && (
        <MultiplayerEntry
          playerName={playerName}
          setPlayerName={setPlayerName}
          onBack={() => { leaveRoom(); setScreen("menu"); }}
          onCreate={() => {
            const code = genCode();
            setRoomCode(code);
            setIsHost(true);
            joinChannel(code, true, driverId, trackId);
            setScreen("driver");
          }}
          onJoin={(code) => {
            const c = code.trim().toUpperCase();
            if (c.length < 3) return;
            setRoomCode(c);
            setIsHost(false);
            joinChannel(c, false, driverId, trackId);
            setScreen("driver");
          }}
        />
      )}

      {screen === "driver" && (
        <DriverSelect
          drivers={allDrivers}
          driverId={driverId}
          onPick={(id) => { setDriverId(id); if (mode === "multi") updatePresence({ driverId: id }); }}
          onBack={() => setScreen("menu")}
          onNext={() => {
            if (mode === "multi") {
              if (isHost) setScreen("track");
              else setScreen("lobby");
            } else {
              setScreen("track");
            }
          }}
        />
      )}

      {screen === "track" && (
        <>
        <WeatherSelect
          weatherId={weatherId}
          onPick={(id) => {
            // In multiplayer only the host can change weather; it syncs to all guests
            if (mode === "multi" && !isHost) return;
            setWeatherId(id);
            if (mode === "multi" && isHost) updatePresence({ weatherId: id });
          }}
        />
        <TrackSelect
          trackId={trackId}
          career={career}
          mode={mode}
          lapsChoice={lapsChoice}
          allTracks={allTracks}
          customTracks={customTracks}
          onCreate={() => setScreen("editor")}
          onDeleteCustom={(id) => {
            const next = customTracks.filter((t) => t.id !== id);
            setCustomTracks(next);
            saveCustomTracks(next);
            if (trackId === id) setTrackId(TRACKS[0].id);
          }}
          onPickLaps={(n) => { setLapsChoice(n); if (mode === "multi" && isHost) updatePresence({ laps: n }); }}
          onPick={(id) => { setTrackId(id); if (mode === "multi" && isHost) updatePresence({ trackId: id }); }}
          onBack={() => setScreen("driver")}
          onStart={() => {
            if (mode === "multi") setScreen("lobby");
            else {
              setResult(null);
              setQualifyingGrid(null);
              setSessionMode("qualifying");
              setScreen("racing");
            }
          }}
        />
        </>
      )}

      {screen === "editor" && (
        <TrackEditor
          onCancel={() => setScreen("track")}
          onSave={(t: TrackDef) => {
            const next = [...customTracks, t];
            setCustomTracks(next);
            saveCustomTracks(next);
            setTrackId(t.id);
            setScreen("track");
          }}
        />
      )}

      {screen === "lobby" && (
        <Lobby
          roomCode={roomCode}
          isHost={isHost}
          players={lobbyPlayers}
          track={track}
          lapsChoice={lapsChoice}
          onPickLaps={(n) => { setLapsChoice(n); if (isHost) updatePresence({ laps: n }); }}
          onChangeTrack={() => setScreen("track")}
          onChangeDriver={() => setScreen("driver")}
          onStart={broadcastStart}
          onLeave={() => { leaveRoom(); setScreen("menu"); }}
        />
      )}

      {screen === "racing" && (
        <>
          <div className="absolute bottom-6 left-6 text-white font-mono z-10 select-none pointer-events-none">
            <div className="flex items-end gap-1">
              <span className="text-5xl sm:text-7xl font-black leading-none tabular-nums">{hud.speed}</span>
              <span className="text-xs sm:text-sm text-white/60 mb-1 sm:mb-2">KM/H</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-widest text-white/50">
              Gear <span className="text-red-500 text-base font-bold">{hud.gear}</span>
            </div>
          </div>

          <div className={`absolute top-4 left-4 text-white font-mono z-10 select-none bg-black/40 backdrop-blur px-3 py-1.5 border-l-2 ${sessionMode === "qualifying" ? "border-fuchsia-500" : "border-red-600"} pointer-events-none`}>
            <div className="text-[10px] uppercase tracking-widest text-white/50">
              {sessionMode === "qualifying" ? "Session" : "Lap"}
            </div>
            <div className="text-xl font-bold">
              {sessionMode === "qualifying" ? "QUALI" : `${hud.lap}/${hud.totalLaps}`}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/50 mt-1">Pos</div>
            <div className={`text-xl font-bold ${sessionMode === "qualifying" ? "text-fuchsia-300" : "text-red-400"}`}>P{hud.position}</div>
            {sessionMode === "race" && (() => {
              const required = lapsChoice === 10 ? 2 : lapsChoice === 5 ? 1 : 0;
              if (required === 0) return null;
              const remaining = Math.max(0, required - pitStops);
              return (
                <>
                  <div className="text-[10px] uppercase tracking-widest text-white/50 mt-1">Pit</div>
                  <div className="flex gap-1 mt-0.5">
                    {Array.from({ length: required }).map((_, i) => (
                      <span
                        key={i}
                        className={`w-3 h-3 rounded-full border ${i < pitStops ? "bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-transparent border-white/40"}`}
                      />
                    ))}
                  </div>
                  {remaining > 0 && pitRequested && !pitActive && (
                    <div className="text-[9px] text-yellow-300 mt-1 uppercase tracking-widest">Box this lap</div>
                  )}
                </>
              );
            })()}
          </div>

          {/* PIT button — race only */}
          {sessionMode === "race" && !pitActive && (() => {
            const required = lapsChoice === 10 ? 2 : lapsChoice === 5 ? 1 : 0;
            if (required === 0) return null;
            const remaining = Math.max(0, required - pitStops);
            if (remaining === 0) return null;
            return (
              <button
                type="button"
                onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); setPitRequested((p) => !p); }}
                onClick={(e) => { e.stopPropagation(); }}
                style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
                className={`absolute top-3 right-3 z-40 min-h-[48px] min-w-[96px] px-5 py-3 font-mono uppercase text-sm font-bold tracking-widest border-2 backdrop-blur transition-all select-none active:scale-95
                  ${pitRequested
                    ? "bg-yellow-400 text-black border-yellow-200 shadow-[0_0_25px_rgba(250,204,21,0.55)]"
                    : "bg-black/60 text-white border-white/40 hover:bg-black/80"}`}
              >
                {pitRequested ? "BOXING" : "PIT IN"}
              </button>
            );
          })()}

          {/* Cinematic pit-stop overlay */}
          {pitActive && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-black/55 backdrop-blur-sm">
              <div className="text-center font-mono">
                <div className="text-[10px] uppercase tracking-[0.5em] text-yellow-300 mb-2">Pit Stop In Progress</div>
                <div className="text-6xl sm:text-7xl font-black text-white tabular-nums drop-shadow-[0_0_30px_rgba(250,204,21,0.6)]">
                  {(5 - pitProgress * 5).toFixed(1)}s
                </div>
                <div className="mt-4 w-72 sm:w-96 mx-auto h-2 bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 transition-[width] duration-100"
                    style={{ width: `${pitProgress * 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-[9px] uppercase tracking-widest text-white/60">
                  <div className={pitProgress > 0.15 ? "text-emerald-300" : ""}>● Jack Up</div>
                  <div className={pitProgress > 0.55 ? "text-emerald-300" : ""}>● New Tires</div>
                  <div className={pitProgress > 0.9 ? "text-emerald-300" : ""}>● Refuel</div>
                </div>
              </div>
            </div>
          )}

          <div className="absolute top-4 right-4 text-white font-mono z-10 select-none bg-black/40 backdrop-blur px-3 py-1.5 text-right pointer-events-none hidden">
            <div className="text-[10px] uppercase tracking-widest text-white/50">Current</div>
            <div className="text-xl font-bold tabular-nums">{hud.lapTime.toFixed(2)}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50 mt-1">Best</div>
            <div className="text-sm tabular-nums text-red-400">
              {hud.bestLap > 0 ? hud.bestLap.toFixed(2) : "--.--"}
            </div>
          </div>

          <Speedometer speed={hud.speed} gear={hud.gear} />

          <LiveTiming entries={liveBoard} totalLaps={hud.totalLaps} fastestLap={fastestLapTime} />

          <button
            onClick={() => setScreen("menu")}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-black/50 backdrop-blur text-white text-xs uppercase tracking-widest border border-white/20 hover:bg-black/70"
          >
            Quit
          </button>

          {countdown !== null && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none select-none">
              <div
                key={countdown}
                className={`font-black tabular-nums leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] animate-in zoom-in-50 fade-in duration-300 ${
                  countdown === 0 ? "text-green-400 text-[12rem]" : "text-white text-[14rem]"
                }`}
              >
                {countdown === 0 ? "GO" : countdown}
              </div>
            </div>
          )}

          <TouchControls touchRef={touchRef} />

          {introOpen && (() => {
            const grid: GridDriver[] = (() => {
              const order = qualifyingGrid && qualifyingGrid.length
                ? qualifyingGrid
                : [driver.id, ...DRIVERS.filter(d => d.id !== driver.id).slice(0, 9).map(d => d.id)];
              return order.map((id) => {
                const d = allDrivers.find(x => x.id === id) ?? DRIVERS[0];
                const isPlayer = id === driver.id;
                return {
                  id,
                  name: isPlayer ? (playerName || d.name) : d.name,
                  team: d.team,
                  color: `#${d.primary.toString(16).padStart(6, "0")}`,
                };
              });
            })();
            return (
              <CinematicIntro
                trackName={track.name}
                country={track.country}
                drivers={grid}
                playerId={driver.id}
                onDone={() => setIntroOpen(false)}
              />
            );
          })()}
        </>
      )}

      {screen === "result" && result && (
        <ResultScreen
          result={result}
          driver={driver}
          track={track}
          mode={mode}
          career={career}
          classification={classification}
          fastestLapId={fastestLapId}
          onPodium={() => setShowPodium(true)}
          onMenu={() => setScreen("menu")}
          onAgain={() => { setResult(null); setScreen("racing"); }}
          canReplay={lastReplayFramesRef.current.length > 1}
          onReplay={() => {
            setReplayData({
              trackName: track.name,
              driverName: driver.name,
              driverColor: driver.primary,
              waypoints: track.waypoints,
              frames: lastReplayFramesRef.current,
            });
            setShowReplay(true);
          }}
        />
      )}

      {showPodium && classification.length > 0 && (
        <PodiumCeremony
          entries={classification}
          trackName={track.name}
          fastestLapId={fastestLapId}
          onClose={() => setShowPodium(false)}
        />
      )}
    </div>
  );
}

// curve length cache
function curveLength(curve: THREE.CatmullRomCurve3) {
  // Approx length using getLengths cache
  return curve.getLength();
}

// ---------------- UI Subcomponents ----------------
function MainMenu({ career, onQuick, onCareer, onMulti, onDaily, onLeaderboard, onReset }: {
  career: CareerSave | null;
  onQuick: () => void;
  onCareer: () => void;
  onMulti: () => void;
  onDaily: () => void;
  onLeaderboard: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/85 to-black/95 text-white z-10 px-6">
      <h1 className="text-5xl sm:text-7xl font-black tracking-tight mb-2 text-center">
        APEX <span className="text-red-600">GP</span>
      </h1>
      <p className="text-[10px] sm:text-sm uppercase tracking-[0.3em] sm:tracking-[0.4em] text-white/60 mb-10 text-center">
        Formula Racing • Career Edition
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={onQuick} className="px-6 py-4 bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 text-white font-bold tracking-widest uppercase">
          Quick Race
        </button>
        <button onClick={onCareer} className="px-6 py-4 bg-red-600 hover:bg-red-500 text-white font-black tracking-widest uppercase shadow-[0_0_40px_rgba(220,0,0,0.5)]">
          Career Mode
        </button>
        <button onClick={onMulti} className="px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white font-black tracking-widest uppercase shadow-[0_0_40px_rgba(0,80,220,0.45)]">
          Multiplayer
        </button>
        <button onClick={onDaily} className="px-6 py-4 bg-yellow-500/90 hover:bg-yellow-400 text-black font-black tracking-widest uppercase shadow-[0_0_40px_rgba(250,200,0,0.4)]">
          Daily Hub 🎁
        </button>
        {career && (
          <div className="mt-4 p-3 border border-white/10 bg-black/30 text-xs">
            <div className="text-white/50 uppercase tracking-widest mb-1">Career</div>
            <div className="flex items-baseline justify-between">
              <span>Points</span>
              <span className="text-red-400 font-bold">{career.points}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span>Tracks Won</span>
              <span>{Object.values(career.completed).filter((c) => c.position === 1).length}/{TRACKS.length}</span>
            </div>
            <StandingsTable career={career} compact />
            <button onClick={onReset} className="mt-2 text-white/40 hover:text-red-400 underline text-[10px]">
              Reset career
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DriverSelect({ drivers, driverId, onPick, onBack, onNext }: {
  drivers: Driver[];
  driverId: string;
  onPick: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-black/85 to-black/95 text-white z-10 px-4 py-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} className="text-white/60 hover:text-white text-xs uppercase tracking-widest mb-4">← Back</button>
        <h2 className="text-3xl sm:text-4xl font-black mb-1">Choose Your Driver</h2>
        <p className="text-white/50 text-sm mb-6 uppercase tracking-widest">Your custom drivers appear first</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {drivers.map((d) => {
            const selected = d.id === driverId;
            const isCustom = d.id.startsWith("custom:");
            return (
              <button
                key={d.id}
                onClick={() => onPick(d.id)}
                className={`relative p-4 border-2 transition text-left ${selected ? "border-red-500 bg-red-500/10" : isCustom ? "border-cyan-400/60 bg-cyan-400/5 hover:border-cyan-300" : "border-white/20 hover:border-white/40 bg-black/40"}`}
              >
                {isCustom && (
                  <div className="absolute top-1 right-1 text-[9px] font-black tracking-widest text-cyan-300 bg-black/60 px-1.5 py-0.5 rounded">YOURS</div>
                )}
                <div className="h-14 rounded mb-3 flex items-center justify-center text-2xl font-black"
                  style={{ background: `#${d.primary.toString(16).padStart(6, "0")}`, color: `#${d.secondary.toString(16).padStart(6, "0")}` }}>
                  #{d.number}
                </div>
                <div className="font-bold text-sm">{d.name}</div>
                <div className="text-white/50 text-xs">{d.team}</div>
              </button>
            );
          })}
        </div>

        <button onClick={onNext} className="mt-8 w-full sm:w-auto px-10 py-4 bg-red-600 hover:bg-red-500 text-white font-black tracking-widest uppercase shadow-[0_0_40px_rgba(220,0,0,0.5)]">
          Continue →
        </button>
      </div>
    </div>
  );
}

function TrackEditor({ onCancel, onSave }: {
  onCancel: () => void;
  onSave: (t: TrackDef) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [name, setName] = useState("My Track");
  const SIZE = 480;
  const SCALE = 1.6; // 1 px = 1.6 world units => world range ≈ ±384

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0b0f17";
    ctx.fillRect(0, 0, SIZE, SIZE);
    // grid
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo((i * SIZE) / 8, 0);
      ctx.lineTo((i * SIZE) / 8, SIZE);
      ctx.moveTo(0, (i * SIZE) / 8);
      ctx.lineTo(SIZE, (i * SIZE) / 8);
      ctx.stroke();
    }
    // start marker
    if (points.length > 0) {
      const [x0, z0] = points[0];
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(x0 / SCALE + SIZE / 2 - 6, z0 / SCALE + SIZE / 2 - 6, 12, 12);
    }
    // closed-loop catmull preview
    if (points.length >= 3) {
      const pts = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
      const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal", 0.5);
      // outline (track width)
      const W = 24;
      ctx.fillStyle = "#1f2937";
      ctx.beginPath();
      const N = 200;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = curve.getPointAt(t);
        const tg = curve.getTangentAt(t).normalize();
        const nx = -tg.z, nz = tg.x;
        const lx = (p.x + nx * (W / 2)) / SCALE + SIZE / 2;
        const lz = (p.z + nz * (W / 2)) / SCALE + SIZE / 2;
        if (i === 0) ctx.moveTo(lx, lz);
        else ctx.lineTo(lx, lz);
      }
      for (let i = N; i >= 0; i--) {
        const t = i / N;
        const p = curve.getPointAt(t);
        const tg = curve.getTangentAt(t).normalize();
        const nx = -tg.z, nz = tg.x;
        const rx = (p.x - nx * (W / 2)) / SCALE + SIZE / 2;
        const rz = (p.z - nz * (W / 2)) / SCALE + SIZE / 2;
        ctx.lineTo(rx, rz);
      }
      ctx.closePath();
      ctx.fill();
      // centerline
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const p = curve.getPointAt(i / N);
        const x = p.x / SCALE + SIZE / 2;
        const z = p.z / SCALE + SIZE / 2;
        if (i === 0) ctx.moveTo(x, z);
        else ctx.lineTo(x, z);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // points
    points.forEach(([x, z], i) => {
      ctx.fillStyle = i === 0 ? "#22c55e" : "#fbbf24";
      ctx.beginPath();
      ctx.arc(x / SCALE + SIZE / 2, z / SCALE + SIZE / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [points]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const x = (px - rect.width / 2) * (SCALE * SIZE / rect.width);
    const z = (py - rect.height / 2) * (SCALE * SIZE / rect.height);
    setPoints((prev) => [...prev, [Math.round(x), Math.round(z)]]);
  };

  const canSave = points.length >= 6 && name.trim().length > 0;

  return (
    <div className="absolute inset-0 bg-gradient-to-b from-black/90 to-black/95 text-white z-30 px-4 py-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <button onClick={onCancel} className="text-white/60 hover:text-white text-xs uppercase tracking-widest mb-3">← Cancel</button>
        <h2 className="text-3xl font-black mb-1">Track Editor</h2>
        <p className="text-white/50 text-xs uppercase tracking-widest mb-4">Tap the grid to drop waypoints — at least 6, in order. The first point is the start/finish line.</p>

        <div className="flex flex-col items-center gap-3">
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            onClick={onClick}
            className="w-full max-w-[480px] aspect-square border border-white/15 cursor-crosshair touch-none"
          />

          <div className="flex flex-wrap gap-2 w-full max-w-[480px]">
            <button
              onClick={() => setPoints((p) => p.slice(0, -1))}
              disabled={points.length === 0}
              className="flex-1 py-2 px-3 bg-white/10 hover:bg-white/20 disabled:opacity-40 border border-white/20 uppercase tracking-widest text-xs"
            >
              Undo ({points.length})
            </button>
            <button
              onClick={() => setPoints([])}
              className="flex-1 py-2 px-3 bg-white/10 hover:bg-white/20 border border-white/20 uppercase tracking-widest text-xs"
            >
              Clear
            </button>
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 24))}
            placeholder="Track name"
            className="w-full max-w-[480px] bg-black/50 border border-white/20 px-3 py-2 text-white font-mono"
          />

          <button
            onClick={() => canSave && onSave({
              id: `custom-${Date.now()}`,
              name: name.trim(),
              country: "Custom",
              laps: 5,
              waypoints: points,
            })}
            disabled={!canSave}
            className="w-full max-w-[480px] px-6 py-4 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-black tracking-widest uppercase shadow-[0_0_40px_rgba(220,0,0,0.5)]"
          >
            Save & Race
          </button>
          {!canSave && points.length < 6 && (
            <div className="text-xs text-white/50">Add at least {6 - points.length} more waypoint(s)</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MultiplayerEntry({ playerName, setPlayerName, onCreate, onJoin, onBack }: {
  playerName: string;
  setPlayerName: (n: string) => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/85 to-black/95 text-white z-20 px-6">
      <button onClick={onBack} className="absolute top-4 left-4 text-white/60 hover:text-white text-xs uppercase tracking-widest">← Menu</button>
      <h2 className="text-4xl sm:text-5xl font-black mb-2">Multiplayer</h2>
      <p className="text-white/50 text-xs sm:text-sm uppercase tracking-widest mb-8">Race your friends online</p>

      <div className="w-full max-w-xs space-y-4">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-white/50 mb-1">Your name</label>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value.slice(0, 16))}
            className="w-full bg-black/50 border border-white/20 px-3 py-2 text-white font-mono"
            placeholder="Your driver name"
          />
        </div>

        <button
          onClick={onCreate}
          className="w-full px-6 py-4 bg-red-600 hover:bg-red-500 text-white font-black tracking-widest uppercase shadow-[0_0_40px_rgba(220,0,0,0.5)]"
        >
          Create Room
        </button>

        <div className="text-center text-white/40 text-xs uppercase tracking-widest">— or —</div>

        <div className="space-y-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            className="w-full bg-black/50 border border-white/20 px-3 py-3 text-white font-mono tracking-[0.4em] text-center text-xl uppercase"
            placeholder="CODE"
          />
          <button
            onClick={() => onJoin(code)}
            disabled={code.trim().length < 3}
            className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black tracking-widest uppercase"
          >
            Join Room
          </button>
        </div>
      </div>
    </div>
  );
}

function Lobby({ roomCode, isHost, players, track, lapsChoice, onPickLaps, onChangeTrack, onChangeDriver, onStart, onLeave }: {
  roomCode: string;
  isHost: boolean;
  players: LobbyPlayer[];
  track: TrackDef;
  lapsChoice: 3 | 5 | 10;
  onPickLaps: (n: 3 | 5 | 10) => void;
  onChangeTrack: () => void;
  onChangeDriver: () => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const copyCode = () => {
    try { navigator.clipboard.writeText(roomCode); } catch {}
  };
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-black/90 to-black/95 text-white z-20 px-4 py-8 overflow-y-auto">
      <div className="max-w-xl mx-auto">
        <button onClick={onLeave} className="text-white/60 hover:text-white text-xs uppercase tracking-widest mb-4">← Leave Room</button>
        <h2 className="text-3xl sm:text-4xl font-black mb-2">Race Lobby</h2>

        <div className="mb-6 p-4 border border-white/15 bg-black/40">
          <div className="text-[10px] uppercase tracking-widest text-white/50 mb-1">Room code — share with friends</div>
          <div className="flex items-center gap-3">
            <div className="text-4xl sm:text-5xl font-black tracking-[0.3em] text-red-400 font-mono">{roomCode}</div>
            <button onClick={copyCode} className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 uppercase tracking-widest">Copy</button>
          </div>
        </div>

        <div className="mb-6 p-4 border border-white/15 bg-black/40 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Track</div>
            <div className="text-xl font-bold">{track.name} <span className="text-white/40 text-sm font-normal">• {track.country} • {lapsChoice} laps</span></div>
          </div>
          {isHost && (
            <button onClick={onChangeTrack} className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 uppercase tracking-widest">Change</button>
          )}
        </div>

        <div className="mb-6 p-4 border border-white/15 bg-black/40">
          <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">Race length</div>
          <div className="flex gap-2">
            {([3, 5, 10] as const).map((n) => (
              <button
                key={n}
                onClick={() => isHost && onPickLaps(n)}
                disabled={!isHost}
                className={`flex-1 py-2 border-2 font-bold uppercase tracking-widest text-sm ${lapsChoice === n ? "border-red-500 bg-red-500/15 text-white" : "border-white/20 bg-black/40 text-white/70"} ${isHost ? "hover:border-white/40" : "opacity-70 cursor-not-allowed"}`}
              >
                {n} Laps
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 p-4 border border-white/15 bg-black/40">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-widest text-white/50">Drivers in room ({players.length})</div>
            <button onClick={onChangeDriver} className="text-xs px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 uppercase tracking-widest">Change Driver</button>
          </div>
          <div className="space-y-1">
            {players.length === 0 && <div className="text-white/40 text-sm">Waiting for players to connect…</div>}
            {players.map((p) => {
              const d = DRIVERS.find((x) => x.id === p.driverId);
              return (
                <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 bg-white/5">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: d ? `#${d.primary.toString(16).padStart(6, "0")}` : "#888" }} />
                  <span className="font-bold">{p.name}</span>
                  <span className="text-white/50 text-xs">{d?.team ?? "—"}</span>
                  {p.isHost && <span className="ml-auto text-[10px] uppercase tracking-widest text-red-400">Host</span>}
                </div>
              );
            })}
          </div>
        </div>

        {isHost ? (
          <button
            onClick={onStart}
            disabled={players.length < 1}
            className="w-full px-10 py-4 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-black tracking-widest uppercase shadow-[0_0_40px_rgba(220,0,0,0.5)]"
          >
            Start Race
          </button>
        ) : (
          <div className="text-center text-white/60 text-sm uppercase tracking-widest">Waiting for host to start…</div>
        )}
      </div>
    </div>
  );
}

function TrackSelect({ trackId, career, mode, lapsChoice, allTracks, customTracks, onCreate, onDeleteCustom, onPickLaps, onPick, onBack, onStart }: {
  trackId: string;
  career: CareerSave | null;
  mode: Mode;
  lapsChoice: 3 | 5 | 10;
  allTracks: TrackDef[];
  customTracks: TrackDef[];
  onCreate: () => void;
  onDeleteCustom: (id: string) => void;
  onPickLaps: (n: 3 | 5 | 10) => void;
  onPick: (id: string) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-black/85 to-black/95 text-white z-10 px-4 py-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} className="text-white/60 hover:text-white text-xs uppercase tracking-widest mb-4">← Back</button>
        <h2 className="text-3xl sm:text-4xl font-black mb-1">Choose Track</h2>
        <p className="text-white/50 text-sm mb-6 uppercase tracking-widest">{mode === "career" ? "Career round" : "Quick race"}</p>

        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-widest text-white/50 mb-2">Race length</div>
          <div className="flex gap-2">
            {([3, 5, 10] as const).map((n) => (
              <button
                key={n}
                onClick={() => onPickLaps(n)}
                className={`flex-1 py-2 border-2 font-bold uppercase tracking-widest text-sm ${lapsChoice === n ? "border-red-500 bg-red-500/15 text-white" : "border-white/20 bg-black/40 text-white/70 hover:border-white/40"}`}
              >
                {n} Laps
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {allTracks.map((t) => {
            const selected = t.id === trackId;
            const result = career?.completed[t.id];
            const isCustom = customTracks.some((c) => c.id === t.id);
            return (
              <button
                key={t.id}
                onClick={() => onPick(t.id)}
                className={`p-4 border-2 transition text-left ${selected ? "border-red-500 bg-red-500/10" : "border-white/20 hover:border-white/40 bg-black/40"}`}
              >
                <div className="flex items-baseline justify-between">
                  <div className="font-black text-lg">{t.name}</div>
                  <div className="text-white/50 text-xs uppercase">{t.country}</div>
                </div>
                <div className="text-white/50 text-xs mt-1">
                  {t.laps} laps {isCustom && <span className="text-blue-400 ml-1">• Custom</span>}
                </div>
                {result && (
                  <div className="mt-2 text-xs text-red-400 font-mono">
                    Best P{result.position} • {result.bestLap.toFixed(2)}s • +{result.points}pts
                  </div>
                )}
                {isCustom && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); onDeleteCustom(t.id); }}
                    className="mt-2 inline-block text-[10px] text-white/40 hover:text-red-400 underline"
                  >
                    Delete
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={onCreate}
            className="p-4 border-2 border-dashed border-blue-400/50 hover:border-blue-400 bg-blue-500/5 text-blue-300 text-left"
          >
            <div className="font-black text-lg">+ Create a Track</div>
            <div className="text-xs mt-1 opacity-70">Design your own circuit</div>
          </button>
        </div>

        <button onClick={onStart} className="mt-8 w-full sm:w-auto px-10 py-4 bg-red-600 hover:bg-red-500 text-white font-black tracking-widest uppercase shadow-[0_0_40px_rgba(220,0,0,0.5)]">
          Start Race
        </button>
      </div>
    </div>
  );
}

function ResultScreen({ result, driver, track, mode, career, classification, fastestLapId, onPodium, onMenu, onAgain, onReplay, canReplay }: {
  result: { position: number; bestLap: number; points: number; credits: number };
  driver: Driver;
  track: TrackDef;
  mode: Mode;
  career: CareerSave | null;
  classification: PodiumEntry[];
  fastestLapId?: string;
  onPodium: () => void;
  onMenu: () => void;
  onAgain: () => void;
  onReplay: () => void;
  canReplay: boolean;
}) {
  const hasPodium = classification.length > 0;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-start bg-gradient-to-b from-black/90 to-black/95 text-white z-30 px-4 py-6 overflow-y-auto">
      <div className="text-white/50 uppercase tracking-widest text-xs mb-1">{track.name} • Final Classification</div>
      <div className="text-5xl sm:text-7xl font-black text-red-500 leading-none">P{result.position}</div>
      <div className="mt-2 mb-3 font-mono text-center flex gap-6">
        <div>
          <div className="text-[10px] text-white/60 uppercase tracking-widest">Best Lap</div>
          <div className="text-lg font-bold">{result.bestLap > 0 ? result.bestLap.toFixed(2) : "--.--"}s</div>
        </div>
        <div>
          <div className="text-[10px] text-white/60 uppercase tracking-widest">Points</div>
          <div className="text-lg font-bold text-red-400">+{result.points}</div>
        </div>
        <div>
          <div className="text-[10px] text-white/60 uppercase tracking-widest">Credits</div>
          <div className="text-lg font-bold text-yellow-300">+{result.credits.toLocaleString()} CR</div>
        </div>
        {mode === "career" && career && (
          <div>
            <div className="text-[10px] text-white/60 uppercase tracking-widest">Career</div>
            <div className="text-lg font-bold">{career.points}</div>
          </div>
        )}
      </div>

      {hasPodium && (
        <div className="w-full max-w-md border border-white/10 bg-black/40">
          <div className="px-2 py-1 bg-white/5 text-[10px] text-white/60 uppercase tracking-widest grid grid-cols-[28px_1fr_70px_50px] gap-2">
            <span>#</span><span>Driver</span><span className="text-right">Best</span><span className="text-right">Pts</span>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {classification.map((e, i) => (
              <div key={e.id} className={`grid grid-cols-[28px_1fr_70px_50px] gap-2 items-center px-2 py-1 border-t border-white/5 text-xs ${e.isPlayer ? "bg-red-600/20" : ""}`}>
                <span className="text-white/60 tabular-nums">{i + 1}</span>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="inline-block w-2 h-3" style={{ background: e.color }} />
                  <span className="truncate font-semibold">{e.name}</span>
                  {e.id === fastestLapId && <span className="text-[9px] px-1 bg-fuchsia-600/40 text-fuchsia-100 border border-fuchsia-400/40">FL</span>}
                </span>
                <span className="text-right tabular-nums text-white/80">{e.bestLap && e.bestLap > 0 ? `${e.bestLap.toFixed(2)}s` : "—"}</span>
                <span className="text-right tabular-nums text-red-300 font-bold">+{e.points}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-center mt-5">
        {hasPodium && (
          <button onClick={onPodium} className="px-5 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black tracking-widest uppercase">
            🏆 View Podium
          </button>
        )}
        <button onClick={onAgain} className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold tracking-widest uppercase">
          Race Again
        </button>
        {canReplay && (
          <button onClick={onReplay} className="px-6 py-3 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold tracking-widest uppercase">
            Replay ▶
          </button>
        )}
        <button onClick={onMenu} className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold tracking-widest uppercase">
          Menu
        </button>
      </div>
      {mode === "career" && career && (
        <div className="mt-4 w-full max-w-md">
          <StandingsTable career={career} />
        </div>
      )}
    </div>
  );
}

function StandingsTable({ career, compact = false }: { career: CareerSave; compact?: boolean }) {
  const standings = career.standings ?? {};
  const rows = DRIVERS
    .map((d) => ({ d, pts: standings[d.id] ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  const playerId = career.driverId;
  return (
    <div className={`mt-3 border border-white/10 bg-black/30 ${compact ? "text-[10px]" : "text-xs"}`}>
      <div className="px-2 py-1 bg-white/5 text-white/60 uppercase tracking-widest flex justify-between">
        <span>Season Standings</span>
        <span>Pts</span>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {rows.map((r, i) => {
          const isPlayer = r.d.id === playerId;
          return (
            <div
              key={r.d.id}
              className={`flex items-center justify-between px-2 py-1 border-t border-white/5 ${isPlayer ? "bg-red-600/20 text-white" : "text-white/80"}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 text-white/40 tabular-nums">{i + 1}</span>
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: `#${r.d.primary.toString(16).padStart(6, "0")}` }}
                />
                <span className="truncate">{r.d.name}</span>
              </div>
              <span className={`tabular-nums font-bold ${isPlayer ? "text-red-300" : ""}`}>{r.pts}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TouchControls({ touchRef }: { touchRef: React.MutableRefObject<{ accel: boolean; brake: boolean; steer: number; handbrake: boolean }> }) {
  const wheelRef = useRef<HTMLDivElement>(null);

  const bindHold = (key: "accel" | "brake" | "handbrake") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      touchRef.current[key] = true;
    },
    onPointerUp: (e: React.PointerEvent) => {
      touchRef.current[key] = false;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    },
    onPointerCancel: () => { touchRef.current[key] = false; },
    onPointerLeave: () => { touchRef.current[key] = false; },
  });

  const onWheelMove = (e: React.PointerEvent) => {
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    touchRef.current.steer = Math.max(-1, Math.min(1, (x - 0.5) * 2));
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pb-4 px-4 flex items-end justify-between pointer-events-none select-none touch-none">
      <div
        ref={wheelRef}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onWheelMove(e); }}
        onPointerMove={onWheelMove}
        onPointerUp={(e) => { touchRef.current.steer = 0; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {} }}
        onPointerCancel={() => { touchRef.current.steer = 0; }}
        className="pointer-events-auto h-28 w-44 rounded-2xl bg-black/40 backdrop-blur border border-white/15 flex items-center justify-center text-white/70 text-xs uppercase tracking-widest touch-none"
      >
        ◀ Steer ▶
      </div>
      <div className="flex gap-3 pointer-events-auto">
        <button {...bindHold("brake")} className="h-20 w-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 text-white font-bold text-xs uppercase tracking-widest active:bg-white/20 touch-none">
          Brake
        </button>
        <button {...bindHold("accel")} className="h-28 w-28 rounded-2xl bg-red-600/90 backdrop-blur border border-red-400 text-white font-black text-sm uppercase tracking-widest active:bg-red-500 shadow-[0_0_30px_rgba(220,0,0,0.5)] touch-none">
          Throttle
        </button>
      </div>
    </div>
  );
}
function Speedometer({ speed, gear }: { speed: number; gear: number }) {
  const max = 320;
  const pct = Math.max(0, Math.min(1, speed / max));
  const angle = pct * 270 - 135; // -135deg .. +135deg
  const ringDeg = pct * 270;
  return (
    <div className="absolute top-28 right-4 z-10 select-none pointer-events-none">
      <div className="relative w-32 h-32 sm:w-36 sm:h-36">
        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-full transition-[background] duration-100"
          style={{
            background: `conic-gradient(from 225deg, #22d3ee 0deg, #ff1493 ${ringDeg * 0.5}deg, #ff6a1a ${ringDeg}deg, rgba(255,255,255,0.06) ${ringDeg}deg, rgba(255,255,255,0.06) 270deg, transparent 270deg)`,
            filter: "drop-shadow(0 0 10px rgba(255,106,26,0.6))",
            mask: "radial-gradient(circle, transparent 58%, #000 60%, #000 100%)",
            WebkitMask: "radial-gradient(circle, transparent 58%, #000 60%, #000 100%)",
          }}
        />
        {/* Inner face */}
        <div className="absolute inset-3 rounded-full bg-black/70 backdrop-blur border border-white/10 shadow-[0_0_30px_rgba(34,211,238,0.25)_inset] flex flex-col items-center justify-center">
          <div className="text-3xl sm:text-4xl font-black tabular-nums leading-none text-white drop-shadow-[0_0_8px_rgba(34,211,238,0.7)] transition-all">
            {Math.round(speed)}
          </div>
          <div className="text-[9px] font-display uppercase tracking-[0.25em] text-cyan-300/80 mt-0.5">km/h</div>
          <div className="mt-1 text-[9px] uppercase tracking-widest text-white/40">
            Gear <span className="text-orange-400 font-bold">{gear}</span>
          </div>
        </div>
        {/* Needle */}
        <div
          className="absolute left-1/2 top-1/2 origin-left h-0.5 w-[42%] -translate-y-1/2 rounded-full transition-transform duration-100"
          style={{
            transform: `translateY(-50%) rotate(${angle}deg)`,
            background: "linear-gradient(90deg, transparent, #ff1493 60%, #ff6a1a)",
            boxShadow: "0 0 8px #ff1493",
          }}
        />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_8px_#fff]" />
      </div>
    </div>
  );
}

function WeatherSelect({ weatherId, onPick }: { weatherId: WeatherId; onPick: (id: WeatherId) => void }) {
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
      <div className="glass rounded-2xl px-3 py-2 flex items-center gap-2 shadow-neon">
        <span className="text-[10px] font-display tracking-widest uppercase text-white/60 px-2">Weather</span>
        <div className="flex gap-1.5 overflow-x-auto max-w-[80vw]">
          {WEATHERS.map((w) => {
            const active = w.id === weatherId;
            return (
              <button
                key={w.id}
                onClick={() => onPick(w.id)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-display tracking-wider uppercase transition-all border ${
                  active
                    ? "bg-gradient-to-br from-fuchsia-500/30 to-cyan-400/30 border-cyan-300/70 text-white shadow-[0_0_18px_rgba(34,211,238,0.5)]"
                    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                title={w.blurb}
              >
                <span className="mr-1">{w.icon}</span>{w.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

