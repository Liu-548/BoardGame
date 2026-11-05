// Link sang bản Beta / về bản chính — Sảnh (src/main.ts) và màn "Chọn cách chơi" của Bang! cùng dùng.

// Bản Beta song song (docs/roadmap/LO-TRINH.md) — 2 domain deploy thật cố định, KHÔNG suy
// ra từ location (khác roomWebSocketUrl() ở bang/client/main.ts, chỗ đó cần theo ĐÚNG domain
// đang chạy để WebSocket nối đúng server; ở đây ngược lại, luôn phải trỏ SANG
// domain KIA). Đang ở bản beta thì hiện link "Về bản chính"; mọi domain khác
// (bản chính, hay chạy cục bộ qua `vite dev`) đều hiện link "Bản Beta".
const MAIN_SITE_URL = "https://bang-boardgame.nguyenngoctuan548.workers.dev/";
const BETA_SITE_URL = "https://bang-boardgame-beta.nguyenngoctuan548.workers.dev/";
const BETA_HOSTNAME = "bang-boardgame-beta.nguyenngoctuan548.workers.dev";

export function betaLinkInfo(): { label: string; href: string } {
  if (location.hostname === BETA_HOSTNAME) {
    return { label: "Về bản chính", href: MAIN_SITE_URL };
  }
  return { label: "Bản Beta (thử nghiệm)", href: BETA_SITE_URL };
}
