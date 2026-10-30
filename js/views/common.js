import { icon } from "../icons.js";
import { esc, md } from "../md.js";

export function sourceCard(src, { big = false } = {}) {
  if (!src) return "";
  return `<a class="source ${big ? "big" : ""}" href="${esc(src.url)}" target="_blank" rel="noopener" data-source>
      ${big ? `<span class="source-ico">${icon("book")}</span>` : ""}
      <span class="source-text"><span class="source-title">${esc(src.title)}${src.lang === "en" ? ' <span class="tag lang-en">EN</span>' : ""}${src.translated ? ` <span class="tag tr">${esc(src.translated)}</span>` : ""}</span>
      ${src.section ? `<span class="source-section">${esc(src.section)}</span>` : ""}</span>
      ${icon("external", "source-go")}
    </a>`;
}

export function goalsList(goals) {
  if (!goals?.length) return "";
  return `<ul class="goals">${goals.map((g) => `<li>${md(g)}</li>`).join("")}</ul>`;
}
