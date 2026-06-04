## Goal

Replace the current "all AI cars run at a flat 88% pace on the centreline" system with a varied, tier-tuned AI field, and make crashes feel weighty without breaking the existing arcade feel or mobile perf.

Today, every opponent in `src/components/RacingGame.tsx` uses the same `AI_SPEED` constant (~line 2173), follows the racing line, never reacts to other cars, and there's no concept of difficulty per race. Crashes already have sparks + `impactControlLoss` + `postImpactSpin`, but bounce too hard, lose too little speed, and don't scrape.

## Scope

Single file: `src/components/RacingGame.tsx`. No schema or routing changes. Multiplayer remote cars are untouched (network-driven). Visual/HUD additions reuse existing pools (sparks, smoke) where possible.

## 1. Difficulty system

Add a `difficulty` setting persisted in `localStorage` (`asphalt:difficulty`) with a small selector on the pre-race screen.

```text
Easy       basePace 0.78   mistakeChance 0.12   reaction 0.55   aggression 0.25
Medium     basePace 0.86   mistakeChance 0.06   reaction 0.70   aggression 0.45
Hard       basePace 0.93   mistakeChance 0.03   reaction 0.82   aggression 0.60
Expert     basePace 0.98   mistakeChance 0.015  reaction 0.90   aggression 0.72
Legendary  basePace 1.02   mistakeChance 0.005  reaction 0.97   aggression 0.85
```

`basePace` multiplies the AI's target speed against the player's `MAX_SPEED`. Legendary intentionally runs slightly above player base so the player must use slipstream + clean lines to win.

## 2. AI personalities

Each `DRIVERS` entry gets a personality tag (aggressive / defensive / consistent / risk-taker / wet-specialist / qualifying-specialist). At race start every AI rolls per-race jitter on top of its personality so the same driver doesn't feel scripted:

- `paceMult` ±3% (consistent: ±1%, risk-taker: ±5%)
- `cornerEntryBrakeBias` (defensive brakes earlier, aggressive later)
- `overtakeUrge` (risk-taker / aggressive higher)
- `defenseUrge` (defensive higher)
- `wetMult` (wet-specialist gets +6% in wet conditions, others -2..-4%)
- `qualiBoost` (qualifying-specialist gets +2% in Q sessions only)

Personality + difficulty combine: `targetSpeed = MAX_SPEED * basePace * personality.paceMult * weather.mult`.

## 3. AI driving behaviour

Replace the constant-speed loop with a per-AI tick that uses existing curve `t` plus a `lateralOffset` so cars don't all sit on the centreline:

- **Racing line** — sample curve point + lateral offset. Default offset = personality bias; under "attacking" mode it shifts toward the inside of the next corner, under "defending" toward the apex-blocking line.
- **Corner speed** — look ahead 30–60m along the curve, measure curvature, compute a safe corner speed; brake if current speed > safe speed. Difficulty raises the cornering grip ceiling.
- **Awareness** — for every other car within 25m ahead/behind in track-space, compute `gapAhead` and `gapBehind`. If `gapAhead < threshold` and closing, enter ATTACK: aim for opposite side of the leading car, increase pace ~5%, brake later by `aggression * 8%`. If `gapBehind < threshold` and being closed on a straight, enter DEFEND: move to inside line, slight pace boost out of corners.
- **Multi-corner overtake setup** — when ATTACK persists 2+ seconds without pass, AI commits to alternate line through the next sequence (offset flipped for 2 corners) for a "switchback" attempt.
- **Mistakes** — per-tick `mistakeChance` (scaled down on straights) causes a brief lock-up: 0.4s reduced grip + small lateral wobble + tyre-smoke puff. Lower tiers make mistakes audible/visible so the player can capitalise.
- **Weather reaction** — multiply target speed and braking thresholds by a wet factor; wet specialists keep more pace, others slow more in heavy rain.
- **Reaction at race start** — randomized launch delay (Easy 250–600ms, Legendary 60–140ms).

All this stays cheap: O(N²) where N≤8 cars, light maths, no extra THREE objects per frame.

## 4. Crash & collision rework

Update the existing impact block (around lines 2694–2760):

- **Momentum loss** — head-on severity drains a larger fraction of speed (`speed *= 1 - clamp(severity*0.6, 0, 0.75)`), glancing hits drain little. Replace the current bounce with a velocity reflection capped at 40% of incoming speed (kills trampoline effect).
- **Wall scraping** — when the car is in continuous wall contact with low normal closure and non-zero tangential speed, apply a constant lateral friction drag, emit a steady spark stream + scrape marks (decal quads laid down on the barrier mesh, capped pool of ~32, fade over 8s), and play a low rumble.
- **Lock-ups & tyre smoke** — when wheel slip > threshold OR `mistake` event, emit smoke puffs from rear wheels using the existing smoke material.
- **Damage marks** — keep a `damageLevel` 0..1 that grows with cumulative impact energy; over 0.5, drive a couple of decal patches on the bodywork (pre-built mesh, opacity driven by damageLevel) and slightly reduce top speed (max 6%). Resets on respawn.
- **Spin physics** — `postImpactSpin` already exists; cap it but extend duration so heavy hits result in a proper spin recovery (current decay is too fast).
- **Suspension/weight transfer** — drive small body roll & pitch offsets on the car group from lateral accel and longitudinal accel (visual only, ~3° max), making braking dive and corner roll readable.
- **High-speed impact camera** — bump `camTrauma` proportional to closure speed; add a one-frame chromatic-aberration-style shake (reuse existing shake; no new postFX).

## 5. UI

- Difficulty pill on the race start panel + persisted to localStorage.
- Small subtitle on the HUD: "AI: Legendary" so the player knows what they're racing.
- Toast when an AI commits a notable mistake near the player ("Walsh locks up!") — throttled.

## 6. Performance & safety

- All new allocations hoisted out of the per-frame loop (reuse vectors).
- Decal pools fixed-size; oldest reused.
- New per-AI state attached to existing `ais[]` entries — no new arrays per frame.
- Mobile: cap decal pool to 16 and skip body-roll lerp when `pixelRatio < 1.5` to protect frame time.

## Out of scope (existing follow-up items)

- Multiplayer qualifying sync (Phase 2 of the prior plan, not requested today).
- Replays / leaderboard changes.
- New tracks or driver art.

## Verification

- Build passes (auto).
- Spot-check each difficulty in a 3-lap race: Easy is beatable from the back, Legendary requires near-perfect driving.
- Drive into a wall head-on (speed should drop hard, brief spin) and graze a wall (continuous sparks + scrape, modest slowdown).
- Confirm no console errors and frame time on mobile preview stays comparable.
