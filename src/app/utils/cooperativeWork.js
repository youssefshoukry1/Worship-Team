// Yield between CPU batches so input, navigation and audio timers can run.
// A microtask (Promise.resolve) would keep blocking the same browser task.
export function yieldToMain() {
  if (typeof globalThis.scheduler?.yield === 'function') return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

export function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('Work cancelled', 'AbortError');
}

export async function forEachChunked(items, visit, { signal } = {}) {
  checkCancelled(signal);
  // Let the page commit its loading state before the first large batch.
  if (items.length > 256) await yieldToMain();
  let started = performance.now();
  for (let i = 0; i < items.length; i++) {
    checkCancelled(signal);
    if (visit(items[i], i) === false) break;
    if ((i + 1) % 32 === 0 && (i + 1) < items.length && performance.now() - started >= 5) {
      await yieldToMain();
      started = performance.now();
    }
  }
  checkCancelled(signal);
}

// Sorting bounded runs and yielding during merges also bounds a large sort;
// splitting just the scan would leave the final native sort in one task.
export async function sortChunked(items, compare, { signal } = {}) {
  const result = items.slice();
  const run = 256;
  if (result.length > run) await yieldToMain();
  let started = performance.now();
  for (let start = 0; start < result.length; start += run) {
    checkCancelled(signal);
    result.splice(start, Math.min(run, result.length - start), ...result.slice(start, start + run).sort(compare));
    if (start + run < result.length && performance.now() - started >= 5) {
      await yieldToMain();
      started = performance.now();
    }
  }
  let source = result;
  let target = new Array(result.length);
  for (let width = run; width < result.length; width *= 2) {
    for (let start = 0; start < result.length; start += width * 2) {
      let left = start, right = Math.min(start + width, result.length);
      const mid = right, end = Math.min(start + width * 2, result.length);
      for (let out = start; out < end; out++) {
        // Like Array.sort, a NaN comparison is a tie and keeps source order.
        target[out] = left < mid && (right >= end || !(compare(source[left], source[right]) > 0)) ? source[left++] : source[right++];
        if ((out + 1) % 256 === 0 && performance.now() - started >= 5) {
          await yieldToMain();
          checkCancelled(signal);
          started = performance.now();
        }
      }
    }
    [source, target] = [target, source];
  }
  checkCancelled(signal);
  return source;
}
