import { drawSoftShadowPanel, drawText, roundRect, withAlpha } from "./utils.js";

class CanvasButton {
  constructor({ id, label, x, y, w, h, onClick, accent = false }) {
    this.id = id;
    this.label = label;
    this.rect = { x, y, w, h };
    this.onClick = onClick;
    this.hover = false;
    this.pressedT = 0;
    this.accent = accent;
  }

  hit(mx, my) {
    const { x, y, w, h } = this.rect;
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  update(dt) {
    this.pressedT = Math.max(0, this.pressedT - dt * 3.5);
  }

  draw(ctx) {
    const { x, y, w, h } = this.rect;
    const r = 16;
    const press = this.pressedT > 0 ? 3 : 0;

    ctx.save();
    ctx.translate(0, press);

    // Glow shadow
    if (this.hover || this.accent) {
      ctx.shadowColor = this.accent ? "rgba(125,255,178,0.45)" : "rgba(87,210,255,0.40)";
      ctx.shadowBlur = this.hover ? 28 : 18;
    }

    // Background gradient
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (this.accent) {
      grad.addColorStop(0, this.hover ? "rgba(125,255,178,0.35)" : "rgba(125,255,178,0.22)");
      grad.addColorStop(1, this.hover ? "rgba(87,210,255,0.22)" : "rgba(87,210,255,0.12)");
    } else {
      grad.addColorStop(0, this.hover ? "rgba(87,210,255,0.22)" : "rgba(255,255,255,0.10)");
      grad.addColorStop(1, this.hover ? "rgba(87,210,255,0.10)" : "rgba(255,255,255,0.05)");
    }
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = grad;
    ctx.fill();

    // Border
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    roundRect(ctx, x, y, w, h, r);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.accent
      ? (this.hover ? "rgba(125,255,178,0.80)" : "rgba(125,255,178,0.45)")
      : (this.hover ? "rgba(87,210,255,0.70)" : "rgba(255,255,255,0.16)");
    ctx.stroke();

    // Top sheen
    const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.45);
    sheen.addColorStop(0, "rgba(255,255,255,0.12)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    roundRect(ctx, x + 1, y + 1, w - 2, h * 0.45, r);
    ctx.fillStyle = sheen;
    ctx.fill();

    // Label
    drawText(ctx, this.label, x + w / 2, y + h / 2, {
      size: 17,
      weight: 800,
      align: "center",
      baseline: "middle",
      color: this.accent
        ? (this.hover ? "#7dffb2" : "rgba(125,255,178,0.92)")
        : (this.hover ? "#eaf3ff" : "rgba(234,243,255,0.88)"),
      shadow: true,
    });

    ctx.restore();
  }
}

export class UIManager {
  constructor(game) {
    this.game = game;
    this.buttons = [];
    this._screen = "menu";
    this._stars = this._genStars(110);
    this._shootingStarT = 0;
    this._shootingStar = null;
  }

  _genStars(n) {
    const stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.55,
        r: Math.random() * 1.4 + 0.3,
        twinkle: Math.random() * Math.PI * 2,
        speed: Math.random() * 1.8 + 0.8,
      });
    }
    return stars;
  }

  setScreen(name) {
    this._screen = name;
    this._rebuildButtons();
  }

  update(dt) {
    for (const b of this.buttons) b.update(dt);
    this._shootingStarT -= dt;
    if (this._shootingStarT <= 0) {
      this._shootingStarT = Math.random() * 6 + 4;
      this._shootingStar = {
        x: Math.random() * 0.6 + 0.1,
        y: Math.random() * 0.25,
        len: Math.random() * 0.18 + 0.08,
        t: 0,
        life: Math.random() * 0.6 + 0.5,
      };
    }
    if (this._shootingStar) {
      this._shootingStar.t += dt;
      if (this._shootingStar.t >= this._shootingStar.life) this._shootingStar = null;
    }
  }

  onMouseMove(mx, my) {
    for (const b of this.buttons) b.hover = b.hit(mx, my);
  }

  onClick(mx, my) {
    for (const b of this.buttons) {
      if (b.hit(mx, my)) {
        b.pressedT = 1;
        b.onClick?.();
        return true;
      }
    }
    return false;
  }

  // ─── Background ───────────────────────────────────────────────────────────

  drawBackground(ctx, view, t) {
    // Deep night sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, "#060d1a");
    g.addColorStop(0.38, "#0b1e35");
    g.addColorStop(0.72, "#0d2540");
    g.addColorStop(1, "#091929");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    // Stars
    const skyH = view.h * 0.52;
    for (const s of this._stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(t * s.speed + s.twinkle);
      ctx.save();
      ctx.globalAlpha = twinkle * 0.9;
      ctx.fillStyle = "#eaf3ff";
      ctx.beginPath();
      ctx.arc(s.x * view.w, s.y * skyH, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Shooting star
    if (this._shootingStar) {
      const ss = this._shootingStar;
      const prog = ss.t / ss.life;
      const a = prog < 0.15 ? prog / 0.15 : prog > 0.75 ? 1 - (prog - 0.75) / 0.25 : 1;
      const sx = (ss.x + prog * ss.len) * view.w;
      const sy = (ss.y + prog * ss.len * 0.45) * view.h;
      const ex = (ss.x + (prog - 0.12) * ss.len) * view.w;
      const ey = (ss.y + (prog - 0.12) * ss.len * 0.45) * view.h;
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      const grad = ctx.createLinearGradient(ex, ey, sx, sy);
      grad.addColorStop(0, "rgba(234,243,255,0)");
      grad.addColorStop(1, "#eaf3ff");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.restore();
    }

    // Moon
    const moonX = view.w * 0.82;
    const moonY = view.h * 0.14;
    const moonR = 34;
    ctx.save();
    ctx.shadowColor = "rgba(200,230,255,0.35)";
    ctx.shadowBlur = 42;
    const moonGrad = ctx.createRadialGradient(moonX - 8, moonY - 8, 4, moonX, moonY, moonR);
    moonGrad.addColorStop(0, "#eaf3ff");
    moonGrad.addColorStop(0.6, "#c8deff");
    moonGrad.addColorStop(1, "#8fb8e8");
    ctx.fillStyle = moonGrad;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    // Moon crater hints
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#3a6090";
    ctx.beginPath(); ctx.arc(moonX + 8, moonY + 5, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(moonX - 10, moonY - 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(moonX + 4, moonY - 12, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // Moon glow halo
    const halo = ctx.createRadialGradient(moonX, moonY, moonR, moonX, moonY, moonR * 3.2);
    halo.addColorStop(0, "rgba(180,215,255,0.18)");
    halo.addColorStop(1, "rgba(180,215,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Treeline silhouette
    ctx.save();
    ctx.fillStyle = "#060e1a";
    const treeY = view.h * 0.44;
    ctx.beginPath();
    ctx.moveTo(0, treeY + 18);
    for (let x = 0; x <= view.w; x += 28) {
      const h2 = Math.sin(x * 0.031 + 1.2) * 22 + Math.sin(x * 0.011) * 14 + 8;
      ctx.lineTo(x, treeY - h2);
      ctx.lineTo(x + 14, treeY - h2 + 12);
    }
    ctx.lineTo(view.w, treeY + 18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Horizon glow (moonlight on water)
    ctx.save();
    const hg = ctx.createLinearGradient(0, view.h * 0.42, 0, view.h * 0.56);
    hg.addColorStop(0, "rgba(87,150,210,0.10)");
    hg.addColorStop(1, "rgba(87,150,210,0)");
    ctx.fillStyle = hg;
    ctx.fillRect(0, view.h * 0.42, view.w, view.h * 0.14);
    ctx.restore();
  }

  // ─── Menu ─────────────────────────────────────────────────────────────────

  drawMenu(ctx, view) {
    const t = this.game.time;
    this.drawBackground(ctx, view, t);
    this.game.drawSceneBase(ctx);

    const cx = view.w / 2;
    const panelW = Math.min(580, view.w * 0.82);
    const panelH = 390;
    const px = cx - panelW / 2;
    const py = view.h * 0.10;

    // Glassmorphism panel
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.70)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 18;
    roundRect(ctx, px, py, panelW, panelH, 22);
    ctx.fillStyle = "rgba(8,18,32,0.82)";
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Top accent border
    const topGrad = ctx.createLinearGradient(px, py, px + panelW, py);
    topGrad.addColorStop(0, "rgba(87,210,255,0)");
    topGrad.addColorStop(0.35, "rgba(87,210,255,0.65)");
    topGrad.addColorStop(0.65, "rgba(125,255,178,0.65)");
    topGrad.addColorStop(1, "rgba(125,255,178,0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(px + 22, py, panelW - 44, 2);
    // Side borders subtle
    roundRect(ctx, px, py, panelW, panelH, 22);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Fish icon (decorative)
    ctx.save();
    ctx.translate(cx, py + 54);
    _drawFishIcon(ctx, 0, 0, 26, "#57d2ff", t);
    ctx.restore();

    // Title
    ctx.save();
    const titleGrad = ctx.createLinearGradient(cx - 160, 0, cx + 160, 0);
    titleGrad.addColorStop(0, "#57d2ff");
    titleGrad.addColorStop(0.5, "#eaf3ff");
    titleGrad.addColorStop(1, "#7dffb2");
    ctx.fillStyle = titleGrad;
    ctx.font = "900 46px Nunito, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(87,210,255,0.40)";
    ctx.shadowBlur = 22;
    ctx.fillText("FISHING MASTER", cx, py + 100);
    ctx.restore();

    drawText(ctx, "FSM Pond Challenge", cx, py + 132, {
      size: 15, weight: 700, align: "center", baseline: "middle",
      color: "rgba(125,255,178,0.78)", shadow: false,
    });

    // Divider
    ctx.save();
    const div = ctx.createLinearGradient(px + 40, 0, px + panelW - 40, 0);
    div.addColorStop(0, "rgba(87,210,255,0)");
    div.addColorStop(0.5, "rgba(87,210,255,0.30)");
    div.addColorStop(1, "rgba(87,210,255,0)");
    ctx.strokeStyle = div;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 40, py + 152); ctx.lineTo(px + panelW - 40, py + 152);
    ctx.stroke();
    ctx.restore();

    // Controls
    const controls = [
      ["🎣", "Left click to cast, then hold to reel"],
      ["🐟", "Right click / Space to hook when fish bites"],
      ["🎿", "1 / 2 / 3 change bait · Mouse wheel = cast power"],
    ];
    let yy = py + 178;
    for (const [icon, text] of controls) {
      drawText(ctx, icon, px + 38, yy, { size: 16, baseline: "middle", shadow: false });
      drawText(ctx, text, px + 62, yy, {
        size: 13, weight: 600, baseline: "middle",
        color: "rgba(234,243,255,0.72)", shadow: false,
      });
      yy += 26;
    }

    for (const b of this.buttons) b.draw(ctx);
  }

  // ─── Pause ────────────────────────────────────────────────────────────────

  drawPause(ctx, view) {
    this.game.drawPlaying(ctx);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();

    const cx = view.w / 2;
    const panelW = Math.min(440, view.w * 0.74);
    const panelH = 340;
    const px = cx - panelW / 2;
    const py = view.h * 0.18;

    _drawGlassPanel(ctx, px, py, panelW, panelH, 20, "rgba(6,14,26,0.88)");

    // Pause icon
    ctx.save();
    ctx.fillStyle = "rgba(87,210,255,0.55)";
    ctx.fillRect(cx - 18, py + 34, 10, 28);
    ctx.fillRect(cx + 8, py + 34, 10, 28);
    ctx.restore();

    drawText(ctx, "PAUSED", cx, py + 82, {
      size: 30, weight: 900, align: "center", baseline: "middle", color: "#eaf3ff",
    });

    for (const b of this.buttons) b.draw(ctx);
  }

  // ─── Game Over ────────────────────────────────────────────────────────────

  drawGameOver(ctx, view) {
    const t = this.game.time;
    this.drawBackground(ctx, view, t);
    this.game.drawSceneBase(ctx);

    const cx = view.w / 2;
    const panelW = Math.min(560, view.w * 0.82);
    const panelH = 420;
    const px = cx - panelW / 2;
    const py = view.h * 0.10;

    _drawGlassPanel(ctx, px, py, panelW, panelH, 22, "rgba(8,14,26,0.88)");

    // Red accent top
    ctx.save();
    const redGrad = ctx.createLinearGradient(px, py, px + panelW, py);
    redGrad.addColorStop(0, "rgba(255,90,106,0)");
    redGrad.addColorStop(0.5, "rgba(255,90,106,0.65)");
    redGrad.addColorStop(1, "rgba(255,90,106,0)");
    ctx.fillStyle = redGrad;
    ctx.fillRect(px + 22, py, panelW - 44, 2);
    ctx.restore();

    drawText(ctx, "GAME OVER", cx, py + 60, {
      size: 38, weight: 900, align: "center", baseline: "middle", color: "#ff5a6a",
    });

    const s = this.game.stats;
    const rows = [
      { label: "Final Score", value: `${s.score}`, accent: true },
      { label: "Fish Caught", value: `🐟 ${s.fishCaught}` },
      { label: "Highest Level", value: `⭐ ${s.highestLevel}` },
      { label: "Failed Attempts", value: `${s.failed}/${s.maxFails}`, danger: s.failed >= s.maxFails },
    ];

    let yy = py + 115;
    for (const row of rows) {
      // Row bg
      ctx.save();
      roundRect(ctx, px + 24, yy - 14, panelW - 48, 34, 10);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fill();
      ctx.restore();

      drawText(ctx, row.label, px + 46, yy + 3, {
        size: 14, weight: 700, baseline: "middle",
        color: "rgba(234,243,255,0.62)", shadow: false,
      });
      drawText(ctx, row.value, px + panelW - 46, yy + 3, {
        size: 16, weight: 800, align: "right", baseline: "middle",
        color: row.accent ? "#7dffb2" : row.danger ? "#ff5a6a" : "#eaf3ff",
        shadow: false,
      });

      // Separator
      if (yy < py + 115 + 34 * 3) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 32, yy + 20); ctx.lineTo(px + panelW - 32, yy + 20);
        ctx.stroke();
        ctx.restore();
      }
      yy += 38;
    }

    for (const b of this.buttons) b.draw(ctx);
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  drawHUD(ctx, view) {
    const g = this.game;
    const p = g.player;
    const s = g.stats;
    const t = g.time;

    // ── Left panel ──
    const pad = 14;
    const top = 12;
    const w = 210;
    const h = 110;
    _drawGlassPanel(ctx, pad, top, w, h, 16, "rgba(6,14,26,0.72)");

    // Score with glow on change
    ctx.save();
    ctx.font = "800 22px Nunito, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#eaf3ff";
    ctx.shadowColor = "rgba(87,210,255,0.35)";
    ctx.shadowBlur = 12;
    ctx.fillText(`${s.score}`, pad + 14, top + 30);
    ctx.restore();
    drawText(ctx, "SCORE", pad + 14, top + 50, {
      size: 10, weight: 800, baseline: "middle",
      color: "rgba(87,210,255,0.70)", shadow: false,
    });

    // Level badge
    const lvlX = pad + w - 18;
    ctx.save();
    ctx.shadowColor = "rgba(125,255,178,0.45)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(lvlX, top + 30, 22, 0, Math.PI * 2);
    const lvlGrad = ctx.createRadialGradient(lvlX, top + 30, 4, lvlX, top + 30, 22);
    lvlGrad.addColorStop(0, "rgba(125,255,178,0.28)");
    lvlGrad.addColorStop(1, "rgba(87,210,255,0.10)");
    ctx.fillStyle = lvlGrad;
    ctx.fill();
    ctx.strokeStyle = "rgba(125,255,178,0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, `${s.level}`, lvlX, top + 30, {
      size: 16, weight: 900, align: "center", baseline: "middle", color: "#7dffb2",
    });
    drawText(ctx, "LVL", lvlX, top + 50, {
      size: 9, weight: 800, align: "center", baseline: "middle",
      color: "rgba(125,255,178,0.65)", shadow: false,
    });

    // Divider
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + 12, top + 64); ctx.lineTo(pad + w - 12, top + 64);
    ctx.stroke();
    ctx.restore();

    // Fish caught + bait
    const fishIcon = "🐟";
    drawText(ctx, `${fishIcon} ${s.fishCaught} caught`, pad + 14, top + 82, {
      size: 12, weight: 700, baseline: "middle",
      color: "rgba(234,243,255,0.65)", shadow: false,
    });
    drawText(ctx, `${p.getBaitName()}`, pad + 14, top + 100, {
      size: 11, weight: 600, baseline: "middle",
      color: "rgba(87,210,255,0.60)", shadow: false,
    });

    // ── Fail hearts (top center) ──
    const heartCx = view.w / 2;
    const heartY = top + 14;
    const heartSpacing = 28;
    const totalHeartsW = s.maxFails * heartSpacing;
    for (let i = 0; i < s.maxFails; i++) {
      const hx = heartCx - totalHeartsW / 2 + i * heartSpacing + heartSpacing / 2;
      const alive = i >= s.failed;
      ctx.save();
      ctx.globalAlpha = alive ? 1.0 : 0.22;
      ctx.shadowColor = alive ? "rgba(255,90,106,0.55)" : "transparent";
      ctx.shadowBlur = alive ? 10 : 0;
      _drawHeart(ctx, hx, heartY + 10, 10, alive ? "#ff5a6a" : "#444");
      ctx.restore();
    }

    // ── Tension meter (top-right) ──
    const mw = 200;
    const mh = 110;
    const mx = view.w - pad - mw;
    const my = top;
    _drawGlassPanel(ctx, mx, my, mw, mh, 16, "rgba(6,14,26,0.72)");

    drawText(ctx, "LINE TENSION", mx + mw / 2, my + 20, {
      size: 10, weight: 800, align: "center", baseline: "middle",
      color: "rgba(234,243,255,0.55)", shadow: false,
    });

    const ten = p.tension01;
    const barW = mw - 28;
    const barH = 14;
    const barX = mx + 14;
    const barY = my + 34;

    // Bar track
    roundRect(ctx, barX, barY, barW, barH, 7);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Fill with gradient
    if (ten > 0.01) {
      const fillW = Math.max(0, barW * Math.min(ten, 1));
      const col1 = ten < 0.55 ? "#7dffb2" : ten < 0.80 ? "#ffd85a" : "#ff5a6a";
      const col2 = ten < 0.55 ? "#57d2ff" : ten < 0.80 ? "#ff9e5a" : "#ff2244";
      ctx.save();
      ctx.shadowColor = withAlpha(col1, 0.50);
      ctx.shadowBlur = 8;
      const fg = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
      fg.addColorStop(0, col1);
      fg.addColorStop(1, col2);
      roundRect(ctx, barX, barY, fillW, barH, 7);
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.restore();

      // Danger pulse
      if (ten > 0.85) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 12);
        ctx.save();
        ctx.globalAlpha = pulse * 0.35;
        roundRect(ctx, barX, barY, fillW, barH, 7);
        ctx.fillStyle = "#ff5a6a";
        ctx.fill();
        ctx.restore();
      }
    }

    // Tick marks
    for (let i = 1; i < 4; i++) {
      const tx2 = barX + barW * (i / 4);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx2, barY + 2); ctx.lineTo(tx2, barY + barH - 2);
      ctx.stroke();
      ctx.restore();
    }

    // Label
    const tensionLabel = ten < 0.40 ? "Relaxed" : ten < 0.70 ? "Good" : ten < 0.88 ? "Danger!" : "SNAP!";
    const tensionCol = ten < 0.40 ? "#7dffb2" : ten < 0.70 ? "#ffd85a" : "#ff5a6a";
    drawText(ctx, tensionLabel, mx + mw / 2, my + 62, {
      size: 13, weight: 900, align: "center", baseline: "middle",
      color: tensionCol, shadow: false,
    });

    // Reel hint when hooked
    if (g.fishManager.anyHooked()) {
      const pulse = 0.72 + 0.28 * Math.sin(t * 5);
      drawText(ctx, "HOLD LEFT CLICK TO REEL", mx + mw / 2, my + 84, {
        size: 10, weight: 800, align: "center", baseline: "middle",
        color: withAlpha("#57d2ff", pulse), shadow: false,
      });
    } else {
      // Bait/cast info
      const baitColors = ["#ffd85a", "#57d2ff", "#7dffb2"];
      drawText(ctx, `● Bait: ${p.getBaitName()}`, mx + mw / 2, my + 84, {
        size: 11, weight: 700, align: "center", baseline: "middle",
        color: withAlpha(baitColors[p.baitIndex] ?? "#eaf3ff", 0.75), shadow: false,
      });
    }

    // Sound indicator bottom right
    drawText(ctx, g.audio.muted ? "🔇" : "🔊", view.w - pad - 16, view.h - pad - 8, {
      size: 16, align: "right", baseline: "bottom", shadow: false,
    });
  }

  // ─── Draw dispatcher ──────────────────────────────────────────────────────

  draw(ctx, view) {
    if (this._screen === "menu") this.drawMenu(ctx, view);
    else if (this._screen === "paused") this.drawPause(ctx, view);
    else if (this._screen === "gameover") this.drawGameOver(ctx, view);
  }

  _rebuildButtons() {
    const g = this.game;
    const view = g.view;
    const cx = view.w / 2;
    this.buttons = [];

    if (this._screen === "menu") {
      this.buttons.push(
        new CanvasButton({
          id: "play", label: "🎣  Start Fishing",
          x: cx - 150, y: view.h * 0.10 + 316,
          w: 300, h: 54,
          accent: true,
          onClick: () => g.startNewGame(),
        }),
      );
    } else if (this._screen === "paused") {
      const y0 = view.h * 0.18 + 110;
      const bw = 300, bh = 50, gap = 10;
      this.buttons.push(
        new CanvasButton({ id: "resume", label: "▶  Resume", x: cx - bw / 2, y: y0, w: bw, h: bh, accent: true, onClick: () => g.resume() }),
        new CanvasButton({ id: "restart", label: "↺  Restart (R)", x: cx - bw / 2, y: y0 + bh + gap, w: bw, h: bh, onClick: () => g.startNewGame() }),
        new CanvasButton({
          id: "mute", label: g.audio.muted ? "🔊  Unmute" : "🔇  Mute",
          x: cx - bw / 2, y: y0 + 2 * (bh + gap), w: bw, h: bh,
          onClick: () => { g.audio.toggleMute(); this._rebuildButtons(); },
        }),
        new CanvasButton({ id: "menu", label: "⌂  Main Menu", x: cx - bw / 2, y: y0 + 3 * (bh + gap), w: bw, h: bh, onClick: () => g.toMenu() }),
      );
    } else if (this._screen === "gameover") {
      const y0 = view.h * 0.10 + 340;
      const bw = 280, bh = 52, gap = 12;
      this.buttons.push(
        new CanvasButton({ id: "restart", label: "↺  Play Again", x: cx - bw / 2, y: y0, w: bw, h: bh, accent: true, onClick: () => g.startNewGame() }),
        new CanvasButton({ id: "menu", label: "⌂  Main Menu", x: cx - bw / 2, y: y0 + bh + gap, w: bw, h: bh, onClick: () => g.toMenu() }),
      );
    }
  }
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function _drawGlassPanel(ctx, x, y, w, h, r, fill = "rgba(8,16,28,0.80)") {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.60)";
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  // Inner sheen top
  const sheen = ctx.createLinearGradient(x, y, x, y + h * 0.35);
  sheen.addColorStop(0, "rgba(255,255,255,0.07)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  roundRect(ctx, x, y, w, h * 0.35, r);
  ctx.fillStyle = sheen;
  ctx.fill();
  // Border
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function _drawHeart(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.3);
  ctx.bezierCurveTo(cx, cy - size * 0.1, cx - size, cy - size * 0.1, cx - size, cy + size * 0.3);
  ctx.bezierCurveTo(cx - size, cy + size * 0.75, cx, cy + size * 1.1, cx, cy + size * 1.3);
  ctx.bezierCurveTo(cx, cy + size * 1.1, cx + size, cy + size * 0.75, cx + size, cy + size * 0.3);
  ctx.bezierCurveTo(cx + size, cy - size * 0.1, cx, cy - size * 0.1, cx, cy + size * 0.3);
  ctx.fill();
}

function _drawFishIcon(ctx, x, y, size, color, t) {
  const wobble = Math.sin(t * 2.2) * 0.08;
  ctx.save();
  ctx.rotate(wobble);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, size * 1.2, size * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail
  ctx.beginPath();
  ctx.moveTo(x - size * 1.1, y);
  ctx.quadraticCurveTo(x - size * 1.7, y - size * 0.7, x - size * 2.0, y);
  ctx.quadraticCurveTo(x - size * 1.7, y + size * 0.7, x - size * 1.1, y);
  ctx.fillStyle = withAlpha(color, 0.75);
  ctx.fill();
  // Eye
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.arc(x + size * 0.65, y - size * 0.10, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
