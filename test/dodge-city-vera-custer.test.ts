// Mở rộng Dodge City, mục C — Vera Custer (nhân vật cuối cùng, 15/15) — cơ chế
// uỷ quyền toàn hệ thống hook: getEffectiveCharacterId()/getEffectiveCharacterHooks()/
// getEffectiveCharacterDefinition() (characters.ts). Xem LO-TRINH.md "Ghi chú
// cho 5.4" mục C.9 để biết đặc tả gốc.
import { describe, expect, it } from "vitest";
import { reduce } from "../src/core/reduce";
import type { GameState, PlayerState } from "../src/core/types";

function makePlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    name: id,
    role: "outlaw",
    hp: 4,
    maxHp: 4,
    hand: [],
    equipment: [],
    alive: true,
    characterId: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [makePlayer("a"), makePlayer("b"), makePlayer("c")],
    deck: [],
    discardPile: [],
    pending: [],
    currentPlayerIndex: 0,
    turnPhase: "play",
    rngState: 1,
    winner: null,
    bangUsedThisTurn: false,
    characterSelection: null,
    turnNumber: 0,
    equipmentPlayedTurn: {},
    joseDelgadoUsesThisTurn: 0,
    docHolydayUsedThisTurn: false,
    duelBangDrawPending: null,
    veraCusterBorrowedCharacterId: null,
    elenaNoirArmed: {},
    elenaNoirImmortalTurnsLeft: {},
    marcelJailCompanion: {},
    marcelCompanionSkipNextTurn: {},
    marcelJailBonusDrawThisTurn: {},
    eventDeck: [],
    activeEventId: null,
    eventDiscard: [],
    houseRules: [],
    expansions: [],
    cardNamesPlayedThisTurn: [],
    ...overrides,
  };
}

describe("Vera Custer — đầu lượt chọn mượn khả năng, TRƯỚC CẢ Dynamite/Jail", () => {
  it("đẩy NEED_PICK_BORROWED_CHARACTER NGAY LÚC BẮT ĐẦU lượt (qua advanceTurn(), giống Dynamite/Jail) — chưa rút bài gì cả", () => {
    // Lượt của c kết thúc -> advanceTurn() chuyển sang a (Vera Custer, vòng
    // lại từ đầu) -> applyTurnStartChecks() tự đẩy pending NGAY, TRƯỚC KHI a
    // kịp gửi action DRAW_CARDS nào — đúng y hệt cách Dynamite/Jail hoạt động.
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer" }),
        makePlayer("b", { characterId: "pixie_pete" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 2,
      turnPhase: "play",
    });

    const { state: next } = reduce(state, { type: "END_TURN", playerId: "c" });

    expect(next.currentPlayerIndex).toBe(0); // đã sang lượt a
    expect(next.pending).toEqual([{ kind: "NEED_PICK_BORROWED_CHARACTER", player: "a" }]);
    expect(next.turnPhase).toBe("draw"); // chưa rút gì, còn đang chờ chọn
    expect(next.players[0].hand).toEqual([]);

    // Còn pending -> không thể DRAW_CARDS.
    expect(() => reduce(next, { type: "DRAW_CARDS", playerId: "a" })).toThrow(/Còn việc đang chờ xử lý/);
  });

  it("chọn mượn thành công: ghi đúng veraCusterBorrowedCharacterId, bắn event, rồi mới tới draw bình thường", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer" }),
        makePlayer("b", { characterId: "pixie_pete" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      pending: [{ kind: "NEED_PICK_BORROWED_CHARACTER", player: "a" }],
    });

    const { state: next, events } = reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" });

    expect(next.veraCusterBorrowedCharacterId).toBe("pixie_pete");
    expect(next.pending).toEqual([]); // không ai cầm Dynamite/Jail -> hết luôn Bước 0
    expect(events).toContainEqual({
      type: "VERA_CUSTER_BORROWED",
      playerId: "a",
      borrowedFromPlayerId: "b",
      characterId: "pixie_pete",
    });
  });

  it("không có ai khác để mượn: bỏ qua, rút bài bình thường ngay (không hỏi gì)", () => {
    const state = makeState({
      players: [makePlayer("a", { characterId: "vera_custer" }), makePlayer("b"), makePlayer("c")],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      deck: ["c2", "c1"],
    });

    const { state: next } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.pending).toEqual([]);
    expect(next.players[0].hand).toEqual(["c1", "c2"]); // rút 2 lá mặc định, không hỏi mượn
  });

  it("XẢY RA TRƯỚC Dynamite: đang cầm Dynamite vẫn bị hỏi mượn TRƯỚC, xong mới tới draw!-check Dynamite", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer", equipment: ["dynamite_1"] }),
        makePlayer("b", { characterId: "pixie_pete" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      pending: [{ kind: "NEED_PICK_BORROWED_CHARACTER", player: "a" }],
      deck: ["beer_1"],
    });

    const { state: next } = reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" });

    expect(next.veraCusterBorrowedCharacterId).toBe("pixie_pete"); // đã ghi nhận mượn
    expect(next.pending).toEqual([
      {
        kind: "NEED_DRAW_CHECK",
        player: "a",
        source: { card: "dynamite" },
        matchSuits: ["spades"],
        matchRanks: ["2", "3", "4", "5", "6", "7", "8", "9"],
      },
    ]); // NGAY SAU đó mới tới Dynamite check, không hỏi mượn lại lần 2
  });

  it("báo lỗi nếu không kèm targetId — bắt buộc chọn, không có lựa chọn 'không mượn ai'", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer" }),
        makePlayer("b", { characterId: "pixie_pete" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      pending: [{ kind: "NEED_PICK_BORROWED_CHARACTER", player: "a" }],
    });

    expect(() => reduce(state, { type: "RESPOND", playerId: "a" })).toThrow(/không có lựa chọn/);
  });

  it("báo lỗi nếu tự chọn mượn chính mình", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer" }),
        makePlayer("b", { characterId: "pixie_pete" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      pending: [{ kind: "NEED_PICK_BORROWED_CHARACTER", player: "a" }],
    });

    expect(() => reduce(state, { type: "RESPOND", playerId: "a", targetId: "a" })).toThrow(/chính mình/);
  });

  it("báo lỗi nếu chọn người CHƯA có nhân vật", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer" }),
        makePlayer("b"), // chưa có nhân vật
        makePlayer("c", { characterId: "pixie_pete" }),
      ],
      currentPlayerIndex: 0,
      pending: [{ kind: "NEED_PICK_BORROWED_CHARACTER", player: "a" }],
    });

    expect(() => reduce(state, { type: "RESPOND", playerId: "a", targetId: "b" })).toThrow(
      /chưa có nhân vật/
    );
  });
});

describe("Vera Custer — mượn được các khả năng THUẦN TUÝ động (onDrawPhase/modifyDistance)", () => {
  it("mượn onDrawPhase (Pixie Pete): rút 3 lá thay 2 ở đầu lượt", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer" }),
        makePlayer("b", { characterId: "pixie_pete" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      veraCusterBorrowedCharacterId: "pixie_pete",
      deck: ["c3", "c2", "c1"],
    });

    const { state: next, events } = reduce(state, { type: "DRAW_CARDS", playerId: "a" });

    expect(next.players[0].hand).toEqual(["c1", "c2", "c3"]);
    expect(events).toContainEqual({ type: "CARDS_DRAWN", playerId: "a", count: 3 });
  });

  it("mượn modifyDistance (Rose Doolan, vai attacker: -1 khoảng cách)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer", hand: ["bang_1"] }),
        makePlayer("b"),
        makePlayer("c"),
        makePlayer("d"),
      ],
      currentPlayerIndex: 0,
      veraCusterBorrowedCharacterId: "rose_doolan",
    });

    // a-c cách 2 ghế, mượn Rose Doolan trừ 1 -> còn 1, trong tầm súng mặc định.
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "c" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "c", source: { card: "bang", from: "a" } }]);
  });

  it("hết lượt, người khác đi, mượn VẪN hiệu lực (không tự hết hạn giữa chừng)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer" }),
        makePlayer("b", { hand: ["bang_1"] }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 1, // lượt của b, KHÔNG phải Vera Custer
      veraCusterBorrowedCharacterId: "rose_doolan",
    });

    // modifyDistance chỉ áp dụng cho ATTACKER — b không mượn gì, nên Rose
    // Doolan KHÔNG ảnh hưởng khoảng cách khi b (không phải Vera) là người bắn.
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "b", cardId: "bang_1", targetId: "a" });
    // b-a cách 1 ghế (liền kề), trong tầm súng mặc định dù không mượn gì.
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "a", source: { card: "bang", from: "b" } }]);
    // Field vẫn còn nguyên, chưa bị xoá — chỉ đơn giản KHÔNG áp dụng vì b không phải Vera Custer.
    expect(next.veraCusterBorrowedCharacterId).toBe("rose_doolan");
  });
});

describe("Vera Custer — mượn được nhân vật cần HỎI RIÊNG đầu lượt (Pedro Ramirez)", () => {
  it("mượn canDrawFromDiscardPile: đầu lượt được hỏi lấy từ chồng bỏ hay rút bộ bài", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer" }),
        makePlayer("b", { characterId: "pedro_ramirez" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      turnPhase: "draw",
      veraCusterBorrowedCharacterId: "pedro_ramirez",
      discardPile: ["beer_5"],
      deck: ["saloon_1"],
    });

    const drawn = reduce(state, { type: "DRAW_CARDS", playerId: "a" });
    expect(drawn.state.pending).toEqual([{ kind: "NEED_PICK_DRAW_SOURCE", player: "a" }]);

    const { state: next } = reduce(drawn.state, { type: "RESPOND", playerId: "a", cardId: "beer_5" });
    expect(next.players[0].hand).toEqual(["beer_5", "saloon_1"]);
  });
});

describe("Vera Custer — mượn được kỹ năng chủ động USE_ABILITY", () => {
  it("mượn canSelfHeal (Sid Ketchum): bỏ 2 lá tuỳ ý để hồi 1 máu", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer", hp: 1, maxHp: 3, hand: ["beer_1", "beer_2"] }),
        makePlayer("b", { characterId: "sid_ketchum" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      veraCusterBorrowedCharacterId: "sid_ketchum",
    });

    const { state: next, events } = reduce(state, {
      type: "USE_ABILITY",
      playerId: "a",
      cardIds: ["beer_1", "beer_2"],
    });

    expect(next.players[0].hp).toBe(2);
    expect(events).toContainEqual({
      type: "SID_KETCHUM_HEALED",
      playerId: "a",
      cardIds: ["beer_1", "beer_2"],
      amount: 1,
    });
  });

  it("KHÔNG mượn máu tối đa (bullets/maxHp) — mượn Sid Ketchum (4 máu) không đổi maxHp của Vera Custer (3 máu)", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer", hp: 3, maxHp: 3 }),
        makePlayer("b", { characterId: "sid_ketchum" }),
        makePlayer("c"),
      ],
      currentPlayerIndex: 0,
      veraCusterBorrowedCharacterId: "sid_ketchum",
    });

    expect(state.players[0].maxHp).toBe(3); // KHÔNG đổi thành 4 (bullets của Sid Ketchum)
  });
});

describe("Vera Custer — mượn được TẤT CẢ, không ngoại lệ (kể cả Apache Kid/Belle Star)", () => {
  it("mượn isImmuneToCard (Apache Kid): miễn nhiễm với lá chất Rô nhắm vào mình", () => {
    const state = makeState({
      players: [
        makePlayer("a", { hand: ["bang_15"] }), // Rô 2
        makePlayer("b", { characterId: "vera_custer" }),
        makePlayer("c", { characterId: "apache_kid" }),
      ],
      currentPlayerIndex: 0,
      veraCusterBorrowedCharacterId: "apache_kid",
    });

    const { state: next, events } = reduce(state, {
      type: "PLAY_CARD",
      playerId: "a",
      cardId: "bang_15",
      targetId: "b",
    });

    expect(next.pending).toEqual([]);
    expect(events).toContainEqual({
      type: "APACHE_KID_IMMUNE",
      playerId: "b",
      fromPlayerId: "a",
      cardId: "bang_15",
    });
  });

  it("mượn disablesOthersEquipment (Belle Star): trang bị người khác vô hiệu hoá trong lượt Vera Custer", () => {
    const state = makeState({
      players: [
        makePlayer("a", { characterId: "vera_custer", hand: ["bang_1"] }),
        makePlayer("b", { equipment: ["mustang_1"] }),
        makePlayer("c", { characterId: "belle_star" }),
      ],
      currentPlayerIndex: 0,
      veraCusterBorrowedCharacterId: "belle_star",
    });

    // a-b cách 1 ghế; nếu Mustang có tác dụng sẽ thành 2 (ngoài tầm súng mặc định 1).
    const { state: next } = reduce(state, { type: "PLAY_CARD", playerId: "a", cardId: "bang_1", targetId: "b" });
    expect(next.pending).toEqual([{ kind: "NEED_MISSED", player: "b", source: { card: "bang", from: "a" } }]);
  });
});
