import { clamp, dist, lerp, norm, sub, vec, mul } from "./utils.js";

const BAITS = [
  { name: "Worm", attraction: 1.0, hookBonus: 0.0, color: "#ffd85a" },
  { name: "Minnow", attraction: 1.25, hookBonus: 0.08, color: "#57d2ff" },
  { name: "Shiny Lure", attraction: 1.45, hookBonus: 0.14, color: "#7dffb2" },
];

export class Player {
  constructor(game) {
    this.game = game;

    this.aim = vec(0, 0);
    this.aimAngle = -Math.PI / 2;

    this.baitIndex = 0;
    this.castPower01 = 0.55; // wheel-adjustable baseline

    // Cast/bobber state
    this.isCharging = false;
    this.charge = 0;
    this.castActive = false;
    this.bobber = {
      pos: vec(0, 0),
      vel: vec(0, 0),
      inWater: false,
      bobPhase: 0,
      rippleT: 0,
      rippleCd: 0,
      dip: 0,
      dipVel: 0,
    };
    this._castTarget = vec(0, 0);

    // Hooking/reel/tension
    this.tension01 = 0;
    this.reelHeld = false;
    this._reelPower = 0;
    this._lastReelSfx = 0;
    this._hookAttemptCd = 0;

    this.resetForMenu();
  }

  resetForMenu() {
    this.castActive = false;
    this.isCharging = false;
    this.charge = 0;
    this.tension01 = 0;
    this.reelHeld = false;
    this._reelPower = 0;
  }

  resetForNewGame() {
    this.resetForMenu();
    this.baitIndex = 0;
    this.castPower01 = 0.55;
  }

  getBait() {
    return BAITS[this.baitIndex] ?? BAITS[0];
  }

  getBaitName() {
    return this.getBait().name;
  }

  setAim(mx, my) {
    this.aim.x = mx;
    this.aim.y = my;
    const pivot = this.getRodPivot();
    this.aimAngle = Math.atan2(my - pivot.y, mx - pivot.x);
  }

  onKeyDown(code) {
    if (code === "Digit1") this.baitIndex = 0;
    if (code === "Digit2") this.baitIndex = 1;
    if (code === "Digit3") this.baitIndex = 2;

    if (code === "Space") {
      // Hook set assist, or quick reel pulse.
      if (this.game.tryHookSet()) return;
      if (this.game.isPlaying() && this.castActive && this.game.fishManager.anyHooked()) {
        this._reelPower = clamp(this._reelPower + 0.25, 0, 1);
      }
    }
  }

  // ---- Control-spec methods (state driven) ----
  startCastCharge() {
    if (!this.game.isPlaying()) return false;
    if (this.castActive) return false;
    if (this.isCharging) return false;
    this.isCharging = true;
    this.charge = 0;
    return true;
  }

  releaseCast() {
    if (!this.game.isPlaying()) return false;
    if (!this.isCharging) return false;
    this.isCharging = false;
    const power = clamp(this.castPower01 * 0.55 + this.charge * 0.65, 0.25, 1);
    this.cast(power);
    return true;
  }

  retrieveBobber() {
    if (!this.game.isPlaying()) return false;
    if (!this.castActive || !this.bobber.inWater) return false;
    if (this.game.fishManager.anyHooked()) return false;
    this.cancelCast("retrieve");
    this.game.audio.playSfx("button", { volume: 0.18 });
    return true;
  }

  canHookNow() {
    if (!this.game.isPlaying()) return false;
    if (!this.castActive || !this.bobber.inWater) return false;
    if (this.game.fishManager.anyHooked()) return false;
    return this.game.fishManager.fish.some((f) => {
      const name = f.fsm.currentName;
      if (name === "BITE") return true;
      if (name === "ESCAPE_ATTEMPT" && f.fsm.timeInState < 0.35) return true;
      return false;
    });
  }

  tryHookFish() {
    if (!this.canHookNow()) return false;
    if (this._hookAttemptCd > 0) return false;
    this._hookAttemptCd = 0.08;
    return this.game.tryHookSet();
  }

  startReeling() {
    if (!this.game.isPlaying()) return false;
    if (!this.castActive) return false;
    if (!this.game.fishManager.anyHooked()) return false;
    this.reelHeld = true;
    return true;
  }

  stopReeling() {
    if (!this.game.isPlaying()) return false;
    if (!this.reelHeld) return false;
    this.reelHeld = false;
    return true;
  }

  cancelCastCharge() {
    if (!this.isCharging) return false;
    this.isCharging = false;
    this.charge = 0;
    return true;
  }

  // ---- Input events (thin wrappers) ----
  onMouseDown() {
    // Left mouse: charge cast, hook fish on bite, reel if hooked, else retrieve.
    if (!this.game.isPlaying()) return;
    if (!this.castActive) {
      this.startCastCharge();
      return;
    }
    // If a fish is biting, left click also hooks it (same as right click / Space).
    if (this.canHookNow()) {
      this.tryHookFish();
      return;
    }
    // Reel if hooked.
    if (this.game.fishManager.anyHooked()) {
      this.startReeling();
      return;
    }
    // No fish — retrieve bobber.
    if (this.bobber.inWater) {
      this.retrieveBobber();
    }
  }

  onMouseUp() {
    // Left mouse up: release cast if charging; otherwise stop reeling.
    if (!this.game.isPlaying()) return;
    if (this.isCharging) {
      this.releaseCast();
      return;
    }
    this.stopReeling();
  }

  onRightMouseDown() {
    // Right mouse down: hook attempt only when bait is in water and bite window is valid.
    if (!this.game.isPlaying()) return;
    if (this.isCharging) {
      // Optional: allow right click to cancel charge before release (no other right-click behavior here).
      this.cancelCastCharge();
      return;
    }
    this.tryHookFish();
  }

  onWheel(deltaY) {
    if (!this.game.isPlaying()) return;
    this.castPower01 = clamp(this.castPower01 + (deltaY > 0 ? -0.05 : 0.05), 0.15, 1);
  }

  onContextMenu() {
    if (!this.game.isPlaying()) return;
    // Context menu is prevented by input handler; gameplay is driven by right mouse down.
    // Keep this as a no-op to avoid "right click = cancel cast" once bait is in the water.
  }

  cancelCast(reason = "cancel") {
    this.castActive = false;
    this.isCharging = false;
    this.charge = 0;
    this.tension01 = 0;
    this.reelHeld = false;
    this._reelPower = 0;
    this.bobber.inWater = false;
    this.bobber.rippleT = 0;
    this.bobber.dip = 0;
    this.bobber.dipVel = 0;
    this.game.fishManager.onBaitRemoved();
  }

  triggerBobberDip(amount = 1) {
    if (!this.castActive || !this.bobber.inWater) return;
    const strength = clamp(amount, 0, 1.6);
    this.bobber.dipVel -= 10 + strength * 16;
    this.bobber.rippleT = Math.max(this.bobber.rippleT, 0.45 + strength * 0.25);
  }

  cast(power01) {
    const g = this.game;
    const pond = g.pond;
    const pivot = this.getRodPivot();
    const dir = norm(sub(this.aim, pivot));

    const minDist = pond.w * 0.20;
    const maxDist = pond.w * 0.60;
    const distTarget = lerp(minDist, maxDist, power01);

    const target = vec(pivot.x + dir.x * distTarget, pivot.y + dir.y * distTarget);
    // Clamp to pond bounds (not strictly ellipse, but feels good).
    target.x = clamp(target.x, pond.x + 40, pond.x + pond.w - 40);
    target.y = clamp(target.y, pond.y + 40, pond.y + pond.h - 40);
    this._castTarget = target;

    this.castActive = true;
    this.bobber.inWater = false;
    this.bobber.pos = vec(pivot.x, pivot.y);

    // Simple arc velocity toward target; gravity-like y component.
    const dx = target.x - pivot.x;
    const dy = target.y - pivot.y;
    const flight = clamp(0.45 + power01 * 0.55, 0.45, 1.0);
    this.bobber.vel = vec(dx / flight, dy / flight - 260);
    this.bobber.bobPhase = 0;
    this.bobber.rippleT = 0.7;
    this.bobber.rippleCd = 0.15;

    g.audio.playSfx("cast");
    g.fishManager.onBaitRemoved();
  }

  getRodPivot() {
    const g = this.game;
    const pond = g.pond;
    return vec(pond.x + pond.w * 0.5, pond.y + pond.h + 54);
  }

  getBaitPosition() {
    return vec(this.bobber.pos.x, this.bobber.pos.y);
  }

  getCatchZone() {
    const pond = this.game.pond;
    return vec(pond.x + pond.w * 0.5, pond.y + pond.h * 0.86);
  }

  update(dt) {
    const g = this.game;
    if (!g.isPlaying()) return;

    this._hookAttemptCd = Math.max(0, this._hookAttemptCd - dt);

    if (this.isCharging) {
      this.charge = clamp(this.charge + dt * 0.9, 0, 1);
    }

    if (this.castActive) {
      if (!this.bobber.inWater) {
        // Flight
        this.bobber.vel.y += 580 * dt;
        this.bobber.pos.x += this.bobber.vel.x * dt;
        this.bobber.pos.y += this.bobber.vel.y * dt;

        // Land when close enough or below target.
        const land = dist(this.bobber.pos, this._castTarget) < 14 || this.bobber.pos.y >= this._castTarget.y;
        if (land) {
          this.bobber.inWater = true;
          this.bobber.pos.x = this._castTarget.x;
          this.bobber.pos.y = this._castTarget.y;
          this.bobber.vel = vec(0, 0);
          this.bobber.rippleT = 1.0;
          this.bobber.rippleCd = 0.05;
          this.bobber.dip = 0;
          this.bobber.dipVel = 0;
          g.fishManager.onBaitDeployed(this.getBait(), this.getBaitPosition());
        }
      } else {
        // Float/bob
        this.bobber.bobPhase += dt * 3.2;
        this.bobber.rippleT = Math.max(0, this.bobber.rippleT - dt * 0.65);
        this.bobber.dipVel += (0 - this.bobber.dip) * dt * 42;
        this.bobber.dipVel *= Math.pow(0.08, dt);
        this.bobber.dip += this.bobber.dipVel * dt;
        this.bobber.dip = clamp(this.bobber.dip, -11, 7);

        // Spawn ripples at a controlled rate (not every frame).
        this.bobber.rippleCd -= dt;
        if (this.bobber.rippleT > 0 && this.bobber.rippleCd <= 0) {
          const p = this.getBaitPosition();
          g.particles.spawnRipple(p.x, p.y, 0.32, "ambient");
          this.bobber.rippleCd = 0.28 + (1 - this.castPower01) * 0.12;
        }
      }
    }

    // Reel power smoothing.
    const targetReel = this.reelHeld ? 1 : 0;
    this._reelPower = lerp(this._reelPower, targetReel, 1 - Math.pow(0.001, dt));

    // Tension is meaningful only when hooked.
    const hooked = g.fishManager.anyHooked();
    if (!hooked) {
      this.tension01 = lerp(this.tension01, 0, 1 - Math.pow(0.002, dt));
      return;
    }

    const fishPull = g.fishManager.getCombinedPull01();
    const reel = this._reelPower;
    // Tension is driven by fish pull and reeling. The previous coefficients made
    // high-pull fish effectively impossible to catch (tension would exceed the
    // strict catch threshold while the line was still stable).
    // Tension comes from fish pull; reeling REDUCES tension by fighting the fish properly.
    // At higher levels, fish pull harder so tension builds faster.
    const lvl = g.stats.level;
    const lvlMul = clamp(1.0 + (lvl - 1) * 0.08, 1.0, 2.0);
    const tensionTarget = clamp((0.10 + fishPull * 0.60 * lvlMul) - reel * 0.25 + (1 - reel) * 0.20, 0, 1.25);
    this.tension01 = lerp(this.tension01, tensionTarget, 1 - Math.pow(0.0008, dt));
    this.tension01 = clamp(this.tension01, 0, 1.25);

    // Reel audio pulses (subtle).
    if (reel > 0.2) {
      this._lastReelSfx -= dt;
      if (this._lastReelSfx <= 0) {
        g.audio.playSfx("reel", { volume: 0.22 });
        this._lastReelSfx = 0.35;
      }
    }

    // Break line if tension is critically high.
    if (this.tension01 >= 1.15) {
      g.onLineBreak();
    }
  }

  getReelPower01() {
    return this._reelPower;
  }
}

