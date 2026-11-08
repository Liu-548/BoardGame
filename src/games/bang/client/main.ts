// Việc 2.3: bấm bài → gọi reduce(). Không dùng "chờ" (await) gì cả — mỗi lần
// bấm là 1 lần gọi reduce() đồng bộ, xong ngay, vẽ lại màn hình.
//
// Việc 2.5: chế độ hotseat — trước khi có GameState, hiện màn hình thiết lập
// (gõ tên 4-8 người — biến thể 8 người, xem docs/roadmap/LO-TRINH.md), rồi mới setupGame().
// Ván kết thúc thì có nút quay lại màn hình thiết lập (giữ nguyên tên cũ) để
// chơi ván khác, không cần tải lại trang.
//
// Việc 3.9: thêm màn hình chọn cách chơi (chung 1 máy / qua mạng) + lobby
// (tạo phòng / vào phòng bằng mã 6 ký tự).
//
// Việc 3.10: bàn chơi qua mạng giờ TƯƠNG TÁC THẬT — bấm bài gửi qua
// `netConnection.send({type:"action",...})` thay vì gọi reduce() cục bộ.
// Không biết ngay kết quả đúng/sai như hotseat (đồng bộ) — phải CHỜ server
// trả lời `{type:"state"}` (thành công, view mới) hay `{type:"action_error"}`
// (bị từ chối) rồi mới vẽ lại. Chọn mục tiêu (Panic!/Cat Balou cần biết tay
// mục tiêu có bài hay không) dùng `handCount` (luôn đúng) thay vì
// `hand.length` (chỉ có với chính mình, xem core/view.ts).
//
// `selection`/`discardSelectionIds`/`error` là trạng thái TẠM THỜI chỉ có ý
// nghĩa ở client (không phải trong GameState) — vd "đã bấm lá Bang!, đang chờ
// bấm chọn mục tiêu". Reset về "idle" sau mỗi lần reduce() thành công.

import { cardNameFromId, isDelayedEquipmentCardName, yellowCardActsAsMissed } from "../core/cards";
import type { CardName } from "../core/cards";
import type { Action, ExpansionId, HouseRuleId } from "../core/types";
import type { PlayerView } from "../core/view";
import { RoomConnection } from "./net";
import type { DeadlineInfo, ServerMessage } from "../protocol";
import "./style.css";
import { betaLinkInfo } from "../../../shared/beta-link";
import {
  applyStoredSettings,
  cardActsAsBang,
  DEFAULT_EVENT_DECK_SIZE,
  describeEvent,
  renderCardReferenceScreen,
  renderHomeScreen,
  renderNetworkCharacterSelectionScreen,
  renderNetworkGame,
  renderNetworkLobby,
  renderNetworkLobbyForm,
  triggerVisualEffect,
  vibrateForTurn,
} from "./ui";
import type { DrawCheckNotice, LobbyPlayer, Selection, UseAbilityCharacter } from "./ui";

const root = document.getElementById("game-root") as HTMLDivElement;

// Hoàn thiện Cài đặt — áp dụng sở thích giao diện sáng/tối + cỡ chữ đã lưu
// TRƯỚC lần vẽ đầu tiên (tránh nháy sáng/cỡ chữ mặc định rồi đổi lại ngay).
applyStoredSettings();

// Các lá cần chọn thêm mục tiêu khi đánh — lá còn lại (bia, saloon, súng máy
// Gatling, tự trang bị...) đánh xong ngay, không cần bước chọn nào thêm.
// Mở rộng Dodge City, mục 1.2 — thêm "punch" (BUG CŨ: thiếu từ trước, không
// liên quan riêng Dodge City — sửa luôn vì cùng chỗ), "rag_time"/"springfield"/
// "tequila" (cả 3 đều cần mục tiêu — xem playRagTime()/playSpringfield()/
// playTequila() ở reduce.ts). "brawl"/"whisky" KHÔNG cần mục tiêu (brawl nhắm
// TẤT CẢ, whisky chỉ tự dùng) nên không thêm vào đây — xử lý riêng ở
// onHandCardClick() bên dưới.
const NEEDS_TARGET = new Set<CardName>(["bang", "duel", "jail", "panic", "cat_balou", "punch", "rag_time", "springfield", "tequila"]);

// Giai đoạn 5 (Calamity Janet) — lá Missed! của Janet ĐÓNG VAI Bang! nên cũng
// cần chọn mục tiêu (NEEDS_TARGET không có "missed" vì Missed! thường không
// đánh chủ động được, xem NEEDS_TARGET ở trên) — cardActsAsBang() (ui.ts,
// mirror actsAsBang() ở core/reduce.ts) mới biết phân biệt được.
function cardNeedsTarget(cardId: string, characterId: string | null): boolean {
  const name = cardNameFromId(cardId);
  if (name === "missed") return cardActsAsBang(cardId, characterId);
  return NEEDS_TARGET.has(name);
}

// Mở rộng Dodge City, mục 1.1 — lá vàng "trì hoãn" KÍCH HOẠT được KHÔNG cần
// mục tiêu (Canteen tự hồi máu, Pony Express tự rút bài, Howitzer bắn hết mọi
// người). Nhóm còn lại cần mục tiêu (Derringer/Knife/Pepperbox/Buffalo Rifle —
// đi thẳng picking-target như Bang!; Conestoga/Can Can — đi picking-target rồi
// rẽ tiếp sang picking-panic-equipment/picking-cat-balou-zone như Panic!/Cat
// Balou, xem onPlayerClick() bên dưới) — quyết định ở onEquipmentClick().
const NO_TARGET_YELLOW_ACTIVATIONS = new Set<CardName>(["canteen", "pony_express", "howitzer"]);

type Screen =
  | "inactive" // Bang! không vẽ gì — Sảnh (src/main.ts) hoặc game khác đang dùng #game-root
  | "home"
  | "network-form"
  | "network-lobby"
  | "network-game"
  | "card-reference"; // việc 4.6: màn hình tra cứu, xem được từ home, quay lại home

let screen: Screen = "inactive";
// Gọi khi bấm "về Sảnh" — do src/main.ts truyền vào qua mountBang().
let exitToHub: () => void = () => {};

// Bổ sung 2026-08-08 — nội dung ô tìm kiếm Thư viện bài. DÙNG CHUNG cho cả 3
// nơi hiện thư viện (màn hình đầy đủ vào từ home, dialog hotseat, dialog qua
// mạng) — 1 người chỉ ở đúng 1 trong 3 ngữ cảnh tại 1 thời điểm nên không cần
// 3 biến riêng. Reset về "" mỗi lần MỞ lại (xem onShowCardReference()/
// onOpenCardReferenceDialog()/onNetworkOpenCardReferenceDialog()) để không
// giữ lại từ khoá cũ từ lần xem trước.
let cardReferenceSearchQuery = "";
// ----- Chế độ chơi qua mạng (việc 3.9) -----
let networkName = "";
let networkCode = "";
let networkError: string | null = null;
let netConnection: RoomConnection | null = null;
let myPlayerId = "";
let lobbyPlayers: LobbyPlayer[] = [];
let lobbyOwnerId: string | null = null;
let networkView: PlayerView | null = null;
let networkSelection: Selection = { step: "idle" };
// Việc bổ sung sau Giai đoạn 5 — giống characterArmedChoices ở hotseat, nhưng
// chỉ 1 giá trị (qua mạng chỉ CHÍNH MÌNH bấm chọn được cho chính mình).
let networkArmedCharacterId: string | null = null;
let networkDiscardSelectionIds: string[] = [];
let networkLastDrawCheck: DrawCheckNotice = null;
let networkGameLog: string[] = []; // việc 4.2, xem ghi chú ở gameLog phía trên
// Bố cục bàn chơi mới — người đang mở panel 👁 (null = không mở panel nào).
let networkInspectPlayerId: string | null = null;
// Đợt 3 UI/UX (mục 9) — giống logDialogOpen/settingsDialogOpen ở hotseat,
// cộng thêm dialog Mã phòng (chỉ qua mạng) và thông báo tạm thời sau khi
// bấm "Chép mã" (null = chưa bấm lần nào từ lúc dialog này mở).
let networkLogDialogOpen = false;
let networkSettingsDialogOpen = false;
// Bổ sung — giống cardReferenceDialogOpen/confirmingNewGame ở hotseat, xem
// ghi chú ở đó.
let networkCardReferenceDialogOpen = false;
let networkConfirmingNewGame = false;
// Bổ sung — bước xác nhận riêng cho "Về phòng chờ (sửa tuỳ chọn)", cùng khuôn
// networkConfirmingNewGame ở trên nhưng KHÔNG dùng chung field (2 nút gửi 2
// ClientMessage khác nhau — xem onNetworkRequestReturnToLobby()).
let networkConfirmingReturnToLobby = false;
let networkRoomCodeDialogOpen = false;
let networkRoomCodeCopyStatus: string | null = null;
// Việc 4.3: trong số `networkView.players`, ai ĐANG có socket mở thật sự
// (server tự tính, xem room.ts) — hiện chú thích "đã mất kết nối" cho người
// không nằm trong mảng này.
let networkConnectedIds: string[] = [];
// Ván trước bị server tự HUỶ vì còn quá ít người kết nối (việc 4.3) — hiện ở
// màn hình lobby, tự dọn khi bắt đầu ván mới.
let networkAbandonedNotice: string | null = null;
// Việc 5.3 — giống selectedHouseRules ở hotseat, nhưng CHỈ chủ phòng dùng tới
// (renderNetworkLobby() không hiện checkbox này với người khác).
let networkSelectedHouseRules: HouseRuleId[] = [];
// Mở rộng Dodge City — giống selectedExpansions ở hotseat, cùng lý do CHỈ chủ
// phòng dùng tới như networkSelectedHouseRules ở trên.
let networkSelectedExpansions: ExpansionId[] = [];
// Giống selectedEventDeckSize ở hotseat, cùng lý do CHỈ chủ phòng dùng tới.
let networkSelectedEventDeckSize: number = DEFAULT_EVENT_DECK_SIZE;
// Việc 4.1: đồng hồ đếm ngược lượt (server tự tính, xem room.ts) — client chỉ
// đọc `expiresAt` rồi TỰ đếm lùi mỗi giây bằng setInterval CỦA RIÊNG CLIENT
// (không phải Durable Object — quy tắc 8 CLAUDE.md chỉ cấm setInterval TRONG
// Durable Object, không cấm ở trình duyệt) để vẽ lại số giây còn lại.
let networkDeadline: DeadlineInfo | null = null;
let countdownTickId: ReturnType<typeof setInterval> | null = null;

// render() dựng lại TOÀN BỘ cây DOM mỗi lần gọi (container.replaceChildren()
// trong renderApp()/renderNetworkGame()) — kể cả khi KHÔNG có gì thật sự đổi,
// vì countdownTickId ở dưới gọi render() mỗi giây chỉ để cập nhật số giây còn
// lại. Khung nào có thanh cuộn riêng (.opponent-row cuộn ngang, .log-list
// cuộn dọc trong dialog Nhật ký) vì vậy bị tạo mới liên tục theo đúng nhịp
// đó, khiến thanh cuộn tự nhảy về đầu dù người chơi không hề đụng vào. Lưu
// lại vị trí cuộn TRƯỚC khi dựng lại, gắn lại đúng vị trí đó NGAY SAU khi
// dựng xong — bù cho việc dự án không diff DOM (đúng lựa chọn "không dùng
// framework" của CLAUDE.md).
// Fix lỗi thật (báo từ chủ dự án): bản thân thẻ `<dialog>` (Nhật ký/Thư viện
// bài/Cài đặt) giờ SỐNG ngoài `container` — gắn thẳng vào `document.body`,
// KHÔNG còn bị `container.replaceChildren()` xoá/tạo lại mỗi giây nữa (xem
// renderDialog() ở ui.ts) — nhưng `.log-list` (danh sách nhật ký BÊN TRONG
// dialog đó) vẫn bị vẽ lại mỗi lần nội dung dialog cập nhật (có dòng log mới),
// nên vẫn cần cơ chế lưu/gắn lại vị trí cuộn này. Vì dialog không còn nằm
// trong `root` nữa, phải dò từ `document` (bao quát cả trong lẫn ngoài
// `root`) thay vì chỉ `root.querySelector()` như trước — nếu không, `.log-list`
// nằm trong dialog sẽ không bao giờ được tìm thấy.
// Bổ sung (sửa bug thanh cuộn Thư viện bài nhảy về đầu mỗi phím gõ tìm kiếm):
// thêm "dialog.app-dialog" — khi nội dung dialog (vd danh sách lá/nhân vật lọc
// theo từ khoá) cao hơn màn hình, CHÍNH thẻ <dialog> là nơi cuộn (UA
// stylesheet mặc định overflow: auto + giới hạn theo viewport), không phải
// `.log-list`/`.opponent-row` như 2 selector cũ — trước đây không nằm trong
// danh sách này nên mỗi lần render() lại (mỗi phím gõ) bị mất vị trí cuộn.
const SCROLLABLE_SELECTORS = [".log-list", "dialog.app-dialog"];

function captureScrollPositions(): Map<string, { left: number; top: number }> {
  const positions = new Map<string, { left: number; top: number }>();
  for (const selector of SCROLLABLE_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) positions.set(selector, { left: el.scrollLeft, top: el.scrollTop });
  }
  // Màn hình đầy đủ Thư viện bài (vào từ trang chủ, không phải dialog giữa
  // ván) không có khung riêng để cuộn — cả trang (window) cuộn thẳng. Cùng lý
  // do: gõ tìm kiếm khiến render() vẽ lại DOM, mất vị trí cuộn trang nếu
  // không lưu/gắn lại riêng.
  positions.set("__window__", { left: window.scrollX, top: window.scrollY });
  return positions;
}

function restoreScrollPositions(positions: Map<string, { left: number; top: number }>): void {
  for (const [selector, pos] of positions) {
    if (selector === "__window__") {
      window.scrollTo(pos.left, pos.top);
      continue;
    }
    const el = document.querySelector(selector);
    if (el) {
      el.scrollLeft = pos.left;
      el.scrollTop = pos.top;
    }
  }
}

// Bổ sung 2026-08-08 — ô tìm kiếm Thư viện bài (.card-ref-search-input) PHẢI
// render() lại NGAY mỗi phím gõ (để lọc danh sách theo query mới, khác mọi
// input khác trong dự án chỉ cập nhật biến mà KHÔNG vẽ lại — xem ghi chú ở
// onCardReferenceSearchChange()). Nhưng render() luôn xoá-vẽ-lại DOM (kể cả
// bên trong dialog, xem renderDialog() ở ui.ts: "vẽ lại nội dung" vẫn
// replaceChildren() thân dialog) — không bù lại thì mỗi phím gõ sẽ mất con
// trỏ/focus đang ở input, gõ được đúng 1 ký tự rồi phải bấm lại vào ô. Cùng
// khuôn captureScrollPositions()/restoreScrollPositions() ở trên, dò từ
// `document` (bao quát cả dialog lẫn màn hình đầy đủ ngoài `root`).
function captureFocusState(): { selectionStart: number | null; selectionEnd: number | null } | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement) || !active.classList.contains("card-ref-search-input")) return null;
  return { selectionStart: active.selectionStart, selectionEnd: active.selectionEnd };
}

function restoreFocusState(saved: { selectionStart: number | null; selectionEnd: number | null } | null): void {
  if (!saved) return;
  const input = document.querySelector(".card-ref-search-input");
  if (!(input instanceof HTMLInputElement)) return;
  // BUG thật (báo từ chủ dự án): input.focus() KHÔNG kèm { preventScroll: true }
  // khiến trình duyệt tự cuộn ô input (nằm gần đầu trang/dialog) vào tầm nhìn
  // mỗi lần gọi — chạy SAU restoreScrollPositions() ở render() nên đè mất vị
  // trí cuộn vừa gắn lại, kéo về gần đầu trang mỗi phím gõ dù đã lưu/gắn lại
  // scroll đúng cách.
  input.focus({ preventScroll: true });
  if (saved.selectionStart !== null && saved.selectionEnd !== null) {
    input.setSelectionRange(saved.selectionStart, saved.selectionEnd);
  }
}

// BUG thật (báo từ chủ dự án): nhấn giữ 1 lá bài trên di động để xem mô tả
// (xem attachDescriptionReveal() ở ui.ts) — chữ vừa hiện ra đã mất ngay lập
// tức. Nguyên nhân: render() dựng lại TOÀN BỘ DOM (kể cả chính lá đang giữ),
// và countdownTickId ở dưới gọi render() mỗi giây liên tục suốt lúc có đồng
// hồ đếm ngược (gần như suốt ván qua mạng) — lá bài cũ (đang mang lớp phủ
// mô tả "card-box--holding") bị xoá, lá MỚI dựng lên không có gì đang hiện,
// dù ngón tay vẫn giữ nguyên (không có touchstart mới để kích lại). Chặn hẳn
// render() không vẽ lại trong lúc đang có overlay mô tả hiện — giữ nguyên
// lớp phủ, không đụng DOM. Lượt render() kế tiếp SAU khi nhả tay (touchend/
// touchcancel/tự ẩn sau AUTO_HIDE_MS gọi hideOverlay(), xem ui.ts) sẽ vẽ lại
// bình thường, cập nhật bù mọi thay đổi bị hoãn trong lúc giữ.
function render(): void {
  if (screen === "inactive") return;
  if (document.querySelector(".card-box--holding")) return;
  const scrollPositions = captureScrollPositions();
  const focusState = captureFocusState();
  renderScreen();
  restoreScrollPositions(scrollPositions);
  restoreFocusState(focusState);
  // Vẫn còn 1 lần "lệch" cuối cùng dù đã có preventScroll: true ở trên —
  // trình duyệt tự cuộn caret của ô input (đang gõ dở) vào tầm nhìn NGAY SAU
  // bước này, KHÔNG qua focus() nên preventScroll không chặn được (đây là
  // hành vi tự nhiên khi gõ vào 1 ô input đang bị cuộn khuất, không phải do
  // code của mình gọi). Gắn lại vị trí cuộn 1 lần nữa ở animation frame kế
  // tiếp (sau khi trình duyệt đã tự cuộn xong) để phần cuộn tự động đó không
  // đè mất lần gắn lại ở trên.
  requestAnimationFrame(() => restoreScrollPositions(scrollPositions));
}

function renderScreen(): void {
  // Tiêu đề "Bang!" — Sảnh (src/main.ts) ẩn nó đi khi quay về.
  const appHeading = document.getElementById("app-heading");
  if (appHeading) appHeading.hidden = false;

  // Nền hơi xám (khác trắng tinh) ở Sảnh (src/main.ts tự bật) + 2 màn "chơi cùng bạn bè" trước lúc
  // vào ván (vào phòng/phòng chờ) — để thẻ/khối (nền trắng) "nổi" lên rõ hơn
  // thay vì hoà lẫn vào nền, giống bản xem trước đã duyệt. Dùng lại ĐÚNG biến
  // --color-bg-alt sẵn có (không thêm màu mới) — mọi màn khác của Bang! (kể
  // cả "Chọn cách chơi" — đã có màu đỏ của vé làm điểm nhấn riêng) vẫn giữ
  // nguyên nền trắng như cũ.
  document.body.classList.toggle("landing-bg", screen === "network-form" || screen === "network-lobby");

  switch (screen) {
    case "home":
      renderHomeScreen(root, betaLinkInfo(), { onPlayNetwork, onShowCardReference, onBackToHub });
      return;
    case "card-reference":
      renderCardReferenceScreen(root, cardReferenceSearchQuery, { onBack: onBackToHome, onSearchChange: onCardReferenceSearchChange });
      return;
    case "network-form":
      renderNetworkLobbyForm(root, networkName, networkCode, networkError, {
        onBack: onBackToHome,
        onNameChange: onNetworkNameChange,
        onCodeChange: onNetworkCodeChange,
        onGenerateCode,
        onJoinRoom,
      });
      return;
    case "network-lobby":
      renderNetworkLobby(
        root,
        networkCode,
        lobbyPlayers,
        lobbyOwnerId,
        myPlayerId,
        networkError,
        networkAbandonedNotice,
        networkSelectedHouseRules,
        networkSelectedExpansions,
        networkSelectedEventDeckSize,
        {
          onLeave: onLeaveNetworkGame,
          onToggleHouseRule: onNetworkToggleHouseRule,
          onToggleExpansion: onNetworkToggleExpansion,
          onEventDeckSizeChange: onNetworkEventDeckSizeChange,
          onStartGame: onNetworkStartGame,
        }
      );
      return;
    case "network-game":
      if (networkView) {
        // Giai đoạn 5, cơ chế chọn nhân vật — hiện màn hình riêng TRƯỚC bàn
        // chơi thật qua mạng, cho tới khi networkView.characterSelection về null.
        if (networkView.characterSelection) {
          renderNetworkCharacterSelectionScreen(root, networkView, networkDeadline, networkArmedCharacterId, {
            onArmCharacterChoice: onNetworkArmCharacterChoice,
            onConfirmCharacterChoice: onNetworkConfirmCharacterChoice,
          });
          return;
        }
        renderNetworkGame(
          root,
          networkView,
          {
            selection: networkSelection,
            error: networkError,
            discardSelection: networkDiscardSelectionIds,
            lastDrawCheck: networkLastDrawCheck,
            deadline: networkDeadline,
            log: networkGameLog,
            connectedPlayerIds: networkConnectedIds,
            inspectPlayerId: networkInspectPlayerId,
            logDialogOpen: networkLogDialogOpen,
            settingsDialogOpen: networkSettingsDialogOpen,
            cardReferenceDialogOpen: networkCardReferenceDialogOpen,
            cardReferenceSearchQuery,
            confirmingNewGame: networkConfirmingNewGame,
            isRoomOwner: myPlayerId === lobbyOwnerId,
            roomCodeDialogOpen: networkRoomCodeDialogOpen,
            roomCode: networkCode,
            roomCodeCopyStatus: networkRoomCodeCopyStatus,
            confirmingReturnToLobby: networkConfirmingReturnToLobby,
          },
          {
            onDrawCards: onNetworkDrawCards,
            onEndTurn: onNetworkEndTurn,
            onToggleDiscardCard: onNetworkToggleDiscardCard,
            onConfirmDiscard: onNetworkConfirmDiscard,
            onHandCardClick: onNetworkHandCardClick,
            onEquipmentClick: onNetworkEquipmentClick,
            onPlayerClick: onNetworkPlayerClick,
            onStoreOptionClick: onNetworkStoreOptionClick,
            onZoneClick: onNetworkZoneClick,
            onRespondTakeConsequence: onNetworkRespondTakeConsequence,
            onCancelSelection: onNetworkCancelSelection,
            onPickDrawSource: onNetworkPickDrawSource,
            onPickDrawTarget: onNetworkPickDrawTarget,
            onPickKeptCard: onNetworkPickKeptCard,
            onPickEquipmentFromPlayer: onNetworkPickEquipmentFromPlayer,
            onPickBorrowedCharacter: onNetworkPickBorrowedCharacter,
            onPickArmed: onNetworkPickArmed,
            onUseDrifterShield: onNetworkUseDrifterShield,
            onUseDealerTrade: onNetworkUseDealerTrade,
            onUseSentinelRevive: onNetworkUseSentinelRevive,
            onPickMarcelCompanion: onNetworkPickMarcelCompanion,
            onPickThiefTarget: onNetworkPickThiefTarget,
            onPickHardLiquor: onNetworkPickHardLiquor,
            onGiveBloodBrothersGift: onNetworkGiveBloodBrothersGift,
            onToggleRanchCard: onNetworkToggleRanchCard,
            onConfirmRanchExchange: onNetworkConfirmRanchExchange,
            onConfirmBangMode: onNetworkConfirmBangMode,
            onBrawlZonePick: onNetworkBrawlZonePick,
            onBrawlZonesConfirmed: onNetworkBrawlZonesConfirmed,
            onExtraDiscardCardClick: onNetworkExtraDiscardCardClick,
            onArmAbility: onNetworkArmAbility,
            onUseChuckWengamAbility: onNetworkUseChuckWengamAbility,
            onArmFairKillerAbility: onNetworkArmFairKillerAbility,
            onToggleAbilityCard: onNetworkToggleAbilityCard,
            onConfirmAbilityCards: onNetworkConfirmAbilityCards,
            onAbilityTargetClick: onNetworkAbilityTargetClick,
            onOpenPlayerPanel: onNetworkOpenPlayerPanel,
            onClosePlayerPanel: onNetworkClosePlayerPanel,
            onOpenLogDialog: onNetworkOpenLogDialog,
            onCloseLogDialog: onNetworkCloseLogDialog,
            onOpenSettingsDialog: onNetworkOpenSettingsDialog,
            onCloseSettingsDialog: onNetworkCloseSettingsDialog,
            onOpenCardReferenceDialog: onNetworkOpenCardReferenceDialog,
            onCloseCardReferenceDialog: onNetworkCloseCardReferenceDialog,
            onCardReferenceSearchChange,
            onOpenRoomCodeDialog: onNetworkOpenRoomCodeDialog,
            onCloseRoomCodeDialog: onNetworkCloseRoomCodeDialog,
            onCopyRoomCode: onNetworkCopyRoomCode,
            onLeaveGame: onLeaveNetworkGame,
            onRequestNewGame: onNetworkRequestNewGame,
            onConfirmNewGame: onNetworkConfirmNewGame,
            onCancelNewGameConfirm: onNetworkCancelNewGameConfirm,
            onRequestReturnToLobby: onNetworkRequestReturnToLobby,
            onConfirmReturnToLobby: onNetworkConfirmReturnToLobby,
            onCancelReturnToLobbyConfirm: onNetworkCancelReturnToLobbyConfirm,
          }
        );
      }
      return;
  }
}

// ----- Màn hình chọn cách chơi -----

// Sảnh (src/main.ts) gọi khi bấm thẻ Bang! — vẽ màn "Chọn cách chơi" vào #game-root.
export function mountBang(onExit: () => void): void {
  exitToHub = onExit;
  screen = "home";
  render();
}

function onBackToHub(): void {
  screen = "inactive";
  exitToHub();
}

function onPlayNetwork(): void {
  screen = "network-form";
  render();
}

// Việc 4.6: chỉ xem được TỪ home, quay lại LUÔN về home — không gắn với ván
// đang chơi dở nào (không cần nhớ "quay lại đâu").
function onShowCardReference(): void {
  screen = "card-reference";
  cardReferenceSearchQuery = "";
  render();
}

// Bổ sung 2026-08-08 — chỗ DUY NHẤT cập nhật cardReferenceSearchQuery, dùng
// chung cho cả 3 ngữ cảnh (xem ghi chú khai báo biến ở trên).
function onCardReferenceSearchChange(value: string): void {
  cardReferenceSearchQuery = value;
  render();
}

function onBackToHome(): void {
  screen = "home";
  render();
}

// ----- Chế độ chơi chung 1 máy (hotseat) -----

// Mở rộng High Noon + A Fistful of Cards — TẠM GỘP thành 1 nút trên giao diện
// (xem EVENT_CARDS_EXPANSION_LABEL ở ui.ts): mỗi bộ RIÊNG LẺ còn thiếu khá
// nhiều lá (Ghost Town/Dead Man/Law of the West/Peyote chưa cài), nên bật/tắt
// LUÔN CẢ 2 id "high_noon" VÀ "a_fistful_of_cards" cùng lúc thay vì để riêng.
// Các bộ khác (dodge_city/custom_characters) vẫn bật/tắt độc lập như cũ.
function toggleExpansionId(current: ExpansionId[], id: ExpansionId): ExpansionId[] {
  if (id === "high_noon" || id === "a_fistful_of_cards") {
    const bothOn = current.includes("high_noon") && current.includes("a_fistful_of_cards");
    const withoutEventCards = current.filter((x) => x !== "high_noon" && x !== "a_fistful_of_cards");
    return bothOn ? withoutEventCards : [...withoutEventCards, "high_noon", "a_fistful_of_cards"];
  }
  return current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id];
}

// Bổ sung — "người đang cần hành động", dùng để rung màn hình (xem
// vibrateForTurn() ở ui.ts) khi tới lượt HOẶC cần phản hồi. Khác
// currentPlayerId() ở trên (chỉ tính "tới lượt" cho hiệu ứng effect-my-turn
// có sẵn): pending[cuối] (nếu có) mới là người THẬT SỰ cần bấm gì đó — vd A
// đánh Bang! vào B thì currentPlayerIndex vẫn là A nhưng B mới cần đỡ
// Missed!, xem PendingAction ở types.ts (mọi kind đều có field `player`).
// Dùng chung được cho cả GameState (hotseat) lẫn PlayerView (qua mạng) vì 2
// kiểu này cùng hình dạng field pending/players/currentPlayerIndex.
function actingPlayerId(
  pending: { player: string }[],
  players: { id: string }[],
  currentPlayerIndex: number
): string | null {
  if (pending.length > 0) return pending[pending.length - 1].player;
  return players[currentPlayerIndex]?.id ?? null;
}

// ----- Chế độ chơi qua mạng (việc 3.9) -----

const ROOM_CODE_LENGTH = 6;
// Bỏ các ký tự dễ nhầm khi đọc/gõ tay: 0/O, 1/I/L.
const ROOM_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

// URL của server phòng. Mặc định dùng CÙNG gốc với trang (đúng cho lúc deploy
// thật, client + server chung domain) — lúc phát triển cục bộ (client chạy
// Vite ở 1 cổng, server chạy wrangler ở cổng khác) truyền qua query string
// ?server=host:port để trỏ đúng, vd http://localhost:5173/?server=127.0.0.1:8787
function roomWebSocketUrl(code: string): string {
  const params = new URLSearchParams(location.search);
  const host = params.get("server") ?? location.host;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${host}/room/${code}`;
}

// Bug đã sửa (báo lỗi thật từ chủ dự án): trước đây MỖI LẦN onJoinRoom() chạy
// (dù đang mở LẠI đúng phòng, đúng tên, chỉ vì rớt mạng/bấm "Rời phòng" rồi
// vào lại/đóng hẳn tab) đều sinh `myPlayerId` NGẪU NHIÊN MỚI — server không
// nhận ra đây là người cũ, ghi nhận thành 1 người chơi khác hoàn toàn, mất
// luôn nhân vật/bài đang chơi dở. RoomConnection (net.ts) tự nối lại được sau
// khi mất mạng NGẮN vì nó giữ nguyên `playerId` trong bộ nhớ — nhưng chỉ đúng
// khi KHÔNG gọi lại onJoinRoom() (vd trang chưa tải lại). Mọi ca "phải gõ lại
// mã phòng" (đóng hẳn tab/app, bấm "Rời phòng" rồi vào lại...) đều đi qua
// onJoinRoom() lần nữa nên cần lưu BỀN, sống sót qua việc đóng hẳn trang —
// dùng `localStorage`, khoá theo ĐÚNG CẶP (mã phòng, tên) chứ không chỉ mã
// phòng, để 1 trình duyệt dùng chung cho NHIỀU người (vd test nhiều tab bằng
// tên khác nhau — An/Bình/Chi/Dũng) không vô tình "cướp" nhầm danh tính của
// người gõ tên khác trong cùng phòng.
function playerIdStorageKey(roomCode: string, name: string): string {
  return `bang_player_id:${roomCode}:${name}`;
}

function randomPlayerId(): string {
  return `p-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreatePlayerId(roomCode: string, name: string): string {
  const key = playerIdStorageKey(roomCode, name);
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh = randomPlayerId();
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    // localStorage bị chặn (vd chế độ ẩn danh nghiêm ngặt) -> vẫn chơi được
    // bình thường, chỉ mất khả năng tự nhận lại đúng danh tính sau khi đóng
    // hẳn tab — không phải lỗi cần báo cho người chơi, im lặng dùng ID tạm.
    return randomPlayerId();
  }
}

function onNetworkNameChange(value: string): void {
  networkName = value;
}

function onNetworkCodeChange(value: string): void {
  networkCode = value;
}

function onGenerateCode(): void {
  networkCode = randomRoomCode();
  render();
}

function onJoinRoom(): void {
  const trimmedName = networkName.trim();
  const trimmedCode = networkCode.trim().toUpperCase();

  if (trimmedName.length === 0) {
    networkError = "Bạn cần nhập tên trước khi vào phòng";
    render();
    return;
  }
  if (trimmedCode.length !== ROOM_CODE_LENGTH) {
    networkError = `Mã phòng phải có đúng ${ROOM_CODE_LENGTH} ký tự`;
    render();
    return;
  }

  networkError = null;
  networkCode = trimmedCode;
  myPlayerId = getOrCreatePlayerId(trimmedCode, trimmedName);
  lobbyPlayers = [];
  lobbyOwnerId = null;
  networkView = null;
  networkGameLog = [];
  networkSelectedHouseRules = [];
  networkSelectedExpansions = [];
  networkSelectedEventDeckSize = DEFAULT_EVENT_DECK_SIZE;
  networkArmedCharacterId = null;
  networkInspectPlayerId = null;
  networkLogDialogOpen = false;
  networkSettingsDialogOpen = false;
  networkCardReferenceDialogOpen = false;
  networkConfirmingNewGame = false;
  networkConfirmingReturnToLobby = false;
  networkRoomCodeDialogOpen = false;
  networkRoomCodeCopyStatus = null;

  netConnection = new RoomConnection(roomWebSocketUrl(trimmedCode), myPlayerId, trimmedName, {
    onMessage: onNetworkMessage,
    onDisconnected: () => {
      networkError = "Mất kết nối, đang thử nối lại...";
      render();
    },
  });

  screen = "network-lobby";
  render();
}

// Bật/tắt vòng lặp đếm lùi mỗi giây theo đúng việc CÓ/KHÔNG còn đồng hồ đang
// chạy — chỉ render() lại (KHÔNG hỏi lại server gì cả, `networkDeadline` đã
// có sẵn `expiresAt`, chỉ cần vẽ lại số giây còn lại tính từ Date.now()).
function syncCountdownTick(): void {
  if (networkDeadline && !countdownTickId) {
    countdownTickId = setInterval(render, 1000);
  } else if (!networkDeadline && countdownTickId) {
    clearInterval(countdownTickId);
    countdownTickId = null;
  }
}

function onNetworkMessage(message: ServerMessage): void {
  networkError = null;

  switch (message.type) {
    case "lobby":
      lobbyPlayers = message.players;
      lobbyOwnerId = message.ownerId;
      if (screen === "network-lobby") render();
      return;
    case "state": {
      // Bổ sung 2026-08-10 — hiệu ứng "tới lượt của mình": qua mạng MỖI người
      // có 1 view riêng (myPlayerId), nên chỉ nháy hiệu ứng đúng lúc lượt MỚI
      // chuyển SANG chính mình (so người-đang-đi cũ/mới), khác hotseat (mọi
      // lượt đổi đều tính, xem ghi chú dispatch() ở trên) vì ở đây phân biệt
      // được rõ "mình" với người khác.
      const previousCurrentPlayerId = networkView?.players[networkView.currentPlayerIndex]?.id ?? null;
      // Bổ sung — rung màn hình khi tới lượt HOẶC cần phản hồi (khác điều
      // kiện effect-my-turn ở trên, xem ghi chú actingPlayerId() ở
      // dispatch()). null nếu chưa có view cũ, hoặc đang ở màn hình chọn
      // nhân vật/ván đã kết thúc (currentPlayerIndex lúc đó không mang ý
      // nghĩa "tới lượt").
      const previousActingId =
        networkView && !networkView.characterSelection && !networkView.winner
          ? actingPlayerId(networkView.pending, networkView.players, networkView.currentPlayerIndex)
          : null;
      networkView = message.view;
      networkConnectedIds = message.connectedPlayerIds;
      networkAbandonedNotice = null; // ván mới đang chạy thật -> thông báo ván cũ bị huỷ hết ý nghĩa
      // Bổ sung — dọn "đang cầm lên" (networkArmedCharacterId) nếu KHÔNG còn
      // hợp lệ với ván HIỆN TẠI: hoặc không còn ở giai đoạn chọn nhân vật, hoặc
      // lá đó không nằm trong 2 lá MỚI vừa được phát (vd bắt đầu ván mới sau
      // khi ván trước kết thúc — 2 lá cũ không còn ý nghĩa gì). Không dọn thì
      // nút "Xác nhận chọn <tên>" sẽ hiện lại đúng lá đã chọn Ở VÁN TRƯỚC dù
      // người chơi chưa bấm gì ở ván mới.
      const myCharacterChoice = networkView.characterSelection?.find((c) => c.playerId === myPlayerId);
      if (!myCharacterChoice?.options?.includes(networkArmedCharacterId ?? "")) {
        networkArmedCharacterId = null;
      }
      const checkEvent = message.events.find((e) => e.type === "DRAW_CHECK_RESOLVED");
      networkLastDrawCheck = checkEvent
        ? {
            playerName: networkView.players.find((p) => p.id === checkEvent.playerId)!.name,
            cardId: checkEvent.cardId,
            matched: checkEvent.matched,
          }
        : null;
      const nameOf = (id: string) => networkView!.players.find((p) => p.id === id)?.name ?? id;
      for (const event of message.events) {
        networkGameLog.unshift(describeEvent(event, nameOf));
        if (event.type === "DYNAMITE_EXPLODED") triggerVisualEffect("effect-dynamite");
      }
      const newCurrentPlayerId = networkView.players[networkView.currentPlayerIndex]?.id ?? null;
      if (newCurrentPlayerId === myPlayerId && newCurrentPlayerId !== previousCurrentPlayerId) {
        triggerVisualEffect("effect-my-turn");
      }
      if (!networkView.characterSelection && !networkView.winner) {
        const newActingId = actingPlayerId(networkView.pending, networkView.players, networkView.currentPlayerIndex);
        if (newActingId === myPlayerId && newActingId !== previousActingId) vibrateForTurn();
      }
      networkDeadline = message.deadline;
      syncCountdownTick();
      screen = "network-game";
      render();
      return;
    }
    case "action_error":
      networkError = message.message;
      render();
      return;
    case "chat":
      // Chưa có UI chat qua mạng trong ván — bonus việc 3.5 mới kiểm ở mức
      // giao thức/console, chưa gắn vào giao diện chơi bài.
      return;
    case "game_abandoned":
      // Việc 4.3 (reason "disconnect") HOẶC chủ phòng chủ động bấm "Về phòng
      // chờ" (reason "host_returned_to_lobby", bổ sung — xem
      // onNetworkRequestReturnToLobby()) — cả 2 đều quay lại lobby, dọn hết
      // trạng thái ván cũ. `lobby` gửi kèm ngay sau đó (xem room.ts) sẽ tự
      // cập nhật đúng danh sách người + chủ phòng hiện tại.
      networkView = null;
      networkGameLog = [];
      networkDeadline = null;
      networkConnectedIds = [];
      networkArmedCharacterId = null;
      networkInspectPlayerId = null;
      networkLogDialogOpen = false;
      networkSettingsDialogOpen = false;
      networkCardReferenceDialogOpen = false;
      networkConfirmingNewGame = false;
      networkConfirmingReturnToLobby = false;
      networkRoomCodeDialogOpen = false;
      syncCountdownTick();
      networkAbandonedNotice =
        message.reason === "host_returned_to_lobby"
          ? "Chủ phòng đã quay về phòng chờ để sửa tuỳ chọn — ván trước đã bị huỷ."
          : "Ván vừa bị huỷ vì không đủ người chơi còn kết nối. Chờ đủ người rồi bắt đầu ván mới.";
      screen = "network-lobby";
      render();
      return;
  }
}

function onNetworkToggleHouseRule(id: HouseRuleId): void {
  networkSelectedHouseRules = networkSelectedHouseRules.includes(id)
    ? networkSelectedHouseRules.filter((existing) => existing !== id)
    : [...networkSelectedHouseRules, id];
  render();
}

function onNetworkToggleExpansion(id: ExpansionId): void {
  networkSelectedExpansions = toggleExpansionId(networkSelectedExpansions, id);
  render();
}

function onNetworkEventDeckSizeChange(size: number): void {
  networkSelectedEventDeckSize = size;
  render();
}

function onNetworkStartGame(): void {
  netConnection?.send({
    type: "start_game",
    seed: Date.now(),
    houseRules: networkSelectedHouseRules,
    expansions: networkSelectedExpansions,
    eventDeckSize: networkSelectedEventDeckSize,
  });
}

// Gửi action qua mạng — KHÔNG biết ngay kết quả (khác dispatch() cục bộ của
// hotseat): phải chờ server trả lời {type:"state"} (thành công) hoặc
// {type:"action_error"} (bị từ chối) rồi mới vẽ lại theo kết quả đó. Reset
// selection/discardSelection NGAY khi gửi (không chờ phản hồi) — khớp đúng
// cảm giác "đã bấm xong" của hotseat, dù kết quả đến sau vài chục mili giây.
function networkDispatch(action: Action): void {
  netConnection?.send({ type: "action", action });
  networkSelection = { step: "idle" };
  networkDiscardSelectionIds = [];
  render();
}

function onNetworkDrawCards(): void {
  networkDispatch({ type: "DRAW_CARDS", playerId: myPlayerId });
}

function onNetworkEndTurn(): void {
  networkDispatch({ type: "END_TURN", playerId: myPlayerId });
}

function onNetworkToggleDiscardCard(cardId: string): void {
  const index = networkDiscardSelectionIds.indexOf(cardId);
  if (index === -1) {
    networkDiscardSelectionIds.push(cardId);
  } else {
    networkDiscardSelectionIds.splice(index, 1);
  }
  render();
}

function onNetworkConfirmDiscard(): void {
  networkDispatch({ type: "DISCARD_CARDS", playerId: myPlayerId, cardIds: networkDiscardSelectionIds });
}

function onNetworkHandCardClick(cardId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) {
    networkDispatch({ type: "RESPOND", playerId: top.player, cardId });
    return;
  }

  const name = cardNameFromId(cardId);
  // Mở rộng Dodge City — xem ghi chú y hệt ở onHandCardClick() (hotseat).
  if (name === "brawl") {
    networkSelection = { step: "picking-brawl-zones", cardId, zones: {} };
    render();
    return;
  }
  if (name === "whisky") {
    networkSelection = { step: "picking-extra-discard", cardId };
    render();
    return;
  }
  const myCharacterId = networkView.players.find((p) => p.id === myPlayerId)?.characterId ?? null;
  if (cardNeedsTarget(cardId, myCharacterId)) {
    networkSelection = { step: "picking-target", cardId, cardName: name };
    render();
  } else {
    networkDispatch({ type: "PLAY_CARD", playerId: myPlayerId, cardId });
  }
}

// Mở rộng Dodge City, mục 1.1 — xem ghi chú y hệt ở onEquipmentClick() (hotseat).
function onNetworkEquipmentClick(ownerId: string, cardId: string): void {
  // Lá "Ricochet" — xem ghi chú y hệt ở onEquipmentClick() (hotseat).
  if (networkSelection.step === "picking-ricochet-equipment" && ownerId === networkSelection.targetId) {
    networkDispatch({
      type: "PLAY_CARD",
      playerId: myPlayerId,
      cardId: networkSelection.cardId,
      targetId: networkSelection.targetId,
      targetCardId: cardId,
    });
    return;
  }

  if (networkSelection.step === "picking-panic-equipment") {
    // Rag Time — xem ghi chú y hệt ở onEquipmentClick() (hotseat).
    if (cardNameFromId(networkSelection.cardId) === "rag_time") {
      networkSelection = {
        step: "picking-extra-discard",
        cardId: networkSelection.cardId,
        targetId: networkSelection.targetId,
        targetCardId: cardId,
      };
      render();
      return;
    }
    networkDispatch({
      type: "PLAY_CARD",
      playerId: myPlayerId,
      cardId: networkSelection.cardId,
      targetId: networkSelection.targetId,
      targetCardId: cardId,
    });
    return;
  }

  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top && top.kind === "NEED_DISCARD_FROM_ZONE" && top.player === ownerId) {
    networkDispatch({ type: "RESPOND", playerId: top.player, cardId });
    return;
  }

  if (top && top.kind === "NEED_MISSED" && top.player === ownerId) {
    networkDispatch({ type: "RESPOND", playerId: top.player, cardId });
    return;
  }

  if (!top && networkSelection.step === "idle" && ownerId === myPlayerId) {
    const name = cardNameFromId(cardId);
    if (isDelayedEquipmentCardName(name) && !yellowCardActsAsMissed(name)) {
      if (NO_TARGET_YELLOW_ACTIVATIONS.has(name)) {
        networkDispatch({ type: "PLAY_CARD", playerId: myPlayerId, cardId });
      } else {
        networkSelection = { step: "picking-target", cardId, cardName: name };
        render();
      }
    }
  }
}

// Panic!/Cat Balou cần biết tay mục tiêu có bài hay không — dùng `handCount`
// (LUÔN đúng, kể cả với người khác) thay vì `hand.length` (chỉ có với chính
// mình qua mạng, xem core/view.ts).
function onNetworkPlayerClick(targetId: string): void {
  if (networkSelection.step !== "picking-target" || !networkView) return;
  const { cardId, cardName } = networkSelection;

  // Rag Time (mở rộng Dodge City) — xem ghi chú y hệt ở onPlayerClick() (hotseat).
  if (cardName === "panic" || cardName === "conestoga" || cardName === "rag_time") {
    const target = networkView.players.find((p) => p.id === targetId)!;
    if (target.handCount > 0) {
      if (cardName === "rag_time") {
        networkSelection = { step: "picking-extra-discard", cardId, targetId };
        render();
      } else {
        networkDispatch({ type: "PLAY_CARD", playerId: myPlayerId, cardId, targetId });
      }
    } else {
      networkSelection = { step: "picking-panic-equipment", cardId, targetId };
      render();
    }
    return;
  }

  // Can Can (mở rộng Dodge City) — xem ghi chú y hệt ở onPlayerClick() (hotseat).
  if (cardName === "cat_balou" || cardName === "can_can") {
    networkSelection = { step: "picking-cat-balou-zone", cardId, targetId };
    render();
    return;
  }

  // Springfield/Tequila (mở rộng Dodge City) — xem ghi chú y hệt ở onPlayerClick() (hotseat).
  if (cardName === "springfield" || cardName === "tequila") {
    networkSelection = { step: "picking-extra-discard", cardId, targetId };
    render();
    return;
  }

  // Lá "Sniper"/"Ricochet" — xem ghi chú y hệt ở onPlayerClick() (hotseat).
  if (cardName === "bang" && networkView.activeEventId === "sniper") {
    const myHand = networkView.players.find((p) => p.id === myPlayerId)?.hand ?? [];
    if (myHand.some((id) => id !== cardId && cardNameFromId(id) === "bang")) {
      networkSelection = { step: "picking-sniper-confirm", cardId, targetId };
      render();
      return;
    }
  }
  if (cardName === "bang" && networkView.activeEventId === "ricochet") {
    const target = networkView.players.find((p) => p.id === targetId);
    if (target && target.equipment.length > 0) {
      networkSelection = { step: "picking-ricochet-confirm", cardId, targetId };
      render();
      return;
    }
  }

  networkDispatch({ type: "PLAY_CARD", playerId: myPlayerId, cardId, targetId });
}

function onNetworkStoreOptionClick(cardId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, cardId });
}

function onNetworkZoneClick(zone: "hand" | "equipment"): void {
  if (networkSelection.step !== "picking-cat-balou-zone") return;
  networkDispatch({
    type: "PLAY_CARD",
    playerId: myPlayerId,
    cardId: networkSelection.cardId,
    targetId: networkSelection.targetId,
    targetZone: zone,
  });
}

// Mở rộng Dodge City — giống hệt onBrawlZonePick (hotseat).
function onNetworkBrawlZonePick(targetId: string, zone: "hand" | "equipment"): void {
  if (networkSelection.step !== "picking-brawl-zones") return;
  networkSelection.zones[targetId] = zone;
  render();
}

// Giống hệt onBrawlZonesConfirmed (hotseat).
function onNetworkBrawlZonesConfirmed(): void {
  if (networkSelection.step !== "picking-brawl-zones") return;
  networkSelection = { step: "picking-extra-discard", cardId: networkSelection.cardId, brawlZones: networkSelection.zones };
  render();
}

// Giống hệt onExtraDiscardCardClick (hotseat).
function onNetworkExtraDiscardCardClick(extraCardId: string): void {
  if (networkSelection.step !== "picking-extra-discard") return;
  networkDispatch({
    type: "PLAY_CARD",
    playerId: myPlayerId,
    cardId: networkSelection.cardId,
    targetId: networkSelection.targetId,
    targetCardId: networkSelection.targetCardId,
    brawlZones: networkSelection.brawlZones,
    extraDiscardCardId: extraCardId,
  });
}

// Giống hệt onArmAbility (hotseat).
function onNetworkArmAbility(playerId: string, ability: UseAbilityCharacter): void {
  const needed = ability === "jose_delgado" ? 1 : 2;
  networkSelection = { step: "picking-ability-cards", playerId, ability, needed, selectedCardIds: [] };
  render();
}

// Giống hệt onUseChuckWengamAbility (hotseat).
function onNetworkUseChuckWengamAbility(playerId: string): void {
  networkDispatch({ type: "USE_ABILITY", playerId, cardIds: [] });
}

// Giống hệt onArmFairKillerAbility (hotseat).
function onNetworkArmFairKillerAbility(playerId: string): void {
  networkSelection = { step: "picking-ability-target", playerId, cardIds: [] };
  render();
}

// Giống hệt onToggleAbilityCard (hotseat).
function onNetworkToggleAbilityCard(cardId: string): void {
  if (networkSelection.step !== "picking-ability-cards") return;
  const index = networkSelection.selectedCardIds.indexOf(cardId);
  if (index === -1) {
    if (networkSelection.selectedCardIds.length >= networkSelection.needed) return;
    networkSelection.selectedCardIds.push(cardId);
  } else {
    networkSelection.selectedCardIds.splice(index, 1);
  }
  render();
}

// Giống hệt onConfirmAbilityCards (hotseat).
function onNetworkConfirmAbilityCards(): void {
  if (networkSelection.step !== "picking-ability-cards" || networkSelection.selectedCardIds.length !== networkSelection.needed) {
    return;
  }
  const { playerId, ability, selectedCardIds } = networkSelection;
  if (ability === "doc_holyday") {
    networkSelection = { step: "picking-ability-target", playerId, cardIds: selectedCardIds };
    render();
    return;
  }
  networkDispatch({ type: "USE_ABILITY", playerId, cardIds: selectedCardIds });
}

// Giống hệt onAbilityTargetClick (hotseat).
function onNetworkAbilityTargetClick(targetId: string): void {
  if (networkSelection.step !== "picking-ability-target") return;
  networkDispatch({ type: "USE_ABILITY", playerId: networkSelection.playerId, cardIds: networkSelection.cardIds, targetId });
}

function onNetworkRespondTakeConsequence(): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player });
}

// Pedro Ramirez — lấy đúng lá trên cùng chồng bỏ làm lá 1.
function onNetworkPickDrawSource(cardId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, cardId });
}

// Jesse Jones (bước 1) — chọn lấy bài từ tay ai, và có để họ tự chọn lá không.
function onNetworkPickDrawTarget(targetId: string, letTargetChoose: boolean): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, targetId, letTargetChoose });
}

// Kit Carlson — giống hệt onPickKeptCard() (hotseat), xem ghi chú ở đó.
function onNetworkPickKeptCard(cardId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (!top || top.kind !== "NEED_PICK_KEPT_CARDS") return;
  const selectedCardIds =
    networkSelection.step === "picking-kit-carlson-kept" ? [...networkSelection.selectedCardIds] : [];
  const index = selectedCardIds.indexOf(cardId);
  if (index === -1) {
    selectedCardIds.push(cardId);
  } else {
    selectedCardIds.splice(index, 1);
  }
  if (selectedCardIds.length >= top.keepCount) {
    networkDispatch({ type: "RESPOND", playerId: top.player, cardIds: selectedCardIds });
    return;
  }
  networkSelection = { step: "picking-kit-carlson-kept", selectedCardIds };
  render();
}

// Mở rộng Dodge City — giống hệt onPickEquipmentFromPlayer (hotseat).
function onNetworkPickEquipmentFromPlayer(targetId: string, cardId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, targetId, cardId });
}

// Mở rộng Dodge City — giống hệt onPickBorrowedCharacter (hotseat).
function onNetworkPickBorrowedCharacter(targetId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, targetId });
}

// Bộ mở rộng "custom_characters" (Elena Noir) — giống hệt onPickArmed (hotseat).
function onNetworkPickArmed(armed: boolean): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, armed });
}

// Bộ mở rộng "custom_characters" (Nomad Norman) — giống hệt onUseDrifterShield
// (hotseat).
function onNetworkUseDrifterShield(): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, useShield: true });
}

// Bộ mở rộng "custom_characters" (Envoy Evy) — giống hệt onUseDealerTrade
// (hotseat).
function onNetworkUseDealerTrade(): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, useDealerTrade: true });
}

// Bộ mở rộng "custom_characters" (Aura The Soul-Weaver) — giống hệt onUseSentinelRevive
// (hotseat).
function onNetworkUseSentinelRevive(): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, reviveTarget: true });
}

// Bộ mở rộng "custom_characters" (Marcel Marcelo) — giống hệt
// onPickMarcelCompanion (hotseat).
function onNetworkPickMarcelCompanion(targetId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, targetId });
}

// Bộ mở rộng "custom_characters" (The Thief) — giống hệt onPickThiefTarget (hotseat).
function onNetworkPickThiefTarget(targetId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, targetId });
}

// Mở rộng A Fistful of Cards — giống hệt các hàm cùng tên (hotseat), xem ghi
// chú ở đó.
function onNetworkPickHardLiquor(): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, skipDrawForHardLiquor: true });
}

function onNetworkGiveBloodBrothersGift(targetId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, targetId });
}

function onNetworkToggleRanchCard(cardId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (!top || top.kind !== "NEED_RANCH_EXCHANGE") return;
  const selectedCardIds = networkSelection.step === "picking-ranch-exchange" ? [...networkSelection.selectedCardIds] : [];
  const index = selectedCardIds.indexOf(cardId);
  if (index === -1) selectedCardIds.push(cardId);
  else selectedCardIds.splice(index, 1);
  networkSelection = { step: "picking-ranch-exchange", selectedCardIds };
  render();
}

function onNetworkConfirmRanchExchange(): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (!top || top.kind !== "NEED_RANCH_EXCHANGE") return;
  const cardIds = networkSelection.step === "picking-ranch-exchange" ? networkSelection.selectedCardIds : [];
  networkDispatch({ type: "RESPOND", playerId: top.player, cardIds });
}

function onNetworkConfirmBangMode(useSpecial: boolean): void {
  if (networkSelection.step === "picking-sniper-confirm") {
    const { cardId, targetId } = networkSelection;
    if (useSpecial) {
      networkSelection = { step: "picking-extra-discard", cardId, targetId, restrictToCardName: "bang" };
      render();
    } else {
      networkDispatch({ type: "PLAY_CARD", playerId: myPlayerId, cardId, targetId });
    }
    return;
  }
  if (networkSelection.step === "picking-ricochet-confirm") {
    const { cardId, targetId } = networkSelection;
    if (useSpecial) {
      networkSelection = { step: "picking-ricochet-equipment", cardId, targetId };
      render();
    } else {
      networkDispatch({ type: "PLAY_CARD", playerId: myPlayerId, cardId, targetId });
    }
  }
}

function onNetworkCancelSelection(): void {
  networkSelection = { step: "idle" };
  render();
}

function onNetworkOpenPlayerPanel(playerId: string): void {
  networkInspectPlayerId = playerId;
  render();
}

function onNetworkClosePlayerPanel(): void {
  networkInspectPlayerId = null;
  render();
}

// Đợt 3 UI/UX (mục 9) — giống hệt các handler mở/đóng dialog ở hotseat, cộng
// thêm dialog Mã phòng/Mời (chỉ qua mạng).
function onNetworkOpenLogDialog(): void {
  networkLogDialogOpen = true;
  render();
}

function onNetworkCloseLogDialog(): void {
  networkLogDialogOpen = false;
  render();
}

function onNetworkOpenSettingsDialog(): void {
  networkSettingsDialogOpen = true;
  render();
}

function onNetworkCloseSettingsDialog(): void {
  networkSettingsDialogOpen = false;
  networkConfirmingNewGame = false; // đóng dialog thì huỷ luôn bước xác nhận dở dang
  networkConfirmingReturnToLobby = false;
  render();
}

// Bổ sung — dialog "Thư viện bài" mở giữa ván qua mạng, giống hotseat (xem
// ghi chú onOpenCardReferenceDialog()) — không gửi gì lên server, chỉ là
// dialog nổi lên trên, đóng lại là chơi tiếp bình thường.
function onNetworkOpenCardReferenceDialog(): void {
  networkCardReferenceDialogOpen = true;
  cardReferenceSearchQuery = "";
  render();
}

function onNetworkCloseCardReferenceDialog(): void {
  networkCardReferenceDialogOpen = false;
  render();
}

// Bổ sung — nút "Bắt đầu ván mới" trong dialog Cài đặt (qua mạng, CHỈ chủ
// phòng thấy nút này — xem NetworkGameOptions.isRoomOwner). Ván ĐÃ kết thúc
// (view.winner khác null) thì gửi start_game bình thường ngay (existing đã
// có winner nên server vốn đã cho qua, không cần `force`); CHƯA kết thúc thì
// chuyển dialog sang bước xác nhận trước — xác nhận xong mới gửi kèm
// `force: true` (xem protocol.ts/room.ts) để server bỏ qua kiểm tra "đang có
// ván dở" và ghi đè bằng ván mới.
function onNetworkRequestNewGame(): void {
  if (!networkView) return;
  if (networkView.winner) {
    netConnection?.send({
      type: "start_game",
      seed: Date.now(),
      houseRules: networkSelectedHouseRules,
      expansions: networkSelectedExpansions,
      eventDeckSize: networkSelectedEventDeckSize,
    });
    return;
  }
  networkConfirmingNewGame = true;
  render();
}

function onNetworkConfirmNewGame(): void {
  netConnection?.send({
    type: "start_game",
    seed: Date.now(),
    houseRules: networkSelectedHouseRules,
    expansions: networkSelectedExpansions,
    eventDeckSize: networkSelectedEventDeckSize,
    force: true,
  });
  networkConfirmingNewGame = false;
  // Đóng luôn dialog Cài đặt — trước đây chỉ tắt ở nhánh "game_abandoned" (nút
  // "Về phòng chờ"), nhánh "state" (ván mới bắt đầu ngay) không hề đụng tới,
  // nên dialog cũ vẫn đè lên màn hình ván mới cho tới khi tự tay đóng.
  networkSettingsDialogOpen = false;
  render();
}

function onNetworkCancelNewGameConfirm(): void {
  networkConfirmingNewGame = false;
  render();
}

// Bổ sung — nút "Về phòng chờ (sửa tuỳ chọn)" trong dialog Cài đặt (qua mạng,
// CHỈ chủ phòng thấy nút này). Khác hẳn onNetworkRequestNewGame() ở trên
// (restart NGAY với tuỳ chọn CŨ khi ván đã kết thúc) — nút này LUÔN hỏi xác
// nhận trước khi gửi, kể cả ván đã kết thúc, vì mục đích của nó là SỬA tuỳ
// chọn chứ không phải chơi lại ngay; hỏi trước cho chắc, tránh bấm nhầm.
function onNetworkRequestReturnToLobby(): void {
  networkConfirmingReturnToLobby = true;
  render();
}

function onNetworkConfirmReturnToLobby(): void {
  netConnection?.send({ type: "return_to_lobby" });
  networkConfirmingReturnToLobby = false;
  // Đóng dialog Cài đặt NGAY (không chờ ServerMessage "game_abandoned" mới tắt
  // như trước) — dialog cũ đóng sẵn từ NHÁNH ĐÓ rồi, nhưng phải đợi 1 vòng
  // round-trip server mới thấy, trong lúc đó dialog vẫn đứng yên trên màn hình
  // dù người chơi vừa xác nhận xong. `screen` vẫn ở "network-game" tới khi
  // "game_abandoned" gửi về, giống hệt onNetworkConfirmNewGame() ở trên.
  networkSettingsDialogOpen = false;
  render();
}

function onNetworkCancelReturnToLobbyConfirm(): void {
  networkConfirmingReturnToLobby = false;
  render();
}

function onNetworkOpenRoomCodeDialog(): void {
  networkRoomCodeCopyStatus = null; // mở dialog mới thì bỏ thông báo "Đã chép!" của lần mở trước
  networkRoomCodeDialogOpen = true;
  render();
}

function onNetworkCloseRoomCodeDialog(): void {
  networkRoomCodeDialogOpen = false;
  render();
}

// navigator.clipboard.writeText() là API bất đồng bộ CỦA TRÌNH DUYỆT (không
// phải chờ người chơi khác trả lời — không vi phạm quy tắc 4 CLAUDE.md, quy
// tắc đó chỉ áp dụng trong core/). 1 số trình duyệt/thiết bị chặn Clipboard
// API (vd không phải HTTPS) — báo lỗi rõ ràng thay vì im lặng thất bại.
function onNetworkCopyRoomCode(): void {
  navigator.clipboard.writeText(networkCode).then(
    () => {
      networkRoomCodeCopyStatus = "Đã chép!";
      render();
    },
    () => {
      networkRoomCodeCopyStatus = "Không chép được — tự bôi đen và chép mã ở trên.";
      render();
    }
  );
}

// "Rời phòng" bên trong dialog Cài đặt — đóng WebSocket CHỦ ĐỘNG (net.ts's
// RoomConnection.close() đặt closedByUser=true, tắt hẳn cơ chế tự nối lại,
// khác mất mạng ngoài ý muốn), quay lại màn hình chính.
function onLeaveNetworkGame(): void {
  netConnection?.close();
  netConnection = null;
  networkView = null;
  networkGameLog = [];
  networkDeadline = null;
  networkConnectedIds = [];
  networkLogDialogOpen = false;
  networkSettingsDialogOpen = false;
  networkCardReferenceDialogOpen = false;
  networkConfirmingNewGame = false;
  networkConfirmingReturnToLobby = false;
  networkRoomCodeDialogOpen = false;
  syncCountdownTick();
  screen = "home";
  render();
}

// Giai đoạn 5, cơ chế chọn nhân vật qua mạng — chỉ CHÍNH MÌNH mới bấm được
// (renderNetworkCharacterSelectionScreen chỉ hiện nút cho đúng viewerId).
// Việc bổ sung sau Giai đoạn 5 — tách "cầm lên xem"/"xác nhận thật", giống hệt
// hotseat (xem ghi chú onArmCharacterChoice() ở trên).
function onNetworkArmCharacterChoice(characterId: string): void {
  networkArmedCharacterId = characterId;
  render();
}

function onNetworkConfirmCharacterChoice(): void {
  if (!networkArmedCharacterId) return;
  networkDispatch({ type: "CHOOSE_CHARACTER", playerId: myPlayerId, characterId: networkArmedCharacterId });
}
