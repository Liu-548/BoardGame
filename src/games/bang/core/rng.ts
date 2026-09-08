// Bộ sinh số ngẫu nhiên có seed. Mọi hàm ở đây đều THUẦN: không dùng biến đóng
// gói (closure) tự thay đổi, không side effect. Trạng thái là 1 số nguyên duy
// nhất (giống rngState trong GameState) — người gọi tự lưu `nextState` để dùng
// cho lần gọi sau. Cùng state đầu vào luôn cho ra cùng kết quả.

export interface RandomResult {
  value: number; // số thực trong [0, 1), giống Math.random() nhưng có seed
  nextState: number; // trạng thái mới, lưu lại để dùng cho lần gọi tiếp theo
}

// Thuật toán mulberry32: đơn giản, nhanh, đủ tốt cho game bài (không cần chuẩn
// mật mã học).
export function nextRandom(state: number): RandomResult {
  const nextState = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(nextState ^ (nextState >>> 15), 1 | nextState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}

export interface ShuffleResult<T> {
  result: T[]; // mảng đã xáo, không phải mảng gốc
  nextState: number;
}

// Xáo mảng theo thuật toán Fisher-Yates, dùng nextRandom bên trong.
// Không sửa mảng truyền vào (trả về bản sao đã xáo).
export function shuffle<T>(array: T[], state: number): ShuffleResult<T> {
  const result = [...array];
  let currentState = state;

  for (let i = result.length - 1; i > 0; i--) {
    const { value, nextState } = nextRandom(currentState);
    currentState = nextState;
    const j = Math.floor(value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return { result, nextState: currentState };
}
