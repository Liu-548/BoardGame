// Việc 2.3: bấm bài → gọi reduce(). Không dùng "chờ" (await) gì cả — mỗi lần
// bấm là 1 lần gọi reduce() đồng bộ, xong ngay, vẽ lại màn hình.
//
// Việc 2.5: chế độ hotseat — trước khi có GameState, hiện màn hình thiết lập
// (gõ tên 4-8 người — biến thể 8 người, xem LO-TRINH.md), rồi mới setupGame().
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

import { cardNameFromId } from "../core/cards";
import type { CardName } from "../core/cards";
import { reduce } from "../core/reduce";
import { setupGame } from "../core/setup";
import type { Action, GameState, HouseRuleId } from "../core/types";
import type { PlayerView } from "../core/view";
import { RoomConnection } from "./net";
import type { DeadlineInfo, ServerMessage } from "../protocol";
import {
  applyStoredSettings,
  describeEvent,
  renderApp,
  renderCardReferenceScreen,
  renderCharacterSelectionScreen,
  renderHomeScreen,
  renderNetworkCharacterSelectionScreen,
  renderNetworkGame,
  renderNetworkLobby,
  renderNetworkLobbyForm,
  renderSetupScreen,
} from "./ui";
import type { DrawCheckNotice, LobbyPlayer, Selection } from "./ui";

const root = document.getElementById("game-root") as HTMLDivElement;

// Hoàn thiện Cài đặt — áp dụng sở thích giao diện sáng/tối + cỡ chữ đã lưu
// TRƯỚC lần vẽ đầu tiên (tránh nháy sáng/cỡ chữ mặc định rồi đổi lại ngay).
applyStoredSettings();

// Các lá cần chọn thêm mục tiêu khi đánh — lá còn lại (bia, saloon, súng máy
// Gatling, tự trang bị...) đánh xong ngay, không cần bước chọn nào thêm.
const NEEDS_TARGET = new Set<CardName>(["bang", "duel", "jail", "panic", "cat_balou"]);

const DEFAULT_PLAYER_NAMES = ["An", "Bình", "Chi", "Dũng"];

type Screen =
  | "home"
  | "local-setup"
  | "local-game"
  | "network-form"
  | "network-lobby"
  | "network-game"
  | "card-reference"; // việc 4.6: màn hình tra cứu, xem được từ home, quay lại home

let screen: Screen = "home";

// ----- Chế độ chơi chung 1 máy (hotseat, việc 2.x) -----
let playerNames: string[] = [...DEFAULT_PLAYER_NAMES];
let setupError: string | null = null;
// Việc 5.3 (house rules) — chọn ở màn hình thiết lập, chỉ áp dụng cho VÁN
// SẮP bắt đầu (không phải cấu hình toàn cục) — reset về [] mỗi khi bắt đầu
// ván mới (onStartGame), giống cách playerNames KHÔNG bị reset (giữ nguyên
// tên cũ) nhưng khác ở đây vì luật bổ sung PHẢI chọn lại mỗi ván, tránh quên
// đang bật gì từ ván trước.
let selectedHouseRules: HouseRuleId[] = [];
let state: GameState; // chỉ tồn tại sau khi bấm "Bắt đầu ván"
// Việc bổ sung sau Giai đoạn 5 — màn hình chọn nhân vật: playerId -> lá đang
// "cầm lên" chờ bấm "Xác nhận" mới thật sự gửi CHOOSE_CHARACTER (tránh bấm
// nhầm lúc chỉ định xem mô tả chức năng). Trạng thái TẠM THỜI chỉ ở client,
// reset về {} mỗi khi bắt đầu ván mới.
let characterArmedChoices: Record<string, string> = {};
let selection: Selection = { step: "idle" };
let discardSelectionIds: string[] = [];
let error: string | null = null;
// Lá vừa lật khi draw! (Barrel/Jail/Dynamite...), tính lại sau MỖI dispatch —
// yêu cầu thiết kế: check bài phải công khai cho tất cả mọi người xem.
let lastDrawCheck: DrawCheckNotice = null;
// Việc 4.2: nhật ký ván đấu — mỗi GameEvent dịch sẵn ra 1 dòng tiếng Việt
// (describeEvent() ở ui.ts) rồi thêm vào ĐẦU mảng (mới nhất lên trên, khỏi
// phải tự cuộn xuống cuối mỗi lần có hành động mới).
let gameLog: string[] = [];
// Đợt 2 UI/UX (mục 4) — playerId nào đang "nở" khu trang bị khi bàn >6 người
// (client-only, xem renderPlayerEquipmentArea() ở ui.ts). Reset về [] mỗi khi
// bắt đầu ván mới, giống characterArmedChoices ở trên.
let expandedSeatIds: string[] = [];
// Đợt 3 UI/UX (mục 9) — 2 dialog góc màn hình (nhật ký/cài đặt), client-only,
// giống expandedSeatIds. Reset về false mỗi khi bắt đầu ván mới.
let logDialogOpen = false;
let settingsDialogOpen = false;

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
// Đợt 2 UI/UX (mục 4) — giống expandedSeatIds ở hotseat, xem ghi chú ở đó.
let networkExpandedSeatIds: string[] = [];
// Đợt 3 UI/UX (mục 9) — giống logDialogOpen/settingsDialogOpen ở hotseat,
// cộng thêm dialog Mã phòng (chỉ qua mạng) và thông báo tạm thời sau khi
// bấm "Chép mã" (null = chưa bấm lần nào từ lúc dialog này mở).
let networkLogDialogOpen = false;
let networkSettingsDialogOpen = false;
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
// Việc 4.1: đồng hồ đếm ngược lượt (server tự tính, xem room.ts) — client chỉ
// đọc `expiresAt` rồi TỰ đếm lùi mỗi giây bằng setInterval CỦA RIÊNG CLIENT
// (không phải Durable Object — quy tắc 8 CLAUDE.md chỉ cấm setInterval TRONG
// Durable Object, không cấm ở trình duyệt) để vẽ lại số giây còn lại.
let networkDeadline: DeadlineInfo | null = null;
let countdownTickId: ReturnType<typeof setInterval> | null = null;

function render(): void {
  switch (screen) {
    case "home":
      renderHomeScreen(root, { onPlayLocal, onPlayNetwork, onShowCardReference });
      return;
    case "card-reference":
      renderCardReferenceScreen(root, { onBack: onBackToHome });
      return;
    case "local-setup":
      renderSetupScreen(root, playerNames, setupError, selectedHouseRules, {
        onNameChange,
        onAddPlayer,
        onRemovePlayer,
        onToggleHouseRule,
        onStartGame,
      });
      return;
    case "local-game":
      // Giai đoạn 5, cơ chế chọn nhân vật — hiện màn hình riêng TRƯỚC bàn chơi
      // thật, cho tới khi mọi người chọn xong (state.characterSelection về null).
      if (state.characterSelection) {
        renderCharacterSelectionScreen(root, state.players, state.characterSelection, characterArmedChoices, {
          onArmCharacterChoice,
          onConfirmCharacterChoice,
        });
        return;
      }
      renderApp(
        root,
        state,
        {
          selection,
          discardSelection: discardSelectionIds,
          error,
          lastDrawCheck,
          log: gameLog,
          expandedSeatIds,
          logDialogOpen,
          settingsDialogOpen,
        },
        {
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
          onPickDrawSource,
          onPickDrawTarget,
          onPickKeptCard,
          onToggleSeatExpanded,
          onOpenLogDialog,
          onCloseLogDialog,
          onOpenSettingsDialog,
          onCloseSettingsDialog,
          onLeaveGame: onBackToHome,
        }
      );
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
      renderNetworkLobby(
        root,
        networkCode,
        lobbyPlayers,
        lobbyOwnerId,
        myPlayerId,
        networkError,
        networkAbandonedNotice,
        networkSelectedHouseRules,
        {
          onToggleHouseRule: onNetworkToggleHouseRule,
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
            expandedSeatIds: networkExpandedSeatIds,
            logDialogOpen: networkLogDialogOpen,
            settingsDialogOpen: networkSettingsDialogOpen,
            roomCodeDialogOpen: networkRoomCodeDialogOpen,
            roomCode: networkCode,
            roomCodeCopyStatus: networkRoomCodeCopyStatus,
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
            onToggleSeatExpanded: onNetworkToggleSeatExpanded,
            onOpenLogDialog: onNetworkOpenLogDialog,
            onCloseLogDialog: onNetworkCloseLogDialog,
            onOpenSettingsDialog: onNetworkOpenSettingsDialog,
            onCloseSettingsDialog: onNetworkCloseSettingsDialog,
            onOpenRoomCodeDialog: onNetworkOpenRoomCodeDialog,
            onCloseRoomCodeDialog: onNetworkCloseRoomCodeDialog,
            onCopyRoomCode: onNetworkCopyRoomCode,
            onLeaveGame: onLeaveNetworkGame,
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

// Việc 4.6: chỉ xem được TỪ home, quay lại LUÔN về home — không gắn với ván
// đang chơi dở nào (không cần nhớ "quay lại đâu").
function onShowCardReference(): void {
  screen = "card-reference";
  render();
}

function onBackToHome(): void {
  screen = "home";
  render();
}

// ----- Chế độ chơi chung 1 máy (hotseat) -----

// KHÔNG render() ở đây — render lại giữa lúc đang gõ sẽ xoá và tạo lại input
// mới, làm mất con trỏ đang gõ (xem ghi chú ở ui.ts).
function onNameChange(index: number, value: string): void {
  playerNames[index] = value;
}

// Hỗ trợ 2-8 người (xem LO-TRINH.md — 2/3 người là biến thể riêng của dự
// án, 4-8 người theo luật gốc BANG!, setup.ts's setupGame() lo phần chia
// vai đúng theo từng cỡ bàn).
function onAddPlayer(): void {
  if (playerNames.length >= 8) return;
  playerNames.push("");
  render();
}

function onRemovePlayer(): void {
  if (playerNames.length <= 2) return;
  playerNames.pop();
  render();
}

function onToggleHouseRule(id: HouseRuleId): void {
  selectedHouseRules = selectedHouseRules.includes(id)
    ? selectedHouseRules.filter((existing) => existing !== id)
    : [...selectedHouseRules, id];
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
  state = setupGame(ids, Date.now(), { dealCharacterCards: true, houseRules: selectedHouseRules });
  // setupGame() tạm dùng id làm tên hiển thị (xem ghi chú trong setup.ts) —
  // gán lại tên thật người chơi vừa gõ.
  state.players.forEach((player, index) => {
    player.name = trimmedNames[index];
  });

  screen = "local-game";
  selection = { step: "idle" };
  discardSelectionIds = [];
  error = null;
  gameLog = [];
  characterArmedChoices = {};
  expandedSeatIds = [];
  logDialogOpen = false;
  settingsDialogOpen = false;
  render();
}

function onPlayAgain(): void {
  screen = "local-setup";
  selectedHouseRules = []; // luật bổ sung chỉ áp dụng cho 1 ván — chọn lại từ đầu mỗi ván mới
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
    const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
    for (const event of result.events) {
      gameLog.unshift(describeEvent(event, nameOf));
    }
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
// Cũng tái dùng cho "rút bộ bài"/"rút ngẫu nhiên"/"giữ 2 lá đầu" (3 nhân vật
// bên dưới) — đều là RESPOND không kèm cardId/targetId, y hệt.
function onRespondTakeConsequence(): void {
  const top = state.pending[state.pending.length - 1];
  if (top) dispatch({ type: "RESPOND", playerId: top.player });
}

// Pedro Ramirez — lấy đúng lá trên cùng chồng bỏ làm lá 1.
function onPickDrawSource(cardId: string): void {
  const top = state.pending[state.pending.length - 1];
  if (top) dispatch({ type: "RESPOND", playerId: top.player, cardId });
}

// Jesse Jones (bước 1) — chọn lấy bài từ tay ai, và có để họ tự chọn lá không.
function onPickDrawTarget(targetId: string, letTargetChoose: boolean): void {
  const top = state.pending[state.pending.length - 1];
  if (top) dispatch({ type: "RESPOND", playerId: top.player, targetId, letTargetChoose });
}

// Kit Carlson — bỏ đúng lá vừa bấm trong 3 lá đã xem, giữ 2 lá còn lại.
function onPickKeptCard(cardId: string): void {
  const top = state.pending[state.pending.length - 1];
  if (top) dispatch({ type: "RESPOND", playerId: top.player, cardId });
}

function onCancelSelection(): void {
  selection = { step: "idle" };
  render();
}

// Đợt 2 UI/UX (mục 4) — bấm "nở"/"thu gọn" khu trang bị của 1 seat khi bàn >6
// người. Client-only, không gửi action gì lên reduce()/server.
function onToggleSeatExpanded(playerId: string): void {
  expandedSeatIds = expandedSeatIds.includes(playerId)
    ? expandedSeatIds.filter((id) => id !== playerId)
    : [...expandedSeatIds, playerId];
  render();
}

// Đợt 3 UI/UX (mục 9) — mở/đóng 2 dialog góc màn hình (nhật ký/cài đặt).
// Client-only, không gửi action gì lên reduce().
function onOpenLogDialog(): void {
  logDialogOpen = true;
  render();
}

function onCloseLogDialog(): void {
  logDialogOpen = false;
  render();
}

function onOpenSettingsDialog(): void {
  settingsDialogOpen = true;
  render();
}

function onCloseSettingsDialog(): void {
  settingsDialogOpen = false;
  render();
}

// Giai đoạn 5, cơ chế chọn nhân vật — KHÔNG dùng currentPlayerId() như các
// handler khác ở trên: chọn nhân vật KHÔNG phải hành động "đúng lượt", MỖI
// người tự chọn ĐỘC LẬP (xem core/types.ts's CharacterChoice), nên playerId
// tới thẳng từ người vừa bấm (renderCharacterSelectionScreen truyền vào).
//
// Việc bổ sung sau Giai đoạn 5 — tách hẳn "cầm lên xem" (onArmCharacterChoice,
// chỉ đổi state client, CHƯA gửi gì) khỏi "xác nhận thật" (onConfirmCharacterChoice,
// mới thật sự dispatch CHOOSE_CHARACTER) — tránh 1 cú bấm nhầm lúc đang xem mô
// tả chức năng vô tình chốt luôn nhân vật, đặc biệt khó undo trên điện thoại.
function onArmCharacterChoice(playerId: string, characterId: string): void {
  characterArmedChoices = { ...characterArmedChoices, [playerId]: characterId };
  render();
}

function onConfirmCharacterChoice(playerId: string): void {
  const characterId = characterArmedChoices[playerId];
  if (!characterId) return;
  dispatch({ type: "CHOOSE_CHARACTER", playerId, characterId });
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
  networkGameLog = [];
  networkSelectedHouseRules = [];
  networkArmedCharacterId = null;
  networkExpandedSeatIds = [];
  networkLogDialogOpen = false;
  networkSettingsDialogOpen = false;
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
      networkView = message.view;
      networkConnectedIds = message.connectedPlayerIds;
      networkAbandonedNotice = null; // ván mới đang chạy thật -> thông báo ván cũ bị huỷ hết ý nghĩa
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
      // Việc 4.3: server đã tự xoá ván (còn quá ít người kết nối) — quay lại
      // lobby, dọn hết trạng thái ván cũ. `lobby` gửi kèm ngay sau đó (xem
      // room.ts) sẽ tự cập nhật đúng danh sách người + chủ phòng hiện tại.
      networkView = null;
      networkGameLog = [];
      networkDeadline = null;
      networkConnectedIds = [];
      networkArmedCharacterId = null;
      networkExpandedSeatIds = [];
      networkLogDialogOpen = false;
      networkSettingsDialogOpen = false;
      networkRoomCodeDialogOpen = false;
      syncCountdownTick();
      networkAbandonedNotice = "Ván vừa bị huỷ vì không đủ người chơi còn kết nối. Chờ đủ người rồi bắt đầu ván mới.";
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

function onNetworkStartGame(): void {
  netConnection?.send({ type: "start_game", seed: Date.now(), houseRules: networkSelectedHouseRules });
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

// Kit Carlson — bỏ đúng lá vừa bấm trong 3 lá đã xem, giữ 2 lá còn lại.
function onNetworkPickKeptCard(cardId: string): void {
  if (!networkView) return;
  const top = networkView.pending[networkView.pending.length - 1];
  if (top) networkDispatch({ type: "RESPOND", playerId: top.player, cardId });
}

function onNetworkCancelSelection(): void {
  networkSelection = { step: "idle" };
  render();
}

// Đợt 2 UI/UX (mục 4) — giống hệt onToggleSeatExpanded (hotseat), xem ghi chú
// ở đó.
function onNetworkToggleSeatExpanded(playerId: string): void {
  networkExpandedSeatIds = networkExpandedSeatIds.includes(playerId)
    ? networkExpandedSeatIds.filter((id) => id !== playerId)
    : [...networkExpandedSeatIds, playerId];
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

render();
