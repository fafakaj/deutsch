// Steps: theory, Anki cards, practice checklist, word decks of the trainer, listening.
import { esc, md } from "../md.js";
import { data, isDone, logEvent, markDone, markUndone, progress, scheduleSave, stepState } from "../store.js";
import { sourceCard } from "./common.js";
import { renderQuiz } from "./quiz.js";
import { ankiToday, runSession } from "./review.js";

function doneBar(step, label = "Отметить как сделано") {
  return isDone(step.id)
    ? `<div class="done-bar ok">Сделано <button class="link-btn" data-act="undo">отменить</button></div>`
    : `<div class="done-bar"><button class="btn primary" data-act="done">${label}</button></div>`;
}

function bindDone(root, step, onDone, rerender) {
  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "done") {
      markDone(step.id);
      onDone?.();
      rerender();
    }
    if (act === "undo") {
      markUndone(step.id);
      rerender();
    }
  });
}

export function renderTheory(root, step, ctx) {
  const st = stepState(step.id);
  const draw = () => {
    const opened = st.opened || isDone(step.id);
    root.innerHTML = `<div class="card theory">
        ${step.intro ? `<div class="md">${md(step.intro)}</div>` : ""}
        ${sourceCard(step.source, { big: true })}
        ${step.alt?.length ? `<details class="alt"><summary>Другие источники</summary>${step.alt.map((s) => sourceCard(s)).join("")}</details>` : ""}
        ${step.do ? `<div class="md do">${md(step.do)}</div>` : ""}
        ${opened ? doneBar(step, "Прочитал") : `<div class="done-bar"><span class="muted small">Сначала откройте источник</span><button class="btn primary" disabled>Прочитал</button></div>`}
      </div>`;
  };
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-source]") && !st.opened) {
      st.opened = new Date().toISOString();
      logEvent("open", step.id);
      setTimeout(draw, 300);
    }
  });
  bindDone(root, step, ctx.onDone, draw);
  draw();
}

/**
 * Anki inside the site: due cards, then new cards of the topics already reached, in plan order.
 * Answers go to the shared review boxes, so the cards come back in "Повторение" on their own.
 */
export function renderAnki(root, step, ctx) {
  root.innerHTML = '<div class="card anki-step" data-anki></div>';
  const box = root.querySelector("[data-anki]");
  const start = (extra = 0) => {
    const t = ankiToday(step.id);
    const fresh = extra ? t.fresh.slice(0, t.newToday.length + extra) : t.newToday;
    runSession(box, [...t.due, ...fresh], {
      onFinish: (right, total) => {
        if (!isDone(step.id)) {
          markDone(step.id);
          ctx.onDone?.();
        }
        draw(`Готово: ${right} из ${total} с первого раза.`);
      },
    });
  };
  const draw = (summary = "") => {
    box.onclick = null;
    const t = ankiToday(step.id);
    const queue = t.due.length + t.newToday.length;
    const more = t.fresh.length > t.newToday.length;
    box.innerHTML = `
      ${step.intro ? `<div class="md">${md(step.intro)}</div>` : ""}
      ${summary ? `<div class="callout ok">${esc(summary)}</div>` : ""}
      <div class="anki-stats">
        <div><b>${t.due.length}</b><span>к повторению</span></div>
        <div><b>${t.newToday.length}</b><span>новых сегодня</span></div>
        <div><b>${t.met} из ${t.total}</b><span>изучено по пройденным темам</span></div>
      </div>
      <div class="review-actions">
        ${queue ? `<button class="btn primary big" data-anki-start>Начать (${queue})</button>` : ""}
        ${more ? `<button class="btn ${queue ? "ghost" : ""}" data-anki-more>Ещё 10 новых</button>` : ""}
      </div>
      ${queue ? "" : `<p class="muted">${more ? "Лимит новых карточек на сегодня исчерпан." : "На сегодня карточек нет."}</p>`}
      <p class="muted small">Карточки повторяются прямо здесь, приложение Anki не нужно. Ответы попадают в общее «Повторение»: карточки вернутся сами по расписанию. Клавиши: пробел — ответ, 1–3 — оценка.</p>
      ${!queue || isDone(step.id) ? doneBar(step, "Повторил") : ""}`;
  };
  box.addEventListener("click", (e) => {
    if (e.target.closest("[data-anki-start]")) start();
    if (e.target.closest("[data-anki-more]")) start(10);
  });
  bindDone(root, step, ctx.onDone, () => draw());
  draw();
}

export function renderPractice(root, step, ctx) {
  // The model answer opens once the student has written their own: comparing comes after trying.
  const sampleHTML = (i, open) => open
    ? `<details class="alt sample" data-sample><summary>Образец</summary><div class="md">${md(step.items[i].sample)}</div></details>`
    : `<div class="muted small" data-sample>Образец откроется, когда напишете ответ.</div>`;
  const checks = (progress.checklist[step.id] ||= {});
  const draw = () => {
    const items = step.items.map((it, i) => {
      const c = checks[i];
      const note = it.write ? progress.notes[`${step.id}:${i}`] || "" : "";
      return `<li class="check-item ${c?.ok ? "ok" : ""}">
          <label><input type="checkbox" data-i="${i}" ${c?.ok ? "checked" : ""} ${it.write ? "disabled" : ""}> <span class="md">${md(it.text)}</span></label>
          ${it.write ? `<textarea class="answer note-input" rows="${it.rows || 5}" data-note="${i}" placeholder="Пишите здесь — текст сохраняется сам">${esc(note)}</textarea>` : ""}
          ${it.source ? sourceCard(it.source) : ""}
          ${it.sample ? sampleHTML(i, c?.ok) : ""}</li>`;
    });
    const allOk = step.items.every((_, i) => checks[i]?.ok);
    root.innerHTML = `<div class="card practice">
        ${step.intro ? `<div class="md">${md(step.intro)}</div>` : ""}
        <ol class="checklist">${items.join("")}</ol>
        ${isDone(step.id) ? doneBar(step) : allOk ? doneBar(step, "Готово") : `<div class="done-bar"><span class="muted small">Отметьте все пункты</span><button class="btn primary" disabled>Готово</button></div>`}
      </div>`;
  };
  // Written notes: saved on every keystroke; the item counts as done once the answer has some substance.
  root.addEventListener("input", (e) => {
    const i = e.target.dataset.note;
    if (i === undefined) return;
    const text = e.target.value;
    progress.notes[`${step.id}:${i}`] = text;
    const ok = text.trim().length >= 20;
    if (!!checks[i]?.ok !== ok) {
      checks[i] = { ok, at: new Date().toISOString() };
      const li = e.target.closest("li");
      li.classList.toggle("ok", ok);
      li.querySelector("input[type=checkbox]").checked = ok;
      const sample = li.querySelector("[data-sample]");
      if (sample) sample.outerHTML = sampleHTML(+i, ok);
      const allOk = step.items.every((_, k) => checks[k]?.ok);
      const bar = root.querySelector(".done-bar");
      if (!isDone(step.id)) bar.outerHTML = allOk ? doneBar(step, "Готово") : bar.outerHTML;
    }
    scheduleSave();
  });
  root.addEventListener("change", (e) => {
    const i = e.target.dataset.i;
    if (i === undefined) return;
    checks[i] = { ok: e.target.checked, at: new Date().toISOString() };
    scheduleSave();
    draw();
  });
  bindDone(root, step, ctx.onDone, draw);
  draw();
}

/** Words of a day: the list, the trainer's score for this deck and the button that opens it. */
export function renderWords(root, step, ctx) {
  const deck = data.words.decks.find((d) => d.id === step.deck);
  if (!deck) {
    root.innerHTML = `<div class="card">Колода ${esc(step.deck)} не найдена.</div>`;
    return;
  }
  const url = `words/#deck=${encodeURIComponent(deck.id)}&step=${encodeURIComponent(step.id)}`;
  const full = new URL(url, location.href).href;
  const draw = () => {
    const rows = deck.words
      .map((w) => `<tr><td class="w-emoji">${esc(w.emoji || "")}</td><td lang="de">${w.article ? `<span class="art art-${w.article}">${w.article}</span> ` : ""}<b>${esc(w.de)}</b>${w.plural ? `<span class="muted small"> · ${esc(w.plural)}</span>` : ""}</td><td>${esc(w.ru)}</td></tr>`)
      .join("");
    root.innerHTML = `<div class="card words-step">
        ${step.intro ? `<div class="md">${md(step.intro)}</div>` : ""}
        <div class="words-head"><span class="words-icon">${esc(deck.icon || "")}</span>
          <div><b>${esc(deck.title)}</b><div class="muted small">${deck.words.length} слов · тест колоды на 80 % засчитывает шаг</div></div></div>
        <div class="review-actions">
          <a class="btn primary big" href="${url}">Открыть в тренажёре</a>
          <button class="btn ghost" data-copy title="${esc(full)}">Ссылка для телефона</button>
        </div>
        <p class="muted small">Тренажёр сделан для телефона. Войдите там под тем же логином — прогресс общий.</p>
        <details class="alt" open><summary>Слова колоды</summary><table class="words-table">${rows}</table></details>
        ${isDone(step.id) ? doneBar(step) : ""}
      </div>`;
  };
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    try {
      await navigator.clipboard.writeText(full);
      b.textContent = "Скопировано";
    } catch {
      prompt("Ссылка на колоду:", full);
    }
  });
  bindDone(root, step, ctx.onDone, draw);
  draw();
}

/** Listening: a video or audio source, then questions about it. */
export function renderListen(root, step, ctx) {
  root.innerHTML = `<div class="card listen">
      ${step.intro ? `<div class="md">${md(step.intro)}</div>` : ""}
      ${sourceCard(step.source, { big: true })}
      <p class="muted small">Смотрите без субтитров. Если поняли меньше половины — включите немецкие субтитры и посмотрите ещё раз.</p>
    </div><div data-listen-quiz></div>`;
  renderQuiz(root.querySelector("[data-listen-quiz]"), step, ctx);
}
