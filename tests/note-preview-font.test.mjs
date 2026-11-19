import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../src/app/components/testimonies/', import.meta.url);
test('note previews choose three measured font sizes and truncate only overflowing text', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    const css = await readFile(new URL('testimonies.module.css', root), 'utf8');
    const source = await readFile(new URL('fitNotePreview.js', root), 'utf8');
    await page.setContent('<style>* { box-sizing: border-box; } body { display: flex; flex-wrap: wrap; }</style>');
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: source.replace('export function', 'function') });
    const result = await page.evaluate(async () => {
      const headings = [];
      for (const withAuthor of [false, true]) {
        for (let count = 1; count <= 80; count++) {
          const card = document.createElement('div');
          card.className = withAuthor ? 'miniNote' : 'miniNote withoutAuthor';
          card.innerHTML = `<button class="noteReadButton">
            <h3 dir="auto"></h3>
            <span class="previewMeasures" aria-hidden="true">
              <span dir="auto" data-preview-size="10"></span><span dir="auto" data-preview-size="9"></span>
            </span>
          </button>`;
          const text = card.querySelector('h3');
          text.textContent = count === 1 ? 'شكرا يارب' : 'في البدء كان الكلمة '.repeat(count);
          document.body.append(card);
          for (const probe of card.querySelectorAll('[data-preview-size]')) probe.textContent = text.textContent;
          observeNotePreview(text.parentElement);
          headings.push(text);
        }
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return headings.map(text => {
        const size = parseFloat(text.style.fontSize);
        const clipped = text.scrollHeight > text.clientHeight + 1;
        const buttonStyle = getComputedStyle(text.parentElement);
        const available = text.parentElement.clientHeight - parseFloat(buttonStyle.paddingTop) - parseFloat(buttonStyle.paddingBottom);
        return { size, clipped, fitsBox: text.clientHeight <= available + 1 };
      });
    });
    assert.deepEqual([...new Set(result.map(item => item.size))].sort(), [10, 8, 9]);
    assert.equal(result[0].size, 10);
    assert.equal(result[0].clipped, false);
    assert.ok(result.some(item => item.size === 9 && !item.clipped));
    assert.ok(result.some(item => item.size === 8 && item.clipped));
    assert.ok(result.filter(item => item.size > 8).every(item => !item.clipped));
    assert.ok(result.every(item => item.fitsBox));
  } finally { await browser.close(); }
});
