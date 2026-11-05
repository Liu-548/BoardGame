import { describe, expect, it } from "vitest";
import { decideJoin, normalizeName, pickOwner, viewHash } from "../../src/shared/room/logic";
import type { Seat } from "../../src/shared/room/logic";

const seat = (name: string, token = "t1", id = name): Seat => ({ playerId: id, name, token, waiting: false });
const none = new Set<string>();

describe("T-ROOM", () => {
  it("T-R-01 normalizeName", () => {
    const k = (s: string) => (normalizeName(s) as { key: string }).key;
    expect(k(" An ")).toBe(k("an"));
    expect(k("AN")).toBe(k("an"));
    expect(k("é")).toBe(k("é")); // é tổ hợp = dựng sẵn
    expect(normalizeName("   ").ok).toBe(false);
    expect(normalizeName("a".repeat(21)).ok).toBe(false);
    expect(normalizeName("a".repeat(20)).ok).toBe(true);
  });
  it("T-R-02 cùng tên + cùng token → reclaim", () => {
    expect(decideJoin([seat("An")], none, true, "an", "t1", 12)).toEqual({ kind: "reclaim", playerId: "An" });
  });
  it("T-R-03 khác token, đang kết nối → reject", () => {
    expect(decideJoin([seat("An")], new Set(["An"]), false, "An", "x", 12).kind).toBe("reject");
  });
  it("T-R-04 khác token, mất kết nối → takeover", () => {
    expect(decideJoin([seat("An")], none, true, "An", "x", 12)).toEqual({ kind: "takeover", playerId: "An" });
  });
  it("T-R-05 tên mới: phòng chờ → new_seat; đầy → reject", () => {
    expect(decideJoin([seat("An")], none, false, "Bình", "t", 12).kind).toBe("new_seat");
    expect(decideJoin([seat("An"), seat("B")], none, false, "C", "t", 2).kind).toBe("reject");
  });
  it("T-R-06 tên mới giữa ván → wait_next_game", () => {
    expect(decideJoin([seat("An")], none, true, "Bình", "t", 2).kind).toBe("wait_next_game");
  });
  it("tên không hợp lệ → reject", () => {
    expect(decideJoin([], none, false, "", "t", 12).kind).toBe("reject");
  });
  it("T-R-07 viewHash", () => {
    expect(viewHash({ a: 1, b: [2] })).toBe(viewHash({ a: 1, b: [2] }));
    expect(viewHash({ a: 1 })).not.toBe(viewHash({ a: 2 }));
  });
  it("T-R-08 pickOwner", () => {
    expect(pickOwner(["a", "b", "c"], new Set(["a", "b"]))).toBe("a");
    expect(pickOwner(["a", "b", "c"], new Set(["b", "c"]))).toBe("b");
    expect(pickOwner(["a"], none)).toBeNull();
  });
});
