// Việc 3.2: Durable Object đầu tiên — chỉ đếm số lần truy cập, để tập quen
// với ctx.storage. Số đếm lưu BỀN trong storage (không phải biến JS thường)
// nên không mất khi Worker khởi động lại hay deploy lại — storage sống độc
// lập với vòng đời instance class.
//
// Dùng chung tên "Room" cho lớp Durable Object luật chơi thật sau này (từ
// việc 3.4 trở đi mới có mã phòng riêng, 1 phòng = 1 instance) — hiện tại
// index.ts tạm cho MỌI request dùng chung đúng 1 instance để demo đếm lượt.

export class Room {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, _env: unknown) {
    this.ctx = ctx;
  }

  async fetch(_request: Request): Promise<Response> {
    const count = (await this.ctx.storage.get<number>("visitCount")) ?? 0;
    const nextCount = count + 1;
    await this.ctx.storage.put("visitCount", nextCount);

    return new Response(`Số lần truy cập: ${nextCount}`);
  }
}
