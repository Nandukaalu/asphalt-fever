/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { CARS, carById, loadSelectedCar } from "@/lib/freeroam/cars";
import { cityById, loadSelectedCity, type CitySpec } from "@/lib/freeroam/cities";
import { supabase } from "@/integrations/supabase/client";

/* ---------- Types ---------- */
type Weather = "clear" | "cloudy" | "light_rain" | "heavy_rain" | "storm" | "fog";
type Collider = { x: number; z: number; rx: number; rz: number };
type Activity = {
  kind: "drift_zone" | "speed_camera" | "time_trial" | "collectible" | "viewpoint" | "car_meet" | "photo_spot";
  x: number; z: number; r: number; label: string; collected?: boolean;
};

type PeerState = {
  uid: string; name: string; carId: string;
  x: number; z: number; yaw: number; speed: number; ts: number;
};

interface FreeRoamProps {
  cityId: string;
  carId: string;
  playerName: string;
  multiplayer: boolean;
  onExit: () => void;
}

const WEATHERS: Weather[] = ["clear", "cloudy", "light_rain", "heavy_rain", "storm", "fog"];
const WEATHER_LABEL: Record<Weather, string> = {
  clear: "Clear", cloudy: "Cloudy", light_rain: "Light Rain",
  heavy_rain: "Heavy Rain", storm: "Thunderstorm", fog: "Fog",
};

/* ---------- Component ---------- */
export default function FreeRoam({ cityId, carId, playerName, multiplayer, onExit }: FreeRoamProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState({
    speed: 0, hour: 12, weather: "clear" as Weather,
    activity: "" as string, collected: 0, totalCollect: 0, peers: 0,
    fps: 0, position: "0,0",
  });
  const [paused, setPaused] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const keysRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef({ steer: 0, throttle: 0, brake: 0 });

  /* ---------- mobile controls ---------- */
  const setSteer = useCallback((v: number) => { touchRef.current.steer = v; }, []);
  const setThrottle = useCallback((v: number) => { touchRef.current.throttle = v; }, []);
  const setBrake = useCallback((v: number) => { touchRef.current.brake = v; }, []);

  useEffect(() => {
    const city = cityById(cityId);
    const car = carById(carId);
    const mount = mountRef.current;
    if (!mount) return;

    /* ---------- renderer ---------- */
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(city.palette.sky);
    scene.fog = new THREE.Fog(city.palette.fog, 50, 320);

    const camera = new THREE.PerspectiveCamera(70, mount.clientWidth / mount.clientHeight, 0.5, 800);

    /* ---------- lights ---------- */
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(60, 100, 40);
    scene.add(sun);
    const moonLight = new THREE.HemisphereLight(0x99bbff, 0x111122, 0.0);
    scene.add(moonLight);

    /* ---------- ground ---------- */
    const WORLD = 600;
    const groundGeo = new THREE.PlaneGeometry(WORLD, WORLD);
    const groundMat = new THREE.MeshLambertMaterial({ color: city.palette.ground });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    /* ---------- procedural city ---------- */
    const colliders: Collider[] = [];
    const buildingsGroup = new THREE.Group();
    const lightsGroup = new THREE.Group(); // window emissive — toggled at night
    scene.add(buildingsGroup, lightsGroup);

    const ROAD_HALF = 6; // half width of each road
    const GRID = 60;     // block size
    const HALF = WORLD / 2;

    // Roads — two perpendicular sets of long boxes along grid lines.
    const roadMat = new THREE.MeshLambertMaterial({ color: city.palette.road });
    for (let g = -HALF; g <= HALF; g += GRID) {
      const rH = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, ROAD_HALF * 2), roadMat);
      rH.rotation.x = -Math.PI / 2; rH.position.set(0, 0.02, g); scene.add(rH);
      const rV = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, WORLD), roadMat);
      rV.rotation.x = -Math.PI / 2; rV.position.set(g, 0.02, 0); scene.add(rV);
    }
    // Lane markings
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    for (let g = -HALF; g <= HALF; g += GRID) {
      for (let x = -HALF; x < HALF; x += 8) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.25), dashMat);
        d.rotation.x = -Math.PI / 2; d.position.set(x, 0.03, g); scene.add(d);
      }
    }

    // Buildings inside each block.
    const colA = new THREE.Color(city.palette.buildingA);
    const colB = new THREE.Color(city.palette.buildingB);
    const accent = new THREE.Color(city.palette.accent);
    const matA = new THREE.MeshLambertMaterial({ color: colA });
    const matB = new THREE.MeshLambertMaterial({ color: colB });
    const windowMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0 });

    const isUrban = city.terrain === "urban" || city.terrain === "tunnel";
    const tallMax = isUrban ? 90 : city.terrain === "mountain" ? 14 : 38;
    const tallMin = isUrban ? 14 : 4;

    for (let bx = -HALF + GRID / 2; bx < HALF; bx += GRID) {
      for (let bz = -HALF + GRID / 2; bz < HALF; bz += GRID) {
        const blockBuildings = Math.floor(2 + Math.random() * 5);
        for (let i = 0; i < blockBuildings; i++) {
          if (Math.random() > city.buildingDensity) continue;
          const w = 6 + Math.random() * 14;
          const d = 6 + Math.random() * 14;
          const h = tallMin + Math.random() * (tallMax - tallMin);
          const ox = bx + (Math.random() - 0.5) * (GRID - ROAD_HALF * 2 - w);
          const oz = bz + (Math.random() - 0.5) * (GRID - ROAD_HALF * 2 - d);
          // skip if too close to road centerlines
          const distRoadX = Math.min(...[-HALF, ...Array.from({ length: Math.ceil(WORLD / GRID) + 1 }, (_, k) => -HALF + k * GRID)].map(g => Math.abs(ox - g)));
          const distRoadZ = Math.min(...[-HALF, ...Array.from({ length: Math.ceil(WORLD / GRID) + 1 }, (_, k) => -HALF + k * GRID)].map(g => Math.abs(oz - g)));
          if (distRoadX < ROAD_HALF + 1 || distRoadZ < ROAD_HALF + 1) continue;

          const mat = Math.random() > 0.5 ? matA : matB;
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(ox, h / 2, oz);
          buildingsGroup.add(b);
          colliders.push({ x: ox, z: oz, rx: w / 2 + 0.5, rz: d / 2 + 0.5 });

          // Window emissive overlay
          if (h > 10) {
            const wm = new THREE.Mesh(
              new THREE.BoxGeometry(w * 1.005, h * 0.9, d * 1.005),
              windowMat.clone(),
            );
            wm.position.set(ox, h / 2, oz);
            lightsGroup.add(wm);
          }
        }
      }
    }

    // Guardrails along outer edge — solid barrier
    const railMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    for (const sign of [-1, 1]) {
      const railH = new THREE.Mesh(new THREE.BoxGeometry(WORLD, 1.2, 0.8), railMat);
      railH.position.set(0, 0.6, sign * HALF); scene.add(railH);
      colliders.push({ x: 0, z: sign * HALF, rx: HALF, rz: 0.6 });
      const railV = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, WORLD), railMat);
      railV.position.set(sign * HALF, 0.6, 0); scene.add(railV);
      colliders.push({ x: sign * HALF, z: 0, rx: 0.6, rz: HALF });
    }

    /* ---------- terrain accents (per city) ---------- */
    if (city.terrain === "desert") {
      const duneMat = new THREE.MeshLambertMaterial({ color: 0xc89058 });
      for (let i = 0; i < 25; i++) {
        const r = 8 + Math.random() * 18;
        const d = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), duneMat);
        d.position.set((Math.random() - 0.5) * WORLD, 0, (Math.random() - 0.5) * WORLD);
        scene.add(d);
      }
    } else if (city.terrain === "mountain") {
      const mtnMat = new THREE.MeshLambertMaterial({ color: 0x6a7a6a });
      for (let i = 0; i < 12; i++) {
        const r = 30 + Math.random() * 60;
        const m = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.5, 6), mtnMat);
        const ang = Math.random() * Math.PI * 2;
        m.position.set(Math.cos(ang) * (HALF + r * 0.3), r * 0.75 - 2, Math.sin(ang) * (HALF + r * 0.3));
        scene.add(m);
      }
    } else if (city.terrain === "beach" || city.terrain === "coastal") {
      const waterMat = new THREE.MeshLambertMaterial({ color: 0x2a6090, transparent: true, opacity: 0.85 });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 1.5, 200), waterMat);
      water.rotation.x = -Math.PI / 2; water.position.set(0, 0.05, -HALF - 100); scene.add(water);
    }

    /* ---------- car factory ---------- */
    const makeCar = (spec: typeof car) => {
      const g = new THREE.Group();
      const body = new THREE.Color(spec.color);
      const accentCol = new THREE.Color(spec.accent);
      const bodyMat = new THREE.MeshLambertMaterial({ color: body });
      const accentMat = new THREE.MeshLambertMaterial({ color: accentCol });
      // body shape by category
      let bw = 1.9, bh = 0.55, bl = 4.4, cabinH = 0.55, cabinL = 2.0;
      if (spec.body === "hyper") { bh = 0.4; cabinH = 0.45; bw = 2.0; bl = 4.6; }
      else if (spec.body === "muscle") { bh = 0.7; cabinH = 0.7; bl = 4.8; }
      else if (spec.body === "sedan") { bh = 0.6; cabinH = 0.75; bl = 5.0; }
      else if (spec.body === "jdm") { bh = 0.55; cabinH = 0.65; }
      const hull = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bl), bodyMat);
      hull.position.y = 0.4 + bh / 2; g.add(hull);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.85, cabinH, cabinL), accentMat);
      cabin.position.y = 0.4 + bh + cabinH / 2; cabin.position.z = -0.2; g.add(cabin);
      // windshield strip
      const glass = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.86, cabinH * 0.6, 0.05), new THREE.MeshBasicMaterial({ color: 0x99ccff, transparent: true, opacity: 0.6 }));
      glass.position.set(0, 0.4 + bh + cabinH / 2, -0.2 + cabinL / 2);
      g.add(glass);
      // wheels
      const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
      const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
      const wheelPos = [[-bw/2, 0.38, bl/2 - 0.7], [bw/2, 0.38, bl/2 - 0.7], [-bw/2, 0.38, -bl/2 + 0.7], [bw/2, 0.38, -bl/2 + 0.7]];
      for (const [x, y, z] of wheelPos) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, y, z);
        g.add(w);
      }
      // taillights & headlights
      const tail = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.9, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      tail.position.set(0, 0.6, -bl / 2); g.add(tail);
      const head = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.9, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffcc }));
      head.position.set(0, 0.6, bl / 2); g.add(head);
      return g;
    };

    const playerCar = makeCar(car);
    scene.add(playerCar);

    /* ---------- traffic ---------- */
    type Traffic = { mesh: THREE.Group; vx: number; vz: number; bounds: { rx: number; rz: number } };
    const traffic: Traffic[] = [];
    const trafficCount = Math.floor(12 + city.trafficDensity * 18);
    for (let i = 0; i < trafficCount; i++) {
      const c = CARS[Math.floor(Math.random() * CARS.length)];
      const t = makeCar(c);
      // place on a road, pick axis & speed
      const axis = Math.random() < 0.5 ? "x" : "z";
      const lane = Math.floor(Math.random() * Math.round(WORLD / GRID)) * GRID - HALF;
      const along = (Math.random() - 0.5) * WORLD;
      if (axis === "x") { t.position.set(along, 0, lane + (Math.random() < 0.5 ? -2 : 2)); t.rotation.y = Math.random() < 0.5 ? 0 : Math.PI; }
      else { t.position.set(lane + (Math.random() < 0.5 ? -2 : 2), 0, along); t.rotation.y = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
      const sp = 6 + Math.random() * 10;
      const vx = Math.sin(t.rotation.y) * sp;
      const vz = Math.cos(t.rotation.y) * sp;
      scene.add(t);
      traffic.push({ mesh: t, vx, vz, bounds: { rx: 1.1, rz: 2.4 } });
    }

    /* ---------- activities ---------- */
    const activities: Activity[] = [];
    const placeAct = (kind: Activity["kind"], label: string, count: number) => {
      for (let i = 0; i < count; i++) {
        // place near a road intersection
        const gx = Math.floor(Math.random() * Math.round(WORLD / GRID)) * GRID - HALF + (Math.random() - 0.5) * 20;
        const gz = Math.floor(Math.random() * Math.round(WORLD / GRID)) * GRID - HALF + (Math.random() - 0.5) * 20;
        activities.push({ kind, x: gx, z: gz, r: 8, label });
      }
    };
    placeAct("drift_zone", "Drift Zone", 4);
    placeAct("speed_camera", "Speed Camera", 6);
    placeAct("time_trial", "Time Trial Start", 3);
    placeAct("collectible", "Collectible", 18);
    placeAct("viewpoint", "Scenic Viewpoint", 4);
    placeAct("car_meet", "Car Meet", 2);
    placeAct("photo_spot", "Photo Spot", 4);

    const totalCollect = activities.filter(a => a.kind === "collectible").length;

    // Activity markers (simple beacons)
    const actMeshes: { mesh: THREE.Mesh; act: Activity }[] = [];
    for (const a of activities) {
      const colorMap: Record<Activity["kind"], number> = {
        drift_zone: 0xff00aa, speed_camera: 0xffaa00, time_trial: 0x00ffaa,
        collectible: 0xffff00, viewpoint: 0x00ccff, car_meet: 0xff6600, photo_spot: 0xff66ff,
      };
      const mat = new THREE.MeshBasicMaterial({ color: colorMap[a.kind], transparent: true, opacity: 0.8 });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 8, 8), mat);
      m.position.set(a.x, 4, a.z);
      scene.add(m);
      actMeshes.push({ mesh: m, act: a });
    }

    /* ---------- rain ---------- */
    const RAIN_N = 1500;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(RAIN_N * 3);
    for (let i = 0; i < RAIN_N; i++) {
      rainPos[i * 3 + 0] = (Math.random() - 0.5) * 200;
      rainPos[i * 3 + 1] = Math.random() * 80;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.3, transparent: true, opacity: 0 });
    const rain = new THREE.Points(rainGeo, rainMat);
    scene.add(rain);

    /* ---------- multiplayer peers ---------- */
    const peerMeshes = new Map<string, THREE.Group>();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const myUid = `${Math.random().toString(36).slice(2, 9)}-${Date.now() % 100000}`;
    let lastBroadcast = 0;
    if (multiplayer) {
      channel = supabase.channel(`freeroam:${city.id}`, {
        config: { broadcast: { self: false }, presence: { key: myUid } },
      });
      channel
        .on("broadcast", { event: "pos" }, ({ payload }: { payload: PeerState }) => {
          if (payload.uid === myUid) return;
          let g = peerMeshes.get(payload.uid);
          if (!g) {
            const c = carById(payload.carId);
            g = makeCar(c);
            // floating name tag (simple sprite stand-in: small box above car)
            const tag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x00ffaa }));
            tag.position.y = 3;
            g.add(tag);
            scene.add(g);
            peerMeshes.set(payload.uid, g);
          }
          g.position.set(payload.x, 0, payload.z);
          g.rotation.y = payload.yaw;
          (g.userData as any).lastTs = payload.ts;
        })
        .subscribe();
    }

    /* ---------- input ---------- */
    const onKeyDown = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = true; if (e.key === "Escape") setPaused(p => !p); };
    const onKeyUp = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    /* ---------- physics state ---------- */
    // start at a road intersection
    playerCar.position.set(0, 0, 0);
    let yaw = 0, speed = 0;
    let lastT = performance.now();
    let timeOfDay = city.startHour;
    let weather: Weather = "clear";
    let weatherTimer = 0;
    let activityMsg = "";
    let activityTimer = 0;
    let collected = 0;
    let driftMeter = 0;
    let speedCamFlash = 0;
    let timeTrialStart = 0;
    let inTimeTrial = false;
    let fpsSamples: number[] = [];
    let raf = 0;
    // Crash / stability state
    let controlLoss = 0;          // 0..1, decays over time, reduces steering authority
    let yawSpin = 0;              // angular velocity from impact (rad/s)
    let scrapeT = 0;              // continuous wall-scrape timer, drives sparks/smoke spawn
    let camShake = 0;             // 0..1

    /* ---------- crash FX pools (sparks + smoke) ---------- */
    const SPARK_N = 80;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(SPARK_N * 3);
    const sparkVel = new Float32Array(SPARK_N * 3);
    const sparkLife = new Float32Array(SPARK_N); // seconds remaining
    for (let i = 0; i < SPARK_N; i++) { sparkPos[i*3+1] = -1000; }
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xffcc66, size: 0.45, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    scene.add(sparks);

    const SMOKE_N = 60;
    const smokeGeo = new THREE.BufferGeometry();
    const smokePos = new Float32Array(SMOKE_N * 3);
    const smokeVel = new Float32Array(SMOKE_N * 3);
    const smokeLife = new Float32Array(SMOKE_N);
    const smokeMax = new Float32Array(SMOKE_N);
    for (let i = 0; i < SMOKE_N; i++) { smokePos[i*3+1] = -1000; }
    smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3));
    const smokeMat = new THREE.PointsMaterial({
      color: 0xcccccc, size: 2.2, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const smoke = new THREE.Points(smokeGeo, smokeMat);
    scene.add(smoke);

    const emitSparks = (x: number, z: number, count: number, dirX: number, dirZ: number) => {
      let emitted = 0;
      for (let i = 0; i < SPARK_N && emitted < count; i++) {
        if (sparkLife[i] > 0) continue;
        sparkPos[i*3+0] = x; sparkPos[i*3+1] = 0.6; sparkPos[i*3+2] = z;
        const spread = 0.7;
        sparkVel[i*3+0] = dirX * (4 + Math.random()*8) + (Math.random()-0.5)*spread*6;
        sparkVel[i*3+1] = 2 + Math.random()*5;
        sparkVel[i*3+2] = dirZ * (4 + Math.random()*8) + (Math.random()-0.5)*spread*6;
        sparkLife[i] = 0.35 + Math.random()*0.35;
        emitted++;
      }
      (sparkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    };
    const emitSmoke = (x: number, z: number, count: number) => {
      let emitted = 0;
      for (let i = 0; i < SMOKE_N && emitted < count; i++) {
        if (smokeLife[i] > 0) continue;
        smokePos[i*3+0] = x; smokePos[i*3+1] = 0.5; smokePos[i*3+2] = z;
        smokeVel[i*3+0] = (Math.random()-0.5) * 1.5;
        smokeVel[i*3+1] = 0.4 + Math.random() * 0.6;
        smokeVel[i*3+2] = (Math.random()-0.5) * 1.5;
        smokeLife[i] = 0.9 + Math.random() * 0.8;
        smokeMax[i] = smokeLife[i];
        emitted++;
      }
      (smokeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    };

    const setAct = (msg: string, ms = 2500) => {
      activityMsg = msg;
      activityTimer = ms;
    };

    /* ---------- main loop ---------- */
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      if (paused || photoMode) {
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
        return;
      }

      // time of day advances (1 in-game hour per 30s)
      timeOfDay = (timeOfDay + dt / 30) % 24;
      const dayT = (timeOfDay - 6) / 12; // -0.5..1.5
      const isNight = timeOfDay < 6 || timeOfDay > 19;
      const dayMix = Math.max(0, Math.min(1, Math.sin((timeOfDay / 24) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5));
      // sky/fog colors
      const dayCol = new THREE.Color(city.palette.sky);
      const nightCol = new THREE.Color(city.palette.skyNight);
      const sky = nightCol.clone().lerp(dayCol, dayMix);
      scene.background = sky;
      (scene.fog as THREE.Fog).color.copy(sky);
      ambient.intensity = 0.15 + dayMix * 0.4;
      sun.intensity = dayMix * 1.0;
      moonLight.intensity = (1 - dayMix) * 0.45;
      // window lights at night
      const windowOpacity = isNight ? 0.85 : (dayMix > 0.85 ? 0 : 0.3 * (1 - dayMix));
      lightsGroup.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mat = mesh.material as THREE.MeshBasicMaterial | undefined;
        if (mat && mat.transparent) mat.opacity = windowOpacity;
      });

      // weather evolution
      weatherTimer -= dt;
      if (weatherTimer <= 0) {
        weather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
        weatherTimer = 30 + Math.random() * 45;
      }
      const wet = weather === "light_rain" ? 0.5 : weather === "heavy_rain" ? 0.85 : weather === "storm" ? 1.0 : weather === "fog" ? 0.1 : 0;
      const vis = weather === "fog" ? 0.35 : weather === "storm" ? 0.6 : weather === "heavy_rain" ? 0.75 : 1;
      (scene.fog as THREE.Fog).far = 50 + 270 * vis;
      rainMat.opacity = Math.min(1, wet * 1.1);
      if (wet > 0) {
        const pos = rainGeo.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < RAIN_N; i++) {
          arr[i * 3 + 1] -= dt * (40 + wet * 60);
          if (arr[i * 3 + 1] < 0) {
            arr[i * 3 + 0] = playerCar.position.x + (Math.random() - 0.5) * 200;
            arr[i * 3 + 1] = 60;
            arr[i * 3 + 2] = playerCar.position.z + (Math.random() - 0.5) * 200;
          } else {
            // drift around player
            const dx = playerCar.position.x - arr[i * 3 + 0];
            const dz = playerCar.position.z - arr[i * 3 + 2];
            if (Math.abs(dx) > 120) arr[i * 3 + 0] += Math.sign(dx) * 200;
            if (Math.abs(dz) > 120) arr[i * 3 + 2] += Math.sign(dz) * 200;
          }
        }
        pos.needsUpdate = true;
      }

      /* ----- input ----- */
      const k = keysRef.current;
      const t = touchRef.current;
      const steerIn = (k["a"] || k["arrowleft"] ? -1 : 0) + (k["d"] || k["arrowright"] ? 1 : 0) + t.steer;
      const throttleIn = (k["w"] || k["arrowup"] ? 1 : 0) + t.throttle;
      const brakeIn = (k["s"] || k["arrowdown"] || k[" "] ? 1 : 0) + t.brake;

      const gripMul = 1 - wet * 0.35; // wet roads = less grip
      const maxSpeed = car.topSpeed * gripMul;
      const accel = car.accel;
      const brake = car.braking * (0.7 + 0.3 * gripMul);

      if (throttleIn > 0) speed += accel * throttleIn * dt;
      if (brakeIn > 0) speed -= brake * brakeIn * dt;
      // engine braking / drag
      speed *= 1 - 0.4 * dt;
      if (speed > maxSpeed) speed = maxSpeed;
      if (speed < -maxSpeed * 0.35) speed = -maxSpeed * 0.35;

      const steerEff = Math.max(-1, Math.min(1, steerIn));
      const steerAuthority = Math.max(0.2, 1 - controlLoss * 0.7);
      const steerRate = car.handling * 1.4 * gripMul * steerAuthority;
      yaw -= steerEff * steerRate * dt * (Math.abs(speed) / Math.max(8, maxSpeed * 0.4));
      // post-impact spin
      yaw += yawSpin * dt;
      yawSpin *= Math.pow(0.05, dt); // decay fast
      controlLoss *= Math.pow(0.25, dt);
      playerCar.rotation.y = yaw;

      const dx = Math.sin(yaw) * speed * dt;
      const dz = Math.cos(yaw) * speed * dt;
      const nx = playerCar.position.x + dx;
      const nz = playerCar.position.z + dz;

      // ===== Realistic collision resolution =====
      // Find first overlapping AABB (static or traffic), compute minimum-penetration
      // axis as wall normal, push out along it, decompose velocity into normal +
      // tangential. Normal component is killed (no rubber bounce), tangential
      // component is preserved with friction → car scrapes/slides along the wall.
      const carRX = 1.1, carRZ = 2.4;
      type Box = { x: number; z: number; rx: number; rz: number };
      let hitBox: Box | null = null;
      for (const c of colliders) {
        if (Math.abs(nx - c.x) < carRX + c.rx && Math.abs(nz - c.z) < carRZ + c.rz) { hitBox = c; break; }
      }
      if (!hitBox) {
        for (const tr of traffic) {
          if (Math.abs(nx - tr.mesh.position.x) < carRX + tr.bounds.rx && Math.abs(nz - tr.mesh.position.z) < carRZ + tr.bounds.rz) {
            hitBox = { x: tr.mesh.position.x, z: tr.mesh.position.z, rx: tr.bounds.rx, rz: tr.bounds.rz };
            break;
          }
        }
      }
      if (hitBox) {
        const penX = (carRX + hitBox.rx) - Math.abs(nx - hitBox.x);
        const penZ = (carRZ + hitBox.rz) - Math.abs(nz - hitBox.z);
        const sx = Math.sign(nx - hitBox.x) || 1;
        const sz = Math.sign(nz - hitBox.z) || 1;
        let nrmX = 0, nrmZ = 0;
        if (penX < penZ) {
          // resolve along X — slide along Z
          playerCar.position.x = hitBox.x + sx * (carRX + hitBox.rx + 0.001);
          playerCar.position.z = nz;
          nrmX = sx;
        } else {
          playerCar.position.z = hitBox.z + sz * (carRZ + hitBox.rz + 0.001);
          playerCar.position.x = nx;
          nrmZ = sz;
        }
        // Velocity vector in world space (forward only — no lateral state in FR sim)
        const vx = Math.sin(yaw) * speed;
        const vz = Math.cos(yaw) * speed;
        const vDotN = vx * nrmX + vz * nrmZ;        // signed normal speed (negative = into wall)
        const intoWall = Math.max(0, -vDotN);        // m/s of head-on closure
        const absSpeed = Math.abs(speed);
        const headOn = absSpeed > 0.1 ? intoWall / absSpeed : 0; // 0 glancing .. 1 head-on
        const massFactor = car.weight / 1500;        // heavier = carries more momentum
        // Energy loss: head-on hits bleed most of the speed; glancing barely slows
        // High speeds bleed proportionally (no bouncing at 500 kph — just heavy slowdown)
        const headOnLoss = headOn * (0.45 + Math.min(0.45, intoWall / 60)) / Math.max(0.7, massFactor * 0.6 + 0.5);
        const scrapeLoss = (1 - headOn) * 0.18 * (1 + intoWall / 80); // tangential friction
        speed *= Math.max(0, 1 - headOnLoss - scrapeLoss * dt * 8);
        // No rebound. Cars don't bounce off walls — they scrape and slow.
        // Tiny separation impulse only for very low-speed wedged contacts.
        if (intoWall < 1.5 && absSpeed < 3) speed *= 0.5;
        // Post-impact instability
        const severity = headOn * Math.min(1, intoWall / 30);
        controlLoss = Math.min(1, controlLoss + severity * 0.9);
        yawSpin += (Math.random() - 0.5) * severity * 2.4;
        camShake = Math.max(camShake, severity);
        // FX — sparks for any contact (scrape), smoke for harder hits
        const contactX = playerCar.position.x - nrmX * carRX;
        const contactZ = playerCar.position.z - nrmZ * carRZ;
        const sparkCount = Math.min(12, 2 + Math.round(intoWall * 0.6));
        if (sparkCount > 0 && absSpeed > 4) emitSparks(contactX, contactZ, sparkCount, -nrmX, -nrmZ);
        if (intoWall > 8) emitSmoke(contactX, contactZ, Math.min(6, 1 + Math.round(intoWall / 8)));
        scrapeT = 0.15;
      } else {
        playerCar.position.x = nx;
        playerCar.position.z = nz;
      }

      // Continuous scrape — light sparks while still touching a wall
      scrapeT = Math.max(0, scrapeT - dt);

      // Hard braking smoke (locked-up tires)
      if (brakeIn > 0 && Math.abs(speed) > 18) {
        if (Math.random() < dt * 12) {
          const back = -2.0;
          emitSmoke(
            playerCar.position.x + Math.sin(yaw) * back + (Math.random()-0.5),
            playerCar.position.z + Math.cos(yaw) * back + (Math.random()-0.5),
            1,
          );
        }
      }

      // Update spark + smoke particle systems
      const GRAV = 14;
      for (let i = 0; i < SPARK_N; i++) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        if (sparkLife[i] <= 0) { sparkPos[i*3+1] = -1000; continue; }
        sparkVel[i*3+1] -= GRAV * dt;
        sparkPos[i*3+0] += sparkVel[i*3+0] * dt;
        sparkPos[i*3+1] += sparkVel[i*3+1] * dt;
        sparkPos[i*3+2] += sparkVel[i*3+2] * dt;
        if (sparkPos[i*3+1] < 0.05) { sparkVel[i*3+1] *= -0.3; sparkPos[i*3+1] = 0.05; sparkVel[i*3+0] *= 0.6; sparkVel[i*3+2] *= 0.6; }
      }
      (sparkGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      for (let i = 0; i < SMOKE_N; i++) {
        if (smokeLife[i] <= 0) continue;
        smokeLife[i] -= dt;
        if (smokeLife[i] <= 0) { smokePos[i*3+1] = -1000; continue; }
        smokePos[i*3+0] += smokeVel[i*3+0] * dt;
        smokePos[i*3+1] += smokeVel[i*3+1] * dt;
        smokePos[i*3+2] += smokeVel[i*3+2] * dt;
        smokeVel[i*3+0] *= Math.pow(0.4, dt);
        smokeVel[i*3+2] *= Math.pow(0.4, dt);
      }
      (smokeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

      // traffic update
      for (const tr of traffic) {
        tr.mesh.position.x += tr.vx * dt;
        tr.mesh.position.z += tr.vz * dt;
        if (Math.abs(tr.mesh.position.x) > HALF - 4) tr.vx *= -1;
        if (Math.abs(tr.mesh.position.z) > HALF - 4) tr.vz *= -1;
      }

      // activity beacons
      for (const am of actMeshes) {
        am.mesh.position.y = 4 + Math.sin(now * 0.003 + am.act.x * 0.01) * 0.5;
        am.mesh.rotation.y += dt * 1.5;
        const a = am.act;
        const d2 = (playerCar.position.x - a.x) ** 2 + (playerCar.position.z - a.z) ** 2;
        if (d2 < a.r * a.r && !a.collected) {
          if (a.kind === "collectible") {
            a.collected = true; collected++;
            am.mesh.visible = false;
            setAct(`+1 Collectible (${collected}/${totalCollect})`);
          } else if (a.kind === "speed_camera") {
            const kph = Math.round(Math.abs(speed) * 3.6);
            speedCamFlash = 0.4;
            setAct(`Speed Camera: ${kph} km/h`);
          } else if (a.kind === "drift_zone") {
            driftMeter += dt * 30;
            setAct(`Drift Zone — score ${Math.round(driftMeter)}`, 800);
          } else if (a.kind === "time_trial") {
            if (!inTimeTrial) { inTimeTrial = true; timeTrialStart = now; setAct("Time Trial started!"); }
            else if (now - timeTrialStart > 8000) {
              const tSec = ((now - timeTrialStart) / 1000).toFixed(2);
              setAct(`Time Trial: ${tSec}s`); inTimeTrial = false;
            }
          } else {
            setAct(a.label);
          }
        }
      }
      activityTimer -= dt * 1000;
      speedCamFlash = Math.max(0, speedCamFlash - dt);

      /* ----- camera ----- */
      const camDist = 8 + Math.min(6, Math.abs(speed) * 0.15);
      const camH = 3.5;
      const camX = playerCar.position.x - Math.sin(yaw) * camDist;
      const camZ = playerCar.position.z - Math.cos(yaw) * camDist;
      camera.position.lerp(new THREE.Vector3(camX, camH, camZ), 0.15);
      camera.lookAt(playerCar.position.x, 1, playerCar.position.z);

      /* ----- MP broadcast (10 Hz) ----- */
      if (channel && now - lastBroadcast > 100) {
        lastBroadcast = now;
        channel.send({
          type: "broadcast",
          event: "pos",
          payload: {
            uid: myUid, name: playerName, carId: car.id,
            x: playerCar.position.x, z: playerCar.position.z,
            yaw, speed, ts: now,
          } as PeerState,
        });
        // prune stale peers
        for (const [uid, mesh] of peerMeshes) {
          if (now - ((mesh.userData as any).lastTs ?? 0) > 8000) {
            scene.remove(mesh); peerMeshes.delete(uid);
          }
        }
      }

      renderer.render(scene, camera);

      // FPS
      const dtMs = performance.now() - now;
      fpsSamples.push(1000 / Math.max(1, dt * 1000 + dtMs));
      if (fpsSamples.length > 30) fpsSamples.shift();

      // HUD push at ~15 Hz
      if (Math.floor(now / 66) !== Math.floor((now - 16) / 66)) {
        setHud({
          speed: Math.round(Math.abs(speed) * 3.6),
          hour: timeOfDay,
          weather,
          activity: activityTimer > 0 ? activityMsg : "",
          collected, totalCollect,
          peers: peerMeshes.size,
          fps: Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length),
          position: `${Math.round(playerCar.position.x)},${Math.round(playerCar.position.z)}`,
        });
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    /* ---------- resize ---------- */
    const onResize = () => {
      if (!mount) return;
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      if (channel) supabase.removeChannel(channel);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, carId, multiplayer, playerName]);

  const city: CitySpec = cityById(cityId);
  const car = carById(carId);

  const hh = Math.floor(hud.hour);
  const mm = Math.floor((hud.hour - hh) * 60);
  const tod = `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 bg-black">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Top HUD */}
      <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2 pointer-events-none">
        <div className="glass rounded-xl px-3 py-2 text-xs font-display uppercase tracking-widest pointer-events-auto">
          <div className="text-primary">{city.name} · {city.country}</div>
          <div className="text-muted-foreground text-[10px]">{car.brand} {car.name}</div>
        </div>
        <div className="glass rounded-xl px-3 py-2 text-xs font-display uppercase tracking-widest text-right">
          <div>{tod} · {WEATHER_LABEL[hud.weather]}</div>
          <div className="text-[10px] text-muted-foreground">★ {hud.collected}/{hud.totalCollect} · {hud.peers} online · {hud.fps} fps</div>
        </div>
        <button
          onClick={onExit}
          className="glass rounded-full px-3 py-2 text-xs font-display uppercase tracking-widest pointer-events-auto hover:shadow-neon"
        >
          ✕ Exit
        </button>
      </div>

      {/* Speedometer */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 glass rounded-2xl px-6 py-2 text-center pointer-events-none">
        <div className="text-3xl font-display font-black text-primary">{hud.speed}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">km/h</div>
      </div>

      {/* Activity toast */}
      {hud.activity && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 glass rounded-xl px-4 py-2 text-sm font-display uppercase tracking-widest text-accent pointer-events-none animate-slide-up">
          {hud.activity}
        </div>
      )}

      {/* Photo mode toggle */}
      <button
        onClick={() => setPhotoMode(p => !p)}
        className="absolute top-20 right-2 glass rounded-full px-3 py-2 text-[10px] font-display uppercase tracking-widest"
      >
        📷 {photoMode ? "Resume" : "Photo"}
      </button>

      {/* Touch controls */}
      <TouchControls onSteer={setSteer} onThrottle={setThrottle} onBrake={setBrake} />
    </div>
  );
}

/* ---------- Touch controls ---------- */
function TouchControls({
  onSteer, onThrottle, onBrake,
}: { onSteer: (v: number) => void; onThrottle: (v: number) => void; onBrake: (v: number) => void }) {
  return (
    <>
      {/* Steering wheel area: left half of screen */}
      <div
        className="absolute bottom-4 left-4 w-32 h-32 rounded-full glass flex items-center justify-center select-none touch-none"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const dx = (e.clientX - cx) / (r.width / 2);
          onSteer(Math.max(-1, Math.min(1, dx)));
        }}
        onPointerUp={() => onSteer(0)}
        onPointerCancel={() => onSteer(0)}
      >
        <div className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">Steer</div>
      </div>

      {/* Throttle */}
      <button
        className="absolute bottom-4 right-4 w-20 h-20 rounded-full bg-primary/80 text-primary-foreground font-display uppercase tracking-widest text-xs shadow-neon active:scale-95 touch-none"
        onPointerDown={() => onThrottle(1)}
        onPointerUp={() => onThrottle(0)}
        onPointerCancel={() => onThrottle(0)}
        onPointerLeave={() => onThrottle(0)}
      >
        Gas
      </button>
      {/* Brake */}
      <button
        className="absolute bottom-28 right-4 w-16 h-16 rounded-full bg-destructive/80 text-destructive-foreground font-display uppercase tracking-widest text-[10px] active:scale-95 touch-none"
        onPointerDown={() => onBrake(1)}
        onPointerUp={() => onBrake(0)}
        onPointerCancel={() => onBrake(0)}
        onPointerLeave={() => onBrake(0)}
      >
        Brake
      </button>
    </>
  );
}