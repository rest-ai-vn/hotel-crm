// Bộ dịch DOM runtime cho trang admin (VI → EN).
// Cách hoạt động: khi lang = "en", duyệt toàn bộ text node + một số attribute,
// tra ADMIN_DICT (khớp nguyên chuỗi đã trim) hoặc ADMIN_TEMPLATE_RULES (chuỗi động).
// React re-render sẽ ghi lại text tiếng Việt — MutationObserver dịch lại ngay.
// Đổi ngôn ngữ thực hiện bằng reload trang (đơn giản và không phải khôi phục DOM).
import { ADMIN_DICT, ADMIN_TEMPLATE_RULES } from "./i18n-admin-dict";

const LANG_KEY = "hotel_crm_lang";
const ATTRS = ["placeholder", "title", "aria-label"] as const;

export type AdminLang = "vi" | "en";

export function getAdminLang(): AdminLang {
  return typeof localStorage !== "undefined" && localStorage.getItem(LANG_KEY) === "en"
    ? "en"
    : "vi";
}

export function setAdminLang(lang: AdminLang): void {
  localStorage.setItem(LANG_KEY, lang);
  // Reload để áp/tháo bộ dịch trên toàn trang — tránh phải khôi phục từng node.
  window.location.reload();
}

function translateString(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const exact = ADMIN_DICT[trimmed];
  if (exact !== undefined) return s.replace(trimmed, exact);
  for (const [re, tpl] of ADMIN_TEMPLATE_RULES) {
    if (re.test(trimmed)) return s.replace(trimmed, trimmed.replace(re, tpl));
  }
  return null;
}

function translateTextNode(node: Text): void {
  const out = translateString(node.data);
  if (out !== null && out !== node.data) node.data = out;
}

function translateElement(el: Element): void {
  for (const attr of ATTRS) {
    const v = el.getAttribute(attr);
    if (v) {
      const out = translateString(v);
      if (out !== null && out !== v) el.setAttribute(attr, out);
    }
  }
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) translateElement(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = walker.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) translateTextNode(n as Text);
    else translateElement(n as Element);
    n = walker.nextNode();
  }
}

let observer: MutationObserver | null = null;

/** Gọi một lần khi app admin mount. Không làm gì nếu lang = vi. */
export function initAdminTranslation(): void {
  if (getAdminLang() !== "en" || observer) return;
  document.documentElement.lang = "en";
  walk(document.body);
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
        translateTextNode(m.target as Text);
      } else if (m.type === "childList") {
        m.addedNodes.forEach((n) => walk(n));
      } else if (m.type === "attributes" && m.target.nodeType === Node.ELEMENT_NODE) {
        translateElement(m.target as Element);
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
}
