// Offline image smoke test (CI runs it inside the built worker image with `--network none`; also runs on the host):
// the AI config parses and Playwright's Chromium launches and renders. No DB, no network, no env needed.
import { chromium } from 'playwright';
import { DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';

const config = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
if (Object.keys(config.tasks).length === 0) throw new Error(`no AI tasks in ${DEFAULT_AI_CONFIG_PATH}`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><p id="x">image-smoke</p>');
  const text = await page.textContent('#x');
  if (text !== 'image-smoke') throw new Error(`Chromium rendered ${JSON.stringify(text)}`);
} finally {
  await browser.close();
}
process.stdout.write('image-smoke ok\n');
