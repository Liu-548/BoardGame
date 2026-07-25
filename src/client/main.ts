// Việc 2.3: bấm bài → gọi reduce(). Không dùng "chờ" (await) gì cả — mỗi lần
// bấm là 1 lần gọi reduce() đồng bộ, xong ngay, vẽ lại màn hình.
//
// Việc 2.5: chế độ hotseat — trước khi có GameState, hiện màn hình thiết lập
// (gõ tên 4-7 người), rồi mới setupGame(). Ván kết thúc thì có nút quay lại
// màn hình thiết lập (giữ nguyên tên cũ) để chơi ván khác, không cần tải lại
// trang.
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

import { cardNameFromId } from "../core/cards";
import type { CardName } from "../core/cards";
import { reduce } from "../core/reduce";
import { setupGame } from "../core/setup";
import type { Action, GameState } from "../core/types";
import type { PlayerView } from "../core/view";
import { RoomConnection } from "./net";
import type { ServerMessage } from "../protocol";
import {
  renderApp,
  renderHomeScreen,
  renderNetworkGame,
  renderNetworkLobby,
  renderNetworkLobbyForm,
  renderSetupScreen,
} from "./ui";
import type { DrawCheckNotice, LobbyPlayer, Selection } from "./ui";

const root = document.getElementById("game-root") as HTMLDivElement;

// Các lá cần chọn thêm mục tiêu khi đánh — lá còn lại (bia, saloon, súng máy
// Gatling, tự trang bị...) đánh xong ngay, không cần bước chọn nào thêm.
const NEEDS_TARGET = new Set<CardName>(["bang", "duel", "jail", "panic", "cat_balou"]);

const DEFAULT_PLAYER_NAMES = ["An", "Bình", "Chi", "Dũng"];

type Screen = "home" | "local-setup" | "local-game" | "network-form" | "network-lobby" | "network-game";

let screen: Screen = "home";

// ----- Chế độ chơi chung 1 máy (hotseat, việc 2.x) -----
let playerNames: string[] = [...DEFAULT_PLAYER_NAMES];
let setupError: string | null = null;
let state: GameState; // chỉ tồn tại sau khi bấm "Bắt đầu ván"
let selection: Selection = { step: "idle" };
let discardSelectionIds: string[] = [];
let error: string | null = null;
// Lá vừa lật khi draw! (Barrel/Jail/Dynamite...), tính lại sau MỖI dispatch —
// yêu cầu thiết kế: check bài phải công khai cho tất cả mọi người xem.
let lastDrawCheck: DrawCheckNotice = null;

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
let networkDiscardSelectionIds: string[] = [];
let networkLastDrawCheck: DrawCheckNotice = null;

function render(): void {
  switch (screen) {
    case "home":
      renderHomeScreen(root, { onPlayLocal, onPlayNetwork });
      return;
    case "local-setup":
      renderSetupScreen(root, playerNames, setupError, {
        onNameChange,
        onAddPlayer,
        onRemovePlayer,
        onStartGame,
      });
      return;
    case "local-game":
      renderApp(root, state, { selection, discardSelection: discardSelectionIds, error, lastDrawCheck }, {
        onDrawCards,
        onEndTurn,
        onToggleDiscardCard,
        onConfirmDiscard,
        onHandCardClick,
        onEquipmentClick,
        onPlayerClick,
        onStoreOptionClick,
        onZoneClick,
        onRespondTakeConsequence,
        onCancelSelection,
        onPlayAgain,
      });
      return;
    case "network-form":
      renderNetworkLobbyForm(root, networkName, networkCode, networkError, {
        onNameChange: onNetworkNameChange,
        onCodeChange: onNetworkCodeChange,
        onGenerateCode,
        onJoinRoom,
      });
      return;
    case "network-lobby":
      renderNetworkLobby(root, networkCode, lobbyPlayers, lobbyOwnerId, myPlayerId, networkError, {
        onStartGame: onNetworkStartGame,
      });
      return;
    case "network-game":
      if (networkView) {
        renderNetworkGame(
          root,
          networkView,
          {
            selection: networkSelection,
            error: networkError,
            discardSelection: networkDiscardSelectionIds,
            lastDrawCheck: networkLastDrawCheck,
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
          }
        );
      }
      return;
  }
}

// ----- Màn hình chọn cách chơi -----

function onPlayLocal(): void {
  screen = "local-setup";
  render();
}

function onPlayNetwork(): void {
  screen = "network-form";
  render();
}

// ----- Chế độ chơi chung 1 máy (hotseat) -----

// KHÔNG render() ở đây — render lại giữa lúc đang gõ sẽ xoá và tạo lại input
// mới, làm mất con trỏ đang gõ (xem ghi chú ở ui.ts).
function onNameChange(index: number, value: string): void {
  playerNames[index] = value;
}

function onAddPlayer(): void {
  if (playerNames.length >= 7) return;
  playerNames.push("");
  render();
}

function onRemovePlayer(): void {
  if (playerNames.length <= 4) return;
  playerNames.pop();
  render();
}

function onStartGame(): void {
  const trimmedNames = playerNames.map((name) => name.trim());
  if (trimmedNames.some((name) => name.length === 0)) {
    setupError = "Mọi người chơi phải có tên, không được để trống";
    render();
    return;
  }

  setupError = null;
  const ids = trimmedNames.map((_, index) => `p${index}`);
  state = setupGame(ids, Date.now());
  // setupGame() tạm dùng id làm tên hiển thị (xem ghi chú trong setup.ts) —
  // gán lại tên thật người chơi vừa gõ.
  state.players.forEach((player, index) => {
    player.name = trimmedNames[index];
  });

  screen = "local-game";
  selection = { step: "idle" };
  discardSelectionIds = [];
  error = null;
  render();
}

function onPlayAgain(): void {
  screen = "local-setup";
  render();
}

// Gọi reduce() thật — mọi hành động của người chơi đều đi qua đây. Bấm sai
// (sai lượt, ngoài tầm, sai mục tiêu...) sẽ ném lỗi tiếng Việt sẵn có từ
// reduce.ts, chỉ cần hiện ra, không cần dịch lại.
function dispatch(action: Action): void {
  try {
    const result = reduce(state, action);
    state = result.state;
    error = null;
    const checkEvent = result.events.find((e) => e.type === "DRAW_CHECK_RESOLVED");
    lastDrawCheck = checkEvent
      ? {
          playerName: state.players.find((p) => p.id === checkEvent.playerId)!.name,
          cardId: checkEvent.cardId,
          matched: checkEvent.matched,
        }
      : null;
  } catch (e) {
    error = e instanceof Error ? e.message : "Có lỗi không rõ khi thực hiện hành động";
  }
  selection = { step: "idle" };
  discardSelectionIds = [];
  render();
}

function currentPlayerId(): string {
  return state.players[state.currentPlayerIndex].id;
}

function onDrawCards(): void {
  dispatch({ type: "DRAW_CARDS", playerId: currentPlayerId() });
}

function onEndTurn(): void {
  dispatch({ type: "END_TURN", playerId: currentPlayerId() });
}

function onToggleDiscardCard(cardId: string): void {
  const index = discardSelectionIds.indexOf(cardId);
  if (index === -1) {
    discardSelectionIds.push(cardId);
  } else {
    discardSelectionIds.splice(index, 1);
  }
  render();
}

function onConfirmDiscard(): void {
  dispatch({ type: "DISCARD_CARDS", playerId: currentPlayerId(), cardIds: discardSelectionIds });
}

// Bấm 1 lá trên tay — nghĩa của cú bấm phụ thuộc bối cảnh hiện tại:
// - Đang có pending chờ MÌNH trả lời -> đây là RESPOND kèm lá này.
// - Không thì đang là lượt "đánh bài" của mình -> đây là PLAY_CARD, nhưng nếu
//   lá cần mục tiêu thì chỉ "cầm lên" (chuyển sang bước chọn mục tiêu), chưa
//   gọi reduce() ngay.
function onHandCardClick(cardId: string): void {
  const top = state.pending[state.pending.length - 1];
  if (top) {
    dispatch({ type: "RESPOND", playerId: top.player, cardId });
    return;
  }

  const name = cardNameFromId(cardId);
  if (NEEDS_TARGET.has(name)) {
    selection = { step: "picking-target", cardId, cardName: name };
    render();
  } else {
    dispatch({ type: "PLAY_CARD", playerId: currentPlayerId(), cardId });
  }
}

// Bấm 1 lá trang bị trên sân ai đó — chỉ có 2 tình huống dùng tới: Cat Balou
// bắt bỏ 1 lá cụ thể trên sân (RESPOND), hoặc Panic! cướp lá trang bị cụ thể
// khi tay mục tiêu đã hết bài (bước 2 của PLAY_CARD panic).
function onEquipmentClick(ownerId: string, cardId: string): void {
  if (selection.step === "picking-panic-equipment") {
    dispatch({
      type: "PLAY_CARD",
      playerId: currentPlayerId(),
      cardId: selection.cardId,
      targetId: selection.targetId,
      targetCardId: cardId,
    });
    return;
  }

  const top = state.pending[state.pending.length - 1];
  if (top && top.kind === "NEED_DISCARD_FROM_ZONE" && top.player === ownerId) {
    dispatch({ type: "RESPOND", playerId: top.player, cardId });
  }
}

// Bấm chọn 1 người làm mục tiêu — chỉ có ý nghĩa khi đang ở bước
// "picking-target" (đã cầm sẵn 1 lá cần mục tiêu ở tay).
function onPlayerClick(targetId: string): void {
  if (selection.step !== "picking-target") return;
  const { cardId, cardName } = selection;

  if (cardName === "panic") {
    const target = state.players.find((p) => p.id === targetId)!;
    if (target.hand.length > 0) {
      dispatch({ type: "PLAY_CARD", playerId: currentPlayerId(), cardId, targetId });
    } else {
      selection = { step: "picking-panic-equipment", cardId, targetId };
      render();
    }
    return;
  }

  if (cardName === "cat_balou") {
    selection = { step: "picking-cat-balou-zone", cardId, targetId };
    render();
    return;
  }

  dispatch({ type: "PLAY_CARD", playerId: currentPlayerId(), cardId, targetId });
}

function onStoreOptionClick(cardId: string): void {
  const top = state.pending[state.pending.length - 1];
  if (top) dispatch({ type: "RESPOND", playerId: top.player, cardId });
}

function onZoneClick(zone: "hand" | "equipment"): void {
  if (selection.step !== "picking-cat-balou-zone") return;
  dispatch({
    type: "PLAY_CARD",
    playerId: currentPlayerId(),
    cardId: selection.cardId,
    targetId: selection.targetId,
    targetZone: zone,
  });
}

// "Chịu hậu quả" dùng chung cho: chịu mất máu thay vì đỡ (Missed!/Indians!/
// Duel), và tự lật bài kiểm tra (draw!) — cả 2 đều là RESPOND không kèm cardId.
function onRespondTakeConsequence(): void {
  const top = state.pending[state.pending.length - 1];
  if (top) dispatch({ type: "RESPOND", playerId: top.player });
}

function onCancelSelection(): void {
  selection = { step: "idle" };
  render();
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
  myPlayerId = `p-${Math.random().toString(36).slice(2, 10)}`;
  lobbyPlayers = [];
  lobbyOwnerId = null;
  networkView = null;

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

function onNetworkMessage(message: ServerMessage): void {
  networkError = null;

  switch (message.type) {
    case "lobby":
      lobbyPlayers = message.players;
      lobbyOwnerId = message.ownerId;
      if (screen === "network-lobby") render();
      return;
    case "state": {
      networkView = message.view;
      const checkEvent = message.events.find((e) => e.type === "DRAW_CHECK_RESOLVED");
      networkLastDrawCheck = checkEvent
        ? {
            playerName: networkView.players.find((p) => p.id === checkEvent.playerId)!.name,
            cardId: checkEvent.cardId,
            matched: checkEvent.matched,
          }
        : null;
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
  }
}

function onNetworkStartGame(): void {
  netConnection?.send({ type: "start_game", seed: Date.now() });
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
  if (NEEDS_TARGET.has(name)) {
    networkSelection = { step: "picking-target", cardId, cardName: name };
    render();
  } else {
    networkDispatch({ type: "PLAY_CARD", playerId: myPlayerId, cardId });
  }
}

function onNetworkEquipmentClick(ownerId: string, cardId: string): void {
  if (networkSelection.step === "picking-panic-equipment") {
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
  }
}

// Panic!/Cat Balou cần biết tay mục tiêu có bài hay không — dùng `handCount`
// (LUÔN đúng, kể cả với người khác) thay vì `hand.length` (chỉ có với chính
// mình qua mạng, xem core/view.ts).
function onNetworkPlayerClick(targetId: string): void {
  if (networkSelection.step !== "picking-target" || !networkView) return;
  const { cardId, cardName } = networkSelection;

  if (cardName === "panic") {
    const target = networkView.players.find((p) => p.id === targetId)!;
    if (target.handCount > 0) {
      networkDispatch({ type: "PLAY_CARD", playerId: myPlayerId, cardId, targetId });
    } else {
      networkSelection = { step: "picking-panic-equipment", cardId, targetId };
      render();
    }
    return;
  }

  if (cardName === "cat_balou") {
    networkSelection = { step: "picking-cat-balou-zone", cardId, targetId };
    render();
    return;
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

function onNetworkRespondTakeConsequence(): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player });
}

function onNetworkCancelSelection(): void {
  networkSelection = { step: "idle" };
  render();
}

render();
