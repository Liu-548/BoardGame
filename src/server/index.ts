// Việc 3.1: Worker "hello world". Việc 3.2: chuyển request sang Durable
// Object (Room) — mỗi request đều dùng CHUNG đúng 1 Room (đặt tên cố định
// "demo"), số lần truy cập đếm và lưu bền trong Room đó. Chưa định tuyến
// theo mã phòng thật (mỗi mã 1 Room riêng) — đó là việc 3.4. Chưa có
// WebSocket (việc 3.3).

import { Room } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.ROOM.idFromName("demo");
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  },
};

export { Room };
