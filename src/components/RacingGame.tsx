import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * Arcade F1-style 3D racer.
 * - Cockpit view (driver perspective)
 * - F1-styled open-wheel car (procedural geometry)
 * - Closed circuit track with kerbs, grass, grandstands
 * - Keyboard controls: W/Up accelerate, S/Down brake, A/D or arrows steer, Space handbrake
 */
export default function RacingGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState({ speed: 0, gear: 1, lap: 1, lapTime: 0, bestLap: 0 });
  const [started, setStarted] = useState(false);
  const touchRef = useRef({ accel: false, brake: false, steer: 0, handbrake: false });

  useEffect(() => {
    if (!started) return;
    const mount = mountRef.current!;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9ecbff);
    scene.fog = new THREE.Fog(0x9ecbff, 200, 900);

    // ---------- Camera (cockpit) ----------
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 2000);

    // ---------- Lights ----------
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x445566, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1c4, 1.4);
    sun.position.set(120, 200, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    sun.shadow.camera.far = 600;
    scene.add(sun);

    // ---------- Track (closed loop via Catmull-Rom) ----------
    // Define waypoints in XZ plane (F1-style flowing circuit)
    const waypoints: THREE.Vector3[] = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -120),
      new THREE.Vector3(40, 0, -200),
      new THREE.Vector3(140, 0, -240),
      new THREE.Vector3(220, 0, -200),
      new THREE.Vector3(240, 0, -100),
      new THREE.Vector3(180, 0, -40),
      new THREE.Vector3(220, 0, 60),
      new THREE.Vector3(180, 0, 160),
      new THREE.Vector3(60, 0, 200),
      new THREE.Vector3(-60, 0, 180),
      new THREE.Vector3(-160, 0, 100),
      new THREE.Vector3(-180, 0, -20),
      new THREE.Vector3(-120, 0, -100),
      new THREE.Vector3(-40, 0, -60),
    ];
    const curve = new THREE.CatmullRomCurve3(waypoints, true, "centripetal", 0.5);

    const TRACK_WIDTH = 14;
    const SEGMENTS = 600;

    // Build track ribbon
    const trackGeo = new THREE.BufferGeometry();
    const trackPositions: number[] = [];
    const trackUVs: number[] = [];
    const trackIndices: number[] = [];
    const kerbLeftPos: number[] = [];
    const kerbRightPos: number[] = [];
    const kerbLeftIdx: number[] = [];
    const kerbRightIdx: number[] = [];
    const centerline: THREE.Vector3[] = [];
    const tangents: THREE.Vector3[] = [];

    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const p = curve.getPointAt(t);
      const tg = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tg.z, 0, tg.x); // left perpendicular
      centerline.push(p);
      tangents.push(tg);

      const left = p.clone().addScaledVector(normal, TRACK_WIDTH / 2);
      const right = p.clone().addScaledVector(normal, -TRACK_WIDTH / 2);
      trackPositions.push(left.x, 0.02, left.z, right.x, 0.02, right.z);
      trackUVs.push(0, t * 80, 1, t * 80);

      // kerbs
      const kL1 = p.clone().addScaledVector(normal, TRACK_WIDTH / 2);
      const kL2 = p.clone().addScaledVector(normal, TRACK_WIDTH / 2 + 1.2);
      kerbLeftPos.push(kL1.x, 0.03, kL1.z, kL2.x, 0.03, kL2.z);
      const kR1 = p.clone().addScaledVector(normal, -TRACK_WIDTH / 2);
      const kR2 = p.clone().addScaledVector(normal, -TRACK_WIDTH / 2 - 1.2);
      kerbRightPos.push(kR1.x, 0.03, kR1.z, kR2.x, 0.03, kR2.z);

      if (i < SEGMENTS) {
        const a = i * 2,
          b = i * 2 + 1,
          c = i * 2 + 2,
          d = i * 2 + 3;
        trackIndices.push(a, c, b, b, c, d);
        kerbLeftIdx.push(a, c, b, b, c, d);
        kerbRightIdx.push(a, c, b, b, c, d);
      }
    }
    trackGeo.setAttribute("position", new THREE.Float32BufferAttribute(trackPositions, 3));
    trackGeo.setAttribute("uv", new THREE.Float32BufferAttribute(trackUVs, 2));
    trackGeo.setIndex(trackIndices);
    trackGeo.computeVertexNormals();
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.85 });
    const track = new THREE.Mesh(trackGeo, trackMat);
    track.receiveShadow = true;
    scene.add(track);

    // Kerbs (alternating red/white via vertex colors approximated by stripes texture)
    const kerbTexCanvas = document.createElement("canvas");
    kerbTexCanvas.width = 64;
    kerbTexCanvas.height = 64;
    const kctx = kerbTexCanvas.getContext("2d")!;
    for (let i = 0; i < 8; i++) {
      kctx.fillStyle = i % 2 === 0 ? "#e11d2c" : "#ffffff";
      kctx.fillRect(0, i * 8, 64, 8);
    }
    const kerbTex = new THREE.CanvasTexture(kerbTexCanvas);
    kerbTex.wrapS = kerbTex.wrapT = THREE.RepeatWrapping;
    kerbTex.repeat.set(1, 200);

    function makeKerb(pos: number[], idx: number[]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const uvs: number[] = [];
      for (let i = 0; i < pos.length / 6; i++) uvs.push(0, i / 10, 1, i / 10);
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7 });
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    makeKerb(kerbLeftPos, kerbLeftIdx);
    makeKerb(kerbRightPos, kerbRightIdx);

    // White track edge lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const leftPts: THREE.Vector3[] = [];
    const rightPts: THREE.Vector3[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const p = curve.getPointAt(t);
      const tg = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tg.z, 0, tg.x);
      leftPts.push(p.clone().addScaledVector(normal, TRACK_WIDTH / 2 - 0.1).setY(0.04));
      rightPts.push(p.clone().addScaledVector(normal, -TRACK_WIDTH / 2 + 0.1).setY(0.04));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftPts), lineMat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightPts), lineMat));

    // Ground (grass)
    const grassGeo = new THREE.PlaneGeometry(2000, 2000);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 1 });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0;
    grass.receiveShadow = true;
    scene.add(grass);

    // Start/finish line
    const sfGeo = new THREE.PlaneGeometry(TRACK_WIDTH, 2);
    const sfCanvas = document.createElement("canvas");
    sfCanvas.width = 128;
    sfCanvas.height = 16;
    const sctx = sfCanvas.getContext("2d")!;
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 2; y++) {
        sctx.fillStyle = (x + y) % 2 === 0 ? "#fff" : "#000";
        sctx.fillRect(x * 8, y * 8, 8, 8);
      }
    const sfTex = new THREE.CanvasTexture(sfCanvas);
    const sfMat = new THREE.MeshBasicMaterial({ map: sfTex });
    const startLine = new THREE.Mesh(sfGeo, sfMat);
    startLine.rotation.x = -Math.PI / 2;
    const sfTangent = curve.getTangentAt(0).normalize();
    startLine.position.copy(curve.getPointAt(0)).setY(0.05);
    startLine.rotation.z = -Math.atan2(sfTangent.z, sfTangent.x);
    scene.add(startLine);

    // Grandstands (simple boxes around outer track)
    const standMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.9 });
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const p = curve.getPointAt(t);
      const tg = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tg.z, 0, tg.x);
      const pos = p.clone().addScaledVector(normal, -(TRACK_WIDTH / 2 + 25));
      const stand = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 6), standMat);
      stand.position.set(pos.x, 4, pos.z);
      stand.lookAt(p.x, 4, p.z);
      stand.castShadow = true;
      stand.receiveShadow = true;
      scene.add(stand);
    }

    // Trees scattered far from track
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x205020 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1a });
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 300 + Math.random() * 400;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3), trunkMat);
      trunk.position.set(x, 1.5, z);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 6, 8), treeMat);
      leaves.position.set(x, 5, z);
      scene.add(trunk, leaves);
    }

    // ---------- F1 Car (procedural) ----------
    const car = new THREE.Group();

    const carRed = new THREE.MeshStandardMaterial({ color: 0xd40000, roughness: 0.35, metalness: 0.4 });
    const carBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const carWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x191919, roughness: 0.95 });

    // Main monocoque (tapered body)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 3.2), carRed);
    body.position.y = 0.4;
    body.castShadow = true;
    car.add(body);

    // Nose cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 8), carRed);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.35, 2.0);
    nose.castShadow = true;
    car.add(nose);

    // Front wing
    const fWing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.5), carBlack);
    fWing.position.set(0, 0.18, 2.55);
    car.add(fWing);
    const fWingTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.35), carWhite);
    fWingTop.position.set(0, 0.28, 2.55);
    car.add(fWingTop);

    // Rear wing
    const rWingPost1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.4), carBlack);
    rWingPost1.position.set(-0.35, 0.7, -1.7);
    car.add(rWingPost1);
    const rWingPost2 = rWingPost1.clone();
    rWingPost2.position.x = 0.35;
    car.add(rWingPost2);
    const rWing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.45), carRed);
    rWing.position.set(0, 1.0, -1.7);
    rWing.castShadow = true;
    car.add(rWing);

    // Air intake / halo
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 16, Math.PI), carBlack);
    halo.rotation.y = Math.PI / 2;
    halo.position.set(0, 0.85, 0.3);
    car.add(halo);

    // Engine cover
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 1.6), carRed);
    cover.position.set(0, 0.7, -0.6);
    cover.castShadow = true;
    car.add(cover);

    // Cockpit opening
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.7), carBlack);
    cockpit.position.set(0, 0.7, 0.4);
    car.add(cockpit);

    // Wheels (4)
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.32, 20);
    const wheels: THREE.Mesh[] = [];
    const wheelPositions = [
      [-0.75, 0.36, 1.3],
      [0.75, 0.36, 1.3],
      [-0.78, 0.36, -1.3],
      [0.78, 0.36, -1.3],
    ];
    wheelPositions.forEach((wp) => {
      const w = new THREE.Mesh(wheelGeo, tyreMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wp[0], wp[1], wp[2]);
      w.castShadow = true;
      wheels.push(w);
      car.add(w);
    });

    // Position car at start
    const startPos = curve.getPointAt(0.001);
    const startTan = curve.getTangentAt(0.001).normalize();
    car.position.copy(startPos);
    car.position.y = 0;
    const startHeading = Math.atan2(startTan.x, startTan.z);
    car.rotation.y = startHeading;
    scene.add(car);

    // Steering wheel inside cockpit (visible in driver view)
    const steeringGroup = new THREE.Group();
    const wheelRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.025, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    steeringGroup.add(wheelRing);
    const wheelBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.04, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    steeringGroup.add(wheelBar);
    steeringGroup.position.set(0, 0.72, 0.55);
    steeringGroup.rotation.x = -Math.PI / 2.6;
    car.add(steeringGroup);

    // ---------- Input ----------
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ---------- Physics state ----------
    let speed = 0; // m/s along heading
    let heading = startHeading;
    const carPos = new THREE.Vector3().copy(car.position);
    let steering = 0; // -1..1 smoothed
    let lap = 1;
    let lapStart = performance.now();
    let bestLap = 0;
    let prevT = 0;

    // Find closest curve t for off-track detection
    function closestT(pos: THREE.Vector3) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < centerline.length; i++) {
        const dx = centerline[i].x - pos.x;
        const dz = centerline[i].z - pos.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return { t: best / centerline.length, dist: Math.sqrt(bestD), idx: best };
    }

    // ---------- Resize ----------
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ---------- Loop ----------
    let last = performance.now();
    let raf = 0;
    let hudTick = 0;

    const MAX_SPEED = 75; // ~270 km/h scaled for arcade feel
    const ACCEL = 22;
    const BRAKE = 55;
    const DRAG = 0.6;
    const OFF_TRACK_DRAG = 6;
    const STEER_RATE = 2.6;

    const animate = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Input
      const t = touchRef.current;
      const accel = keys["w"] || keys["arrowup"] || t.accel;
      const brake = keys["s"] || keys["arrowdown"] || t.brake;
      const leftKey = keys["a"] || keys["arrowleft"];
      const rightKey = keys["d"] || keys["arrowright"];
      const handbrake = keys[" "] || t.handbrake;

      // Steering smoothing (less responsive at high speed for stability)
      const keySteer = (leftKey ? 1 : 0) - (rightKey ? 1 : 0);
      const steerInput = keySteer !== 0 ? keySteer : -t.steer;
      steering += (steerInput - steering) * Math.min(1, dt * 6);

      // Speed
      if (accel) speed += ACCEL * dt;
      if (brake) speed -= BRAKE * dt;
      if (!accel && !brake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), DRAG * dt * 5);
      if (handbrake) speed *= Math.pow(0.05, dt);
      speed = Math.max(-15, Math.min(MAX_SPEED, speed));

      // Off-track penalty
      const ct = closestT(carPos);
      if (ct.dist > TRACK_WIDTH / 2 + 1.5) {
        speed -= Math.sign(speed) * Math.min(Math.abs(speed), OFF_TRACK_DRAG * dt);
      }

      // Heading update — turning rate proportional to speed (no spinning at standstill)
      const speedFactor = Math.min(1, Math.abs(speed) / 12);
      const turnRate = STEER_RATE * speedFactor * (speed >= 0 ? 1 : -1);
      heading += steering * turnRate * dt;

      // Move
      carPos.x += Math.sin(heading) * speed * dt;
      carPos.z += Math.cos(heading) * speed * dt;

      car.position.set(carPos.x, 0, carPos.z);
      car.rotation.y = heading;

      // Spin wheels
      const wheelSpin = (speed * dt) / 0.36;
      wheels.forEach((w) => (w.rotation.x += wheelSpin));
      // Front wheel steer
      wheels[0].rotation.y = steering * 0.4;
      wheels[1].rotation.y = steering * 0.4;
      steeringGroup.rotation.z = -steering * 0.9;

      // Lap detection (crossing t=0)
      if (prevT > 0.9 && ct.t < 0.1) {
        const lapTime = (now - lapStart) / 1000;
        if (bestLap === 0 || lapTime < bestLap) bestLap = lapTime;
        lap++;
        lapStart = now;
      }
      prevT = ct.t;

      // ---------- Cockpit camera ----------
      // Position slightly behind/above car nose looking forward; bobs with speed
      const camOffset = new THREE.Vector3(0, 1.05, -0.4); // local: above cockpit, just behind halo
      const camWorld = camOffset.clone().applyEuler(new THREE.Euler(0, heading, 0)).add(car.position);
      // Add subtle shake at high speed
      const shake = (Math.abs(speed) / MAX_SPEED) * 0.04;
      camWorld.x += (Math.random() - 0.5) * shake;
      camWorld.y += (Math.random() - 0.5) * shake;
      camera.position.lerp(camWorld, 0.5);

      const lookTarget = new THREE.Vector3(
        car.position.x + Math.sin(heading) * 8,
        1.0,
        car.position.z + Math.cos(heading) * 8
      );
      camera.lookAt(lookTarget);
      // FOV pulse with speed for sense of motion
      const targetFov = 72 + (Math.abs(speed) / MAX_SPEED) * 18;
      camera.fov += (targetFov - camera.fov) * 0.08;
      camera.updateProjectionMatrix();

      // HUD throttle (10Hz)
      hudTick++;
      if (hudTick % 6 === 0) {
        const kmh = Math.abs(speed) * 3.6 * 1.6; // scale to feel like F1 km/h
        const gear = Math.max(1, Math.min(8, Math.floor((Math.abs(speed) / MAX_SPEED) * 8) + 1));
        setHud({
          speed: Math.round(kmh),
          gear,
          lap,
          lapTime: (now - lapStart) / 1000,
          bestLap,
        });
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [started]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <div ref={mountRef} className="absolute inset-0" />

      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/80 to-black/95 text-white z-10">
          <h1 className="text-6xl font-black tracking-tight mb-2" style={{ fontFamily: "Inter, sans-serif" }}>
            APEX <span className="text-red-600">GP</span>
          </h1>
          <p className="text-sm uppercase tracking-[0.4em] text-white/60 mb-10">Formula Racing • Cockpit Edition</p>

          <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm mb-10">
            <div className="text-white/60 text-right">Accelerate</div>
            <div className="font-mono">W / ↑</div>
            <div className="text-white/60 text-right">Brake / Reverse</div>
            <div className="font-mono">S / ↓</div>
            <div className="text-white/60 text-right">Steer</div>
            <div className="font-mono">A D / ← →</div>
            <div className="text-white/60 text-right">Handbrake</div>
            <div className="font-mono">SPACE</div>
          </div>

          <button
            onClick={() => setStarted(true)}
            className="px-12 py-4 bg-red-600 hover:bg-red-500 transition text-white font-bold tracking-widest uppercase text-lg shadow-[0_0_40px_rgba(220,0,0,0.5)]"
          >
            Start Race
          </button>
        </div>
      )}

      {started && (
        <>
          {/* HUD */}
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
            <div className="text-xl font-bold">{hud.lap}</div>
          </div>

          <div className="absolute top-4 right-4 text-white font-mono z-10 select-none bg-black/40 backdrop-blur px-3 py-1.5 text-right pointer-events-none">
            <div className="text-[10px] uppercase tracking-widest text-white/50">Current</div>
            <div className="text-xl font-bold tabular-nums">{hud.lapTime.toFixed(2)}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50 mt-1">Best</div>
            <div className="text-sm tabular-nums text-red-400">
              {hud.bestLap > 0 ? hud.bestLap.toFixed(2) : "--.--"}
            </div>
          </div>

          {/* Touch controls (mobile) */}
          <TouchControls touchRef={touchRef} />
        </>
      )}
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
    const x = (e.clientX - rect.left) / rect.width; // 0..1
    touchRef.current.steer = Math.max(-1, Math.min(1, (x - 0.5) * 2));
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pb-4 px-4 flex items-end justify-between pointer-events-none select-none touch-none">
      {/* Steering pad (left) */}
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

      {/* Pedals (right) */}
      <div className="flex gap-3 pointer-events-auto">
        <button
          {...bindHold("brake")}
          className="h-20 w-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 text-white font-bold text-xs uppercase tracking-widest active:bg-white/20 touch-none"
        >
          Brake
        </button>
        <button
          {...bindHold("accel")}
          className="h-28 w-28 rounded-2xl bg-red-600/90 backdrop-blur border border-red-400 text-white font-black text-sm uppercase tracking-widest active:bg-red-500 shadow-[0_0_30px_rgba(220,0,0,0.5)] touch-none"
        >
          Throttle
        </button>
      </div>
    </div>
  );
}
