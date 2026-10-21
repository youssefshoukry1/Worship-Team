const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cooperativeWork(values = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../src/app/utils/cooperativeWork.js'), 'utf8').replace(/^export /gm, '');
  const context = { setTimeout, performance, DOMException, ...values };
  vm.runInNewContext(source + ';globalThis.api = { forEachChunked, sortChunked, checkCancelled };', context);
  return context.api;
}

module.exports = { cooperativeWork };
