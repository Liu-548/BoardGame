// Thẻ vai: ảnh (assets/roles/<vai>/) + icon + tên vai. Vai chưa có ảnh → icon lớn làm ảnh tạm.
import type { Role } from "../core/types";
import { ALL_ROLES } from "../core/types";
import { ROLE_INFO, ROLE_LABEL } from "./turn";

const SPIN_STEPS = 12; // ~2,3 giây: 70ms, mỗi bước chậm hơn 17%

// Vite quét thư mục lúc build: bỏ ảnh vào assets/roles/<vai>/ là có, không cần sửa code.
// Quét mọi thư mục vai; imagesByRole() bỏ qua thư mục không đúng tên vai trong ALL_ROLES.
const FILES = import.meta.glob("../assets/roles/*/*.{webp,png,jpg,jpeg}", {
  eager: true,
  query: "?url",
  import: "default",
});

// "…/roles/wolf/a.webp" → { wolf: [url] }. Thư mục không đúng tên vai thì bỏ qua.
export function imagesByRole(files: Record<string, string>): Partial<Record<Role, string[]>> {
  const out: Partial<Record<Role, string[]>> = {};
  for (const path of Object.keys(files).sort()) {
    const role = path.split("/").at(-2) as Role;
    if (ALL_ROLES.includes(role)) (out[role] ??= []).push(files[path]);
  }
  return out;
}

const ROLE_IMAGES = imagesByRole(FILES);

// Cùng 1 key (mã người chơi) → luôn cùng 1 ảnh, trên mọi máy, suốt ván. Băm chuỗi, không ngẫu nhiên.
export function pickImage(list: string[] | undefined, key: string): string | null {
  if (!list || list.length === 0) return null;
  let h = 0;
  for (const ch of key) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return list[h % list.length];
}

function div(className: string, text?: string): HTMLDivElement {
  const e = document.createElement("div");
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// sm = chỉ ảnh (thẻ nhỏ trên ô người chơi); md/lg = ảnh + icon + tên.
export function roleCard(role: Role, key: string, size: "sm" | "md" | "lg"): HTMLElement {
  const card = div(`ww-rolecard ww-rolecard--${size} ww-rolecard--${ROLE_INFO[role].team}`);
  card.title = ROLE_LABEL[role];
  const art = div("ww-rolecard__art");
  const src = pickImage(ROLE_IMAGES[role], key);
  if (src) {
    // Ảnh meme hay nằm ngang có chữ → hiện TRỌN ảnh (contain), chỗ trống lót bằng chính ảnh đó làm mờ.
    for (const cls of ["ww-rolecard__bg", "ww-rolecard__img"]) {
      const img = document.createElement("img");
      img.className = cls;
      img.src = src;
      img.alt = "";
      img.draggable = false;
      art.appendChild(img);
    }
  } else {
    art.appendChild(div("ww-rolecard__icon", ROLE_LABEL[role].split(" ")[0])); // ảnh tạm: icon lớn
  }
  card.appendChild(art);
  if (size !== "sm") card.appendChild(div("ww-rolecard__name", ROLE_LABEL[role]));
  return card;
}

// Animation chia vai (pha "Xem vai", R-30a): lá quay qua các vai có trong ván (cấu hình công khai),
// chậm dần rồi lật ra vai của mình. Chạm: đang quay → lật ngay; đã lật → đóng. Trả hàm đóng.
export function playRoleReveal(
  host: HTMLElement,
  o: { myRole: Role; myKey: string; roles: Role[]; teammates: string[]; instant?: boolean },
): () => void {
  host.querySelector(".ww-reveal")?.remove(); // ván mới bắt đầu lại giữa chừng: không để 2 lớp chồng nhau
  const overlay = div("ww-reveal");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Chia vai");
  const title = div("ww-reveal__title", "🃏 Đang chia vai…");
  const slot = div("ww-reveal__slot");
  const caption = div("ww-reveal__caption");
  caption.setAttribute("aria-live", "polite");
  const hint = div("ww-reveal__hint", "Chạm để bỏ qua");
  for (const n of [title, slot, caption, hint]) overlay.appendChild(n);
  host.appendChild(overlay);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  const show = (role: Role, key: string) => slot.replaceChildren(roleCard(role, key, "lg"));
  const close = () => {
    clearTimeout(timer);
    overlay.remove();
  };
  const finish = () => {
    clearTimeout(timer);
    done = true;
    slot.classList.add("ww-reveal__slot--flip");
    show(o.myRole, o.myKey);
    title.textContent = "Vai của bạn";
    caption.textContent = o.teammates.length ? `🐺 Đồng đội: ${o.teammates.join(", ")}` : "";
    hint.textContent = "Chạm để đóng";
  };
  overlay.addEventListener("click", () => (done ? close() : finish()));

  const faces = o.roles.length ? o.roles : [o.myRole];
  if (o.instant || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    finish();
  } else {
    let i = 0;
    let delay = 70;
    const step = () => {
      if (i >= SPIN_STEPS) return finish();
      show(faces[i % faces.length], `spin-${i}`); // key khác nhau → vai có nhiều ảnh thì đổi ảnh khi quay
      i++;
      delay *= 1.17;
      timer = setTimeout(step, delay);
    };
    step();
  }
  return close;
}
