const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/utils/interiorSwipe.js', 'utf8').replaceAll('export ', '');
const context = vm.createContext({}); vm.runInContext(source, context);
const release = (points, amount, now) => context.swipeRelease(points.map(([time, amount]) => ({ time, amount })), amount, 390, now);
test('short flick commits, while an equally short slow drag returns', () => {
  assert.equal(release([[0,0],[20,16],[40,36]],36,40).completed,true);
  assert.equal(release([[0,0],[200,16],[400,36]],36,400).completed,false);
});
test('holding before a flick does not dilute recent velocity', () => {
  assert.equal(release([[0,0],[500,0],[520,16],[540,36]],36,540).completed,true);
});
test('paused momentum, tiny jitter and a fast reversal cannot commit', () => {
  assert.equal(release([[0,0],[20,36]],36,150).completed,false);
  assert.equal(release([[0,0],[10,12]],12,10).completed,false);
  assert.equal(release([[0,0],[200,200],[240,160],[280,120]],120,280).completed,false);
});
test('a long slow drag commits and return settling stays gentle and bounded', () => {
  assert.equal(release([[0,0],[400,130]],130,400).completed,true);
  const duration=context.swipeSettleDuration(false,36,390);
  assert.ok(duration >= 240 && duration <= 280);
  assert.ok(context.swipeSettleDuration(true,36,390,3) < context.swipeSettleDuration(true,36,390,0));
  assert.equal(context.swipeSettleDuration(false,0,390),0);
});


test('lighter flicks and shorter slow drags navigate without accepting tiny movements', () => {
  assert.equal(release([[0,0],[20,10],[40,20]],20,40).completed,true);
  assert.equal(release([[0,0],[20,10],[40,17]],17,40).completed,false);
  assert.equal(release([[0,0],[200,35],[400,72]],72,400).completed,true);
  assert.equal(release([[0,0],[200,30],[400,60]],60,400).completed,false);
});
