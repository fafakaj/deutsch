// The site as GitHub Pages serves it: a static server, under /deutsch/, no local API.
// The gist API is stubbed: sync merges before it writes, a 401 stops writing. See run_smoke.sh.
const { chromium } = require("playwright");
const assert = require("assert");

const BASE = process.env.BASE; // …/deutsch/
const SESSION = { user: "olo", owner: true, token: "t", gist: "g" };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let n = 0;
  const ok = (name) => console.log(`ok ${++n} ${name}`);

  // The phone already finished a step; this laptop finishes another one. The gist must keep both.
  let gist = { version: 1, saved_at: "2026-11-02T08:00:00Z", steps: { "w01-mon-02": { status: "done", done_at: "2026-11-02T08:00:00Z" } } };
  let patches = 0;
  let status = 200;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem("de-session", JSON.stringify(s)), SESSION);
  await ctx.route("https://api.github.com/gists/g", async (route) => {
    if (status !== 200) return route.fulfill({ status, body: "{}" });
    if (route.request().method() === "PATCH") {
      patches += 1;
      gist = JSON.parse(JSON.parse(route.request().postData()).files["progress.json"].content);
      return route.fulfill({ status: 200, body: "{}" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ files: { "progress.json": { content: JSON.stringify(gist) } } }) });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}?today=2026-11-02#/step/w01-mon-01`);
  await page.waitForSelector(".stage-in");
  assert.match(await page.textContent(".course"), /1 из \d+/);
  ok("subpath: site loads under /deutsch/ and reads the gist");

  // The phone saves again while the laptop tab stays open.
  gist.steps["w01-mon-03"] = { status: "done", done_at: "2026-11-02T09:00:00Z" };
  await page.click("[data-skip]");
  await page.waitForFunction(() => document.querySelector("[data-save]")?.className.includes("save-saved"));
  assert(patches >= 1, "no PATCH");
  assert.deepEqual(Object.keys(gist.steps).sort(), ["w01-mon-01", "w01-mon-02", "w01-mon-03"]);
  ok("sync: the save merges the other device's steps instead of overwriting them");

  status = 401;
  await page.goto(`${BASE}?today=2026-11-02#/step/w01-mon-04`);
  await page.waitForSelector(".stage-in");
  await page.click("[data-skip]");
  await page.waitForFunction(() => document.querySelector("[data-save]")?.className.includes("save-auth"), null, { timeout: 10000 });
  const before = patches;
  await page.waitForTimeout(1500);
  assert.equal(patches, before);
  ok("401: the token error shows and no retries are sent");

  // The trainer on a phone, from a bookmark (no step in the link).
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.addInitScript((s) => localStorage.setItem("de-session", JSON.stringify({ ...s, token: null, gist: null })), SESSION);
  const pp = await phone.newPage();
  pp.on("pageerror", (e) => errors.push(`phone: ${e.message}`));
  await pp.goto(`${BASE}words/`);
  await pp.waitForTimeout(1500);
  const w = await pp.evaluate(() => document.scrollingElement.scrollWidth);
  assert(w <= 390, `trainer is ${w}px wide`);
  ok("trainer: loads under /deutsch/words/, no sideways scroll at 390 px");

  // A deck passed in the trainer counts on the site even without the step in the link.
  await pp.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("de-progress-backup") || "{}");
    p.words = { ...(p.words || {}), w1d1: { learnedIds: [0, 1, 2], testBest: 85, updatedAt: Date.now() } };
    p.saved_at = new Date().toISOString();
    localStorage.setItem("de-progress-backup", JSON.stringify(p));
  });
  const stepId = await pp.evaluate(async () => {
    const plan = await (await fetch("../data/plan.json")).json();
    return plan.weeks[0].days.flatMap((d) => d.steps).find((s) => s.type === "words" && (s.deck || "w1d1") === "w1d1").id;
  });
  await pp.goto(`${BASE}?today=2026-11-02#/step/${stepId}`);
  await pp.waitForSelector(".words-step");
  await pp.waitForSelector(".done-bar.ok", { timeout: 5000 });
  ok("words step: a deck passed from a trainer bookmark counts");

  await browser.close();
  assert.deepEqual(errors, [], "JS errors");
  console.log(`all ${n} passed`);
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
