import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

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

type Mode = "quick" | "career";

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
];

const SAVE_KEY = "apex-gp-career-v1";

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
  const [screen, setScreen] = useState<"menu" | "driver" | "track" | "racing" | "result">("menu");
  const [mode, setMode] = useState<Mode>("quick");
  const [driverId, setDriverId] = useState<string>(DRIVERS[0].id);
  const [trackId, setTrackId] = useState<string>(TRACKS[0].id);
  const [career, setCareer] = useState<CareerSave | null>(null);
  const [result, setResult] = useState<{ position: number; bestLap: number; points: number } | null>(null);
  const touchRef = useRef({ accel: false, brake: false, steer: 0, handbrake: false });

  useEffect(() => { setCareer(loadSave()); }, []);

  const driver = useMemo(() => DRIVERS.find((d) => d.id === driverId)!, [driverId]);
  const track = useMemo(() => TRACKS.find((t) => t.id === trackId)!, [trackId]);

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
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9ecbff);
    scene.fog = new THREE.Fog(0x9ecbff, 250, 1100);

    const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 2500);

    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x445566, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1c4, 1.5);
    sun.position.set(160, 240, 100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -300;
    sun.shadow.camera.right = 300;
    sun.shadow.camera.top = 300;
    sun.shadow.camera.bottom = -300;
    sun.shadow.camera.far = 800;
    scene.add(sun);

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

    // Grass
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 1 })
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

    // Grandstands
    const standMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.9 });
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

    // Trees
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x205020 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1a });
    for (let i = 0; i < 100; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 350 + Math.random() * 500;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3), trunkMat);
      trunk.position.set(x, 1.5, z);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 6, 8), treeMat);
      leaves.position.set(x, 5, z);
      scene.add(trunk, leaves);
    }

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
    const startPos = curve.getPointAt(0.001);
    const startTan = curve.getTangentAt(0.001).normalize();
    const startHeading = Math.atan2(startTan.x, startTan.z);
    player.group.position.copy(startPos);
    player.group.rotation.y = startHeading;

    // AI cars (other drivers)
    type AI = { car: ReturnType<typeof buildCar>; t: number; speed: number };
    const MAX_SPEED_PREVIEW = 78;
    const AI_SPEED = MAX_SPEED_PREVIEW * 0.88; // identical pace for fairness
    const ais: (AI & { driver: Driver; offset: number })[] = [];
    const otherDrivers = DRIVERS.filter((d) => d.id !== driver.id);
    otherDrivers.forEach((d, i) => {
      const c = buildCar(d);
      scene.add(c.group);
      const tStart = -0.004 - i * 0.005; // staggered grid behind player
      const lateral = (i % 2 === 0 ? 1 : -1) * (2 + (i % 4)); // weave across track
      ais.push({ car: c, t: (tStart + 1) % 1, speed: AI_SPEED, driver: d, offset: lateral });
    });

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
    const totalLaps = track.laps;
    let lapStart = performance.now();
    let bestLap = 0;
    let prevT = 0;
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

    const animate = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

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
        speed *= 0.55;
        lateralVel *= -0.3;
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

      // Lap detection
      if (prevT > 0.9 && ct2.t < 0.1) {
        const lapTime = (now - lapStart) / 1000;
        if (bestLap === 0 || lapTime < bestLap) bestLap = lapTime;
        lap++;
        lapStart = now;
        if (lap > totalLaps && !raceFinished) {
          raceFinished = true;
        }
      }
      prevT = ct2.t;
      raceProgress = (lap - 1) + ct2.t;

      // ---------- AI ----------
      const cLen = curveLength(curve);
      ais.forEach((ai) => {
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

      // Position calc — sort all cars by total progress
      let position = 1;
      const playerLapFrac = raceProgress % 1;
      ais.forEach((ai) => {
        const aiLapEst = Math.floor(raceProgress) + (ai.t < playerLapFrac - 0.5 ? 1 : ai.t > playerLapFrac + 0.5 ? -1 : 0);
        const aiProg = aiLapEst + ai.t;
        if (aiProg > raceProgress) position++;
      });

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
        // Finalize after a beat
        const points = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][position - 1] ?? 0;
        const r = { position, bestLap, points };
        setResult(r);
        if (mode === "career") {
          const cur = loadSave() ?? { driverId: driver.id, points: 0, completed: {} };
          cur.driverId = driver.id;
          const prev = cur.completed[track.id];
          const newBest = prev && prev.bestLap > 0 && prev.bestLap < bestLap ? prev.bestLap : bestLap;
          cur.completed[track.id] = { bestLap: newBest, position, points };
          cur.points = Object.values(cur.completed).reduce((a, b) => a + b.points, 0);
          writeSave(cur);
          setCareer(cur);
        }
        setScreen("result");
        return; // stop loop
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
          onReset={() => { try { localStorage.removeItem(SAVE_KEY); } catch {}; setCareer(null); }}
        />
      )}

      {screen === "driver" && (
        <DriverSelect
          driverId={driverId}
          onPick={(id) => setDriverId(id)}
          onBack={() => setScreen("menu")}
          onNext={() => setScreen("track")}
        />
      )}

      {screen === "track" && (
        <TrackSelect
          trackId={trackId}
          career={career}
          mode={mode}
          onPick={(id) => setTrackId(id)}
          onBack={() => setScreen("driver")}
          onStart={() => { setResult(null); setScreen("racing"); }}
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

          <button
            onClick={() => setScreen("menu")}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-black/50 backdrop-blur text-white text-xs uppercase tracking-widest border border-white/20 hover:bg-black/70"
          >
            Quit
          </button>

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
function MainMenu({ career, onQuick, onCareer, onReset }: {
  career: CareerSave | null;
  onQuick: () => void;
  onCareer: () => void;
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
            <button onClick={onReset} className="mt-2 text-white/40 hover:text-red-400 underline text-[10px]">
              Reset career
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DriverSelect({ driverId, onPick, onBack, onNext }: {
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
        <p className="text-white/50 text-sm mb-6 uppercase tracking-widest">Select your seat for the season</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {DRIVERS.map((d) => {
            const selected = d.id === driverId;
            return (
              <button
                key={d.id}
                onClick={() => onPick(d.id)}
                className={`relative p-4 border-2 transition text-left ${selected ? "border-red-500 bg-red-500/10" : "border-white/20 hover:border-white/40 bg-black/40"}`}
              >
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

function TrackSelect({ trackId, career, mode, onPick, onBack, onStart }: {
  trackId: string;
  career: CareerSave | null;
  mode: Mode;
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TRACKS.map((t) => {
            const selected = t.id === trackId;
            const result = career?.completed[t.id];
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
                <div className="text-white/50 text-xs mt-1">{t.laps} laps</div>
                {result && (
                  <div className="mt-2 text-xs text-red-400 font-mono">
                    Best P{result.position} • {result.bestLap.toFixed(2)}s • +{result.points}pts
                  </div>
                )}
              </button>
            );
          })}
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