// Canvas-rendered animated "soul": geodisc or constellation. Reacts to state and mic level.
class Orb {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.t = 0;
    this.style = 'geodisc';
    this.color = '#5ec8ff';
    this.state = 'idle';
    this.level = 0;
    this.nodes = Array.from({ length: 26 }, () => ({
      a: Math.random() * Math.PI * 2, r: 0.3 + Math.random() * 0.65, s: (Math.random() - 0.5) * 0.8, p: Math.random() * 6.28,
    }));
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setState(s) { this.state = s; }
  setLevel(l) { this.level = l; }

  rgba(a) {
    const h = this.color.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  loop() {
    const g = this.g;
    const W = this.c.width;
    const cx = W / 2;
    const cy = this.c.height / 2;
    const R = W * 0.42;
    const speed = { idle: 0.4, listening: 1.2, thinking: 2.4, speaking: 1.6, error: 0.2 }[this.state] || 0.4;
    this.t += 0.016 * speed;
    const t = this.t;
    const amp = this.state === 'listening' ? 0.06 + this.level * 0.6
      : this.state === 'speaking' ? 0.1 + 0.08 * Math.sin(t * 6) : 0.04;

    g.clearRect(0, 0, W, W);
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
    glow.addColorStop(0, this.rgba(0.35));
    glow.addColorStop(1, this.rgba(0));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
    g.fill();

    g.lineWidth = 2;
    if (this.style === 'constellation') this.drawConstellation(g, cx, cy, R, amp, t);
    else this.drawGeodisc(g, cx, cy, R, amp, t);

    g.fillStyle = this.rgba(0.9);
    g.beginPath();
    g.arc(cx, cy, R * (0.14 + amp * 0.4), 0, Math.PI * 2);
    g.fill();
    requestAnimationFrame(this.loop);
  }

  drawGeodisc(g, cx, cy, R, amp, t) {
    for (let k = 0; k < 5; k++) {
      const r = R * (0.35 + 0.13 * k) * (1 + amp * Math.sin(t * 2 + k));
      const sides = 6 + k;
      const rot = t * (k % 2 ? 1 : -1) * (0.3 + k * 0.1);
      g.strokeStyle = this.rgba(0.85 - k * 0.12);
      g.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
    }
  }

  drawConstellation(g, cx, cy, R, amp, t) {
    const pts = this.nodes.map((n) => {
      const a = n.a + t * n.s;
      const r = n.r * R * (1 + amp * Math.sin(t * 3 + n.p));
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (d < R * 0.65) {
          g.strokeStyle = this.rgba(0.5 * (1 - d / (R * 0.65)));
          g.beginPath();
          g.moveTo(pts[i][0], pts[i][1]);
          g.lineTo(pts[j][0], pts[j][1]);
          g.stroke();
        }
      }
    }
    g.fillStyle = this.rgba(0.95);
    for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  }
}
