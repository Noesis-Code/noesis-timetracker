// Générateur de code QR local (aucune dépendance, aucun appel réseau). Mode octets, correction d'erreur M, versions 1 à 6
// (jusqu'à 106 octets) : suffisant pour une URI otpauth:// courte. Le secret TOTP ne quitte donc jamais le serveur vers un service tiers.
const CAP = [null, // version -> { data: octets de données, ec: octets de correction par bloc, blocks: [[nb, données par bloc]], align }
  { data: 16, ec: 10, blocks: [[1, 16]], align: [] },
  { data: 28, ec: 16, blocks: [[1, 28]], align: [6, 18] },
  { data: 44, ec: 26, blocks: [[1, 44]], align: [6, 22] },
  { data: 64, ec: 18, blocks: [[2, 32]], align: [6, 26] },
  { data: 86, ec: 24, blocks: [[2, 43]], align: [6, 30] },
  { data: 108, ec: 16, blocks: [[4, 27]], align: [6, 34] },
];
const EXP = new Array(512), LOG = new Array(256);
(function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenerator(deg) {
  let g = [1];
  for (let i = 0; i < deg; i++) { const n = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { n[j] ^= g[j]; n[j + 1] ^= gmul(g[j], EXP[i]); } g = n; }
  return g;
}
function rsRemainder(data, deg) {
  const g = rsGenerator(deg), rem = new Array(deg).fill(0);
  for (const b of data) { const f = b ^ rem.shift(); rem.push(0); for (let i = 0; i < deg; i++) rem[i] ^= gmul(g[i + 1], f); }
  return rem;
}

function buildCodewords(bytes, v) {
  const c = CAP[v], bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); for (const b of bytes) put(b, 8);
  const cap = c.data * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const out = []; for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xEC; out.length < c.data; pad ^= 0xEC ^ 0x11) out.push(pad);
  const blocks = []; let k = 0;
  for (const [n, len] of c.blocks) for (let i = 0; i < n; i++) { const d = out.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, c.ec) }); }
  const res = [];
  for (let i = 0; i < Math.max(...blocks.map((b) => b.d.length)); i++) for (const b of blocks) if (i < b.d.length) res.push(b.d[i]);
  for (let i = 0; i < c.ec; i++) for (const b of blocks) res.push(b.e[i]);
  return res;
}

function encodeMatrix(bytes, v, forceMask) {
  const size = 17 + 4 * v, c = CAP[v];
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { if (x >= 0 && y >= 0 && x < size && y < size) { mod[y][x] = dark; fn[y][x] = true; } };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); }
  const n = c.align.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c.align[i] + dx, c.align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formatBits = (mask) => { const data = mask; let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); return ((data << 10) | rem) ^ 0x5412; }; // niveau M = 00
  const drawFormat = (mask) => {
    const b = formatBits(mask), bit = (i) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0); // réserve les cases de format
  const cw = buildCodewords(bytes, v), data = [];
  for (const b of cw) for (let i = 7; i >= 0; i--) data.push((b >>> i) & 1);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && i < data.length) { mod[y][x] = data[i] === 1; i++; }
    }
  }
  const maskFn = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const apply = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x]; };
  const penalty = () => {
    let p = 0;
    for (let y = 0; y < size; y++) for (const get of [(a) => mod[y][a], (a) => mod[a][y]]) { let run = 1; for (let x = 1; x < size; x++) { if (get(x) === get(x - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3;
    let dark = 0; for (const row of mod) for (const m of row) if (m) dark++;
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8 && forceMask == null; m++) { apply(m); drawFormat(m); const p = penalty(); if (p < bestP) { best = m; bestP = p; } apply(m); }
  if (forceMask != null) best = forceMask;
  apply(best); drawFormat(best);
  return mod;
}

// Retourne la matrice booléenne d'un QR pour `text` (UTF-8), ou lève si le texte dépasse 106 octets.
function qrMatrix(text, forceMask) {
  const bytes = Buffer.from(String(text), 'utf8');
  for (let v = 1; v <= 6; v++) if (bytes.length <= CAP[v].data - 2) return encodeMatrix([...bytes], v, forceMask);
  throw new Error('texte trop long pour le QR local');
}

// SVG autonome (fond blanc, zone de silence de 4 modules, modules sombres) : lisible par les lecteurs même dans une interface sombre.
function qrSvg(text, { scale = 4 } = {}) {
  const m = qrMatrix(text), n = m.length, q = 4, dim = (n + 2 * q) * scale;
  let d = '';
  for (let y = 0; y < n; y++) { let x = 0; while (x < n) { if (!m[y][x]) { x++; continue; } let e = x; while (e < n && m[y][e]) e++; d += `M${(x + q) * scale} ${(y + q) * scale}h${(e - x) * scale}v${scale}h${-(e - x) * scale}z`; x = e; } }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" role="img" aria-label="Code QR"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

module.exports = { qrMatrix, qrSvg };
