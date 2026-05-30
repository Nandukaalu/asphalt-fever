## Scope

Three coordinated changes to `src/components/RacingGame.tsx` (and small touches to `FreeRoam.tsx` for tone parity if needed).

---

## 1. Cinematic lighting tone

- Drop `toneMappingExposure` ~15–20% across all weathers (multiply weather `exposure` by `0.82`).
- Lower hemisphere intensity ~25%, raise directional sun contrast (intensity +10%, increase shadow `bias` tuning already in place).
- Slightly deepen fog color toward neutral grey for non-clear weathers.
- Add subtle vignette via a fullscreen transparent radial overlay (DOM, cheap on mobile).
- Result: darker, higher-contrast, broadcast-style image without losing detail.

---

## 2. Real branching pit lane (no teleports)

Replace today's "request pit → teleport car into box" with a physical drive-through lane.

**Geometry built once at race start:**
- `pitEntryCurve`: CatmullRom from a point on the racing line ~120m before SF, peeling outward over ~80m onto the pit strip start.
- `pitLaneCurve`: straight along existing parallel strip past the 3 pit boxes.
- `pitExitCurve`: CatmullRom from end of pit strip back to the racing line ~120m after SF, with a merge taper.
- Render each curve as an asphalt ribbon with white edge lines, plus:
  - Pit-in/pit-out arrow signage and red/white striped concrete barriers separating pit road from main track.
  - "60" speed-limit boards at pit entry and "END" board near exit.

**Behavior:**
- Player toggles `PIT IN` intent. Nothing happens until they physically drive into the marked `pitEntryGate` rectangle (positioned at the start of `pitEntryCurve`).
- On crossing the gate with intent active: enter `pitState = "entry"`. Throttle/brake stay player-controlled but **max speed clamped to 60 km/h** inside pit lane (engineer call: "Speed limiter on").
- Car follows pit lane physically (lane-keep assist nudges steering toward `pitLaneCurve` for accessibility on mobile — small lateral force, not a teleport).
- When the car reaches its `pitBoxPos`, `pitState = "stop"`: brake assist, crew animation plays, tire/jack/refuel timing as today.
- After timer: `pitState = "exit"`. Car drives forward along `pitExitCurve`. Speed cap stays at 60 until past the exit cone, then released and `pitState = "racing"`.
- Pit-stop counter only increments when state transitions out of `"stop"` (no double-counting).
- AI cars use the same curves — when AI decides to pit, they follow entry → box → exit waypoints instead of vanishing.

**Bug fixes addressed:**
- No more "cross SF line → instant pit" — pit is gated by physical entry.
- No more "spawn outside map" — exit waypoint is on the curve, with a final lerp toward `curve.getPointAt(nearestT)` before releasing control.
- Wall collision system already exists; pit barriers added to it.

**Multiplayer:** position is already synced raw — physical pit lane works automatically because peers see the actual `(x, z, heading)` of the player.

---

## 3. Grandstand & crowd atmosphere

Built once at race start, placed at 4 scenic curve fractions (0.05, 0.28, 0.55, 0.78):

- **Grandstand structure**: tiered ramp mesh (3 stacked boxes with rake) + back wall + roof canopy. Materials: concrete and steel.
- **Crowd**: `THREE.Points` cloud of ~600 dots per stand, slight per-frame y-bob (sin wave with random phase) to fake waving.
- **Flag poles**: 6 per stand, with a thin `PlaneGeometry` flag whose vertices wobble via shader uniform `time` (or simpler: small rotation oscillation).
- **Team banners**: long flat planes with team color stripes hanging from the front of each stand.
- **Camera flashes**: per stand, every ~0.3–0.8s spawn a tiny white `PointLight` that lives 80ms — pooled to keep cost flat. Frequency doubles during final lap and on race finish.
- **VIP suite**: one of the stands gets a glass-fronted upper deck with warm interior emissive panels.
- **Night lighting**: 4 floodlight pylons per stand (already-supported `SpotLight` style faked with cones + emissive disks pointing at track) — activate when `W.id` includes "night".

Performance: all stands share one geometry/material set, crowd as `Points` (one draw call per stand), flash lights pooled (max 8 alive).

---

## Files touched

- `src/components/RacingGame.tsx` — all three changes.
- No new files needed.

## Technical notes

- Curves: `THREE.CatmullRomCurve3` then sampled into `BufferGeometry` ribbons (existing pattern used for the main track).
- Pit lane speed cap: clamp `speed = Math.min(speed, 16.67)` (60 km/h in m/s) while `pitState !== "racing"`.
- Lane-keep nudge: at each frame in pit, find closest point on `pitLaneCurve`, compute lateral error, apply `steering += clamp(lateralError * 0.15, -0.3, 0.3)`.
- Camera flashes: pre-allocate 8 `PointLight`s, recycle by setting `intensity = 0` when expired.
- Flag wave: rotation `y = sin(time*2 + phase) * 0.4`.

## Out of scope this pass

- Custom 3D modeled spectators (use Points — keeps mobile FPS).
- Real crowd audio (would need new asset pipeline; can be added later).
- Animated tire-gun crew arms beyond what already exists.
