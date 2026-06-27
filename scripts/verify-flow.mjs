import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const gameUrl = process.env.GAME_URL ?? "http://localhost:5173";
const outputDir = path.resolve(process.env.FLOW_ARTIFACT_DIR ?? "artifacts/flow");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
});
page.on("pageerror", (error) => errors.push(`pageerror: ${String(error)}`));

async function screenshot(name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
  const text = await page.evaluate(() => window.render_game_to_text?.() ?? "{}");
  fs.writeFileSync(path.join(outputDir, `${name}.json`), text);
}

async function clickGuide(expectedStep) {
  await page.waitForFunction((step) => {
    const text = window.render_game_to_text?.();
    if (!text) return false;
    return JSON.parse(text).guide_step === step;
  }, expectedStep);
  await screenshot(`before-${expectedStep}`);
  await page.getByTestId("guide-primary").click();
  await page.waitForTimeout(Number(process.env.FLOW_STEP_WAIT_MS ?? 1800));
}

await page.goto(gameUrl, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.render_game_to_text === "function");

await clickGuide("start-cultivation");

await page.waitForFunction(() => {
  const state = JSON.parse(window.render_game_to_text());
  return state.guide_step === "breakthrough" && state.cultivation.current >= state.cultivation.required;
});
await clickGuide("breakthrough");
await clickGuide("breakthrough");
await clickGuide("learn-technique");
await clickGuide("trial-first");
await clickGuide("starter-pack");

await screenshot("complete");

if (errors.length) {
  fs.writeFileSync(path.join(outputDir, "errors.json"), JSON.stringify(errors, null, 2));
  throw new Error(`Browser errors found: ${errors.join("; ")}`);
}

const finalState = JSON.parse(await fs.promises.readFile(path.join(outputDir, "complete.json"), "utf8"));
if (finalState.guide_step !== "complete") {
  throw new Error(`Guide did not complete: ${finalState.guide_step}`);
}

await browser.close();
