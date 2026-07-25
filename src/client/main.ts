// Việc 2.2: dựng 1 ván demo bằng setupGame() (core/) rồi vẽ ra màn hình bằng
// renderGameState() (ui.ts). Chưa bấm bài được — đó là việc 2.3.

import { setupGame } from "../core/setup";
import { renderGameState } from "./ui";

const root = document.getElementById("game-root") as HTMLDivElement;

const state = setupGame(["An", "Bình", "Chi", "Dũng"], Date.now());

renderGameState(root, state);
