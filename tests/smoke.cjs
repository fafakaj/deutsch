// Smoke test: see run_smoke.sh.
const { chromium } = require("playwright");
const assert = require("assert");

const BASE = process.env.BASE;
const REAL = process.env.REAL === "data";

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon|api\.github/.test(m.text()) && errors.push(`${page.url()}: ${m.text()}`));
  const go = async (hash) => {
    await page.goto(`${BASE}/?today=2026-11-02${hash}`);
    await page.waitForSelector(".stage-in, .map, .review-page, .read-page .article-head", { timeout: 10000 });
  };
  let n = 0;
  const ok = (name) => console.log(`ok ${++n} ${name}`);

  await go("#/");
  assert.match(await page.textContent("header.top"), /Неделя 1 из/);
  ok("home: header and current step");

  if (REAL) {
    // Every step of the real plan opens without an error.
    const ids = await page.evaluate(async () => {
      const p = await (await fetch("data/plan.json")).json();
      return p.weeks.flatMap((w) => w.days.flatMap((d) => d.steps.map((s) => s.id)));
    });
    for (const id of ids) {
      await go(`#/step/${id}`);
      await page.waitForSelector("[data-body] > *", { timeout: 5000 });
      const txt = await page.textContent("[data-body]");
      assert(!/не найден/.test(txt), `${id}: ${txt.slice(0, 80)}`);
    }
    ok(`all ${ids.length} steps render`);
  } else {
    await go("#/step/w01-mon-02");
    const q = page.locator("[data-q]");
    await q.nth(0).locator(".de-input").fill("Bin.");
    await q.nth(0).locator("[data-check]").click();
    await page.waitForSelector('[data-q="0"] .q-verdict.ok');
    ok("de answer: case and final dot ignored");

    await q.nth(1).locator(".de-input").fill("ich komme aus Deutschlnd");
    await q.nth(1).locator("[data-check]").click();
    await page.waitForSelector('[data-q="1"] .q-verdict.bad');
    await q.nth(1).locator(".de-input").fill("x");
    await q.nth(1).locator("[data-check]").click();
    assert.match(await q.nth(1).textContent(), /Ответ: Ich komme aus Deutschland/);
    ok("de answer: wrong twice shows the answer");

    await q.nth(1).locator(".de-input").fill("");
    await q.nth(1).locator(".de-input").click();
    await q.nth(1).locator('[data-umlaut="ü"]').click();
    assert.equal(await q.nth(1).locator(".de-input").inputValue(), "ü");
    ok("umlaut button types into the answer");

    await go("#/step/w01-mon-04");
    assert.match(await page.textContent(".practice"), /Образец откроется/);
    await page.fill("[data-note]", "Ich heiße Max und ich komme aus Berlin.");
    await page.waitForSelector("details.sample");
    ok("practice: sample opens after writing");

    await go("#/step/w01-mon-06");
    const href = await page.getAttribute(".words-step a.btn.primary", "href");
    assert.equal(href, "words/#deck=w1d1&step=w01-mon-06");
    assert.equal(await page.locator(".words-table tr").count(), 3);
    ok("words step: deck table and trainer link");

    await go("#/step/w01-mon-03");
    await page.waitForSelector(".listen .source.big");
    await page.waitForSelector("[data-listen-quiz] [data-q]");
    ok("listen step: source and questions");

    await go("#/step/w01-mon-05");
    await page.fill('[data-q="0"] textarea', "Ich heiße Max. Ich komme aus Berlin.");
    await page.click('[data-q="0"] [data-check]');
    assert.match(await page.textContent('[data-q="0"]'), /Ich heiße … Ich komme aus/);
    ok("oral: sample shown from answer field");

    await go("#/read/sein");
    await page.waitForSelector(".article-body table");
    assert.match(await page.textContent(".article-head"), /Конспект на русском/);
    ok("article: own summary renders");
  }

  await go("#/map");
  await go("#/review");
  ok("map and review pages");

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  pp.on("pageerror", (e) => errors.push(`phone ${pp.url()}: ${e.message}`));
  for (const hash of ["#/", "#/map", "#/review"]) {
    await pp.goto(`${BASE}/?today=2026-11-02${hash}`);
    await pp.waitForTimeout(400);
    const w = await pp.evaluate(() => document.scrollingElement.scrollWidth);
    assert(w <= 390, `phone ${hash}: page is ${w}px wide`);
  }
  ok("phone: no sideways scroll");

  await browser.close();
  assert.deepEqual(errors, [], "JS errors");
  console.log(`all ${n} passed`);
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
