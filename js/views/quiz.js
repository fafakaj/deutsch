// Quiz: every question is checked automatically except "text", which the student
// compares with the model answer. The step is done when every question is correct.
import { esc, md } from "../md.js";
import { deAnswers, grade, questionBody, readValue } from "../grade.js";
import { speakGermanSequence } from "../speech.js";
import { data, isDone, logEvent, markDone, progress, scheduleSave } from "../store.js";

const CYRILLIC = /[\u0400-\u04FF]/;

function germanSpeechText(text, hints = false) {
  let plain = String(text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>~]/g, "")
    .replace(/[«»„“”"]/g, "");
  plain = hints
    ? plain.replace(/\([^)]*\)/g, " ")
    : plain.replace(/\(([^)]*)\)/g, (_, inner) => (CYRILLIC.test(inner) ? " " : inner));
  const words = plain.split(/\s+/).filter((w) => w && !CYRILLIC.test(w));
  const result = words
    .join(" ")
    .replace(/_{2,}/g, " ")
    .replace(/…|\.{3,}/g, " ")
    .replace(/\s*[—–]\s*/g, ". ")
    .replace(/\s*→\s*/g, ". ")
    .replace(/\s*\/\s*/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?])(?:\s*[.,;:!?])+/g, "$1")
    .trim()
    .replace(/^[.,;:!?]+/, "")
    .trim();
  return /[A-Za-zÄÖÜäöüß0-9]/.test(result) ? result : "";
}

function filledQuestion(q, answer) {
  const source = String(q.q ?? "");
  const blanks = source.match(/_{2,}/g) || [];
  if (!blanks.length) return germanSpeechText(source, true);

  const words = germanSpeechText(answer).split(/\s+/).filter(Boolean);
  let filled = source;
  if (blanks.length === 1 && words.length) {
    filled = source.replace(/_{2,}/, words.join(" "));
  } else if (blanks.length === words.length) {
    let k = 0;
    filled = source.replace(/_{2,}/g, () => words[k++]);
  }
  if (/_{2,}/.test(filled)) return "";
  return germanSpeechText(filled, true);
}

function speechAnswers(q) {
  if (q.type === "de") return deAnswers(q).slice(0, 1).map(germanSpeechText);
  if (q.type === "choice") return [germanSpeechText(q.options[q.answer])];
  if (q.type === "multi") return q.answers.map((k) => germanSpeechText(q.options[k]));
  if (q.type === "text") return [germanSpeechText(q.model ?? q.answer)];
  return [];
}

function speakQuestionAndAnswer(q) {
  const answers = speechAnswers(q).filter(Boolean);
  const question = filledQuestion(q, answers.join(". "));
  speakGermanSequence([question, ...answers]);
}

function hasAnswer(q, value) {
  if (q.type === "choice") return value !== null;
  if (q.type === "multi") return Array.isArray(value) && value.length > 0;
  return String(value ?? "").trim() !== "";
}

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
      redraw(i);
      speakQuestionAndAnswer(q);
      return;
    }
    const withAnswer = hasAnswer(q, value);
    if (withAnswer) speakQuestionAndAnswer(q);
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
