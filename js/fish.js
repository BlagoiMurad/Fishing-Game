import { FSM } from "./fsm.js";
import { clamp, chance, dist, lerp, norm, rand, sub, vec, mul, withAlpha } from "./utils.js";

const FISH_TYPES = {
  common: {
    name: "Common Carp",
    colorA: "#57d2ff",
    colorB: "#2aa2d2",
    score: 100,
    baseSpeed: 52,
    cautious: 0.7,
    pull: 0.35,
    biteBase: 0.85,
    rarity: 0.72,
  },
  fast: {
    name: "Swift Trout",
    colorA: "#7dffb2",
    colorB: "#3fd68b",
    score: 160,
    baseSpeed: 82,
    cautious: 0.95,
    pull: 0.52,
    biteBase: 0.70,
    rarity: 0.20,
  },
  rare: {
    name: "Rare Koi",
    colorA: "#ffd85a",
    colorB: "#ff9e5a",
    score: 260,
    baseSpeed: 64,
    cautious: 1.25,
    pull: 0.46,
    biteBase: 0.58,
    rarity: 0.06,
  },
  heavy: {
    name: "Heavy Catfish",
    colorA: "#a7b7ff",
    colorB: "#6a78d8",
    score: 220,
    baseSpeed: 48,
    cautious: 0.85,
    pull: 0.68,
    biteBase: 0.62,
    rarity: 0.12,
  },
};

function pickFishType(level) {
  // Weighted selection shifts with level.
  const lv = Math.max(1, level);
  const wCommon = clamp(0.78 - lv * 0.03, 0.45, 0.8);
  const wFast = clamp(0.16 + lv * 0.02, 0.16, 0.32);
  const wHeavy = clamp(0.10 + lv * 0.01, 0.10, 0.22);
  const wRare = clamp(0.04 + lv * 0.004, 0.04, 0.12);

  const sum = wCommon + wFast + wHeavy + wRare;
  const r = Math.random() * sum;
  if (r < wCommon) return "common";
  if (r < wCommon + wFast) return "fast";
  if (r < wCommon + wFast + wHeavy) return "heavy";
  return "rare";
}

export class Fish {
  static pickType(level) {
    return pickFishType(level);
  }

  constructor(game, typeName, spawnPos) {
    this.game = game;
    this.typeName = typeName;
    this.type = FISH_TYPES[typeName] ?? FISH_TYPES.common;

    this.pos = vec(spawnPos.x, spawnPos.y);
    this.vel = vec(rand(-30, 30), rand(-10, 10));
    this.angle = Math.atan2(this.vel.y, this.vel.x);
    this.turnRate = rand(2.5, 4.2);

    this.size = rand(18, 26) + (typeName === "heavy" ? 8 : 0) + (typeName === "rare" ? 3 : 0);
    this.speed = this.type.baseSpeed;
    this.pull01 = this.type.pull;
    this.cautious = this.type.cautious;
    this.score = this.type.score;

    this.stateData = {
      wanderTarget: vec(this.pos.x + rand(-120, 120), this.pos.y + rand(-80, 80)),
      wanderTimer: rand(0.6, 1.8),
      biteTimer: 0,
      biteWindow: 0.7,
      escapeTimer: 0,
      circlePhase: rand(0, Math.PI * 2),
      interest: 0,
      hooked: false,
      caught: false,
      catchAwarded: false,
      pendingDespawnT: 0,
      feedbackCd: 0,
    };

    this.fsm = new FSM(this, "SWIM", createFishStates());
  }

  get name() {
    return this.type.name;
  }

  isHooked() {
    return this.fsm.currentName === "HOOKED" || this.fsm.currentName === "ESCAPE_ATTEMPT";
  }

  isBiting() {
    return this.fsm.currentName === "BITE";
  }

  get detectionRadius() {
    const g = this.game;
    const bait = g.player.getBait();
    const lvl = g.stats.level;
    const base = 165;
    // Higher bait attraction + higher level (more fish) -> slightly more detection, but cautious fish reduce it.
    return base * bait.attraction * lerp(1.0, 1.12, clamp((lvl - 1) / 8, 0, 1)) * (1 / this.cautious);
  }

  get biteRange() {
    return 22 + this.size * 0.25;
  }

  get biteWindow() {
    const g = this.game;
    const bait = g.player.getBait();
    const lvl = g.stats.level;
    const base = this.type.biteBase;
    // Higher levels = much shorter bite window (harder to time)
    const harder = clamp(1 - (lvl - 1) * 0.055, 0.30, 1);
    return clamp(base * harder + bait.hookBonus, 0.18, 0.95);
  }

  update(dt) {
    this.stateData.feedbackCd = Math.max(0, this.stateData.feedbackCd - dt);
    this.fsm.update(dt);
    this._integrate(dt);
  }

  _integrate(dt) {
    const pond = this.game.pond;
    const pad = 24;
    const minX = pond.x + pad;
    const maxX = pond.x + pond.w - pad;
    const minY = pond.y + pad;
    const maxY = pond.y + pond.h - pad;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    // Soft boundary steering.
    if (this.pos.x < minX) this.vel.x = Math.abs(this.vel.x) * 0.9;
    if (this.pos.x > maxX) this.vel.x = -Math.abs(this.vel.x) * 0.9;
    if (this.pos.y < minY) this.vel.y = Math.abs(this.vel.y) * 0.9;
    if (this.pos.y > maxY) this.vel.y = -Math.abs(this.vel.y) * 0.9;

    // Damping and angle.
    this.vel.x *= Math.pow(0.985, dt * 60);
    this.vel.y *= Math.pow(0.985, dt * 60);
    this.angle = Math.atan2(this.vel.y, this.vel.x);
  }

  tryHookSet() {
    // Primary hook timing: during BITE.
    // Secondary forgiveness: during the very beginning of ESCAPE_ATTEMPT
    // the player can still recover and hook the fish.
    const stateName = this.fsm.currentName;
    const canHook =
      stateName === "BITE" || (stateName === "ESCAPE_ATTEMPT" && this.fsm.timeInState < 0.35);
    if (!canHook) return false;
    const g = this.game;
    const baitPos = g.player.getBaitPosition();
    if (!g.player.castActive || !g.player.bobber.inWater) return false;
    // Validate proximity so hook attempts are consistent and not "global".
    // Keep it forgiving during BITE so it still feels responsive.
    if (stateName === "BITE") {
      const rangeMul = 2.1;
      if (dist(this.pos, baitPos) > this.biteRange * rangeMul) return false;
      this.fsm.setState("HOOKED");
      return true;
    }

    // Early ESCAPE_ATTEMPT forgiveness (small accuracy check).
    const rangeMul = 1.75;
    if (dist(this.pos, baitPos) > this.biteRange * rangeMul) return false;
    this.fsm.setState("HOOKED");
    return true;
  }

  markCaught() {
    if (this.stateData.caught) return;
    this.fsm.setState("CAUGHT");
  }

  markEscaped() {
    // Guard: never penalise the player if this fish was already caught.
    if (this.stateData.caught || this.stateData.catchAwarded) return;
    this.game.onFishEscaped(this);
  }

  draw(ctx) {
    const g = this.game;
    const t = g.time;
    const s = this.size;

    // Shadow/silhouette under water
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(this.pos.x, this.pos.y + 10, s * 1.1, s * 0.55, this.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle);

    const wiggle = Math.sin(t * 6 + this.pos.x * 0.02) * 0.06;
    ctx.rotate(wiggle);

    const grad = ctx.createLinearGradient(-s, 0, s, 0);
    grad.addColorStop(0, this.type.colorB);
    grad.addColorStop(0.55, this.type.colorA);
    grad.addColorStop(1, withAlpha(this.type.colorB, 0.9));
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.25, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.fillStyle = withAlpha(this.type.colorB, 0.9);
    ctx.beginPath();
    ctx.moveTo(-s * 1.1, 0);
    ctx.quadraticCurveTo(-s * 1.55, -s * 0.65, -s * 1.85, 0);
    ctx.quadraticCurveTo(-s * 1.55, s * 0.65, -s * 1.1, 0);
    ctx.closePath();
    ctx.fill();

    // Fin
    ctx.fillStyle = withAlpha("#eaf3ff", 0.12);
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.1);
    ctx.quadraticCurveTo(-s * 0.2, -s * 0.95, s * 0.35, -s * 0.3);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(s * 0.78, -s * 0.1, Math.max(2.2, s * 0.12), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Steering helpers
  steerToward(target, dt, speedMul = 1) {
    const to = sub(target, this.pos);
    const dir = norm(to);
    const targetVel = mul(dir, this.speed * speedMul);
    const k = 1 - Math.pow(0.001, dt);
    this.vel.x = lerp(this.vel.x, targetVel.x, k);
    this.vel.y = lerp(this.vel.y, targetVel.y, k);
  }

  steerWander(dt, speedMul = 1) {
    const d = this.stateData;
    d.wanderTimer -= dt;
    if (d.wanderTimer <= 0) {
      const pond = this.game.pond;
      d.wanderTimer = rand(0.9, 2.0);
      d.wanderTarget = vec(rand(pond.x + 50, pond.x + pond.w - 50), rand(pond.y + 60, pond.y + pond.h - 60));
    }
    this.steerToward(d.wanderTarget, dt, speedMul);
  }
}

function createFishStates() {
  return {
    SWIM: {
      enter: (fish) => {
        fish.stateData.interest = 0;
      },
      update: (fish, dt) => {
        fish.steerWander(dt, 1.0);
        const g = fish.game;
        if (!g.player.castActive || !g.player.bobber.inWater) return;
        const baitPos = g.player.getBaitPosition();
        const d = dist(fish.pos, baitPos);
        if (d < fish.detectionRadius) {
          fish.fsm.setState("NOTICE_BAIT");
        }
      },
    },

    NOTICE_BAIT: {
      enter: (fish) => {
        fish.stateData.noticeT = rand(0.35, 0.75) * fish.cautious;
        fish.stateData.interest = 0.35;
        fish.game.onFishNearBobber(0.35);
      },
      update: (fish, dt) => {
        const g = fish.game;
        if (!g.player.castActive || !g.player.bobber.inWater) {
          fish.fsm.setState("SWIM");
          return;
        }
        const baitPos = g.player.getBaitPosition();
        const d = dist(fish.pos, baitPos);
        fish.stateData.noticeT -= dt;
        fish.stateData.interest = clamp(fish.stateData.interest + dt * 0.5, 0, 1);
        fish.steerToward(baitPos, dt, 0.45);
        if (fish.stateData.feedbackCd <= 0) {
          g.onFishNearBobber(0.3 + fish.stateData.interest * 0.2);
          fish.stateData.feedbackCd = rand(0.28, 0.48);
        }

        if (d < fish.detectionRadius * 0.82 && fish.stateData.noticeT <= 0) {
          fish.fsm.setState("APPROACH");
        } else if (fish.stateData.noticeT <= -0.35 || d > fish.detectionRadius * 1.15) {
          fish.fsm.setState("SWIM");
        }
      },
    },

    APPROACH: {
      enter: (fish) => {
        fish.stateData.circlePhase = rand(0, Math.PI * 2);
        fish.stateData.approachTimer = 0;
        fish.game.onFishNearBobber(0.62);
      },
      update: (fish, dt) => {
        const g = fish.game;
        if (!g.player.castActive || !g.player.bobber.inWater) {
          fish.fsm.setState("SWIM");
          return;
        }
        const baitPos = g.player.getBaitPosition();
        const d = dist(fish.pos, baitPos);

        fish.stateData.approachTimer += dt;

        // Circle approach to build suspense.
        fish.stateData.circlePhase += dt * (1.8 + (fish.typeName === "fast" ? 0.8 : 0));
        const offset = vec(
          Math.cos(fish.stateData.circlePhase) * 24,
          Math.sin(fish.stateData.circlePhase * 0.9) * 18,
        );
        const target = { x: baitPos.x + offset.x, y: baitPos.y + offset.y };
        fish.steerToward(target, dt, 0.75);
        if (fish.stateData.feedbackCd <= 0) {
          const closeness = clamp(1 - d / Math.max(1, fish.detectionRadius), 0, 1);
          g.onFishNearBobber(0.45 + closeness * 0.45);
          fish.stateData.feedbackCd = rand(0.16, 0.34);
        }

        // Too far / too chaotic -> back to swim.
        if (d > fish.detectionRadius * 1.2) {
          fish.fsm.setState("SWIM");
          return;
        }
        // On low levels fish should more reliably bite even while orbiting.
        // The threshold shrinks a bit as level increases.
        const lvl = g.stats.level;
        const biteDistMul = lerp(1.28, 1.06, clamp((lvl - 1) / 8, 0, 1));
        if (d < fish.biteRange * biteDistMul) {
          fish.fsm.setState("BITE");
        }

        // If the fish spends too long approaching without biting, disengage.
        if (fish.stateData.approachTimer > 4.6) {
          fish.fsm.setState("NOTICE_BAIT");
        }
      },
    },

    BITE: {
      enter: (fish) => {
        fish.stateData.biteWindow = fish.biteWindow;
        fish.stateData.biteTimer = fish.stateData.biteWindow;
        fish.game.onFishBiteStart(fish);
        fish.stateData.feedbackCd = 0;
      },
      update: (fish, dt) => {
        const g = fish.game;
        if (!g.player.castActive || !g.player.bobber.inWater) {
          fish.fsm.setState("SWIM");
          return;
        }
        const baitPos = g.player.getBaitPosition();
        fish.steerToward(baitPos, dt, 0.25);
        fish.stateData.biteTimer -= dt;
        if (fish.stateData.feedbackCd <= 0) {
          g.onFishNearBobber(0.95);
          fish.stateData.feedbackCd = rand(0.08, 0.16);
        }

        if (fish.stateData.biteTimer <= 0) {
          fish.fsm.setState("ESCAPE_ATTEMPT");
        }
      },
      exit: (fish) => {
        fish.game.onFishBiteEnd(fish);
      },
    },

    HOOKED: {
      enter: (fish) => {
        fish.stateData.hooked = true;
        fish.stateData.escapeTimer = 0;
        fish.game.onFishHooked(fish);
      },
      update: (fish, dt) => {
        const g = fish.game;
        const player = g.player;

        // Bait removed (e.g. cancelled cast or post-catch cleanup) — return to swim silently.
        if (!player.castActive || !player.bobber.inWater) {
          fish.fsm.setState("SWIM");
          return;
        }

        const reel = player.getReelPower01();
        const catchZone = player.getCatchZone();

        // Fish pulls away from bobber; player reel drags fish toward bobber.
        const baitPos = g.player.getBaitPosition();
        const awayDir = norm(sub(fish.pos, baitPos));
        const pullSpeed = fish.speed * lerp(0.8, 1.25, fish.pull01) * lerp(1.0, 1.15, clamp((g.stats.level - 1) / 10, 0, 1));
        fish.vel.x += awayDir.x * pullSpeed * dt * 0.45;
        fish.vel.y += awayDir.y * pullSpeed * dt * 0.45;

        const towardDir = norm(sub(baitPos, fish.pos));
        const reelStrength = reel * lerp(110, 160, 1 - fish.pull01);
        fish.vel.x += towardDir.x * reelStrength * dt;
        fish.vel.y += towardDir.y * reelStrength * dt;

        // Occasional struggle bursts.
        if (chance(dt * (0.6 + fish.pull01 * 1.1))) {
          fish.vel.x += rand(-1, 1) * 85 * fish.pull01;
          fish.vel.y += rand(-1, 1) * 65 * fish.pull01;
        }

        // Catch check: fish is dragged close to bobber/catch zone with good reel tension.
        const baitPos2 = g.player.getBaitPosition();
        const dToBait = dist(fish.pos, baitPos2);
        const dToZone = dist(fish.pos, catchZone);
        const catchRadius = 90; // generous radius
        const tensionOk = player.tension01 <= 0.96;
        const reelOk = reel >= 0.15;
        if ((dToBait < catchRadius || dToZone < catchRadius) && tensionOk && reelOk) {
          fish.fsm.setState("CAUGHT");
          return;
        }

        // Escape pressure scales with level — higher level fish struggle more.
        const escLvlMul = clamp(1.0 + (g.stats.level - 1) * 0.12, 1.0, 2.5);
        fish.stateData.escapeTimer += dt * (reel < 0.25 ? 1.0 : 0.42) * escLvlMul;
        if (fish.stateData.escapeTimer > 1.25 && chance(dt * (0.25 + fish.pull01 * 0.65) * escLvlMul)) {
          fish.fsm.setState("ESCAPE_ATTEMPT");
        }
      },
    },

    ESCAPE_ATTEMPT: {
      enter: (fish) => {
        const lvl = fish.game.stats.level;
        // At high levels fish escape faster — less recovery time for the player
        const escMin = clamp(0.75 - (lvl - 1) * 0.04, 0.30, 0.75);
        const escMax = clamp(1.3 - (lvl - 1) * 0.05, 0.50, 1.3);
        fish.stateData.escapeTimer = rand(escMin, escMax);
        fish.game.onFishEscapeAttempt(fish);
      },
      update: (fish, dt) => {
        const g = fish.game;
        const player = g.player;

        // If bait was removed (e.g. after a catch), just go back to swimming —
        // never penalise the player.
        if (!player.castActive || !player.bobber.inWater) {
          fish.fsm.setState("SWIM");
          return;
        }

        const reel = player.getReelPower01();
        const catchZone = player.getCatchZone();

        fish.stateData.escapeTimer -= dt;

        // Erratic burst movement away from bobber/catch zone.
        const away = norm(sub(fish.pos, catchZone));
        const zig = Math.sin((g.time + fish.pos.x * 0.01) * 16) * 0.9;
        const ang = Math.atan2(away.y, away.x) + zig;
        const dir = { x: Math.cos(ang), y: Math.sin(ang) };
        const sp = fish.speed * (1.45 + fish.pull01 * 0.6);
        fish.vel.x = lerp(fish.vel.x, dir.x * sp, 1 - Math.pow(0.0006, dt));
        fish.vel.y = lerp(fish.vel.y, dir.y * sp, 1 - Math.pow(0.0006, dt));

        // Recovery condition: player reels and keeps tension not extreme.
        if (reel > 0.45 && player.tension01 < 0.92 && chance(dt * 1.6)) {
          fish.fsm.setState("HOOKED");
          return;
        }

        // Catch can still happen here if fish gets dragged in.
        const baitP = g.player.getBaitPosition();
        const d = Math.min(dist(fish.pos, catchZone), dist(fish.pos, baitP));
        if (d < 90 && player.tension01 <= 0.93 && reel >= 0.10) {
          fish.fsm.setState("CAUGHT");
          return;
        }

        if (fish.stateData.escapeTimer <= 0) {
          fish.markEscaped();
          fish.fsm.setState("SWIM");
        }
      },
    },

    CAUGHT: {
      enter: (fish) => {
        fish.stateData.caught = true;
        fish.stateData.pendingDespawnT = 0.55;
        fish.game.onFishCaught(fish);
      },
      update: (fish, dt) => {
        fish.stateData.pendingDespawnT -= dt;
        // Pop upward slightly for feedback.
        fish.vel.y = lerp(fish.vel.y, -30, 1 - Math.pow(0.002, dt));
        fish.vel.x *= Math.pow(0.92, dt * 60);
        if (fish.stateData.pendingDespawnT <= 0) {
          fish.game.fishManager.despawn(fish);
        }
      },
    },
  };
}

