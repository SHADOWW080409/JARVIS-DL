const test = require('node:test');
const assert = require('node:assert');
const s = require('../electron/lib/safety');

test('risky goals', () => {
  assert.ok(s.isRiskyGoal('delete all my files'));
  assert.ok(s.isRiskyGoal('Buy this on Amazon'));
  assert.ok(!s.isRiskyGoal('open notepad and write a note'));
});
test('risky actions', () => {
  assert.ok(s.isRiskyAction({ action: 'open_app', name: 'powershell' }));
  assert.ok(s.isRiskyAction({ action: 'key', keys: 'alt+f4' }));
  assert.ok(s.isRiskyAction({ action: 'type', text: 'rm -rf /' }));
  assert.ok(!s.isRiskyAction({ action: 'open_app', name: 'notepad' }));
  assert.ok(!s.isRiskyAction({ action: 'click', x: 1, y: 2 }));
  assert.ok(!s.isRiskyAction(null));
});
test('describe', () => {
  assert.strictEqual(s.describe({ action: 'key', keys: 'enter' }), 'press enter');
  assert.strictEqual(s.describe({ action: 'click', x: 5, y: 6 }), 'click at (5, 6)');
});
