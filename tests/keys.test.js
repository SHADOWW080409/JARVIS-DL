const test = require('node:test');
const assert = require('node:assert');
const { toSendKeys, parseWin } = require('../electron/lib/keys');

test('ctrl+s -> ^s', () => assert.strictEqual(toSendKeys('ctrl+s'), '^s'));
test('ctrl+shift+t', () => assert.strictEqual(toSendKeys('Ctrl+Shift+T'), '^+t'));
test('named keys', () => {
  assert.strictEqual(toSendKeys('enter'), '{ENTER}');
  assert.strictEqual(toSendKeys('alt+f4'), '%{F4}');
});
test('special characters are escaped', () => assert.strictEqual(toSendKeys('ctrl+('), '^{(}'));
test('missing key throws', () => assert.throws(() => toSendKeys('ctrl+')));
test('unknown key throws', () => assert.throws(() => toSendKeys('ctrl+banana')));
test('win combos', () => {
  assert.deepStrictEqual(parseWin('win+d'), { vk: 68 });
  assert.deepStrictEqual(parseWin('win+left'), { vk: 0x25 });
  assert.strictEqual(parseWin('ctrl+c'), null);
});
