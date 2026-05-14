import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import DailyHub from "./DailyHub";
import { recordRace } from "@/lib/dailyRewards";

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
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState({ speed: 0, gear: 1, lap: 1, totalLaps: 3, lapTime: 0, bestLap: 0, position: 1 });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [screen, setScreen] = useState<"menu" | "multi" | "driver" | "track" | "editor" | "lobby" | "racing" | "result">("menu");
  const [mode, setMode] = useState<Mode>("quick");
  const [customDrivers, setCustomDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState<string>(DRIVERS[0].id);
  const [trackId, setTrackId] = useState<string>(TRACKS[0].id);
  const [lapsChoice, setLapsChoice] = useState<3 | 5 | 10>(5);
  const [weatherId, setWeatherId] = useState<WeatherId>(() => loadWeather());
  useEffect(() => { try { localStorage.setItem(WEATHER_KEY, weatherId); } catch {} }, [weatherId]);
  const [career, setCareer] = useState<CareerSave | null>(null);
  const [result, setResult] = useState<{ position: number; bestLap: number; points: number } | null>(null);
  const [customTracks, setCustomTracks] = useState<TrackDef[]>([]);
  const [showDaily, setShowDaily] = useState(false);
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

  useEffect(() => { setCareer(loadSave()); }, []);
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
      const state = ch.presenceState() as Record<string, Array<{ name: string; driverId: string; isHost: boolean; trackId?: string; laps?: 3 | 5 | 10 }>>;
      const players: LobbyPlayer[] = [];
      let hostTrackId: string | undefined;
      let hostLaps: 3 | 5 | 10 | undefined;
      for (const [pid, metas] of Object.entries(state)) {
        const meta = metas[0];
        if (!meta) continue;
        players.push({ id: pid, name: meta.name, driverId: meta.driverId, isHost: !!meta.isHost });
        if (meta.isHost) {
          if (meta.trackId) hostTrackId = meta.trackId;
          if (meta.laps) hostLaps = meta.laps;
        }
      }
      players.sort((a, b) => (a.isHost === b.isHost ? a.name.localeCompare(b.name) : a.isHost ? -1 : 1));
      setLobbyPlayers(players);
      if (!asHost && hostTrackId) setTrackId(hostTrackId);
      if (!asHost && hostLaps) setLapsChoice(hostLaps);
    });

    ch.on("broadcast", { event: "start" }, () => {
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
        });
      }
    });
  }

  async function updatePresence(extra: { driverId?: string; trackId?: string; laps?: 3 | 5 | 10 }) {
    const ch = channelRef.current;
    if (!ch) return;
    await ch.track({
      name: playerName,
      driverId: extra.driverId ?? driverId,
      isHost,
      trackId: isHost ? (extra.trackId ?? trackId) : undefined,
      laps: isHost ? (extra.laps ?? lapsChoice) : undefined,
    });
  }

  function broadcastStart() {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "start", payload: { trackId } });
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
    const mount = mountRef.current!;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

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
    type Puff = { mesh: THREE.Mesh; life: number; maxLife: number };
    const smokes: Puff[] = [];
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const m = new THREE.Mesh(smokeGeo, smokeMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      smokes.push({ mesh: m, life: 0, maxLife: 1 });
    }
    let smokeIdx = 0;
    function spawnSmoke(x: number, z: number) {
      const p = smokes[smokeIdx++ % SMOKE_COUNT];
      p.mesh.position.set(x, 0.05, z);
      p.mesh.scale.setScalar(0.6 + Math.random() * 0.4);
      p.life = 0.8 + Math.random() * 0.4;
      p.maxLife = p.life;
      p.mesh.visible = true;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75;
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
    let playerSlot = 4;
    if (isMulti) {
      const idx = lobbyPlayers.findIndex((p) => p.id === playerIdRef.current);
      playerSlot = idx >= 0 ? idx : 0;
    }
    const pSlot = gridSlot(playerSlot);
    const startHeading = pSlot.heading;
    player.group.position.set(pSlot.x, 0, pSlot.z);
    player.group.rotation.y = startHeading;

    // AI cars (other drivers)
    type AI = { car: ReturnType<typeof buildCar>; t: number; speed: number };
    const MAX_SPEED_PREVIEW = 78;
    const AI_SPEED = MAX_SPEED_PREVIEW * 0.88; // identical pace for fairness
    const ais: (AI & { driver: Driver; offset: number })[] = [];
    if (!isMulti) {
      const otherDrivers = DRIVERS.filter((d) => d.id !== driver.id);
      let next = 0;
      otherDrivers.forEach((d) => {
        if (next === playerSlot) next++;
        const slot = next++;
        const g = gridSlot(slot);
        const c = buildCar(d);
        scene.add(c.group);
        c.group.position.set(g.x, 0, g.z);
        c.group.rotation.y = g.heading;
        const lateral = (slot % 2 === 0 ? 1 : -1) * GRID_LAT;
        ais.push({ car: c, t: g.t, speed: AI_SPEED, driver: d, offset: lateral });
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
    const totalLaps = lapsChoice;
    let lapStart = performance.now();
    let bestLap = 0;
    let prevT = pSlot.t;
    let firstCross = false;
    let raceFinished = false;
    let raceProgress = 0; // total fraction

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

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Constants
    const MAX_SPEED = 78;
    const ACCEL = 24;
    const BRAKE = 60;
    const DRAG = 0.7;
    const OFF_TRACK_DRAG = 8;
    const STEER_RATE = 2.7;
    const WALL_LIMIT = TRACK_WIDTH / 2 + 2.3;

    let last = performance.now();
    let raf = 0;
    let hudTick = 0;
    const raceStartAt = last + 3800;
    let lastCountdownShown = 99;
    setCountdown(3);

    // Session stats for daily challenges
    let sessTopSpeedKmh = 0;
    let sessDriftDist = 0;

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
        if (shown !== lastCountdownShown) {
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
      const accel = !raceFinished && (keys["w"] || keys["arrowup"] || t.accel);
      const brake = !raceFinished && (keys["s"] || keys["arrowdown"] || t.brake);
      const leftKey = keys["a"] || keys["arrowleft"];
      const rightKey = keys["d"] || keys["arrowright"];
      const handbrake = keys[" "] || t.handbrake;

      const keySteer = (leftKey ? 1 : 0) - (rightKey ? 1 : 0);
      const steerInput = keySteer !== 0 ? keySteer : -t.steer;
      steering += (steerInput - steering) * Math.min(1, dt * 6);

      if (accel) speed += ACCEL * dt;
      if (brake) speed -= BRAKE * dt;
      if (!accel && !brake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), DRAG * dt * 6);
      if (handbrake) speed *= Math.pow(0.05, dt);
      speed = Math.max(-15, Math.min(MAX_SPEED, speed));

      const ct = closestT(carPos);
      if (ct.dist > TRACK_WIDTH / 2 + 1.5) {
        speed -= Math.sign(speed) * Math.min(Math.abs(speed), OFF_TRACK_DRAG * dt);
      }

      // Heading + lateral slide physics
      const speedFactor = Math.min(1, Math.abs(speed) / 12);
      const turnRate = STEER_RATE * speedFactor * (speed >= 0 ? 1 : -1);
      const dHeading = steering * turnRate * dt;
      heading += dHeading;

      // Slide: lateral vel from sharp turning at high speed
      const lateralAccel = -dHeading * speed * 0.6;
      lateralVel += lateralAccel;
      lateralVel *= Math.pow(0.04, dt); // grip recovery

      // Move forward + sideways
      const fx = Math.sin(heading), fz = Math.cos(heading);
      const sx = Math.cos(heading), sz = -Math.sin(heading);
      carPos.x += fx * speed * dt + sx * lateralVel * dt;
      carPos.z += fz * speed * dt + sz * lateralVel * dt;

      // Wall collision: push back inside, lose speed
      const ct2 = closestT(carPos);
      if (ct2.dist > WALL_LIMIT) {
        const center = centerline[ct2.idx];
        const dx = carPos.x - center.x;
        const dz = carPos.z - center.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const nx = dx / len, nz = dz / len;
        carPos.x = center.x + nx * WALL_LIMIT;
        carPos.z = center.z + nz * WALL_LIMIT;
        speed *= 0.9;     // gentle scrape, not a full stop
        lateralVel *= -0.2;
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

      player.group.position.set(carPos.x, 0, carPos.z);
      player.group.rotation.y = heading;

      const wheelSpin = (speed * dt) / 0.36;
      player.wheels.forEach((w) => (w.rotation.x += wheelSpin));
      player.wheels[0].rotation.y = steering * 0.4;
      player.wheels[1].rotation.y = steering * 0.4;
      player.steeringGroup.rotation.z = -steering * 0.9;

      // Lap detection — first crossing of start line just arms the timer
      if (prevT > 0.9 && ct2.t < 0.1) {
        if (!firstCross) {
          firstCross = true;
          lapStart = now;
        } else {
          const lapTime = (now - lapStart) / 1000;
          if (bestLap === 0 || lapTime < bestLap) bestLap = lapTime;
          lap++;
          lapStart = now;
          if (lap > totalLaps && !raceFinished) {
            raceFinished = true;
          }
        }
      }
      prevT = ct2.t;
      raceProgress = (lap - 1) + ct2.t;

      // ---------- AI ----------
      const cLen = curveLength(curve);
      if (!isMulti) ais.forEach((ai) => {
        ai.t += (ai.speed * dt) / cLen;
        if (ai.t >= 1) ai.t -= 1;
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
      if (isMulti) {
        remotesRef.current.forEach((rp) => {
          if (rp.progress > raceProgress) position++;
        });
      } else {
        ais.forEach((ai) => {
          const aiLapEst = Math.floor(raceProgress) + (ai.t < playerLapFrac - 0.5 ? 1 : ai.t > playerLapFrac + 0.5 ? -1 : 0);
          const aiProg = aiLapEst + ai.t;
          if (aiProg > raceProgress) position++;
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
      const shake = (Math.abs(speed) / MAX_SPEED) * 0.05;
      camWorld.x += (Math.random() - 0.5) * shake;
      camWorld.y += (Math.random() - 0.5) * shake;
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
      for (const p of smokes) {
        if (!p.mesh.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.mesh.visible = false; continue; }
        const k = p.life / p.maxLife;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * k;
        p.mesh.scale.x += dt * 1.2;
        p.mesh.scale.y += dt * 1.2;
      }

      // HUD
      hudTick++;
      if (hudTick % 5 === 0) {
        const kmh = Math.abs(speed) * 3.6 * 1.6;
        const gear = Math.max(1, Math.min(8, Math.floor((Math.abs(speed) / MAX_SPEED) * 8) + 1));
        setHud({
          speed: Math.round(kmh),
          gear,
          lap: Math.min(lap, totalLaps),
          totalLaps,
          lapTime: (now - lapStart) / 1000,
          bestLap,
          position,
        });
      }

      renderer.render(scene, camera);

      if (raceFinished) {
        const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
        const points = POINTS[position - 1] ?? 0;
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
        setResult({ position, bestLap, points });
        if (mode === "career") {
          const cur: CareerSave = loadSave() ?? {
            driverId: driver.id, points: 0, completed: {}, standings: {}, rounds: [],
          };
          cur.driverId = driver.id;
          if (!cur.standings) cur.standings = {};
          if (!cur.rounds) cur.rounds = [];
          const prev = cur.completed[track.id];
          const newBest = prev && prev.bestLap > 0 && prev.bestLap < bestLap ? prev.bestLap : bestLap;
          cur.completed[track.id] = { bestLap: newBest, position, points };
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
  }, [screen]);

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
          onReset={() => { try { localStorage.removeItem(SAVE_KEY); } catch {}; setCareer(null); }}
        />
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
        <WeatherSelect weatherId={weatherId} onPick={setWeatherId} />
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
            else { setResult(null); setScreen("racing"); }
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

          <div className="absolute top-4 left-4 text-white font-mono z-10 select-none bg-black/40 backdrop-blur px-3 py-1.5 border-l-2 border-red-600 pointer-events-none">
            <div className="text-[10px] uppercase tracking-widest text-white/50">Lap</div>
            <div className="text-xl font-bold">{hud.lap}/{hud.totalLaps}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50 mt-1">Pos</div>
            <div className="text-xl font-bold text-red-400">P{hud.position}</div>
          </div>

          <div className="absolute top-4 right-4 text-white font-mono z-10 select-none bg-black/40 backdrop-blur px-3 py-1.5 text-right pointer-events-none">
            <div className="text-[10px] uppercase tracking-widest text-white/50">Current</div>
            <div className="text-xl font-bold tabular-nums">{hud.lapTime.toFixed(2)}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50 mt-1">Best</div>
            <div className="text-sm tabular-nums text-red-400">
              {hud.bestLap > 0 ? hud.bestLap.toFixed(2) : "--.--"}
            </div>
          </div>

          <Speedometer speed={hud.speed} gear={hud.gear} />

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
        </>
      )}

      {screen === "result" && result && (
        <ResultScreen
          result={result}
          driver={driver}
          track={track}
          mode={mode}
          career={career}
          onMenu={() => setScreen("menu")}
          onAgain={() => { setResult(null); setScreen("racing"); }}
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
function MainMenu({ career, onQuick, onCareer, onMulti, onReset }: {
  career: CareerSave | null;
  onQuick: () => void;
  onCareer: () => void;
  onMulti: () => void;
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

function ResultScreen({ result, driver, track, mode, career, onMenu, onAgain }: {
  result: { position: number; bestLap: number; points: number };
  driver: Driver;
  track: TrackDef;
  mode: Mode;
  career: CareerSave | null;
  onMenu: () => void;
  onAgain: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/85 to-black/95 text-white z-30 px-6">
      <div className="text-white/50 uppercase tracking-widest text-xs mb-2">{track.name} • {driver.team}</div>
      <div className="text-7xl sm:text-9xl font-black text-red-500 leading-none">P{result.position}</div>
      <div className="mt-4 font-mono text-center">
        <div className="text-sm text-white/60 uppercase tracking-widest">Best Lap</div>
        <div className="text-2xl font-bold">{result.bestLap > 0 ? result.bestLap.toFixed(2) : "--.--"}s</div>
        <div className="text-sm text-white/60 uppercase tracking-widest mt-3">Points</div>
        <div className="text-2xl font-bold text-red-400">+{result.points}</div>
        {mode === "career" && career && (
          <div className="text-xs text-white/50 mt-2">Career total: {career.points} pts</div>
        )}
      </div>
      <div className="flex gap-3 mt-8">
        <button onClick={onAgain} className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold tracking-widest uppercase">
          Race Again
        </button>
        <button onClick={onMenu} className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold tracking-widest uppercase">
          Menu
        </button>
      </div>
      {mode === "career" && career && (
        <div className="mt-6 w-full max-w-sm">
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
