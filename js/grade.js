// One question: its input HTML, reading the answer back and checking it.
// Shared by step quizzes and the review mode.
import { esc, md } from "./md.js";

export const norm = (s) => String(s ?? "").replace(/\r/g, "").split("\n").map((l) => l.trimEnd()).join("\n").trim();
const num = (s) => Number(String(s).trim().replace(",", ".").replace("−", "-"));

export function questionBody(q, i, val = "") {
  switch (q.type) {
    case "output":
      return `<div class="q-text">${q.q ? md(q.q) : "Что выведет код?"}</div><pre class="code">${esc(q.code)}</pre>
        <textarea class="answer mono" rows="${Math.max(2, q.answer.split("\n").length)}" placeholder="Вывод" data-input>${esc(val)}</textarea>`;
    case "choice":
    case "multi":
      return `<div class="q-text">${md(q.q)}${q.type === "multi" ? ' <span class="muted small">(несколько)</span>' : ""}</div><div class="options">${q.options
        .map((o, k) => {
          const checked = Array.isArray(val) ? val.includes(k) : val === k;
          return `<label class="option"><input type="${q.type === "choice" ? "radio" : "checkbox"}" name="q${i}" value="${k}" ${checked ? "checked" : ""}> <span>${md(o)}</span></label>`;
        })
        .join("")}</div>`;
    case "expr":
      return `<div class="q-text">${md(q.q)}</div>
        <input class="answer mono" placeholder="${esc(q.vars.join(", "))}: например 2x^2 + exp(x)" value="${esc(val)}" data-input autocapitalize="off" autocomplete="off" spellcheck="false">`;
    case "number":
      return `<div class="q-text">${md(q.q)}</div><input class="answer mono short" inputmode="decimal" placeholder="число" value="${esc(val)}" data-input>`;
    case "vector":
      return `<div class="q-text">${md(q.q)}</div><div class="vector">${q.answer
        .map((_, k) => `<label>${esc(q.labels?.[k] ?? `#${k + 1}`)} <input class="answer mono short" inputmode="decimal" value="${esc(val?.[k] ?? "")}" data-k="${k}"></label>`)
        .join("")}</div>`;
    case "de":
      return `<div class="q-text">${md(q.q)}</div>
        <input class="answer de-input" lang="de" placeholder="Ответ по-немецки" value="${esc(val)}" data-input autocapitalize="off" autocomplete="off" spellcheck="false">
        <span class="umlauts">${["ä", "ö", "ü", "ß", "Ä", "Ö", "Ü"].map((c) => `<button type="button" class="btn small umlaut" data-umlaut="${c}" tabindex="-1">${c}</button>`).join("")}</span>`;
    case "text":
      return `<div class="q-text">${md(q.q)}</div>
        <textarea class="answer" rows="3" placeholder="Ваш ответ" data-input>${esc(val)}</textarea>`;
    default:
      return "";
  }
}

export function readValue(q, el) {
  if (q.type === "choice") {
    const c = el.querySelector("input:checked");
    return c ? +c.value : null;
  }
  if (q.type === "multi") return [...el.querySelectorAll("input:checked")].map((c) => +c.value);
  if (q.type === "vector") return [...el.querySelectorAll("[data-k]")].map((c) => c.value);
  return el.querySelector("[data-input]")?.value ?? "";
}

/** Accepted spellings of a "de" answer. */
export const deAnswers = (q) => (Array.isArray(q.answer) ? q.answer : [q.answer]);

/**
 * A German answer for comparison: case, outer spaces and final punctuation do not count, and
 * ae/oe/ue/ss are accepted for ä/ö/ü/ß (a laptop without a German layout).
 */
export function deNorm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "")
    .trim()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

/** Auto-check an answer. "text" questions are self-checked and never come here. */
export async function grade(q, value) {
  if (q.type === "output") return { ok: norm(value) === norm(q.answer) };
  if (q.type === "choice") return { ok: value === q.answer };
  if (q.type === "multi") return { ok: JSON.stringify([...value].sort()) === JSON.stringify([...q.answers].sort()) };
  if (q.type === "number") return { ok: Math.abs(num(value) - q.answer) <= (q.tol ?? 1e-6) * Math.max(1, Math.abs(q.answer)) };
  if (q.type === "vector") {
    const parsed = value.map((v) => {
      const m = String(v).trim().replace(",", ".").replace("−", "-").match(/^(-?[\d.]+)\s*\/\s*([\d.]+)$/);
      return m ? +m[1] / +m[2] : num(v);
    });
    return { ok: parsed.every((v, k) => Math.abs(v - q.answer[k]) <= (q.tol ?? 1e-6) * Math.max(1, Math.abs(q.answer[k]))) };
  }
  if (q.type === "de") {
    const got = deNorm(value);
    if (!got) return { ok: false, msg: "Введите ответ" };
    return { ok: deAnswers(q).some((a) => deNorm(a) === got) };
  }
  return { ok: false };
}
