import { describe, expect, it } from "vitest";
import { CHARACTERS, EXPANSION_CHARACTER_IDS } from "../src/core/characters";
import { setupGame } from "../src/core/setup";

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `p${i + 1}`);
}

function countRoles(state: ReturnType<typeof setupGame>) {
  const counts: Record<string, number> = {};
  for (const player of state.players) {
    // role là null ở biến thể 2 người (KHÔNG chia vai, xem describe riêng bên
    // dưới) — "none" gom lại thành 1 khoá cho TypeScript, các test 4-8 người
    // ở đây không bao giờ thấy khoá này.
    const key = player.role ?? "none";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

describe("setupGame", () => {
  it("báo lỗi nếu số người chơi ngoài khoảng hỗ trợ (2-8)", () => {
    expect(() => setupGame(ids(1), 1)).toThrow();
    expect(() => setupGame(ids(9), 1)).toThrow();
  });

  it("cùng seed + cùng danh sách người chơi luôn cho ra cùng state", () => {
    const a = setupGame(ids(5), 42);
    const b = setupGame(ids(5), 42);
    expect(a).toEqual(b);
  });

  it.each([4, 5, 6, 7, 8])("chia đúng số vai với %i người chơi", (playerCount) => {
    const state = setupGame(ids(playerCount), 1);
    const roleCounts = countRoles(state);

    expect(roleCounts.sheriff).toBe(1);

    // Biến thể 8 người (xem LO-TRINH.md): giống 7 người mặc định, cộng thêm
    // 1 Kẻ phản bội nữa — 4-7 người luôn chỉ có đúng 1 Renegade.
    const expectedRenegades: Record<number, number> = { 4: 1, 5: 1, 6: 1, 7: 1, 8: 2 };
    const expectedOutlaws: Record<number, number> = { 4: 2, 5: 2, 6: 3, 7: 3, 8: 3 };
    const expectedDeputies: Record<number, number> = { 4: 0, 5: 1, 6: 1, 7: 2, 8: 2 };
    expect(roleCounts.renegade ?? 0).toBe(expectedRenegades[playerCount]);
    expect(roleCounts.outlaw ?? 0).toBe(expectedOutlaws[playerCount]);
    expect(roleCounts.deputy ?? 0).toBe(expectedDeputies[playerCount]);
  });

  it("Sheriff có 5 máu, người khác có 4 máu, và đi lượt đầu tiên", () => {
    const state = setupGame(ids(5), 7);
    const sheriff = state.players.find((p) => p.role === "sheriff")!;

    expect(sheriff.hp).toBe(5);
    expect(sheriff.maxHp).toBe(5);
    for (const player of state.players) {
      if (player.role !== "sheriff") {
        expect(player.hp).toBe(4);
      }
    }

    expect(state.players[state.currentPlayerIndex].role).toBe("sheriff");
    expect(state.turnPhase).toBe("draw");
    expect(state.pending).toEqual([]);
    expect(state.discardPile).toEqual([]);
    expect(state.winner).toBeNull();
  });

  it("mỗi người rút đúng số lá bằng máu hiện có, không ai trùng lá", () => {
    const state = setupGame(ids(6), 9);
    const allHandCards = state.players.flatMap((p) => p.hand);

    for (const player of state.players) {
      // Dynamite tự xuống sân ngay khi được chia lúc setup (mục 8 file luật) —
      // cộng cả hand lẫn equipment mới đúng bằng số lá đã rút.
      expect(player.hand.length + player.equipment.length).toBe(player.hp);
    }
    expect(new Set(allHandCards).size).toBe(allHandCards.length);
  });

  it("tổng số lá bài (tay + trang bị + chồng rút) vẫn đủ 80 với bộ mặc định", () => {
    const state = setupGame(ids(6), 9);
    const dealtTotal = state.players.reduce((sum, p) => sum + p.hand.length + p.equipment.length, 0);
    expect(dealtTotal + state.deck.length + state.discardPile.length).toBe(80);
  });

  it("nhận cardCounts tuỳ chỉnh qua RuleOptions", () => {
    const state = setupGame(ids(4), 1, { cardCounts: { bang: 35 } });
    const dealtTotal = state.players.reduce((sum, p) => sum + p.hand.length + p.equipment.length, 0);
    expect(dealtTotal + state.deck.length).toBe(90); // 80 + 10 lá bang thêm
  });

  describe("dealCharacterCards (cơ chế phát 2 lá nhân vật, chọn giữ 1)", () => {
    it("phát đúng 2 lá KHÔNG TRÙNG cho mỗi người, lấy từ registry CHARACTERS", () => {
      const state = setupGame(ids(5), 3, { dealCharacterCards: true });

      expect(state.characterSelection).not.toBeNull();
      expect(state.characterSelection).toHaveLength(5);

      const allDealt = state.characterSelection!.flatMap((c) => c.options);
      expect(new Set(allDealt).size).toBe(allDealt.length); // không ai trùng lá với ai
      for (const characterId of allDealt) {
        expect(CHARACTERS[characterId]).toBeDefined();
      }
      for (const choice of state.characterSelection!) {
        expect(choice.chosen).toBeNull();
      }
    });

    it("chưa biết máu/bài tay lúc còn chờ chọn — hp/hand tạm 0/rỗng, bộ bài CHÍNH chưa bị đụng tới", () => {
      const state = setupGame(ids(4), 3, { dealCharacterCards: true });

      for (const player of state.players) {
        expect(player.hp).toBe(0);
        expect(player.maxHp).toBe(0);
        expect(player.hand).toEqual([]);
        expect(player.equipment).toEqual([]);
        expect(player.characterId).toBeNull();
      }
      expect(state.deck.length).toBe(80); // đủ 80 lá, chưa ai rút gì
      expect(state.pending).toEqual([]);
    });

    it("characterAssignments được ưu tiên hơn — có cả 2 thì dealCharacterCards bị bỏ qua", () => {
      const state = setupGame(ids(4), 3, {
        dealCharacterCards: true,
        characterAssignments: { p1: "el_gringo" },
      });

      expect(state.characterSelection).toBeNull();
      expect(state.players[0].characterId).toBe("el_gringo");
    });

    it("cùng seed luôn cho ra cùng kết quả (2 lá nhân vật của từng người)", () => {
      const a = setupGame(ids(6), 11, { dealCharacterCards: true });
      const b = setupGame(ids(6), 11, { dealCharacterCards: true });
      expect(a).toEqual(b);
    });
  });

  describe("biến thể 2 người (không chia vai)", () => {
    it("cả 2 người đều role: null, không ai là Sheriff", () => {
      const state = setupGame(ids(2), 1);

      expect(state.players).toHaveLength(2);
      for (const player of state.players) {
        expect(player.role).toBeNull();
      }
    });

    it("cả 2 đều 4 máu (không ai được +1 Sheriff vì không có Sheriff)", () => {
      const state = setupGame(ids(2), 1);

      for (const player of state.players) {
        expect(player.hp).toBe(4);
        expect(player.maxHp).toBe(4);
      }
    });

    it("người đầu tiên trong danh sách đi lượt đầu (không có Sheriff để xác định)", () => {
      const state = setupGame(ids(2), 1);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.players[0].id).toBe("p1");
    });

    it("vẫn chia đủ bài tay theo máu, không ai trùng lá, và qua được Bước 0 đầu lượt", () => {
      const state = setupGame(ids(2), 1);

      for (const player of state.players) {
        expect(player.hand.length + player.equipment.length).toBe(player.hp);
      }
      const allHandCards = state.players.flatMap((p) => p.hand);
      expect(new Set(allHandCards).size).toBe(allHandCards.length);
      expect(state.turnPhase).toBe("draw");
      expect(state.winner).toBeNull();
    });

    it("cùng seed luôn cho ra cùng kết quả", () => {
      const a = setupGame(ids(2), 5);
      const b = setupGame(ids(2), 5);
      expect(a).toEqual(b);
    });
  });

  describe("biến thể 3 người (vòng tròn săn đuổi công khai)", () => {
    it("chia đúng đủ 3 vai police/criminal/traitor, mỗi vai đúng 1 người", () => {
      const state = setupGame(ids(3), 1);
      const roles = state.players.map((p) => p.role).sort();
      expect(roles).toEqual(["criminal", "police", "traitor"]);
    });

    it("không ai được +máu (không có Sheriff) — đều 4 máu mặc định", () => {
      const state = setupGame(ids(3), 1);
      for (const player of state.players) {
        expect(player.hp).toBe(4);
        expect(player.maxHp).toBe(4);
      }
    });

    it("người đầu tiên trong danh sách đi lượt đầu (không có Sheriff để xác định)", () => {
      const state = setupGame(ids(3), 1);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.players[0].id).toBe("p1");
    });

    it("vẫn chia đủ bài tay theo máu, không ai trùng lá, và qua được Bước 0 đầu lượt", () => {
      const state = setupGame(ids(3), 1);

      for (const player of state.players) {
        expect(player.hand.length + player.equipment.length).toBe(player.hp);
      }
      const allHandCards = state.players.flatMap((p) => p.hand);
      expect(new Set(allHandCards).size).toBe(allHandCards.length);
      expect(state.turnPhase).toBe("draw");
      expect(state.winner).toBeNull();
    });

    it("cùng seed luôn cho ra cùng kết quả", () => {
      const a = setupGame(ids(3), 5);
      const b = setupGame(ids(3), 5);
      expect(a).toEqual(b);
    });
  });

  // Mở rộng Dodge City — options.expansions: ["dodge_city"] (xem
  // EXPANSION_CARD_COUNTS ở cards.ts) phải cộng thêm đúng số lá Dodge City vào
  // bộ bài khi bật, KHÔNG đổi gì khi tắt (mặc định).
  describe("bộ mở rộng 'dodge_city'", () => {
    function totalCardsByName(state: ReturnType<typeof setupGame>, name: string): number {
      const inDeck = state.deck.filter((id) => id.startsWith(`${name}_`)).length;
      const inHands = state.players.reduce(
        (sum, p) => sum + p.hand.filter((id) => id.startsWith(`${name}_`)).length,
        0
      );
      return inDeck + inHands;
    }

    it("TẮT (mặc định): không có lá Dodge City nào trong bộ bài", () => {
      const state = setupGame(ids(4), 1);
      expect(totalCardsByName(state, "bible")).toBe(0);
      expect(totalCardsByName(state, "iron_plate")).toBe(0);
    });

    it("BẬT: cộng đủ 40/40 lá Dodge City (đợt 1 + đợt 2) vào bộ bài — 80 lá gốc + 39 lá cộng thêm = 119 lá tổng", () => {
      const state = setupGame(ids(4), 1, { expansions: ["dodge_city"] });
      // Đợt 1.
      expect(totalCardsByName(state, "bible")).toBe(1);
      expect(totalCardsByName(state, "sombrero")).toBe(1);
      expect(totalCardsByName(state, "ten_gallon_hat")).toBe(1);
      expect(totalCardsByName(state, "iron_plate")).toBe(2);
      expect(totalCardsByName(state, "canteen")).toBe(1);
      expect(totalCardsByName(state, "pony_express")).toBe(1);
      // Đợt 2 — lá xanh thêm bản sao thứ 2 + 2 tên hoàn toàn mới.
      expect(totalCardsByName(state, "barrel")).toBe(3);
      expect(totalCardsByName(state, "dynamite")).toBe(2);
      expect(totalCardsByName(state, "remington")).toBe(2);
      expect(totalCardsByName(state, "rev_carabine")).toBe(2);
      expect(totalCardsByName(state, "binocular")).toBe(1);
      expect(totalCardsByName(state, "hideout")).toBe(1);
      // Đợt 2 — lá nâu trùng bộ cơ bản thêm số lượng Dodge City.
      expect(totalCardsByName(state, "bang")).toBe(29);
      expect(totalCardsByName(state, "beer")).toBe(8);
      expect(totalCardsByName(state, "missed")).toBe(13);
      expect(totalCardsByName(state, "cat_balou")).toBe(5);
      expect(totalCardsByName(state, "general_store")).toBe(3);
      expect(totalCardsByName(state, "indians")).toBe(3);
      expect(totalCardsByName(state, "panic")).toBe(5);
      // Đợt 2 — lá nâu hoàn toàn mới.
      expect(totalCardsByName(state, "brawl")).toBe(1);
      expect(totalCardsByName(state, "dodge")).toBe(2);
      expect(totalCardsByName(state, "punch")).toBe(1);
      expect(totalCardsByName(state, "rag_time")).toBe(1);
      expect(totalCardsByName(state, "springfield")).toBe(1);
      expect(totalCardsByName(state, "tequila")).toBe(1);
      expect(totalCardsByName(state, "whisky")).toBe(1);
      // Đợt 2 — 7 lá vàng còn lại.
      expect(totalCardsByName(state, "derringer")).toBe(1);
      expect(totalCardsByName(state, "conestoga")).toBe(1);
      expect(totalCardsByName(state, "can_can")).toBe(1);
      expect(totalCardsByName(state, "buffalo_rifle")).toBe(1);
      expect(totalCardsByName(state, "knife")).toBe(1);
      expect(totalCardsByName(state, "pepperbox")).toBe(1);
      expect(totalCardsByName(state, "howitzer")).toBe(1);

      // Đếm cả equipment — Dynamite tự xuống sân ngay lúc chia (equipment.ts's
      // giveCardToPlayer()), không nằm trong hand như bài thường.
      const dealt = state.players.reduce((sum, p) => sum + p.hand.length + p.equipment.length, 0);
      expect(state.deck.length + dealt).toBe(119);
    });
  });

  // Mở rộng Dodge City, bổ sung theo yêu cầu chủ dự án — bộ mở rộng KHÔNG
  // được tính vào bộ nhân vật đưa ra phát 2-lá-chọn-1 (dealCharacterCards) trừ
  // khi chủ phòng tick đúng bộ đó, y hệt cách nó hoạt động với bộ bài ở trên.
  describe("bộ mở rộng 'dodge_city' — lọc bộ nhân vật khi dealCharacterCards bật", () => {
    it("TẮT (mặc định): không bao giờ ra 1 trong 15 nhân vật Dodge City", () => {
      // 6 người x 20 ván khác seed — đủ nhiều lần bốc để bắt được lỗi nếu vô
      // tình lọt 1 nhân vật Dodge City vào bộ bốc.
      for (let seed = 1; seed <= 20; seed++) {
        const state = setupGame(ids(6), seed, { dealCharacterCards: true });
        const dealt = state.characterSelection!.flatMap((c) => c.options);
        for (const characterId of dealt) {
          expect(EXPANSION_CHARACTER_IDS.dodge_city).not.toContain(characterId);
        }
      }
    });

    it("BẬT: đủ 31 nhân vật (16 gốc + 15 Dodge City) trong bộ bốc", () => {
      // 8 người x 2 lá = 16 lá — đúng bằng số nhân vật gốc, nên PHẢI có ít
      // nhất 1 nhân vật Dodge City lọt vào nếu bộ bốc đã gộp đủ 31 nhân vật
      // (bốc KHÔNG lặp lại — xem shuffle() ở rng.ts).
      const state = setupGame(ids(8), 1, { dealCharacterCards: true, expansions: ["dodge_city"] });
      const dealt = state.characterSelection!.flatMap((c) => c.options);
      expect(dealt).toHaveLength(16);
      expect(new Set(dealt).size).toBe(16); // không trùng lá nào
      expect(dealt.some((characterId) => EXPANSION_CHARACTER_IDS.dodge_city.includes(characterId))).toBe(true);
    });
  });
});
