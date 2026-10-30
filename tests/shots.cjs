// Screenshots of every screen on desktop and phone, light and dark: the before/after record of UI work.
// Run: bash tests/run_shots.sh OUT_DIR
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.env.BASE;
const OUT = process.env.OUT;
const SCREENS = [
  ["home", "#/"],
  ["theory", "#/step/w01-mon-01"],
  ["quiz", "#/step/w01-mon-02"],
  ["listen", "#/step/w01-mon-03"],
  ["practice", "#/step/w01-mon-04"],
  ["oral", "#/step/w01-mon-05"],
  ["words", "#/step/w01-mon-06"],
  ["anki", "#/step/w01-mon-07"],
  ["article", "#/read/sein"],
  ["map", "#/map"],
  ["review", "#/review"],
  ["login", "#/login"],
];
const SIZES = { desk: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  for (const scheme of ["light", "dark"]) {
    for (const [size, viewport] of Object.entries(SIZES)) {
      const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      for (const [name, hash] of SCREENS) {
        await page.goto(`${BASE}/?today=2026-11-02${hash}`);
        await page.waitForSelector("header.top, main.login", { timeout: 20000 });
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/${name}-${size}-${scheme}.png`, fullPage: size === "phone" });
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`Скриншоты: ${OUT}. Ошибок JS: ${errors.length}`);
  if (errors.length) console.log(errors.join("\n"));
})();
