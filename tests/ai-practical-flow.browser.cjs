/* eslint-disable @typescript-eslint/no-require-imports -- Browser regression suite. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/app/bible_form/AiPracticalFlow.jsx');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const component = { exports: {} };
vm.runInNewContext(compiled, {
  module: component, exports: component.exports,
  require: name => name.includes('LanguageContext') ? { useLanguage: () => ({ language: 'ar' }) } : require(name)
}, { filename });

let css;
const browsers = {};
before(async () => {
  const cssFile = path.join(root, 'src/app/globals.css');
  css = (await postcss([tailwind({ base: root })]).process(fs.readFileSync(cssFile, 'utf8'), { from: cssFile })).css;
  for (const [engine, type] of Object.entries({ chromium, webkit })) browsers[engine] = await type.launch();
});
after(async () => { await Promise.all(Object.values(browsers).map(browser => browser.close())); });

for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: application uses ordered action cards across mobile and desktop widths`, async () => {
    const page = await browsers[engine].newPage();
    try {
      for (const width of [320, 390, 1024]) for (const count of [2, 3]) {
        await page.setViewportSize({ width, height: 650 });
        const titles = ['صلِّ قبل القرار', 'راجع التزامك', 'تصرّف بأمانة'].slice(0, count);
        const flow = { steps: titles.map(title => ({ title })) };
        const markup = renderToStaticMarkup(React.createElement(component.exports.default, { flow }));
        await page.setContent(`<html lang="ar" dir="rtl"><head><style>${css}</style><style>body{margin:0;padding:16px;background:#060b13;color:#f1f5f9}main{max-width:480px;margin:auto}</style></head><body><main>${markup}</main></body></html>`);
        const figure = page.getByRole('figure', { name: 'خطوات التطبيق العملي' });
        assert.equal(await figure.locator('[data-ai-practical-step]').count(), count);
        assert.equal(await figure.locator('svg, [data-ai-journey]').count(), 0);
        for (const title of titles) assert.equal(await figure.getByText(title, { exact: true }).count(), 1);
        const boxes = await figure.locator('li').evaluateAll(elements => elements.map(element => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, content: element.scrollWidth, client: element.clientWidth };
        }));
        assert.ok(boxes.every(box => Math.abs(box.y - boxes[0].y) < 1));
        assert.ok(boxes[0].x > boxes.at(-1).x, 'Action order stays right to left');
        const textBoxes = await figure.locator('li > span:not([aria-hidden])').evaluateAll(elements => elements.map(element => ({ content: element.scrollWidth, client: element.clientWidth })));
        assert.ok(textBoxes.every(box => box.content <= box.client + 1), `Action text fits its card: ${JSON.stringify({ width, count, textBoxes })}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const colors = await figure.locator('li > span[aria-hidden="true"]').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
        assert.notEqual(colors[0], colors.at(-1), 'The last action has a distinct green accent');
        if (width === 390 && count === 3) {
          const preview = path.join(process.env.AI_MODE_SCREENSHOT_DIR || os.tmpdir(), `wasla-practical-flow-${engine}.png`);
          await page.screenshot({ path: preview });
        }
      }
    } finally { await page.close(); }
  });
}
