import fs from "node:fs/promises";
process.env.PLAYWRIGHT_BROWSERS_PATH = new URL(
  "../.tmp/playwright",
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const { chromium, expect } = await import("@playwright/test");
await fs.mkdir("qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: "qa/video", size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
const errors = [],
  steps = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const read = () => page.evaluate(() => window.__YAOHUO__.snapshot());
const log = (x) => {
  steps.push(x);
  console.log(x);
};
async function act(name) {
  await page.locator(`[data-act="${name}"]`).click();
}
async function travel(id) {
  await act("map");
  await act("go-" + id);
  await page.waitForFunction(() => window.__YAOHUO__.view().nav === 0, null, {
    timeout: 20000,
  });
  await page.keyboard.press("KeyE");
  await page.waitForFunction(
    (id) => window.__YAOHUO__.view().focus === id,
    id,
    { timeout: 5000 },
  );
  await page.waitForTimeout(1300);
  log("Reached " + id);
}
async function hold(name, ms) {
  const el = page.locator(`[data-hold="${name}"]`);
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
async function stage(value) {
  await page.waitForFunction(
    (v) => {
      const s = window.__YAOHUO__.snapshot();
      return s.pieces.find((p) => p.id === s.activeId)?.stage === v;
    },
    value,
    { timeout: 20000 },
  );
}
try {
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForFunction(() => window.__YAOHUO__, null, { timeout: 60000 });
  await page.locator("#start").click();
  await travel("supply");
  await act("new");
  await travel("clay");
  await hold("prepare", 3600);
  await stage("prepared");
  await act("take");
  await travel("wheel");
  await act("open");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "qa/03-wheel-before-v01.png" });
  const before = (await read()).pieces[0].radius;
  // Real mouse drags across the visible vessel, never mutate state via diagnostics.
  await page.mouse.move(760, 430);
  await page.mouse.down();
  await page.mouse.move(830, 430, { steps: 20 });
  await page.mouse.up();
  await page.mouse.move(760, 480);
  await page.mouse.down();
  await page.mouse.move(805, 480, { steps: 20 });
  await page.mouse.up();
  await page.screenshot({ path: "qa/04-wheel-shaped-v01.png" });
  const shaped = (await read()).pieces[0].radius;
  if (JSON.stringify(shaped) === JSON.stringify(before))
    throw new Error("Visible drag missed vessel: geometry did not change");
  log("Geometry changed through real mouse input");
  await act("take");
  await travel("rack");
  await hold("wait", 1300);
  await stage("leather");
  await act("take");
  await travel("wheel");
  await hold("trim", 4200);
  await stage("trimmed");
  await act("take");
  await travel("paint");
  await act("tool-leaf");
  await page.mouse.click(710, 440);
  await page.mouse.click(740, 465);
  await act("tool-band");
  await page.mouse.click(730, 410);
  await page.screenshot({ path: "qa/05-painted-v01.png" });
  const painted = (await read()).pieces[0];
  if (!painted.marks.length) throw new Error("Painting did not hit vessel");
  await act("take");
  await travel("glaze");
  await hold("dip", 3100);
  await act("clean-foot");
  await act("take");
  await travel("rack");
  await hold("wait", 1550);
  await stage("dry");
  await act("take");
  await travel("kiln");
  await act("load");
  await act("light");
  await hold("wait", 16000);
  await page.screenshot({ path: "qa/06-kiln-v01.png" });
  await stage("fired");
  await act("take");
  await travel("display");
  await page.screenshot({ path: "qa/07-porcelain-v01.png" });
  await act("pack");
  await stage("packed");
  const saved = await read();
  await act("settings");
  await act("save");
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.__YAOHUO__, null, { timeout: 60000 });
  const restored = await read();
  expect(restored.pieces[0].id).toBe(saved.pieces[0].id);
  expect(restored.pieces[0].marks).toEqual(saved.pieces[0].marks);
  expect(restored.pieces[0].radius).toEqual(saved.pieces[0].radius);
  expect(restored.pieces[0].stage).toBe("packed");
  log("Full mud-to-collection loop and IndexedDB reload passed");
  await page.locator("#start").click();
  await act("collection");
  await page.screenshot({ path: "qa/08-collection-v01.png" });
  await act("close-modal");
  await page.setViewportSize({ width: 390, height: 844 });
  await act("settings");
  await page.screenshot({ path: "qa/09-settings-narrow-v01.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await act("close-modal");
  const report = {
    date: new Date().toISOString(),
    browser: browser.version(),
    viewport: "1440 x 900",
    steps,
    errors,
    stats: await page.evaluate(() => window.__YAOHUO__.stats()),
    piece: restored.pieces[0],
  };
  await fs.writeFile("qa/playtest.json", JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS");
} catch (e) {
  await page.screenshot({ path: "qa/failure.png" });
  await fs.writeFile(
    "qa/failure.json",
    JSON.stringify(
      {
        message: e.message,
        errors,
        steps,
        state: await read().catch(() => null),
        view: await page
          .evaluate(() => window.__YAOHUO__?.view())
          .catch(() => null),
      },
      null,
      2,
    ),
  );
  console.error(e);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
