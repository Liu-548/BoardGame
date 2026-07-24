import { describe, expect, it } from "vitest";
import { nextRandom, shuffle } from "../src/core/rng";

describe("nextRandom", () => {
  it("cùng state đầu vào luôn cho ra cùng kết quả", () => {
    const a = nextRandom(42);
    const b = nextRandom(42);
    expect(a).toEqual(b);
  });

  it("state khác nhau thường cho kết quả khác nhau", () => {
    const a = nextRandom(1);
    const b = nextRandom(2);
    expect(a.value).not.toBe(b.value);
  });

  it("value luôn nằm trong [0, 1)", () => {
    let state = 123;
    for (let i = 0; i < 100; i++) {
      const { value, nextState } = nextRandom(state);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      state = nextState;
    }
  });

  it("gọi liên tiếp không lặp lại cùng 1 giá trị ngay lập tức", () => {
    const first = nextRandom(7);
    const second = nextRandom(first.nextState);
    expect(second.value).not.toBe(first.value);
  });
});

describe("shuffle", () => {
  const deck = [1, 2, 3, 4, 5, 6, 7, 8];

  it("cùng seed cho ra cùng thứ tự, 100% lần", () => {
    const a = shuffle(deck, 99);
    const b = shuffle(deck, 99);
    expect(a.result).toEqual(b.result);
    expect(a.nextState).toBe(b.nextState);
  });

  it("không sửa mảng gốc truyền vào", () => {
    const original = [...deck];
    shuffle(deck, 99);
    expect(deck).toEqual(original);
  });

  it("kết quả xáo vẫn đủ và đúng các phần tử ban đầu", () => {
    const { result } = shuffle(deck, 99);
    expect(result.length).toBe(deck.length);
    expect([...result].sort()).toEqual([...deck].sort());
  });

  it("seed khác nhau thường cho thứ tự khác nhau", () => {
    const a = shuffle(deck, 1);
    const b = shuffle(deck, 2);
    expect(a.result).not.toEqual(b.result);
  });
});
