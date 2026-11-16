const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ Map, Set });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/pray/prayerListLayout.js'), 'utf8').replaceAll('export ', ''), context);
const { prayerListLayout: layout, prayerWindow: windowFor, prayerBatchFor: batch } = context;
const items = count => Array.from({ length: count }, (_, i) => ({ _id: String(i) }));

test('variable heights use exact offsets, including boundaries and empty lists', () => {
    const result = layout(items(4), new Map([['0', 100], ['1', 3000], ['2', 75]]));
    assert.deepEqual(Array.from(result.offsets), [0, 100, 3100, 3175, 3355]);
    assert.deepEqual([-1, 0, 99, 100, 3099, 3100, 3355, 9999].map(result.indexAt), [0, 0, 0, 1, 1, 2, 3, 3]);
    assert.deepEqual(Array.from(windowFor(layout([], new Map()), 0, 844, 0)), []);
});

test('window stays bounded across 2000 rows and pins only one distant focused editor', () => {
    const result = layout(items(2000), new Map());
    for (let top = 0; top < result.total; top += 1000) {
        const indices = Array.from(windowFor(result, top, 844, 2000, '0'));
        assert.ok(indices.length <= 11); assert.ok(indices.includes(0));
        assert.equal(new Set(indices).size, indices.length);
    }
});

test('deep targets expose the needed batch directly without exceeding collection size', () => {
    assert.equal(batch(0, 0), 0); assert.equal(batch(0, 1), 1);
    assert.equal(batch(9, 2000), 10); assert.equal(batch(10, 2000), 20);
    assert.equal(batch(1999, 2000), 2000); assert.equal(batch(10, 11), 11);
    assert.equal(batch(0, 2000, 500), 500);
});
