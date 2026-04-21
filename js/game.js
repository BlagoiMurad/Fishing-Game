import { InputHandler } from "./input.js";
import { Player } from "./player.js";
import { FishManager } from "./enemy.js";
import { UIManager } from "./ui.js";
import { AudioManager } from "./audio.js";
import {
  clamp,
  dist,
  drawText,
  fitCanvasToDisplay,
  lerp,
  rand,
  roundRect,
  vec,
  withAlpha,
} from "./utils.js";

class ParticleSystem {
  constructor() {
    this.ripples = [];
    this.splashes = [];
    this.bubbles = [];
  }

  reset() {
    this.ripples = [];
    this.splashes = [];
    this.bubbles = [];
  }

  spawnRipple(x, y, strength = 1, kind = "default") {
    this.ripples.push({
      x,
      y,
      t: 0,
      life: 0.95 + strength * 0.35,
      r0: 8 + strength * 6,
      r1: 42 + strength * 38,
      a0: kind === "bite" ? 0.42 : 0.26,
      kind,
    });
  }

  spawnSplash(x, y, strength = 1, col = "#57d2ff") {
    const n = Math.floor(10 + strength * 16);
    for (let i = 0; i < n; i++) {
      const ang = rand(-Math.PI, 0);
      const sp = rand(90, 260) * (0.7 + strength * 0.5);
      this.splashes.push({
        x,
        y,
        vx: Math.cos(ang) * sp + rand(-40, 40),
        vy: Math.sin(ang) * sp - rand(10, 80),
        life: rand(0.35, 0.75) * (0.85 + strength * 0.25),
        t: 0,
        r: rand(1.2, 2.6) * (0.9 + strength * 0.5),
        col,
      });
    }
  }

  spawnBubbles(x, y, strength = 1, count = null) {
    const n = count ?? Math.floor(4 + strength * 5);
    for (let i = 0; i < n; i++) {
      this.bubbles.push({
        x: x + rand(-8, 8),
        y: y + rand(2, 12),
        vx: rand(-12, 12) * (0.6 + strength * 0.25),
        vy: -rand(22, 48) * (0.8 + strength * 0.3),
        life: rand(0.28, 0.62) * (0.9 + strength * 0.2),
        t: 0,
        r: rand(1.4, 3.2) * (0.9 + strength * 0.25),
      });
    }
  }

  update(dt) {
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < r.life);

    for (const p of this.splashes) {
      p.t += dt;
      p.vy += 620 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.splashes = this.splashes.filter((p) => p.t < p.life);

    for (const b of this.bubbles) {
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= Math.pow(0.25, dt);
      b.vy *= Math.pow(0.18, dt);
    }
    this.bubbles = this.bubbles.filter((b) => b.t < b.life);
  }

  draw(ctx) {
    // Ripples
    for (const r of this.ripples) {
      const tt = clamp(r.t / r.life, 0, 1);
      const radius = lerp(r.r0, r.r1, tt);
      const a = lerp(r.a0, 0, tt);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = r.kind === "bite" ? "#eaf3ff" : "#57d2ff";
      ctx.lineWidth = r.kind === "ambient" ? 1 : 2;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, radius * 1.2, radius * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Splash droplets
    for (const p of this.splashes) {
      const tt = clamp(p.t / p.life, 0, 1);
      const a = lerp(0.65, 0, tt);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Bubbles
    for (const b of this.bubbles) {
      const tt = clamp(b.t / b.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = lerp(0.52, 0, tt);
      ctx.fillStyle = "#eaf3ff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(87,210,255,0.65)";
      ctx.stroke();
      ctx.restore();
    }
  }
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.view = { w: 960, h: 540, dpr: 1 };
    this.pond = { x: 0, y: 0, w: 0, h: 0 };

    this.time = 0;
    this._lastMs = 0;
    this._rafId = 0;

    this.events = new EventTarget();
    this.audio = new AudioManager();
    this.input = new InputHandler(canvas);
    this.player = new Player(this);
    this.fishManager = new FishManager(this);
    this.ui = new UIManager(this);
    this.particles = new ParticleSystem();

    this.screen = "menu"; // menu | playing | paused | gameover
    this.stats = {
      score: 0,
      level: 1,
      highestLevel: 1,
      fishCaught: 0,
      failed: 0,
      maxFails: 5,
      nextLevelScore: 550,
    };

    this._biteHintT = 0;
    this._levelTimer = 0;
    this._levelUpT = 0;
    this._levelUpNum = 1;
    this._bobberActivityT = 0;
    this._bobberActivityStrength = 0;
  }

  init() {
    if (!this.ctx) throw new Error("Canvas 2D context unavailable");
    this.onResize();
    this.ui.setScreen("menu");
    this.input.attach(this);
    this.audio.init();

    // Unlock audio on first interaction (browser policy safe).
    const unlockOnce = async () => {
      await this.audio.unlock();
      await this.audio.playMusic();
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
    window.addEventListener("pointerdown", unlockOnce, { once: true });
    window.addEventListener("keydown", unlockOnce, { once: true });
  }

  start() {
    this._lastMs = 0;
    const tick = (ms) => {
      this._rafId = requestAnimationFrame(tick);
      const dt = this._lastMs ? clamp((ms - this._lastMs) / 1000, 0, 0.05) : 0;
      this._lastMs = ms;
      this.time += dt;

      this.update(dt);
      this.draw();
      this.input.frameReset();
    };
    this._rafId = requestAnimationFrame(tick);
  }

  isPlaying() {
    return this.screen === "playing";
  }

  startNewGame() {
    this.stats.score = 0;
    this.stats.level = 1;
    this.stats.highestLevel = 1;
    this.stats.fishCaught = 0;
    this.stats.failed = 0;
    this.stats.nextLevelScore = 550;
    this._levelTimer = 0;
    this._levelUpT = 0;

    this.player.resetForNewGame();
    this.fishManager.reset();
    this.fishManager.start();
    this.particles.reset();

    this.screen = "playing";
    this.ui.setScreen("playing");
    this.events.dispatchEvent(new CustomEvent("gameStart"));
    this.audio.playSfx("button");
    this.audio.playMusic();
  }

  toMenu() {
    this.screen = "menu";
    this.player.resetForMenu();
    this.fishManager.stop();
    this.particles.reset();
    this.ui.setScreen("menu");
  }

  pause() {
    if (!this.isPlaying()) return;
    this.screen = "paused";
    this.ui.setScreen("paused");
  }

  resume() {
    if (this.screen !== "paused") return;
    this.screen = "playing";
    this.ui.setScreen("playing");
  }

  gameOver() {
    if (this.screen === "gameover") return;
    this.screen = "gameover";
    this.fishManager.stop();
    this.ui.setScreen("gameover");
    this.events.dispatchEvent(new CustomEvent("gameOver", { detail: { ...this.stats } }));
    this.audio.playSfx("fail");
  }

  onResize() {
    const rect = this.canvas.getBoundingClientRect();
    this.view = fitCanvasToDisplay(this.canvas, this.ctx, rect.width, rect.height);
    const w = this.view.w;
    const h = this.view.h;
    this.pond = {
      x: w * 0.14,
      y: h * 0.30,
      w: w * 0.72,
      h: h * 0.56,
    };
    this.ui.setScreen(this.screen === "playing" ? "playing" : this.screen);
  }

  onBlur() {
    if (this.isPlaying()) this.pause();
  }

  onFocus() {
    // Keep paused; player explicitly resumes.
  }

  onKeyDown(code) {
    if (code === "Escape") {
      if (this.isPlaying()) this.pause();
      else if (this.screen === "paused") this.resume();
      return;
    }
    if (code === "KeyR") {
      if (this.screen === "playing" || this.screen === "paused" || this.screen === "gameover") this.startNewGame();
      return;
    }
    if (this.screen === "paused") return;
    this.player.onKeyDown(code);
  }

  onKeyUp(code) {
    // Keyup exists for the assignment; we use it to release held reel via Space.
    if (code === "Space") {
      // No-op currently, but the event is handled and available for expansion.
    }
  }

  onMouseMove(mx, my) {
    this.player.setAim(mx, my);
    this.ui.onMouseMove(mx, my);
  }

  onClick(mx, my) {
    this.audio.unlock();
    if (this.screen === "menu" || this.screen === "paused" || this.screen === "gameover") {
      const did = this.ui.onClick(mx, my);
      if (did) this.audio.playSfx("button");
      return;
    }
    // In gameplay, click is not used for fishing actions anymore.
    // Fishing actions are handled by:
    // - left mousedown/mouseup: charge+release cast, retrieve, reel
    // - right mousedown: hook attempt
  }

  onMouseDown(mx, my) {
    this.audio.unlock();
    if (this.screen !== "playing") return;
    this.player.onMouseDown(mx, my);
  }

  onMouseUp(mx, my) {
    if (this.screen !== "playing") return;
    this.player.onMouseUp(mx, my);
  }

  onRightMouseDown(mx, my) {
    this.audio.unlock();
    if (this.screen !== "playing") return;
    this.player.onRightMouseDown(mx, my);
  }

  onRightMouseUp(mx, my) {
    // no-op
  }

  onWheel(deltaY, mx, my) {
    if (this.screen !== "playing") return;
    this.player.onWheel(deltaY);
  }

  onContextMenu(mx, my) {
    if (this.screen !== "playing") return;
    this.player.onContextMenu(mx, my);
  }

  tryHookSet() {
    if (!this.isPlaying()) return false;
    if (!this.player.castActive || !this.player.bobber.inWater) return false;
    const ok = this.fishManager.tryHookSet();
    if (ok) this.audio.playSfx("bite", { volume: 0.28 });
    return ok;
  }

  onLineBreak() {
    if (!this.isPlaying()) return;
    this.stats.failed = Math.min(this.stats.maxFails, this.stats.failed + 1);
    const baitPos = this.player.getBaitPosition();
    this.particles.spawnSplash(baitPos.x, baitPos.y, 1.0, "#57d2ff");
    this.particles.spawnRipple(baitPos.x, baitPos.y, 1.1, "bite");
    this.audio.playSfx("fail");

    // Force all hooked fish back to swim.
    for (const f of this.fishManager.fish) {
      if (f.isHooked()) f.fsm.setState("SWIM");
    }
    this.player.cancelCast("fail");

    if (this.stats.failed >= this.stats.maxFails) this.gameOver();
  }

  onFishBiteStart(fish) {
    // Keep the UI hint aligned with the fish's actual BITE window.
    // Add a small grace period for human reaction time.
    const biteWindow = fish?.stateData?.biteWindow ?? fish?.biteWindow ?? 0.5;
    this._biteHintT = clamp(biteWindow + 0.12, 0.25, 0.95);
    const baitPos = this.player.getBaitPosition();
    this.particles.spawnRipple(baitPos.x, baitPos.y, 1.0, "bite");
    this.particles.spawnBubbles(baitPos.x, baitPos.y, 0.95, 7);
    this.player.triggerBobberDip(0.95);
    this._bobberActivityT = Math.max(this._bobberActivityT, 0.55);
    this._bobberActivityStrength = Math.max(this._bobberActivityStrength, 1.0);
    this.audio.playSfx("bite", { volume: 0.26 });
  }

  onFishBiteEnd(fish) {
    // no-op
  }

  onFishHooked(fish) {
    const baitPos = this.player.getBaitPosition();
    this.particles.spawnSplash(baitPos.x, baitPos.y, 0.7, "#eaf3ff");
    this.particles.spawnRipple(baitPos.x, baitPos.y, 0.9, "bite");
    this.particles.spawnBubbles(baitPos.x, baitPos.y, 0.9, 8);
    this.player.triggerBobberDip(1.15);
  }

  onFishEscapeAttempt(fish) {
    const p = this.player.getBaitPosition();
    this.particles.spawnRipple(p.x, p.y, 0.9, "default");
    this.particles.spawnBubbles(p.x, p.y, 0.72, 5);
    this.player.triggerBobberDip(0.8);
  }

  onFishNearBobber(intensity = 0.5) {
    if (!this.isPlaying()) return;
    if (!this.player.castActive || !this.player.bobber.inWater) return;
    const p = this.player.getBaitPosition();
    const strength = clamp(intensity, 0.2, 1.2);
    this._bobberActivityT = Math.max(this._bobberActivityT, 0.18 + strength * 0.12);
    this._bobberActivityStrength = Math.max(this._bobberActivityStrength, strength);
    this.particles.spawnRipple(p.x + rand(-4, 4), p.y + rand(-3, 3), 0.22 + strength * 0.28, "ambient");
    this.particles.spawnBubbles(p.x + rand(-5, 5), p.y + rand(-2, 4), 0.25 + strength * 0.28, strength > 0.75 ? 3 : 2);
    this.player.triggerBobberDip(0.18 + strength * 0.24);
  }

  onFishEscaped(fish) {
    if (!this.isPlaying()) return;
    this.stats.failed = Math.min(this.stats.maxFails, this.stats.failed + 1);
    this.events.dispatchEvent(new CustomEvent("fishEscaped", { detail: { type: fish.typeName, name: fish.name } }));
    this.audio.playSfx("fail", { volume: 0.32 });

    if (this.stats.failed >= this.stats.maxFails) {
      this.gameOver();
    }
  }

  onFishCaught(fish) {
    if (!this.isPlaying()) return;
    if (fish.stateData.catchAwarded) return;
    fish.stateData.catchAwarded = true;
    this.stats.score += fish.score;
    this.stats.fishCaught += 1;
    this.stats.highestLevel = Math.max(this.stats.highestLevel, this.stats.level);
    this.events.dispatchEvent(
      new CustomEvent("fishCaught", {
        detail: { type: fish.typeName, name: fish.name, score: fish.score, totalScore: this.stats.score },
      }),
    );
    this.audio.playSfx("catch");

    const cz = this.player.getCatchZone();
    this.particles.spawnSplash(cz.x, cz.y, 1.2, "#7dffb2");
    this.particles.spawnRipple(cz.x, cz.y, 1.1, "default");

    // Reset cast after a catch.
    this.player.cancelCast("catch");

    if (this.stats.score >= this.stats.nextLevelScore || this.stats.fishCaught % 4 === 0) {
      this.levelUp();
    }
  }

  levelUp() {
    this.stats.level += 1;
    this.stats.highestLevel = Math.max(this.stats.highestLevel, this.stats.level);
    this.stats.nextLevelScore = Math.floor(this.stats.nextLevelScore * 1.32 + 110);
    this._levelUpT = 2.8;
    this._levelUpNum = this.stats.level;
    this.events.dispatchEvent(new CustomEvent("levelUp", { detail: { level: this.stats.level } }));
    this.audio.playSfx("button", { volume: 0.22 });
  }

  update(dt) {
    this.ui.update(dt);
    if (this.screen !== "playing") return;

    this._biteHintT = Math.max(0, this._biteHintT - dt);
    this._levelUpT = Math.max(0, this._levelUpT - dt);
    this._bobberActivityT = Math.max(0, this._bobberActivityT - dt);
    this._bobberActivityStrength = lerp(this._bobberActivityStrength, 0, 1 - Math.pow(0.02, dt));
    this._levelTimer += dt;
    if (this._levelTimer > 28) {
      this._levelTimer = 0;
      // Time-based difficulty bump (small).
      if (this.stats.level < 12) this.levelUp();
    }

    if (this.player.castActive && this.player.bobber.inWater && this._bobberActivityT > 0) {
      const p = this.player.getBaitPosition();
      const pulseChance = dt * (8 + this._bobberActivityStrength * 10);
      if (Math.random() < pulseChance) {
        this.particles.spawnBubbles(p.x + rand(-6, 6), p.y + rand(-2, 4), 0.2 + this._bobberActivityStrength * 0.22, 2);
      }
      if (Math.random() < dt * (4 + this._bobberActivityStrength * 6)) {
        this.particles.spawnRipple(p.x + rand(-4, 4), p.y + rand(-3, 3), 0.18 + this._bobberActivityStrength * 0.18, "ambient");
      }
    }

    this.player.update(dt);
    this.fishManager.update(dt);
    this.particles.update(dt);
  }

  draw() {
    const ctx = this.ctx;
    const view = this.view;
    if (!ctx) return;

    if (this.screen === "playing") this.drawPlaying(ctx);
    else this.ui.draw(ctx, view);
  }

  drawPlaying(ctx) {
    // Background + scene
    this.ui.drawBackground(ctx, this.view, this.time);
    this.drawSceneBase(ctx);

    // Water surface FX first (ripples)
    this.particles.draw(ctx);

    // Fish
    this.fishManager.draw(ctx);

    // Bobber/line/rod
    this.drawFishingRig(ctx);

    // HUD
    this.ui.drawHUD(ctx, this.view);

    // Bite hint
    if (this._biteHintT > 0) {
      const a = clamp(this._biteHintT / 0.9, 0, 1);
      drawText(ctx, "BITE! Right Click or Space!", this.view.w / 2, this.pond.y + 40, {
        size: 18,
        weight: 900,
        align: "center",
        baseline: "middle",
        color: withAlpha("#ffd85a", 0.55 + a * 0.45),
      });
    }

    // Level-up banner
    if (this._levelUpT > 0) {
      const progress = this._levelUpT / 2.8;
      // Fade in fast, hold, fade out
      const a = progress > 0.85 ? clamp((1 - progress) / 0.15, 0, 1) :
                progress < 0.15 ? clamp(progress / 0.15, 0, 1) : 1;
      const yOff = progress > 0.85 ? (1 - (progress - 0.85) / 0.15) * 18 - 18 : 0;
      const cx = this.view.w / 2;
      const cy = this.view.h / 2 + yOff;

      // Dark backdrop
      ctx.save();
      ctx.globalAlpha = a * 0.72;
      ctx.fillStyle = "#0a1a2a";
      roundRect(ctx, cx - 170, cy - 42, 340, 84, 18);
      ctx.fill();
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = "#7dffb2";
      ctx.lineWidth = 2.5;
      roundRect(ctx, cx - 170, cy - 42, 340, 84, 18);
      ctx.stroke();
      ctx.restore();

      // Text
      drawText(ctx, `LEVEL ${this._levelUpNum}!`, cx, cy - 10, {
        size: 32, weight: 900, align: "center", baseline: "middle",
        color: withAlpha("#7dffb2", a),
      });
      // Difficulty hint
      const hints = [
        "", "Fish bite faster!", "Fish escape quicker!",
        "Stronger fish pulls!", "Very aggressive fish!",
        "Expert difficulty!", "Master angler required!",
      ];
      const hintIdx = clamp(Math.floor((this._levelUpNum - 1) / 2), 0, hints.length - 1);
      const hint = hints[hintIdx] || "Extreme difficulty!";
      drawText(ctx, hint, cx, cy + 24, {
        size: 14, weight: 700, align: "center", baseline: "middle",
        color: withAlpha("#ffd85a", a * 0.9),
      });
    }
  }

  drawSceneBase(ctx) {
    const pond = this.pond;
    const w = this.view.w;
    const h = this.view.h;
    const t = this.time;

    // Shore / grass bank
    ctx.save();
    const shoreY = pond.y + pond.h;
    const shore = ctx.createLinearGradient(0, shoreY, 0, h);
    shore.addColorStop(0, "#1a2e1e");
    shore.addColorStop(0.4, "#223028");
    shore.addColorStop(1, "#161e14");
    ctx.fillStyle = shore;
    ctx.fillRect(0, shoreY, w, h - shoreY);

    // Grass tufts along shore
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 28; i++) {
      const gx = pond.x + (i / 27) * pond.w;
      const gy = shoreY + 4;
      const gh = 10 + Math.sin(i * 2.3) * 5;
      ctx.fillStyle = i % 3 === 0 ? "#2d5a35" : "#1e4226";
      ctx.beginPath();
      ctx.moveTo(gx - 4, gy + gh);
      ctx.quadraticCurveTo(gx + Math.sin(t * 0.8 + i) * 3, gy, gx + 4, gy + gh);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Pond water (clipped ellipse)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(pond.x + pond.w / 2, pond.y + pond.h / 2, pond.w / 2, pond.h / 2, 0, 0, Math.PI * 2);
    ctx.clip();

    // Deep water gradient
    const water = ctx.createLinearGradient(0, pond.y, 0, pond.y + pond.h);
    water.addColorStop(0, "#0d3d5e");
    water.addColorStop(0.4, "#082d48");
    water.addColorStop(1, "#05192e");
    ctx.fillStyle = water;
    ctx.fillRect(pond.x, pond.y, pond.w, pond.h);

    // Moonlight shimmer on water
    const moonReflX = pond.x + pond.w * 0.78;
    const moonReflY = pond.y + pond.h * 0.28;
    const moonRefl = ctx.createRadialGradient(moonReflX, moonReflY, 10, moonReflX, moonReflY, 120);
    moonRefl.addColorStop(0, "rgba(180,220,255,0.18)");
    moonRefl.addColorStop(1, "rgba(180,220,255,0)");
    ctx.fillStyle = moonRefl;
    ctx.fillRect(pond.x, pond.y, pond.w, pond.h);

    // Animated wave lines
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "#c8e4ff";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const yy = pond.y + (i / 11) * pond.h;
      ctx.beginPath();
      ctx.moveTo(pond.x, yy);
      for (let x2 = pond.x; x2 <= pond.x + pond.w; x2 += 48) {
        const wy = yy + Math.sin((x2 * 0.014 + t * 0.6) + i * 0.7) * 4;
        ctx.lineTo(x2, wy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Lily pads (decorative)
    const lilies = [
      { x: pond.x + pond.w * 0.25, y: pond.y + pond.h * 0.35 },
      { x: pond.x + pond.w * 0.68, y: pond.y + pond.h * 0.55 },
      { x: pond.x + pond.w * 0.15, y: pond.y + pond.h * 0.65 },
      { x: pond.x + pond.w * 0.80, y: pond.y + pond.h * 0.30 },
    ];
    for (const lp of lilies) {
      const bob = Math.sin(t * 0.7 + lp.x) * 2;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#1d4a28";
      ctx.beginPath();
      ctx.ellipse(lp.x, lp.y + bob, 16, 10, t * 0.15 + lp.x, 0, Math.PI * 2);
      ctx.fill();
      // Flower
      ctx.fillStyle = "rgba(255,220,230,0.75)";
      ctx.beginPath();
      ctx.arc(lp.x, lp.y + bob, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.restore();

    // Pond rim glow
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(pond.x + pond.w / 2, pond.y + pond.h / 2, pond.w / 2, pond.h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(120,200,255,0.14)";
    ctx.stroke();
    ctx.restore();

    // Dock (wooden planks look)
    const dockW = pond.w * 0.24;
    const dockH = 42;
    const dx = pond.x + pond.w * 0.5 - dockW / 2;
    const dy = pond.y + pond.h + 14;
    ctx.save();
    // Wood planks
    const woodGrad = ctx.createLinearGradient(dx, dy, dx, dy + dockH);
    woodGrad.addColorStop(0, "#3a2a18");
    woodGrad.addColorStop(1, "#251a10");
    roundRect(ctx, dx, dy, dockW, dockH, 8);
    ctx.fillStyle = woodGrad;
    ctx.fill();
    // Plank lines
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#1a100a";
    ctx.lineWidth = 1;
    for (let pi = 1; pi < 4; pi++) {
      const px2 = dx + (dockW / 4) * pi;
      ctx.beginPath();
      ctx.moveTo(px2, dy + 4);
      ctx.lineTo(px2, dy + dockH - 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#eaf3ff";
    ctx.lineWidth = 1;
    roundRect(ctx, dx, dy, dockW, dockH, 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Dock posts
    ctx.fillStyle = "#2a1c0e";
    ctx.fillRect(dx + 6, dy + dockH - 2, 8, 16);
    ctx.fillRect(dx + dockW - 14, dy + dockH - 2, 8, 16);
    ctx.restore();

    // Cattails on the left shore
    const cattailPositions = [
      { x: pond.x - 10, y: pond.y + pond.h * 0.45 },
      { x: pond.x + 8, y: pond.y + pond.h * 0.55 },
      { x: pond.x - 5, y: pond.y + pond.h * 0.62 },
      { x: pond.x + pond.w + 5, y: pond.y + pond.h * 0.42 },
      { x: pond.x + pond.w + 16, y: pond.y + pond.h * 0.58 },
    ];
    for (const ct of cattailPositions) {
      const sway = Math.sin(t * 0.9 + ct.x * 0.05) * 4;
      ctx.save();
      ctx.strokeStyle = "#3a2e16";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ct.x, ct.y + 30);
      ctx.quadraticCurveTo(ct.x + sway * 0.5, ct.y + 10, ct.x + sway, ct.y - 30);
      ctx.stroke();
      // Seed head
      ctx.fillStyle = "#5a3e22";
      ctx.beginPath();
      ctx.ellipse(ct.x + sway, ct.y - 22, 5, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawFishingRig(ctx) {
    const player = this.player;
    const pond = this.pond;
    const pivot = player.getRodPivot();
    const aim = player.aim;

    // Player silhouette on shore
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y + 16, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rod
    const rodLen = 150;
    const ang = clamp(player.aimAngle, -Math.PI * 0.92, -Math.PI * 0.10);
    const tip = vec(pivot.x + Math.cos(ang) * rodLen, pivot.y + Math.sin(ang) * rodLen);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(234,243,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(87,210,255,0.55)";
    ctx.stroke();
    ctx.restore();

    // Line + bobber
    if (!player.castActive) {
      // Preview line to aim point
      ctx.save();
      ctx.strokeStyle = "rgba(234,243,255,0.22)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      const tx = clamp(aim.x, pond.x + 30, pond.x + pond.w - 30);
      const ty = clamp(aim.y, pond.y + 30, pond.y + pond.h - 30);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();

      // Charge meter hint
      if (player.isCharging) {
        const a = 0.2 + player.charge * 0.8;
        drawText(ctx, "Charging cast...", this.view.w / 2, this.pond.y + this.pond.h + 18, {
          size: 14,
          weight: 800,
          align: "center",
          baseline: "middle",
          color: withAlpha("#57d2ff", a),
          shadow: false,
        });
      }
      return;
    }

    const bob = player.bobber;
    const bp = player.getBaitPosition();
    const lineEnd = vec(bp.x, bp.y);

    // Line curvature
    const mid = vec(lerp(tip.x, lineEnd.x, 0.5), lerp(tip.y, lineEnd.y, 0.5) + 28 + player.tension01 * 12);
    ctx.save();
    ctx.strokeStyle = "rgba(234,243,255,0.28)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo(mid.x, mid.y, lineEnd.x, lineEnd.y);
    ctx.stroke();
    ctx.restore();

    // Bobber bobbing
    const bobOffset = bob.inWater ? Math.sin(bob.bobPhase) * 2.5 + bob.dip : 0;
    const bx = bp.x;
    const by = bp.y + bobOffset;

    // Bobber
    const bait = player.getBait();
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = bait.color;
    ctx.beginPath();
    ctx.arc(bx, by, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx - 2, by - 2, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Catch zone indicator (subtle)
    const cz = player.getCatchZone();
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = "#7dffb2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cz.x, cz.y, 34, 20, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

