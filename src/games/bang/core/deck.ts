// Rút 1 lá từ đỉnh deck (phần tử cuối mảng) — MUTATE trực tiếp `next`, giống
// mọi hàm nội bộ khác trong core/ (xem ghi chú đầu reduce.ts). Hết deck thì
// xáo lại chồng bỏ làm deck mới bằng RNG có seed trong state. Nếu cả deck lẫn
// chồng bỏ đều rỗng (gần như không thể xảy ra ở ván bình thường) thì trả về
// undefined.
//
// Tách riêng khỏi reduce.ts (chuyển từ việc 1.6, vốn là hàm private ở đó) vì
// từ việc 5.2, core/characters.ts (Bart Cassidy/El Gringo rút bài khi mất
// máu) cũng cần dùng — để nguyên trong reduce.ts sẽ tạo VÒNG LẶP IMPORT
// (reduce.ts đã import getCharacterHooks từ characters.ts).
import { shuffle } from "./rng";
import type { GameState } from "./types";

export function drawTopCard(next: GameState): string | undefined {
  if (next.deck.length === 0) {
    if (next.discardPile.length === 0) return undefined;
    const { result, nextState } = shuffle(next.discardPile, next.rngState);
    next.deck = result;
    next.discardPile = [];
    next.rngState = nextState;
  }
  return next.deck.pop();
}
