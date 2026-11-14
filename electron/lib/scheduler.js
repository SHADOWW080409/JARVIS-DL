// Voice scheduling: items persist in the state store and fire when due.
class Scheduler {
  constructor(state, onFire) {
    this.state = state;
    this.onFire = onFire;
  }

  start() {
    this.timer = setInterval(() => this.tick(), 5000);
    this.tick();
  }

  add(item) {
    const items = this.state.get('items');
    items.push({ id: Date.now(), ...item });
    this.state.set('items', items);
  }

  list() { return this.state.get('items'); }

  tick() {
    const now = Date.now();
    const items = this.state.get('items');
    const due = items.filter((i) => Date.parse(i.when) <= now);
    if (!due.length) return;
    this.state.set('items', items.filter((i) => !due.includes(i)));
    due.forEach((i) => this.onFire(i));
  }
}

module.exports = { Scheduler };
