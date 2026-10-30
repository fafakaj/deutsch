// Data and progress.
// Progress is saved to every place that is available: the account gist (when the account has a
// token) and the local server (logs/progress*.json, when the app runs from server.py). localStorage
// keeps a copy so an offline moment never loses work. On load the newest copy wins. Each account has
// its own copies; the owner and a session without login share the original ones.
import { gistLoad, gistSave, session } from "./auth.js";

const LS_KEY = "de-progress-backup";
/** A site path from any page: the word trainer lives one folder down (words/). */
export const siteURL = (path) => new URL(`../${path}`, import.meta.url).href;
const SAVE_DELAY = 800;

export const data = { plan: null, quizzes: {}, anki: { cards: [] }, words: { decks: [], extra: [] } };
export let progress = emptyProgress();

const stepIndex = new Map(); // id -> {step, block, week, order}
let saveTimer = null;
let saveState = "saved"; // saved | pending | error
const saveListeners = new Set();
export const backend = { server: false, gist: null, user: null };

/** Sessions saved before accounts existed belong to the owner. */
const isGuestAccount = () => backend.user && backend.user.owner === false;
const lsKey = () => (isGuestAccount() ? `${LS_KEY}:${backend.user.user.toLowerCase()}` : LS_KEY);
const serverURL = () => siteURL(backend.user ? `api/progress?user=${encodeURIComponent(backend.user.user)}` : "api/progress");

function emptyProgress() {
  return { version: 1, steps: {}, quiz: {}, checklist: {}, notes: {}, review: {}, words: {}, events: [] };
}

/** Save time in ms. Old server copies have a zone-less local stamp; Date.parse reads it as local time. */
function stamp(p) {
  return Date.parse(p.saved_at || "") || 0;
}

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export async function loadData() {
  const [plan, quizzes, anki, words] = await Promise.all([
    getJSON(siteURL("data/plan.json")),
    getJSON(siteURL("data/quizzes.json")),
    getJSON(siteURL("data/anki.json")),
    getJSON(siteURL("data/words.json")),
  ]);
  data.plan = plan;
  data.quizzes = quizzes;
  data.anki = anki;
  data.words = words;

  const byId = new Map();
  for (const week of plan.weeks) for (const day of week.days) for (const step of day.steps) byId.set(step.id, { step, day });
  let order = 0;
  for (const week of plan.weeks) {
    for (const block of week.blocks) {
      block.items = block.steps.map((id) => byId.get(id).step);
      for (const step of block.items) stepIndex.set(step.id, { step, block, week, date: byId.get(step.id).day.date, order: order++ });
    }
  }
}

export async function loadProgress() {
  const copies = [];
  backend.user = session();
  try {
    copies.push(await getJSON(serverURL()));
    backend.server = true;
  } catch {
    backend.server = false;
  }
  backend.gist = backend.user?.token ? backend.user : null;
  if (backend.gist) {
    try {
      copies.push(await gistLoad(backend.gist));
    } catch (err) {
      console.warn("gist load failed", err);
      setSaveState("error");
    }
  }
  try {
    copies.push(JSON.parse(localStorage.getItem(lsKey()) || "null"));
  } catch {
    /* no local copy */
  }
  const sorted = copies.filter(Boolean).sort((a, b) => stamp(b) - stamp(a));
  progress = Object.assign(emptyProgress(), sorted[0] || {});
  dropTimes();
  // Push the newest copy to places that hold an older one.
  if (sorted.length > 1 && sorted.some((c) => c.saved_at !== sorted[0].saved_at)) scheduleSave(false);
}

/**
 * Phone and laptop share the gist: when the tab comes back, take a newer remote copy.
 * The word trainer is another page of the same site: its saves arrive through localStorage.
 */
export async function pullRemote() {
  if (saveState === "pending") return false;
  try {
    const local = JSON.parse(localStorage.getItem(lsKey()) || "null");
    if (local && stamp(local) > stamp(progress)) {
      progress = Object.assign(emptyProgress(), local);
      return true;
    }
  } catch {
    /* no local copy */
  }
  if (!backend.gist) return false;
  try {
    const remote = await gistLoad(backend.gist);
    if (remote && stamp(remote) > stamp(progress)) {
      progress = Object.assign(emptyProgress(), remote);
      dropTimes();
      return true;
    }
  } catch (err) {
    console.warn("gist pull failed", err);
  }
  return false;
}

/** The site no longer tracks time: drop what older versions saved (step timers, weekly hours). */
function dropTimes() {
  for (const s of Object.values(progress.steps)) delete s.time_s;
  delete progress.hours;
  progress.events = progress.events.filter((e) => e.type !== "hours");
}

export function onSaveState(fn) {
  saveListeners.clear(); // one header at a time listens
  saveListeners.add(fn);
  fn(saveState);
}

function setSaveState(s) {
  saveState = s;
  saveListeners.forEach((fn) => fn(s));
}

export function scheduleSave(touch = true) {
  if (touch) progress.saved_at = new Date().toISOString();
  try {
    localStorage.setItem(lsKey(), JSON.stringify(progress));
  } catch {
    /* private mode */
  }
  setSaveState("pending");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY);
}

async function saveNow() {
  try {
    const jobs = [];
    if (backend.server) {
      jobs.push(fetch(serverURL(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(progress) })
        .then((r) => { if (!r.ok) throw new Error(r.status); }));
    }
    if (backend.gist) jobs.push(gistSave(backend.gist, progress));
    await Promise.all(jobs);
    setSaveState(jobs.length ? "saved" : "local");
  } catch (err) {
    console.warn("save failed", err);
    setSaveState("error");
    saveTimer = setTimeout(saveNow, 8000);
  }
}

export function logEvent(type, step, detail = {}) {
  progress.events.push({ t: new Date().toISOString(), type, step, ...detail });
  if (progress.events.length > 4000) progress.events.splice(0, progress.events.length - 4000);
  scheduleSave();
}

// ---------------------------------------------------------------- dates

export function todayISO() {
  const override = new URLSearchParams(location.search).get("today");
  if (override) return override;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function fmtDate(iso, withWeekday = true) {
  const d = new Date(iso + "T12:00:00");
  const s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withWeekday ? `${WEEKDAYS[d.getDay()]}, ${s}` : s;
}

/** The plan week whose dates contain today (null before the start or after the end). */
export function calendarWeek() {
  const today = todayISO();
  return data.plan.weeks.find((w) => w.days[0].date <= today && today <= w.days[6].date) || null;
}

// ---------------------------------------------------------------- steps

export function getStep(id) {
  return stepIndex.get(id);
}

export function allSteps() {
  return [...stepIndex.values()];
}

export function isDone(stepId) {
  const s = progress.steps[stepId];
  return !!s && s.status === "done";
}

export function stepState(stepId) {
  return progress.steps[stepId] || (progress.steps[stepId] = { status: "todo" });
}

export function markDone(stepId, detail = {}) {
  const s = stepState(stepId);
  if (s.status !== "done") {
    s.status = "done";
    s.done_at = new Date().toISOString();
    Object.assign(s, detail);
    logEvent(detail.skipped ? "skip" : "done", stepId, detail);
  }
  scheduleSave();
}

export function markUndone(stepId) {
  const s = stepState(stepId);
  s.status = "todo";
  delete s.done_at;
  delete s.skipped;
  logEvent("undone", stepId);
}

export function rateStep(stepId, rating) {
  stepState(stepId).rating = rating;
  logEvent("rate", stepId, { rating });
}

function count(steps) {
  const req = steps.filter((s) => !s.optional);
  return { done: req.filter((s) => isDone(s.id)).length, total: req.length };
}

export function blockProgress(block) {
  return count(block.items);
}

export function weekProgress(week) {
  return count(week.blocks.flatMap((b) => b.items));
}

export function overallProgress() {
  return count(allSteps().map((e) => e.step));
}

/** The block's soft deadline has passed and it is not finished. */
export function blockLate(block) {
  const p = blockProgress(block);
  return block.due < todayISO() && p.done < p.total;
}

/** The one step to do now: the first unfinished required step of the path, whatever the date. */
export function currentStep() {
  for (const { step } of stepIndex.values()) {
    if (!step.optional && !isDone(step.id)) return step;
  }
  return null;
}

export function nextStepAfter(stepId) {
  const cur = stepIndex.get(stepId);
  for (const entry of stepIndex.values()) {
    if (entry.order > cur.order && !entry.step.optional && !isDone(entry.step.id)) return entry.step;
  }
  return null;
}
