// Việc 3.1: Worker "hello world". Việc 3.2: chuyển request sang Durable
// Object (Room), có WebSocket + Hibernation (việc 3.3).
//
// Việc 3.4: định tuyến theo mã phòng — đường dẫn `/room/<mã>`. `env.ROOM.
// idFromName(code)` LUÔN trả về cùng 1 ID cho cùng 1 chuỗi `code`, nên "cùng
// mã → cùng Room" tự động đúng, không cần tự lưu bảng ánh xạ mã→instance ở
// đâu cả. Chưa có màn hình lobby để tự sinh mã (việc 3.9) — tạm thời ai gõ mã
// gì trên URL thì vào đúng phòng đó, kể cả mã tự bịa.

import { Room } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/([^/]+)\/?$/);

    if (!match) {
      return new Response("Thiếu mã phòng trong đường dẫn — dùng /room/<mã phòng>", { status: 404 });
    }

    const roomCode = match[1];
    const id = env.ROOM.idFromName(roomCode);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  },
};

export { Room };
