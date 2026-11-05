// Thẻ vai: ảnh đúng vai, mỗi người 1 ảnh cố định.
import { describe, expect, it } from "vitest";
import { imagesByRole, pickImage } from "../../src/games/werewolf/client/cards";

describe("Ảnh thẻ vai", () => {
  it("chia ảnh theo thư mục vai, bỏ thư mục lạ", () => {
    const files = {
      "../assets/roles/wolf/b.webp": "/b",
      "../assets/roles/wolf/a.webp": "/a",
      "../assets/roles/seer/x.png": "/x",
      "../assets/roles/khac/y.png": "/y",
    };
    expect(imagesByRole(files)).toEqual({ wolf: ["/a", "/b"], seer: ["/x"] });
  });
  it("cùng mã người chơi luôn ra cùng ảnh; không có ảnh → null", () => {
    const list = ["/1", "/2", "/3", "/4"];
    const first = pickImage(list, "player-abc");
    for (let i = 0; i < 5; i++) expect(pickImage(list, "player-abc")).toBe(first);
    expect(list).toContain(first);
    expect(new Set(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map((k) => pickImage(list, k))).size).toBeGreaterThan(1);
    expect(pickImage(undefined, "x")).toBeNull();
    expect(pickImage([], "x")).toBeNull();
  });
});
