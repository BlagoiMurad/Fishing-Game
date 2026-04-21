import { Fish } from "./fish.js";
import { clamp, rand, vec } from "./utils.js";

export class FishManager {
  constructor(game) {
    this.game = game;
    this.fish = [];
    this.baitActive = false;
    this.bait = null;
    this.baitPos = vec(0, 0);

    this._spawnTimerId = null;
    this._ambientTimerId = null;
    this._maxFish = 8;
  }

  start() {
    this.stop();
    // Spawn cadence increases with level (handled in tick).
    this._spawnTimerId = setInterval(() => this._spawnTick(), 850);
    // Ambient ripples/bubbles
    this._ambientTimerId = setInterval(() => this._ambientTick(), 900);
  }

  stop() {
    if (this._spawnTimerId) clearInterval(this._spawnTimerId);
    if (this._ambientTimerId) clearInterval(this._ambientTimerId);
    this._spawnTimerId = null;
    this._ambientTimerId = null;
  }

  reset() {
    this.fish = [];
    this.baitActive = false;
    this.bait = null;
    this._maxFish = 8;
  }

  onBaitDeployed(bait, pos) {
    this.baitActive = true;
    this.bait = bait;
    this.baitPos.x = pos.x;
    this.baitPos.y = pos.y;
  }

  onBaitRemoved() {
    this.baitActive = false;
    this.bait = null;
  }

  despawn(fish) {
    const idx = this.fish.indexOf(fish);
    if (idx >= 0) this.fish.splice(idx, 1);
  }

  anyHooked() {
    return this.fish.some((f) => f.isHooked());
  }

  getCombinedPull01() {
    const hooked = this.fish.filter((f) => f.isHooked());
    if (hooked.length === 0) return 0;
    const sum = hooked.reduce((a, f) => a + f.pull01, 0);
    return clamp(sum / hooked.length, 0, 1);
  }

  update(dt) {
    if (!this.game.isPlaying()) return;
    if (this.baitActive) {
      const p = this.game.player.getBaitPosition();
      this.baitPos.x = p.x;
      this.baitPos.y = p.y;
    }
    for (const f of this.fish) f.update(dt);
  }

  draw(ctx) {
    // Fish remain fully simulated and catchable, but are intentionally hidden from view.
    // Gameplay feedback comes from the bobber and water effects instead.
  }

  tryHookSet() {
    // Prefer fish closest to bobber.
    // Important: candidates must include both:
    // - BITE: main timing window
    // - early ESCAPE_ATTEMPT: grace window (player can still recover)
    const g = this.game;
    const baitPos = g.player.getBaitPosition();
    const candidates = this.fish.filter((f) => {
      const name = f.fsm.currentName;
      if (name === "BITE") return true;
      if (name === "ESCAPE_ATTEMPT" && f.fsm.timeInState < 0.35) return true;
      return false;
    });
    candidates.sort((a, b) => {
      const da = (a.pos.x - baitPos.x) ** 2 + (a.pos.y - baitPos.y) ** 2;
      const db = (b.pos.x - baitPos.x) ** 2 + (b.pos.y - baitPos.y) ** 2;
      return da - db;
    });
    for (const f of candidates) {
      if (f.tryHookSet()) return true;
    }
    return false;
  }

  _spawnTick() {
    const g = this.game;
    if (!g.isPlaying()) return;
    const pond = g.pond;
    const lvl = g.stats.level;
    const targetMax = clamp(6 + lvl * 1.5, 6, 20);
    this._maxFish = targetMax;

    // Spawn chance scales with level but respects max.
    if (this.fish.length >= this._maxFish) return;
    const p = clamp(0.20 + lvl * 0.06, 0.20, 0.90);
    if (Math.random() > p) return;
    this.spawn();
  }

  spawn() {
    const g = this.game;
    const pond = g.pond;
    const lvl = g.stats.level;
    const typeName = Fish.pickType(lvl);
    const spawnPos = vec(rand(pond.x + 80, pond.x + pond.w - 80), rand(pond.y + 90, pond.y + pond.h - 90));
    const f = new Fish(g, typeName, spawnPos);
    this.fish.push(f);
  }

  _ambientTick() {
    const g = this.game;
    if (!g.isPlaying()) return;
    const pond = g.pond;
    // Subtle ripples where there is no bobber to keep scene alive.
    const x = rand(pond.x + pond.w * 0.15, pond.x + pond.w * 0.85);
    const y = rand(pond.y + pond.h * 0.18, pond.y + pond.h * 0.82);
    g.particles.spawnRipple(x, y, 0.8, "ambient");
  }
}

