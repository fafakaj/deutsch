// Quiz: every question is checked automatically except "text", which the student
// compares with the model answer. The step is done when every question is correct.
import { esc, md } from "../md.js";
import { deAnswers, grade, questionBody, readValue } from "../grade.js";
import { data, isDone, logEvent, markDone, progress, scheduleSave } from "../store.js";

function questionHTML(q, i, saved) {
  const state = saved?.ok ? "ok" : saved?.tried ? "bad" : "";
  const val = saved?.value ?? "";
  const body = questionBody(q, i, val);
  const verdict = saved?.ok
    ? `<div class="q-verdict ok">Верно</div>`
    : saved?.tried ? `<div class="q-verdict bad">Неверно${saved.msg ? `: ${esc(saved.msg)}` : ""}</div>` : "";
  // After two misses the right answer is shown: guessing further teaches nothing.
  const answerLine = q.type === "de" && !saved?.ok && saved?.tried >= 2 ? `<div><b>Ответ:</b> ${esc(deAnswers(q)[0])}</div>` : "";
  const reveal = (saved?.ok || saved?.tried >= 2) && (q.explain || answerLine)
    ? `<div class="explain">${answerLine}${q.explain ? md(q.explain) : ""}</div>`
    : "";
  const textModel = q.type === "text" && saved?.revealed
    ? `<div class="explain"><b>Образец:</b> ${md(q.model ?? q.answer)}<div class="self">
        <button class="btn small" data-self="yes">Совпало</button> <button class="btn small ghost" data-self="no">Не совпало</button></div></div>`
    : "";
  const buttons = q.type === "text"
    ? (saved?.ok ? "" : `<button class="btn" data-check="${i}">Показать образец</button>`)
    : (saved?.ok ? "" : `<button class="btn" data-check="${i}">Проверить</button>`);
  return `<div class="question card ${state}" data-q="${i}">
      ${body}${verdict}${textModel}${reveal}
      <div class="q-actions">${buttons}</div></div>`;
}

export function renderQuiz(root, step, { onDone }) {
  const quiz = data.quizzes[step.quiz];
  if (!quiz) {
    root.innerHTML = `<div class="card">Квиз ${esc(step.quiz)} не найден.</div>`;
    return;
  }
  const saved = (progress.quiz[step.id] ||= {});

  const draw = () => {
    const okCount = quiz.questions.filter((_, i) => saved[i]?.ok).length;
    root.querySelector("[data-score]").textContent = `${okCount} из ${quiz.questions.length}`;
    root.querySelector("[data-bar]").style.width = `${(100 * okCount) / quiz.questions.length}%`;
    if (okCount === quiz.questions.length && !isDone(step.id)) {
      markDone(step.id, { questions: okCount });
      onDone?.();
    }
  };

  root.innerHTML = `<div class="quiz">
      <div class="quiz-head"><div class="muted small">${step.type === "oral" ? "Сначала ответьте вслух, потом сравните с образцом." : ""}</div>
      <div class="score"><span data-score></span><div class="bar"><div data-bar></div></div></div></div>
      <div data-questions>${quiz.questions.map((q, i) => questionHTML(q, i, saved[i])).join("")}</div></div>`;

  const redraw = (i) => {
    const old = root.querySelector(`[data-q="${i}"]`);
    const fresh = document.createElement("div");
    fresh.innerHTML = questionHTML(quiz.questions[i], i, saved[i]);
    old.replaceWith(fresh.firstElementChild);
    draw();
    scheduleSave();
  };

  async function check(i) {
    const q = quiz.questions[i];
    const el = root.querySelector(`[data-q="${i}"]`);
    const value = readValue(q, el);
    const s = (saved[i] ||= {});
    s.value = value;
    if (q.type === "text") {
      if (String(value).trim().length < 15) {
        s.tried = (s.tried || 0) + 1;
        s.msg = "напишите ответ хотя бы одним предложением";
        return redraw(i);
      }
      s.revealed = true;
      s.msg = "";
      return redraw(i);
    }
    const { ok, msg = "" } = await grade(q, value);
    s.ok = ok;
    s.msg = msg;
    if (!ok) s.tried = (s.tried || 0) + 1;
    logEvent("answer", step.id, { q: i, ok });
    redraw(i);
  }

  root.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-check]");
    if (c) return check(+c.dataset.check);
    const self = e.target.closest("[data-self]");
    if (self) {
      const i = +self.closest("[data-q]").dataset.q;
      const s = saved[i];
      if (self.dataset.self === "yes") s.ok = true;
      else {
        s.revealed = false;
        s.tried = (s.tried || 0) + 1;
        s.msg = "";
      }
      logEvent("answer", step.id, { q: i, ok: s.ok === true, self: true });
      return redraw(i);
    }
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.target.tagName === "INPUT")) {
      const q = e.target.closest("[data-q]");
      if (q) {
        e.preventDefault();
        check(+q.dataset.q);
      }
    }
  });
  draw();
}
