// Multitask queue: up to 3 tasks run at once, but only one "computer" task
// (the one that drives mouse/keyboard) may run at a time.
class TaskQueue {
  constructor(onChange) {
    this.list = [];
    this.n = 0;
    this.onChange = onChange || (() => {});
  }

  add(title, kind, fn) {
    const t = { id: ++this.n, title, kind, status: 'queued', cancelled: false, _fn: fn };
    t.done = new Promise((res) => { t._res = res; });
    this.list.push(t);
    this.pump();
    this.emit();
    return t;
  }

  pump() {
    const running = this.list.filter((t) => t.status === 'running');
    for (const t of this.list.filter((x) => x.status === 'queued')) {
      if (running.length >= 3) break;
      if (t.kind === 'computer' && running.some((r) => r.kind === 'computer')) continue;
      this.run(t);
      running.push(t);
    }
  }

  async run(t) {
    t.status = 'running';
    this.emit();
    try {
      const r = await t._fn(t);
      t.status = t.cancelled ? 'cancelled' : 'done';
      t._res(r);
    } catch (e) {
      t.status = 'error';
      t.error = e.message;
      t._res(`Sorry, ${e.message}`);
    }
    this.emit();
    this.pump();
    setTimeout(() => {
      this.list = this.list.filter((x) => x !== t);
      this.emit();
    }, 4000);
  }

  cancelAll() {
    for (const t of this.list) {
      if (t.status === 'queued') { t.status = 'cancelled'; t.cancelled = true; t._res('Cancelled.'); }
      else if (t.status === 'running') t.cancelled = true;
    }
    this.emit();
  }

  emit() {
    this.onChange(this.list.map(({ id, title, kind, status }) => ({ id, title, kind, status })));
  }
}

module.exports = { TaskQueue };
