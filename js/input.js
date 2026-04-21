import { clamp } from "./utils.js";

export class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.keysDown = new Set();
    this.mouse = {
      x: 0,
      y: 0,
      down: false,
      rightDown: false,
      clicked: false,
      released: false,
      wheelDelta: 0,
    };
    this._on = [];
  }

  attach(game) {
    const c = this.canvas;
    const w = window;

    const toCanvasSpace = (e) => {
      const rect = c.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / Math.max(1, rect.width);
      const my = (e.clientY - rect.top) / Math.max(1, rect.height);
      this.mouse.x = clamp(mx, 0, 1) * game.view.w;
      this.mouse.y = clamp(my, 0, 1) * game.view.h;
    };

    this._listen(w, "keydown", (e) => {
      this.keysDown.add(e.code);
      game.onKeyDown(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
    });

    this._listen(w, "keyup", (e) => {
      this.keysDown.delete(e.code);
      game.onKeyUp(e.code);
    });

    this._listen(w, "resize", () => game.onResize());
    this._listen(w, "blur", () => game.onBlur());
    this._listen(w, "focus", () => game.onFocus());

    this._listen(c, "mousemove", (e) => {
      toCanvasSpace(e);
      game.onMouseMove(this.mouse.x, this.mouse.y);
    });

    this._listen(c, "click", (e) => {
      toCanvasSpace(e);
      this.mouse.clicked = true;
      game.onClick(this.mouse.x, this.mouse.y);
    });

    this._listen(c, "mousedown", (e) => {
      toCanvasSpace(e);
      if (e.button === 2) {
        this.mouse.rightDown = true;
        game.onRightMouseDown(this.mouse.x, this.mouse.y);
      } else {
        this.mouse.down = true;
        game.onMouseDown(this.mouse.x, this.mouse.y);
      }
    });

    this._listen(c, "mouseup", (e) => {
      toCanvasSpace(e);
      if (e.button === 2) {
        this.mouse.rightDown = false;
        game.onRightMouseUp(this.mouse.x, this.mouse.y);
      } else {
        this.mouse.down = false;
        this.mouse.released = true;
        game.onMouseUp(this.mouse.x, this.mouse.y);
      }
    });

    this._listen(c, "wheel", (e) => {
      toCanvasSpace(e);
      const d = clamp(e.deltaY, -240, 240);
      this.mouse.wheelDelta += d;
      game.onWheel(d, this.mouse.x, this.mouse.y);
      e.preventDefault();
    }, { passive: false });

    this._listen(c, "contextmenu", (e) => {
      e.preventDefault();
      toCanvasSpace(e);
      game.onContextMenu(this.mouse.x, this.mouse.y);
    });
  }

  frameReset() {
    this.mouse.clicked = false;
    this.mouse.released = false;
    this.mouse.wheelDelta = 0;
  }

  isDown(code) {
    return this.keysDown.has(code);
  }

  _listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._on.push([target, type, fn, opts]);
  }

  detach() {
    for (const [t, type, fn, opts] of this._on) t.removeEventListener(type, fn, opts);
    this._on = [];
  }
}

