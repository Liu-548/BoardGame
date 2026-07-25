// Việc 3.1: Worker "hello world" — bước đầu tiên của Giai đoạn 3 (mạng).
// Chỉ cần trả lời được request để xác nhận Worker chạy trên Cloudflare.
// Chưa có Durable Object (việc 3.2), chưa có WebSocket (việc 3.3), chưa định
// tuyến theo mã phòng (việc 3.4) — cố tình để trống, thêm dần từng việc một.

export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response("Bang! server đang chạy.");
  },
};
