const fs = require('fs');
const path = require('path');

function merge(a, b) {
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) {
      a[k] = merge(a[k] && typeof a[k] === 'object' ? a[k] : {}, b[k]);
    } else {
      a[k] = b[k];
    }
  }
  return a;
}

// Tiny JSON-file store with deep-merge patching.
class Store {
  constructor(dir, name, defaults) {
    this.file = path.join(dir, name + '.json');
    this.data = merge({}, JSON.parse(JSON.stringify(defaults)));
    try {
      merge(this.data, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch { /* first run */ }
  }
  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); }
  all() { return this.data; }
  patch(o) { merge(this.data, o); this.save(); return this.data; }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    } catch (e) { console.error('Store save failed:', e.message); }
  }
}

module.exports = { Store, merge };
