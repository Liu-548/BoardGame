// Điểm vào của trang (index.html): vẽ Sảnh chọn game, rồi giao #game-root cho game
// được chọn. Mỗi game tự vẽ màn của mình và gọi lại showHub() khi người chơi thoát.
import "./shared/style.css"; // nạp TRƯỚC CSS của Sảnh/game để các game đè được lên phần chung
import { betaLinkInfo } from "./shared/beta-link";
import { renderHubScreen } from "./hub/ui";
import type { HubGameId } from "./hub/ui";
import { mountBang } from "./games/bang/client/main";
import { mountWerewolf, resumeWerewolf } from "./games/werewolf/client/main";

const root = document.getElementById("game-root") as HTMLDivElement;

// Thẻ Mạt Chược/Coup (chưa có code thật) đang mở ghi chú hay không. null = không thẻ nào.
let expandedLockedGame: HubGameId | null = null;

function showHub(): void {
  // Sảnh tự vẽ tiêu đề riêng, không dùng tiêu đề "Bang!".
  const heading = document.getElementById("app-heading");
  if (heading) heading.hidden = true;
  document.body.classList.add("landing-bg");
  renderHubScreen(root, expandedLockedGame, betaLinkInfo(), { onSelectGame, onToggleLockedNote });
}

// Mạt Chược/Coup chưa có code thật: bấm vào chỉ mở/đóng ghi chú (onToggleLockedNote).
function onSelectGame(id: HubGameId): void {
  if (id === "bang") {
    mountBang(showHub);
  } else if (id === "werewolf") {
    document.body.classList.remove("landing-bg");
    mountWerewolf(root, showHub);
  }
}

function onToggleLockedNote(id: HubGameId): void {
  expandedLockedGame = expandedLockedGame === id ? null : id;
  showHub();
}

// F5 khi đang ở phòng Ma Sói → vào lại đúng phòng (xem resumeWerewolf()); không thì vẽ Sảnh.
if (!resumeWerewolf(root, showHub)) showHub();
