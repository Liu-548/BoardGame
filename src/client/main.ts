// Việc 2.1: bài tập DOM cơ bản — lấy 2 phần tử HTML ra bằng id, lắng nghe sự
// kiện click trên nút, rồi đổi nội dung chữ (textContent) khi bấm.

const thongBao = document.getElementById("thong-bao") as HTMLParagraphElement;
const nutThu = document.getElementById("nut-thu") as HTMLButtonElement;

let soLanBam = 0;

nutThu.addEventListener("click", () => {
  soLanBam += 1;
  thongBao.textContent = `Đã bấm ${soLanBam} lần.`;
});
