const assert = require('assert');
const fs = require('fs');
const { parseChat, searchChat, setChat } = require('../server');

const raw = fs.readFileSync('tests/sample-chat.txt', 'utf8');
const messages = parseChat(raw);

assert.strictEqual(messages.length, 4);
setChat(messages);

const daily = searchChat('tamam', 'day');
assert.strictEqual(daily.found, true);
assert.strictEqual(daily.stats.total, 3);
assert.strictEqual(daily.values.reduce((sum, value) => sum + value, 0), 3);

const monthly = searchChat('tamam', 'month');
assert.strictEqual(monthly.labels.length, 2);
assert.deepStrictEqual(monthly.values, [2, 1]);

const missing = searchChat('yok', 'day');
assert.strictEqual(missing.found, false);

console.log('backend smoke ok');
