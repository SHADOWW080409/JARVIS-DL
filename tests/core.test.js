const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractJson } = require('../electron/lib/llm');
const { Store, merge } = require('../electron/lib/store');
const { TaskQueue } = require('../electron/lib/tasks');
const { Scheduler } = require('../electron/lib/scheduler');
const { quote } = require('../electron/lib/psHost');
const DEFAULTS = require('../electron/lib/defaults');

test('extractJson handles plain, fenced and wrapped JSON', () => {
  assert.deepStrictEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepStrictEqual(extractJson('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepStrictEqual(extractJson('Sure! {"a":3} done'), { a: 3 });
  assert.throws(() => extractJson('nope'));
});

test('merge is deep and keeps untouched keys', () => {
  const r = merge({ a: { b: 1, c: 2 } }, { a: { b: 9 } });
  assert.deepStrictEqual(r, { a: { b: 9, c: 2 } });
});

test('Store persists patches and merges over defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jv-'));
  const s = new Store(dir, 'settings', DEFAULTS);
  s.patch({ slots: { personality: 'edith' } });
  const s2 = new Store(dir, 'settings', DEFAULTS);
  assert.strictEqual(s2.get('slots').personality, 'edith');
  assert.strictEqual(s2.get('slots').soul.style, 'geodisc');
});

test('TaskQueue runs only one computer task at a time', async () => {
  const q = new TaskQueue();
  let running = 0;
  let peak = 0;
  const job = () => async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 20));
    running--;
    return 'ok';
  };
  const a = q.add('a', 'computer', job());
  const b = q.add('b', 'computer', job());
  await Promise.all([a.done, b.done]);
  assert.strictEqual(peak, 1);
});

test('TaskQueue reports errors as speech', async () => {
  const q = new TaskQueue();
  const t = q.add('x', 'think', async () => { throw new Error('boom'); });
  assert.strictEqual(await t.done, 'Sorry, boom');
});

test('Scheduler fires due items once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jv-'));
  const st = new Store(dir, 'state', { items: [] });
  const fired = [];
  const s = new Scheduler(st, (i) => fired.push(i.task));
  s.add({ when: new Date(Date.now() - 1000).toISOString(), task: 'past' });
  s.add({ when: new Date(Date.now() + 3600000).toISOString(), task: 'future' });
  s.tick();
  s.tick();
  assert.deepStrictEqual(fired, ['past']);
  assert.strictEqual(s.list().length, 1);
});

test('PowerShell quoting escapes single quotes', () => {
  assert.strictEqual(quote("it's"), "'it''s'");
});
