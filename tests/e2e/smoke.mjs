// End-to-end smoke test: drives the real UI in headless Chromium (software WebGL).
//   npm run smoke          (starts its own Vite dev server)
// Screenshots are written to ./screenshots/.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const SHOTS = 'screenshots';
mkdirSync(SHOTS, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
page.on('dialog', (d) => d.accept());

const step = (name) => console.log(`• ${name}`);
const game = (fn, arg) => page.evaluate(fn, arg);
const count = () => game(() => window.__battlesim.game.placement.length);
// World (x, z) on the ground -> client pixel coordinates.
const toScreen = (x, z) => game(([x, z]) => {
  const { renderer } = window.__battlesim;
  const v = renderer.camera.position.clone().set(x, 0, z).project(renderer.camera);
  const r = renderer.canvas.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, [x, z]);

try {
  step('load');
  await page.goto(url);
  await page.waitForFunction(() => window.__battlesim, null, { timeout: 20000 });
  await page.waitForSelector('#help:not([hidden])');
  await page.screenshot({ path: `${SHOTS}/01-help.png` });
  await page.click('#help button.primary');
  await page.waitForFunction(() => document.querySelectorAll('.card img').length > 0, null, { timeout: 20000 });
  assert.ok((await count()) > 0, 'starter armies placed');

  step('clear and place with real clicks');
  await page.click('#clearAllBtn'); await page.click('#clearAllBtn');
  assert.equal(await count(), 0);
  await game(() => { window.__battlesim.renderer.controls.target.set(0, 0, 0); window.__battlesim.renderer.camera.position.set(0, 30, 34); });
  await page.waitForTimeout(300);
  await page.click('.team-toggle .red');
  await page.click('.card[data-id="clubber"]');
  const a = await toScreen(-12, -8), b = await toScreen(-12, 8);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 20, a.y + ((b.y - a.y) * i) / 20);
  await page.mouse.up();
  const painted = await count();
  assert.ok(painted >= 8, `drag painted a line (got ${painted})`);

  await page.click('.team-toggle .blue');
  await page.click('.eras button[data-era="medieval"]');
  await page.click('.card[data-id="swordsman"]');
  for (let i = 0; i < 6; i++) {
    const p = await toScreen(10, -5 + i * 2);
    await page.mouse.click(p.x, p.y);
  }
  await page.click('.eras button[data-era="heroes"]');
  await page.click('.card[data-id="beamer"]');
  const hb = await toScreen(16, 0);
  await page.mouse.click(hb.x, hb.y);
  const placed = await count();
  assert.equal(placed, painted + 7, 'clicked units placed');
  const teams = await game(() => window.__battlesim.game.teamCounts());
  assert.deepEqual(teams, [painted, 7]);

  step('eraser');
  await page.click('#eraseBtn');
  const e = await toScreen(10, -5);
  await page.mouse.move(e.x, e.y);
  await page.mouse.click(e.x, e.y);
  assert.equal(await count(), placed - 1, 'eraser removed a unit');
  await page.keyboard.press('x');
  await page.screenshot({ path: `${SHOTS}/02-edit.png` });

  step('battle');
  const before = await count();
  await page.click('#startBtn');
  assert.equal(await game(() => window.__battlesim.game.state), 'battle');
  await page.click('.speed button[data-speed="4"]');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/03-battle.png` });
  await page.waitForSelector('#banner:not([hidden])', { timeout: 120000 });
  const title = await page.textContent('#bannerTitle');
  assert.match(title, /wins|draw/i);
  console.log(`  result: ${title} (${await page.textContent('#bannerStats')})`);
  await page.screenshot({ path: `${SHOTS}/04-result.png` });

  step('reset restores the setup');
  await page.click('#bannerReset');
  assert.equal(await game(() => window.__battlesim.game.state), 'edit');
  assert.equal(await count(), before);
  assert.equal(await game(() => window.__battlesim.game.world.units.length), before);

  step('save slot + autosave survive reload');
  await page.click('#saveBtn');
  await page.fill('#saveName', 'Smoke test army');
  await page.click('#saveConfirm');
  await page.waitForSelector('#slotList li b');
  assert.equal(await page.textContent('#slotList li b'), 'Smoke test army');
  await page.click('#modal .close');
  await page.waitForTimeout(600); // autosave debounce
  await page.reload();
  await page.waitForFunction(() => window.__battlesim, null, { timeout: 20000 });
  assert.equal(await page.isHidden('#help'), true, 'help only shows on first visit');
  assert.equal(await count(), before, 'autosave restored');
  await page.click('#clearAllBtn'); await page.click('#clearAllBtn');
  await page.click('#saveBtn');
  await page.click('#slotList li button.primary');
  assert.equal(await count(), before, 'slot loaded');

  step('share code export/import');
  await page.click('#saveBtn');
  await page.click('#exportBtn');
  await page.waitForFunction(() => document.querySelector('#shareCode').value.startsWith('BSIM'));
  const code = await page.inputValue('#shareCode');
  await page.click('#modal .close');
  await page.click('#clearAllBtn'); await page.click('#clearAllBtn');
  assert.equal(await count(), 0);
  await page.click('#saveBtn');
  await page.fill('#shareCode', 'definitely not a code');
  await page.click('#importBtn');
  await page.waitForSelector('#shareMsg.err');
  await page.fill('#shareCode', code);
  await page.click('#importBtn');
  await page.waitForSelector('#modal', { state: 'hidden' });
  assert.equal(await count(), before, 'imported from share code');

  step('random battle + scenarios');
  await page.click('#randomBtn');
  assert.ok((await game(() => window.__battlesim.game.teamCounts())).every((n) => n > 0));
  await page.click('#saveBtn');
  await page.click('#scenarioList button');
  assert.ok((await count()) > 50, 'scenario loaded');
  await page.screenshot({ path: `${SHOTS}/05-scenario.png` });

  const info = await game(() => window.__battlesim.renderer.gl.info.render);
  console.log(`  draw calls: ${info.calls}`);
  assert.deepEqual(problems, [], 'no page/console errors');
  console.log('\nSmoke test passed ✔');
} catch (err) {
  await page.screenshot({ path: `${SHOTS}/failure.png` }).catch(() => {});
  console.error('\nSmoke test FAILED:', err.message);
  if (problems.length) console.error(problems.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
