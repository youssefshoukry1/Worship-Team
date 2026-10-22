// Run against a local Next server: node --test tests/profile-photo-webkit.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { webkit, devices } from 'playwright';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let browser;
before(async () => { browser = await webkit.launch(); });
after(async () => { await browser?.close(); });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const photoUrl = 'https://avatars.example.test/new.webp';
const oldPhotoUrl = 'https://avatars.example.test/old.png';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

async function setup(t, { fail = false, existing = false, pngFallback = false, desktop = false } = {}) {
  const context = await browser.newContext({ ...(desktop ? devices['Desktop Safari'] : devices['iPhone 13']), serviceWorkers: 'block' });
  const gate = deferred();
  t.after(async () => { gate.resolve(); await context.close(); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ existing, pngFallback, oldPhotoUrl }) => {
    localStorage.setItem('wasla_splash_version', '1.0.6');
    localStorage.setItem('user_Taspe7_Token', 'photo-test-token');
    localStorage.setItem('user_Taspe7_ID', 'photo-test-user');
    localStorage.setItem('user_Taspe7_Username', 'photo-tester');
    localStorage.setItem('user_Taspe7_GlobalRole', 'USER');
    if (existing) localStorage.setItem('user_Taspe7_ProfilePhoto', oldPhotoUrl);
    // Exercise client-side tab navigation without a real caching worker.
    Object.defineProperty(navigator.serviceWorker, 'controller', { value: { scriptURL: '/sw.js?v=navigation-v2' } });
    window.__drawSizes = [];
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      window.__drawSizes.push([this.canvas.width, this.canvas.height]);
      return drawImage.apply(this, args);
    };
    if (pngFallback) {
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback) { return toBlob.call(this, callback, 'image/png'); };
    }
  }, { existing, pngFallback, oldPhotoUrl });
  const state = { saved: false, metadata: null, uploaded: null };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' };
  await page.route('**/version.json?*', route => route.fulfill({ json: { version: '1.0.6' } }));
  await page.route('https://avatars.example.test/**', route => route.fulfill({ body: pixel, contentType: 'image/png', headers: cors }));
  await page.route('https://storage.example.test/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    state.uploaded = route.request().postDataBuffer();
    assert.equal(route.request().headers()['content-type'], state.metadata.mimeType);
    return route.fulfill({ status: 200, headers: cors });
  });
  await page.route(/\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    const reply = (json, status = 200) => route.fulfill({ json, status, headers: cors });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (path.endsWith('/profile-photo/upload-url')) {
      state.metadata = route.request().postDataJSON();
      await gate.promise;
      return fail ? reply({ message: 'Test upload failed' }, 500) : reply({ uploadUrl: 'https://storage.example.test/upload', fileUrl: photoUrl });
    }
    if (path.endsWith('/profile-photo/confirm')) { state.saved = true; return reply({ profilePhoto: photoUrl }); }
    if (path.endsWith('/my-profile')) return reply({ user: {
      _id: 'photo-test-user', Name: 'Photo Tester', username: 'photo-tester',
      profilePhoto: state.saved ? photoUrl : (existing ? oldPhotoUrl : null),
      bibleNotes: [], bibleHighlights: [], prayTime: [],
    } });
    if (path.endsWith('/my-teams')) return reply({ teams: [] });
    return reply({ friends: [], incoming: [], outgoing: [], users: [], data: [] });
  });
  await page.goto(process.env.PROFILE_TEST_URL || 'http://localhost:3000/normal_UserProfile', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Photo Tester', exact: true }).waitFor();
  return { page, gate, state, errors };
}

async function selectPhoto(page, { noisy = false, portrait = false, beforeConfirm } = {}) {
  const base64 = await page.evaluate(({ noisy, portrait }) => {
    const canvas = document.createElement('canvas');
    canvas.width = noisy ? 3000 : portrait ? 4000 : 8000;
    canvas.height = noisy ? 3000 : 6000;
    const ctx = canvas.getContext('2d');
    if (noisy) {
      const data = ctx.createImageData(canvas.width, canvas.height);
      let random = 123;
      for (let i = 0; i < data.data.length; i += 4) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        data.data[i] = random & 255;
        data.data[i + 1] = (random >>> 8) & 255;
        data.data[i + 2] = (random >>> 16) & 255;
        data.data[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
    } else {
      ctx.fillStyle = '#ef4444'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(2000, 1000, 4000, 4000);
    }
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  }, { noisy, portrait });
  const buffer = Buffer.from(base64, 'base64');
  if (noisy) assert.ok(buffer.length > 5 * 1024 * 1024, 'camera original exceeds the former 5MB limit');
  await page.locator('input[type=file]').setInputFiles({ name: 'camera.jpg', mimeType: 'image/jpeg', buffer });
  await page.getByRole('button', { name: 'Done', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('img[alt="Crop me"]')?.naturalWidth > 0);
  if (beforeConfirm) await beforeConfirm(page);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // The upload-url request is still blocked at this point.
  await page.waitForFunction(() => document.querySelector('img[alt="Profile"]')?.src.startsWith('blob:'));
  await page.waitForFunction(() => !document.querySelector('img[alt="Crop me"]'));
  const sizes = await page.evaluate(() => window.__drawSizes);
  assert.ok(sizes.length > 0);
  assert.ok(sizes.every(([w, h]) => w > 0 && h > 0 && w <= 1024 && h <= 1024), JSON.stringify(sizes));
  return page.getByAltText('Profile', { exact: true }).first();
}

test('48MP original: default crop works without dragging; preview and viewer work before upload completes', async t => {
  const { page, state, gate, errors } = await setup(t);
  const image = await selectPhoto(page);
  assert.equal(state.saved, false);
  await image.click();
  const viewer = page.locator('div.fixed').filter({ has: page.getByTitle('Remove Photo') });
  await viewer.waitFor();
  const bounds = await viewer.getByAltText('Profile', { exact: true }).boundingBox();
  const viewport = page.viewportSize();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
  assert.equal(await page.getByTitle('Remove Photo').isDisabled(), true);
  gate.resolve();
  await page.waitForFunction(url => localStorage.getItem('user_Taspe7_ProfilePhoto') === url, photoUrl);
  assert.equal(state.metadata.mimeType, 'image/webp');
  assert.ok(state.metadata.fileSize < 5 * 1024 * 1024);
  assert.deepEqual(errors, []);
});

test('upload and preview survive leaving and returning to the profile tab', async t => {
  const { page, gate, state, errors } = await setup(t);
  const image = await selectPhoto(page);
  const preview = await image.getAttribute('src');
  await page.getByRole('link', { name: 'Friends', exact: true }).click();
  await page.waitForURL(/\/friends\/?$/);
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await page.waitForURL(/\/normal_UserProfile\/?$/);
  await page.getByAltText('Profile', { exact: true }).waitFor();
  assert.equal(await page.getByAltText('Profile', { exact: true }).getAttribute('src'), preview);
  assert.equal(state.saved, false);
  gate.resolve();
  await page.waitForFunction(url => localStorage.getItem('user_Taspe7_ProfilePhoto') === url, photoUrl);
  assert.deepEqual(errors, []);
});

test('failed background upload restores the previous photo and allows retry', async t => {
  const { page, gate, errors } = await setup(t, { fail: true, existing: true });
  await selectPhoto(page);
  gate.resolve();
  await page.getByText('Test upload failed', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('button[title="Change Photo"]')?.disabled);
  assert.equal(await page.evaluate(() => localStorage.getItem('user_Taspe7_ProfilePhoto')), oldPhotoUrl);
  await page.waitForFunction(() => document.querySelector('img[alt="Profile"]')?.naturalWidth === 1);
  assert.deepEqual(errors, []);
});

test('camera files above 5MB are compressed; PNG encoder fallback uploads its actual MIME type', async t => {
  const { page, gate, state, errors } = await setup(t, { pngFallback: true, desktop: true });
  await selectPhoto(page, { noisy: true });
  gate.resolve();
  await page.waitForFunction(url => localStorage.getItem('user_Taspe7_ProfilePhoto') === url, photoUrl);
  assert.equal(state.metadata.mimeType, 'image/png');
  assert.equal(state.metadata.fileExt, 'png');
  assert.deepEqual(errors, []);
});

test('portrait crop matches the full-width grid; edge, corner, and move gestures stay aligned and square', async t => {
  const { page, gate, errors } = await setup(t);
  await selectPhoto(page, { portrait: true, beforeConfirm: async page => {
    const selection = page.locator('.ReactCrop__crop-selection');
    // Let the modal's entrance transition finish before checking its geometry.
    await selection.waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Done', exact: true }).click({ trial: true });
    const image = await page.getByAltText('Crop me').boundingBox();
    const initial = await selection.boundingBox();
    assert.ok(Math.abs(initial.width - image.width) < 2);
    assert.ok(Math.abs(initial.width - initial.height) < 2);
    assert.ok(Math.abs(initial.x - image.x) < 2);
    assert.ok(Math.abs(initial.y - image.y - (image.height - initial.height) / 2) < 2);
    const styles = await page.locator('.ReactCrop').evaluate(root => {
      const corner = root.querySelector('.ReactCrop__drag-handle.ord-nw');
      const selection = root.querySelector('.ReactCrop__crop-selection');
      const grid = root.querySelector('.ReactCrop__rule-of-thirds-vt');
      return { transform: getComputedStyle(corner).transform,
        gridColor: getComputedStyle(grid, '::before').backgroundColor,
        gridPosition: getComputedStyle(grid, '::before').left,
        width: selection.getBoundingClientRect().width,
        edges: [...root.querySelectorAll('.ReactCrop__drag-handle')].map(e => getComputedStyle(e).display) };
    });
    assert.equal(styles.transform, 'none');
    assert.equal(styles.gridColor, 'rgba(255, 255, 255, 0.45)');
    assert.ok(Math.abs(parseFloat(styles.gridPosition) - (styles.width - 2) / 3) < 2);
    assert.ok(styles.edges.every(display => display !== 'none'));
    await page.screenshot({ path: join(tmpdir(), 'taspe7-profile-crop-grid.png') });

    const top = await page.locator('.ReactCrop__drag-handle.ord-n').boundingBox();
    await page.mouse.move(top.x + top.width / 2, top.y + 8);
    await page.mouse.down();
    await page.mouse.move(top.x + top.width / 2, top.y + 78, { steps: 8 });
    await page.mouse.up();
    const resized = await selection.boundingBox();
    assert.ok(Math.abs(resized.width - (initial.width - 70)) < 2);
    assert.ok(Math.abs(resized.width - resized.height) < 2);

    // Moving the selection must carry the grid and its handles with it.
    await page.mouse.move(resized.x + resized.width / 2, resized.y + resized.height / 2);
    await page.mouse.down();
    await page.mouse.move(resized.x + resized.width / 2 + 15, resized.y + resized.height / 2 - 20, { steps: 6 });
    await page.mouse.up();
    const moved = await selection.boundingBox();
    assert.ok(Math.abs(moved.x - resized.x - 15) < 2);
    assert.ok(Math.abs(moved.y - resized.y + 20) < 2);

    const corner = await page.locator('.ReactCrop__drag-handle.ord-se').boundingBox();
    await page.mouse.move(corner.x + corner.width - 5, corner.y + corner.height - 5);
    await page.mouse.down();
    await page.mouse.move(corner.x + corner.width - 30, corner.y + corner.height - 30, { steps: 6 });
    await page.mouse.up();
    const final = await selection.boundingBox();
    assert.ok(final.width < moved.width);
    assert.ok(Math.abs(final.width - final.height) < 2);
    assert.ok(final.x >= image.x - 1 && final.y >= image.y - 1);
    assert.ok(final.x + final.width <= image.x + image.width + 1 && final.y + final.height <= image.y + image.height + 1);

    for (const [edge, key] of [['n', 'ArrowDown'], ['s', 'ArrowUp'], ['e', 'ArrowLeft'], ['w', 'ArrowRight']]) {
      const before = await selection.boundingBox();
      await page.locator(`.ReactCrop__drag-handle.ord-${edge}`).focus();
      await page.keyboard.press(`Shift+${key}`);
      await page.waitForFunction(expected => Math.abs(document.querySelector('.ReactCrop__crop-selection').getBoundingClientRect().width - expected) < 2, before.width - 10);
      const after = await selection.boundingBox();
      assert.ok(Math.abs(after.width - (before.width - 10)) < 2, `resize from ${edge}: ${before.width} -> ${after.width}`);
      assert.ok(Math.abs(after.width - after.height) < 2);
    }
    await page.getByTitle('Reset crop').click();
    const reset = await selection.boundingBox();
    assert.ok(Math.abs(reset.width - image.width) < 2);
  } });
  gate.resolve();
  await page.waitForFunction(url => localStorage.getItem('user_Taspe7_ProfilePhoto') === url, photoUrl);
  assert.deepEqual(errors, []);
});
