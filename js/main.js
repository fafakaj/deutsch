import { accountConfigured, login, logout, session } from "./auth.js";
import { icon, STEP_ICON } from "./icons.js";
import { esc, md } from "./md.js";
import {
  backend, blockLate, blockProgress, calendarWeek, currentStep, data, fmtDate, getStep, isDone, loadData, loadProgress,
  markDone, nextStepAfter, onSaveState, overallProgress, progress, pullRemote, rateStep, weekProgress,
} from "./store.js";
import { renderQuiz } from "./views/quiz.js";
import { dueCount, renderReview } from "./views/review.js";
import { renderAnki, renderListen, renderPractice, renderTheory, renderWords } from "./views/steps.js";

const TYPE_RU = { theory: "Теория", quiz: "Квиз", oral: "Говорение", anki: "Карточки", practice: "Письмо", words: "Слова", listen: "Аудирование" };
const PANEL_KEY = "de-panel";
const BRAND = "Deutsch";
const phone = () => matchMedia("(max-width: 820px)").matches;
const app = document.getElementById("app");
const TITLE = document.title;
let cleanup = null;

// ---------------------------------------------------------------- side panel prefs

function panelPrefs() {
  const base = { w: 300, collapsed: false };
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(PANEL_KEY) || "{}");
  } catch {
    /* defaults */
  }
  // On a phone the panel is a drawer: it opens on demand and closes on every page.
  return { ...base, ...saved, ...(phone() ? { collapsed: true } : {}) };
}

function savePanelPrefs(p) {
  if (phone()) return;
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(p));
  } catch {
    /* not remembered */
  }
}

// ---------------------------------------------------------------- chrome

function header({ menu = false } = {}) {
  const p = overallProgress();
  const cur = currentStep();
  const weekNo = cur ? getStep(cur.id).week.n : data.plan.weeks.length;
  const due = dueCount();
  const s = backend.user;
  return `<header class="top">
      ${menu ? `<button class="icon-btn menu-btn" data-menu aria-label="Шаги недели">${icon("menu")}</button>` : ""}
      <a class="brand" href="#/" aria-label="${BRAND}: текущий шаг"><span class="logo">${icon("flag")}</span><span class="brand-name">${BRAND}</span></a>
      <div class="course" title="${p.done} из ${p.total} обязательных шагов">
        <span>Неделя ${weekNo} из ${data.plan.weeks.length}</span>
        <span class="bar"><i style="width:${(100 * p.done) / p.total}%"></i></span>
        <span class="muted">${p.done} из ${p.total} шагов</span>
      </div>
      <nav class="nav">
        <a class="nav-link" href="#/review" title="Повторение">${icon("repeat")}<span class="nav-label">Повторение</span>${due ? `<span class="count">${due}</span>` : ""}</a>
        <a class="nav-link" href="words/" title="Тренажёр слов (удобнее с телефона)">${icon("cards")}<span class="nav-label">Слова</span></a>
        <a class="nav-link" href="#/map" title="Карта курса">${icon("map")}<span class="nav-label">Карта курса</span></a>
        <span class="status"><span class="dot" data-save title="Сохранение"></span></span>
        ${s
          ? `<button class="user" data-logout title="${s.token ? "Выйти" : "Выйти. Синхронизация между устройствами выключена"}"><span class="avatar">${esc(s.user[0].toUpperCase())}</span><span class="user-name">${esc(s.user)}</span></button>`
          : `<a class="nav-link" href="#/login">Войти</a>`}
      </nav>
    </header>`;
}

function stepIcon(s) {
  return icon(isDone(s.id) ? "check" : STEP_ICON[s.type]);
}

function stepRow(s, activeStepId) {
  const cls = [isDone(s.id) ? "done" : "", s.id === activeStepId ? "active" : "", s.optional ? "opt" : ""].join(" ");
  return `<li class="${cls}"><a href="#/step/${s.id}">${stepIcon(s)}<span class="st-title">${esc(s.title)}</span></a></li>`;
}

function weekPicker(week) {
  const cal = calendarWeek();
  const items = data.plan.weeks
    .map((w) => {
      const p = weekProgress(w);
      const cls = [w === week ? "active" : "", w === cal ? "cur" : "", p.done === p.total ? "full" : ""].join(" ");
      return `<li class="${cls}"><a href="#/block/${w.blocks[0].id}"><span class="wk-n">${w.n}</span><span class="wk-t">${esc(w.title)}</span><span class="wk-c">${p.done}/${p.total}</span></a></li>`;
    })
    .join("");
  return `<details class="week-pick"><summary><span class="wk-head"><b>Неделя ${week.n}</b><small>${esc(week.title)}</small></span>${icon("chevron")}</summary>
      <ol class="week-list">${items}</ol></details>`;
}

function panel(week, block, activeStepId) {
  const prefs = panelPrefs();
  const mods = week.blocks
    .map((b) => {
      const p = blockProgress(b);
      const open = b === block;
      const full = p.done === p.total;
      const cls = ["mod", open ? "open" : "", full ? "full" : "", blockLate(b) ? "late" : ""].join(" ");
      return `<section class="${cls}">
          <a class="mod-h" href="#/block/${b.id}"><span class="n">${full ? icon("check") : b.n}</span>
            <span class="t">${esc(b.title)}<small>${blockLate(b) ? "срок прошёл · " : ""}до ${fmtDate(b.due)}</small></span><span class="c">${p.done}/${p.total}</span></a>
          ${open ? `<ol class="steps">${b.items.map((s) => stepRow(s, activeStepId)).join("")}</ol>` : ""}
        </section>`;
    })
    .join("");
  return `<aside class="panel ${prefs.collapsed ? "collapsed" : ""}" style="--panel-w:${prefs.w}px">
      <div class="panel-head">${weekPicker(week)}
        <button class="icon-btn collapse-btn" data-collapse title="Свернуть панель" aria-label="Свернуть панель">${icon("left")}</button>
      </div>
      <div class="panel-body">${mods}
        ${week.goal ? `<details class="week-goal"><summary>Цель недели</summary><div class="md small">${md(week.goal)}</div></details>` : ""}
      </div>
      <div class="resizer" data-resize title="Потяните, чтобы изменить ширину"></div>
    </aside>
    <div class="scrim" data-scrim></div>`;
}

function stepBar(block, activeStepId) {
  return `<nav class="step-bar" aria-label="Шаги блока">${block.items
    .map((s, i) => {
      const cls = [isDone(s.id) ? "done" : "", s.id === activeStepId ? "cur" : "", s.optional ? "opt" : ""].join(" ");
      return `<a class="sq ${cls}" href="#/step/${s.id}" title="${i + 1}. ${esc(s.title)}">${stepIcon(s)}</a>`;
    })
    .join("")}</nav>`;
}

function stageHead(step, entry, isNow) {
  const i = entry.block.items.indexOf(step);
  return `<div class="stage-head">
      <div class="kind">${isNow ? '<span class="now">Сейчас</span>' : ""}<span>${TYPE_RU[step.type] || ""} · шаг ${i + 1} из ${entry.block.items.length}${step.optional ? " · по желанию" : ""}</span></div>
      <h1>${esc(step.title)}</h1>
      ${step.why ? `<div class="why md">${md(step.why)}</div>` : ""}
    </div>`;
}

function stageFoot(step) {
  if (isDone(step.id)) return "";
  return `<div class="stage-foot"><button class="link-btn" data-skip title="Шаг засчитается, в журнале будет отметка «уже знаю»">Уже знаю, пропустить</button></div>`;
}

function rateHTML(step) {
  const r = progress.steps[step.id]?.rating;
  const opt = [["easy", "Легко"], ["ok", "Нормально"], ["hard", "Сложно"]];
  return `<span class="rate">${opt.map(([k, label]) => `<button class="chip ${r === k ? "on" : ""}" data-rate="${k}">${label}</button>`).join("")}</span>`;
}

function nextBanner(step) {
  const next = nextStepAfter(step.id);
  return `<div class="next-card">
      <span class="next-ok">${icon("check")}</span>
      <div class="next-text"><b>Сдано</b><div class="rate-row"><span class="muted small">Как прошло?</span>${rateHTML(step)}</div></div>
      ${next ? `<a class="btn primary big" href="#/step/${next.id}">Дальше ${icon("arrow")}</a>` : '<span class="muted">Это был последний шаг плана.</span>'}
    </div>`;
}

// ---------------------------------------------------------------- pages

function render() {
  cleanup?.();
  cleanup = null;
  document.title = TITLE;
  const hash = location.hash || "#/";
  const [, route, arg] = hash.match(/^#\/(\w*)\/?(.*)$/) || [];

  if (route === "login") return renderLogin();
  if (route === "map") return renderMap();
  if (route === "review") return renderReviewPage();
  if (route === "read") return renderRead(arg);

  let step = null;
  if (route === "step") step = getStep(arg)?.step || null;
  if (route === "block") {
    const block = data.plan.weeks.flatMap((w) => w.blocks).find((b) => b.id === arg);
    if (block) step = block.items.find((s) => !s.optional && !isDone(s.id)) || block.items[0];
  }
  const now = currentStep();
  step ||= now;
  if (!step) return renderFinished();
  const entry = getStep(step.id);

  app.innerHTML = `${header({ menu: true })}
    <main class="layout">${panel(entry.week, entry.block, step.id)}
      <section class="stage">${stepBar(entry.block, step.id)}
        <div class="stage-in">${stageHead(step, entry, step === now)}<div data-next></div><div data-body></div>${stageFoot(step)}</div>
      </section>
    </main>`;
  bindChrome();
  bindPanel();
  centerStepBar();
  const body = app.querySelector("[data-body]");
  const nextEl = app.querySelector("[data-next]");
  const ctx = {
    week: entry.week,
    onDone: () => {
      refreshChrome(entry, step);
      nextEl.innerHTML = nextBanner(step);
      app.querySelector(".stage-foot")?.remove();
      nextEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
  };
  if (step.type === "quiz" || step.type === "oral") renderQuiz(body, step, ctx);
  else if (step.type === "theory") renderTheory(body, step, ctx);
  else if (step.type === "anki") renderAnki(body, step, ctx);
  else if (step.type === "practice") renderPractice(body, step, ctx);
  else if (step.type === "words") renderWords(body, step, ctx);
  else if (step.type === "listen") renderListen(body, step, ctx);
  if (isDone(step.id)) nextEl.innerHTML = nextBanner(step);

  app.querySelector(".stage").addEventListener("click", (e) => {
    if (e.target.closest("[data-skip]")) {
      markDone(step.id, { skipped: true });
      render();
      return;
    }
    const r = e.target.closest("[data-rate]");
    if (r) {
      rateStep(step.id, r.dataset.rate);
      r.parentElement.outerHTML = rateHTML(step);
    }
  });
  window.scrollTo(0, 0);
}

/** Keep the current square of a long step bar in view (the bar scrolls sideways on a phone). */
function centerStepBar() {
  const bar = app.querySelector(".step-bar");
  const cur = bar?.querySelector(".cur");
  if (cur && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = cur.offsetLeft - bar.clientWidth / 2 + cur.offsetWidth / 2;
}

function refreshChrome(entry, step) {
  app.querySelector("header.top").outerHTML = header({ menu: true });
  app.querySelector("aside.panel").remove();
  app.querySelector("[data-scrim]").outerHTML = panel(entry.week, entry.block, step.id);
  app.querySelector(".step-bar").outerHTML = stepBar(entry.block, step.id);
  bindChrome();
  bindPanel();
  centerStepBar();
}

function renderMap() {
  const cal = calendarWeek();
  const weeks = data.plan.weeks
    .map((w) => {
      const wp = weekProgress(w);
      const blocks = w.blocks
        .map((b) => {
          const p = blockProgress(b);
          const cls = [p.done === p.total ? "full" : "", blockLate(b) ? "late" : ""].join(" ");
          return `<a class="map-block ${cls}" href="#/block/${b.id}"><span class="mb-t">${esc(b.title)}</span>
              <span class="mb-c">${p.done}/${p.total}</span><i style="--p:${p.total ? p.done / p.total : 0}"></i></a>`;
        })
        .join("");
      const cls = [w === cal ? "cur" : "", wp.done === wp.total ? "full" : ""].join(" ");
      return `<section class="map-week ${cls}">
          <div class="map-head"><span class="map-n">${wp.done === wp.total ? icon("check") : w.n}</span>
            <div><b>${esc(w.title)}</b><small>Неделя ${w.n} · ${fmtDate(w.days[0].date, false)} – ${fmtDate(w.days[6].date, false)}${w === cal ? " · сейчас" : ""}</small></div></div>
          <div class="map-blocks">${blocks}</div></section>`;
    })
    .join("");
  const p = overallProgress();
  app.innerHTML = `${header()}<main class="map"><div class="page-head"><h1>Карта курса</h1><p class="muted">${data.plan.weeks.length} недели, по 3 блока в неделе. Сдано ${p.done} из ${p.total} шагов.</p></div>${weeks}</main>`;
  bindChrome();
}

function renderReviewPage() {
  app.innerHTML = `${header()}<main class="review-page"><div data-body></div></main>`;
  bindChrome();
  renderReview(app.querySelector("[data-body]"));
}

/** A Russian translation (or retelling) of an English source: data/articles/<slug>.md with front matter. */
async function renderRead(slug) {
  app.innerHTML = `${header()}<main class="read-page"><article class="card article" data-body><p class="muted"><span class="spinner"></span>Загружаю статью…</p></article></main>`;
  bindChrome();
  window.scrollTo(0, 0);
  const body = app.querySelector("[data-body]");
  let text = "";
  try {
    if (!/^[\w-]+$/.test(slug)) throw new Error("неверный адрес статьи");
    const r = await fetch(`data/articles/${slug}.md`);
    if (!r.ok) throw new Error(`статья не найдена (${r.status})`);
    text = await r.text();
  } catch (err) {
    if (body.isConnected) body.innerHTML = `<h1>Не удалось открыть статью</h1><p class="bad">${esc(err.message)}</p>`;
    return;
  }
  if (!body.isConnected) return;
  const [, head = "", rest = text] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) || [];
  const fm = Object.fromEntries([...head.matchAll(/^(\w+): (.*)$/gm)].map((m) => [m[1], m[2]]));
  document.title = `${fm.title || slug} · ${BRAND}`;
  const what = { пересказ: "Пересказ на русском", конспект: "Конспект на русском" }[fm.kind] || "Перевод на русский";
  body.innerHTML = `<header class="article-head">
      <span class="tag">${esc(fm.kind || "перевод")}</span>
      <h1>${esc(fm.title || slug)}</h1>
      <p class="muted small">${what}. Источник: ${esc(fm.source || "")}.${fm.license ? ` ${esc(fm.license)}` : ""}</p>
      ${fm.original ? `<a class="btn" href="${esc(fm.original)}" target="_blank" rel="noopener">Оригинал (англ.) ${icon("external")}</a>` : ""}
    </header>
    <div class="md article-body">${md(rest, { article: true })}</div>`;
}

function renderFinished() {
  app.innerHTML = `${header()}<main class="map"><div class="page-head"><h1>Все шаги плана сданы</h1></div></main>`;
  bindChrome();
}

function renderLogin(message = "") {
  app.innerHTML = `<main class="login"><form class="login-card" data-login>
      <div class="brand"><span class="logo">${icon("flag")}</span><span class="brand-name">${BRAND}</span></div>
      <h1>Вход</h1>
      <label>Логин<input class="answer" name="user" autocomplete="username" autocapitalize="off" required></label>
      <label>Пароль<input class="answer" name="password" type="password" autocomplete="current-password" required></label>
      <div class="bad small" data-msg>${esc(message)}</div>
      <button class="btn primary big" type="submit">Войти</button>
      ${backend.server ? '<a class="small" href="#/">Продолжить без входа</a>' : ""}
    </form></main>`;
  app.querySelector("[data-login]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    btn.textContent = "Вхожу…";
    try {
      await login(String(f.get("user")), String(f.get("password")));
      await loadProgress();
      location.hash = "#/";
      render();
    } catch (err) {
      renderLogin(err.message);
    }
  });
}

// ---------------------------------------------------------------- bindings

function bindChrome() {
  const save = app.querySelector("[data-save]");
  if (save) {
    onSaveState((s) => {
      if (!save.isConnected) return;
      save.className = `dot save-${s}`;
      save.title = { saved: "Сохранено", pending: "Сохраняю", error: "Не удалось сохранить, повторю", local: "Сохранено только в браузере" }[s];
    });
  }
  app.querySelector("[data-logout]")?.addEventListener("click", () => {
    if (!confirm("Выйти из аккаунта на этом устройстве?")) return;
    logout();
    // Reload so nothing of this account's progress stays in memory for the next one.
    location.hash = "#/login";
    location.reload();
  });
}

function bindPanel() {
  const aside = app.querySelector("aside.panel");
  if (!aside) return;
  const toggle = () => {
    const p = panelPrefs();
    p.collapsed = !aside.classList.contains("collapsed");
    savePanelPrefs(p);
    aside.classList.toggle("collapsed", p.collapsed);
  };
  aside.querySelector("[data-collapse]").addEventListener("click", toggle);
  app.querySelector("[data-menu]")?.addEventListener("click", toggle);
  app.querySelector("[data-scrim]").addEventListener("click", () => aside.classList.add("collapsed"));
  const handle = aside.querySelector("[data-resize]");
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = aside.getBoundingClientRect().width;
    const move = (ev) => {
      const w = Math.max(220, Math.min(560, startW + ev.clientX - startX));
      aside.style.setProperty("--panel-w", `${w}px`);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      const p = panelPrefs();
      p.w = Math.round(aside.getBoundingClientRect().width);
      savePanelPrefs(p);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
  });
}

/** The ä ö ü ß buttons under a German answer: type the letter into that answer at the cursor. */
function bindUmlauts() {
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest("[data-umlaut]")) e.preventDefault(); // keep the focus in the answer
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-umlaut]");
    const input = b?.closest(".question, [data-q], [data-card]")?.querySelector(".de-input");
    if (!input) return;
    const { selectionStart: a = input.value.length, selectionEnd: z = input.value.length } = input;
    input.value = input.value.slice(0, a) + b.dataset.umlaut + input.value.slice(z);
    input.focus();
    input.setSelectionRange(a + 1, a + 1);
  });
}

async function main() {
  try {
    await loadData();
    await loadProgress();
  } catch (err) {
    app.innerHTML = `<div class="card pad"><h2>Не удалось загрузить данные</h2><pre class="err">${esc(err.message)}</pre></div>`;
    return;
  }
  // On the hosted site the account is the only storage; locally the server works without it.
  if (!backend.server && !session() && (await accountConfigured()) && location.hash !== "#/login") location.hash = "#/login";
  bindUmlauts();
  window.addEventListener("hashchange", render);
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && (await pullRemote())) render();
  });
  render();
}

main();
