# Authoritative Multiplier + Planned Path Analysis

## Goal

Keep server authority intact while making live gameplay path readable and deterministic:

- Final multiplier and win amount must match server payload.
- Live multiplier should react to visible interactions (pickups/hazards).
- Doll must move on a 100% accurate path between planned multipliers.
- Doll must always collide with the **next** planned item.

## Current Authoritative Flow (Code-Level)

1. `RoundManager` builds an authoritative plan (`durationMs`, `steps`, `targetMultiplier`, `isLoss`).
2. `InteractionSystem.setAuthoritativeRoundControl(plan)` enables seeded planner mode.
3. `InteractionSystem.generatePlannedAuthoritativeItems(plan)` simulates physics and spawns planned items in world-space (each item has `plannedStepIndex`, `effect`, `targetVX/VY`).
4. During `update()`:
   - `updateAuthoritativePathOverride()` sets the doll's position deterministically along a segment from its current position to the next planned item.
   - Restricted collision pools allow only the next planned item to be detected as a collision target.
   - On hit, `applyAuthoritativeEffectStep()` updates the multiplier, `currentPlannedStepIndex` increments, and the next segment is computed.
5. `RoundManager` marks crash reached when both:
   - planned path is complete, **and**
   - elapsed time is near scheduled crash moment (`>= 96% duration`).

## Risks Previously Observed

1. Path drift between planned items because doll velocity was not aligned with target.
2. Out-of-order or unintended item collisions because all items in the pool were eligible.
3. Multiplier plateau before crash because of an early lock.
4. Inconsistent step deltas because event math was over-corrected per-frame.

## Applied Improvements

### A) Crash Moment Guard

In `RoundManager.startAuthoritativeFlightController`:

- `authoritativeTargetReached` requires both:
  - `pathComplete`, and
  - `elapsed >= 96% durationMs`.
- This prevents early freeze/plateau while doll is still visibly traveling.

### B) Deterministic Path-Segment Override (Final)

In `InteractionSystem`:

- New methods: `beginAuthoritativePathSegment()`, `updateAuthoritativePathOverride()`.
- Each frame in authoritative mode (after launch grace), doll `position.x/y` is overridden along an exact segment from the current position to the next planned item.
- Velocity is set to match the segment direction so visuals (tilt/rolling) stay natural.
- A subtle parabolic arc (`-38 * sin(pi * t)`) is layered for natural travel feel.
- At `t >= 0.995`, position snaps to exact target to guarantee swept collision registers.

### C) Strict Next-Target Collision Pool

`getAuthoritativeCollisionPool(defaultItems, acceptedTypes)`:

- In authoritative rounds, only the single "next planned item" is eligible for collision in its respective pool.
- Prevents accidental hits on neighbouring items while traveling.
- Pools restricted: `pickups`, `bombs`, `skyMultipliers`, `bats`.

### D) Bat Collision Padding Boost

When the next planned target is a bat, swept-AABB padding for bats is temporarily increased (5px -> 22px) so the deterministic segment endpoint guarantees a hit on the bat's bounding box.

### E) Step Type Distribution (Variety)

`AuthoritativeRoundPlanner._generateStepSequence` now uses a weighted picker:

| Type       | Target % | Notes                                             |
| ---------- | -------- | ------------------------------------------------- |
| `add`      | ~30%     | Sky `+` pickup. Positive math.                    |
| `subtract` | ~30%     | Sky `-` pickup. Disabled while current ≤ 1.10.    |
| `multiply` | ~10%     | Sky `x` boost. Tapered when ≥ 85% of target.      |
| `bat`      | ~15%     | Visible bat hazard. Effect resolves as `+`.       |
| `divide`   | ~15%     | Bomb `÷`. Disabled while current ≤ 1.40.          |

Net positive (add + multiply + bat) vs negative (subtract + divide) ≈ 55/45.

**Adjacency rules:**

- `bat→bat`, `bomb→bomb`, `bat→bomb`, `bomb→bat`: all blocked (no two hazards back-to-back).
- `subtract→subtract`: blocked (no two `-` back-to-back).
- `multiply→multiply`: blocked (no two `x` back-to-back).
- `add→add`: allowed and lightly boosted (+40% weight) so two `+` can come together.

### F) Per-Segment Path Variance

`beginAuthoritativePathSegment` now jitters per-segment:

- segment speed: `620..800 px/s`
- duration floor raised to `340 ms` so even close items feel naturally spaced.

**Arc shape & magnitude are context-aware (based on the previously consumed step):**

| Previous step    | Arc shape | Magnitude (px) | Visual feel                          |
| ---------------- | --------- | -------------- | ------------------------------------ |
| `add` (+)        | up        | 55..95         | celebratory leap (kept moderate)     |
| `multiply` (x)   | up        | 55..95         | celebratory leap (kept moderate)     |
| `bat`            | drop      | 160..240       | straight-down dive then catch-up     |
| `subtract` (-)   | up        | 18..38         | shallow, weighed down                |
| `divide` (÷)     | up        | 18..38         | shallow, weighed down                |
| first segment    | up        | 30..55         | medium default                       |

`drop` shape is a clean linear travel from bat position to the next item,
with a slight gravity ease-in on Y (`t * (0.65 + 0.35 * t)`) so the
descent feels weighted. Combined with planner placement (next item is
positioned in the natural fall path: small lateral 30..130 px, vertical
drop 170..360 px), the doll falls straight down to the next multiplier
without magnet-style sideways pull — matches Pengu Sport feel.

Bat hit also calls `forceDiveDown(1)` and `shakeOnHazard()` for
immediate impact feedback, matching pre-server-authoritative behavior.

### G) Minimum Spacing Between Planned Items

`generatePlannedAuthoritativeItems` enforces context-aware spacing.

**Default (non-bat predecessor):**

- `minHGap = 290 px` horizontal gap between consecutive items (with extra `0..40 px` jitter).
- `minVGap = 110 px` vertical separation when items are too close on X.
- `minTotalDist = 320 px` Euclidean lower bound.

**After bat (predecessor `bat`):**

- lateral offset clamped to `30..130 px` (small lateral, no big sideways jump).
- vertical drop clamped to `170..360 px` (next item is naturally below).

This prevents:

- visual overlap between multipliers/bats/bombs,
- jerky/teleport-like motion when items are too close together,
- magnet-style sideways pull right after a bat hit (the next multiplier
  is now placed in the doll's natural fall path).

## Multiplier Behaviors, Forces and Directions

| Effect Type      | Server Symbol(s) | Live Multiplier Action                            | Visual Force/Direction              |
| ---------------- | ---------------- | ------------------------------------------------- | ----------------------------------- |
| `add`            | `+1`, `+2`, `+5` | step up by weighted delta (`weight * baseScale`)  | gentle UP boost forward             |
| `multiply`       | `x2`, `x3`       | step up by `(value - 1) * 3 * baseScale`          | UP/forward boost (stronger)         |
| `subtract`       | `-1`, `-2`       | step down by `value * baseScale` (clamped >= 1)   | downward drop (lighter)             |
| `divide`         | `÷2`             | step down by `value * baseScale` (clamped >= 1)   | aggressive downward force           |
| `bat`            | bat hit          | step up like add                                  | strong straight-down slam (visual)  |
| no event in window | none           | no change                                         | continue current segment            |

`baseScale = (targetMultiplier - 1) / expectedWeightTotal`, computed once per round.

## Path Direction & Distance Rules

- Distance between two planned items is computed on every segment start.
- Segment duration scales with distance (`dist / 720 px·s`, clamped 240-1400 ms).
- Direction vector `(toX - fromX, toY - fromY) / durSec` becomes the doll velocity.
- The doll position is interpolated linearly along this vector + parabolic arc.
- Final position at `t >= 0.995` is the exact item position to guarantee hit.

### H) Decorative Sky Multipliers

`populateAuthoritativeSkyDecorations(plan)` populates the world with
visual-only sky multipliers so the scene looks populated and
professional, like the reference reel — but with two strict constraints:

1. **Same labels as planned multipliers.**
   Decorative label pool is taken from `plan.steps` (filtered to
   `add | multiply | subtract`). So if the planner uses `+0.10`,
   `-2.50`, `x3.40`, decorations show those same labels — gameplay
   multipliers and decoration multipliers always match in flavor.

2. **Off-path only.** Decorations are never inside the doll's travel
   corridor between consecutive planned items. They sit only around
   the path (sides/top/bottom), never on it.

**Curve-aware path clearance:**

The doll's real path between two planned items is not a straight line — it's an arc (`+`/`x`), a drop curve (`bat`), or a shallow arc (`-`/`÷`). Decorations are placed using a curve-sample clearance check (`isInsidePath`) that rejects positions within `pathClearance = 90 px` of any sampled point along the actual doll travel curve. This guarantees no decoration ever sits inside the doll's path, even when arcs bulge above the segment line.

**Vertical bounds:**

- Decoration band: `stageTop + 50 px → groundY - 60 px` — full sky height so multipliers appear above AND below the path (close to ground too).
- Item ceiling: `groundY - 380 px` — items can't be too high (and therefore the doll can't fly off the top).
- Doll ceiling clamp: `stageTop + 60 px` — final safety net inside `updateAuthoritativePathOverride`.

**Trailing decorations past last planned item:**

`endX = lastPlannedX + 4500 px` — random scatter continues to populate the world well beyond the final planned multiplier so the doll's ground roll never lands in an empty/weird area.

Two-pass placement:

1. **Rim pass** — for every path segment, decorations are placed perpendicular on both sides. Each candidate tries multiple offset distances (`120 → 260 px`) and picks the first one that clears the curve. Guarantees path is visibly flanked by multipliers without ever entering the curve.
2. **Random scatter pass** — fills remaining world with planned-label decorations using the same curve-aware clearance.

Other rules:

- Density: ~1 per 220 px world width (min 28 placed).
- Reserved zone: 130 px around every planned item.
- **Path curve clearance: 90 px** from the actual doll travel curve (arc/drop/shallow), not just the line. Tight gaps but the path stays clean.
- Decoration spacing: **110 px minimum** between decorations.
- `isProceduralDecoration = true`, `isPlannedAuthoritativeItem = false` — decorations never enter `getAuthoritativeCollisionPool`.
- Round-end cleanup via `clearAllAuthoritativeItems`.

The actual gameplay multipliers (planned: e.g. `+0.10`, `-2.50`, `x3.40`) drive collisions and the live multiplier; the decorative sky is purely visual and label-consistent with the planned values.

## Verification Checklist

1. Path: doll visibly travels from one planned multiplier to the next without drift.
2. Hit: every planned item is consumed in order; no skipped item.
3. Multiplier: continues to respond to events right up to crash moment, no early plateau.
4. Crash moment: final value matches server `crashPoint` exactly; `winAmount` matches.
5. Loss case (`crashPoint=1`, `winAmount=0`): visible loss staging triggers correctly.
6. Multi-target stress test: high crashPoint (e.g. 30.7) does not freeze early.

