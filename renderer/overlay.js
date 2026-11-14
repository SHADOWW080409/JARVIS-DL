const c = document.getElementById('c');
const g = c.getContext('2d');
function fit() { c.width = innerWidth; c.height = innerHeight; render(); }

const strokes = [];
let cur = null;

function render() {
  g.clearRect(0, 0, c.width, c.height);
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = '#5ec8ff';
  g.shadowColor = '#5ec8ff';
  g.shadowBlur = 14;
  for (const s of strokes) {
    g.beginPath();
    s.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
}

function sendBox(s) {
  const xs = s.map((p) => p[0]);
  const ys = s.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  window.overlay.bbox({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
}

addEventListener('resize', fit);
addEventListener('mousedown', (e) => {
  cur = [[e.clientX, e.clientY]];
  strokes.push(cur);
  document.getElementById('tip').style.display = 'none';
});
addEventListener('mousemove', (e) => {
  if (!cur) return;
  cur.push([e.clientX, e.clientY]);
  render();
  sendBox(cur);
});
addEventListener('mouseup', () => {
  if (cur) sendBox(cur);
  cur = null;
});
fit();
