import { describe, expect, it } from "vitest";
import { buildDeck, DECK, DEFAULT_CARD_COUNTS } from "../src/core/cards";

describe("bộ bài mặc định", () => {
  it("có đúng 80 lá", () => {
    expect(DECK.length).toBe(80);
  });

  it("id từng lá không trùng nhau", () => {
    const ids = DECK.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("đúng số lượng từng loại theo mặc định", () => {
    for (const [name, count] of Object.entries(DEFAULT_CARD_COUNTS)) {
      const actual = DECK.filter((card) => card.name === name).length;
      expect(actual).toBe(count);
    }
  });

  it("mỗi lá đều có suit và rank hợp lệ", () => {
    for (const card of DECK) {
      expect(card.suit).toBeTruthy();
      expect(card.rank).toBeTruthy();
    }
  });
});

describe("buildDeck với số lượng tuỳ chỉnh", () => {
  it("chỉ đổi các loại được truyền vào, loại khác giữ mặc định", () => {
    const custom = buildDeck({ bang: 35, missed: 17, jail: 5 });

    expect(custom.filter((c) => c.name === "bang").length).toBe(35);
    expect(custom.filter((c) => c.name === "missed").length).toBe(17);
    expect(custom.filter((c) => c.name === "jail").length).toBe(5);
    // loại không truyền vào (vd beer) vẫn giữ số lượng mặc định
    expect(custom.filter((c) => c.name === "beer").length).toBe(DEFAULT_CARD_COUNTS.beer);
  });

  it("tổng số lá thay đổi đúng theo phần chênh lệch đã tuỳ chỉnh", () => {
    const custom = buildDeck({ bang: 35, missed: 17, jail: 5 });
    // chênh lệch: bang +10, missed +5, jail +2 so với mặc định 80 lá
    expect(custom.length).toBe(80 + 10 + 5 + 2);
  });
});
