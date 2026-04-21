import { Game } from "./game.js";

const boot = () => {
  const canvas = document.getElementById("gameCanvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const game = new Game(canvas);
  game.init();
  game.start();
};

window.addEventListener("load", boot, { once: true });

