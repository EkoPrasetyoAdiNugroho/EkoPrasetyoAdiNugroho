// Generates assets/contrib-game.svg — an "advanced" arcade snake that HUNTS
// contribution cells (greedy nearest-food path), with neon glow, a gradient
// tapered body, eat-burst particles, a running score and CRT scanlines.
// Self-hosted (no Action / external service). Token: env GH_TOKEN / GITHUB_TOKEN.
import { writeFileSync, mkdirSync } from "node:fs";

const LOGIN = process.env.STATS_USER || "EkoPrasetyoAdiNugroho";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error("No token"); process.exit(1); }

async function gql(query, variables) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const to = new Date();
const from = new Date(to.getTime() - 371 * 24 * 3600 * 1000);
const data = await gql(`
  query($login:String!,$from:DateTime!,$to:DateTime!){
    user(login:$login){ contributionsCollection(from:$from,to:$to){
      contributionCalendar{ totalContributions
        weeks{ contributionDays{ contributionCount weekday } } } } }
  }`, { login: LOGIN, from: from.toISOString(), to: to.toISOString() });

const cal = data.user.contributionsCollection.contributionCalendar;
let weeks = cal.weeks.map(w => {
  const col = new Array(7).fill(0);
  for (const d of w.contributionDays) col[d.weekday] = d.contributionCount;
  return col;
});
weeks = weeks.slice(-52);
const COLS = weeks.length, ROWS = 7;
const maxC = Math.max(1, ...weeks.flat());

// ---------- theme ----------
const BG = "#090c12", LINE = "#1b2330", TEXT = "#e6edf3", MUTE = "#8b949e";
const GOLD = "#FFD166", EMER = "#06D6A0";
const FONT = "'JetBrains Mono','Fira Code',Consolas,'Courier New',monospace";
const LEVEL = ["#121a16", "#0d4a36", "#11845f", "#06D6A0", "#8dffe0"];
const EMPTY = "#121a16";
function level(c) {
  if (!c) return 0;
  const r = c / maxC;
  if (r <= 0.1) return 1;
  if (r <= 0.3) return 2;
  if (r <= 0.6) return 3;
  return 4;
}
function hexLerp(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

// ---------- layout ----------
const STEP = 13, CELL = 11, GX = 18, GY = 50;
const W = GX * 2 + COLS * STEP, H = GY + ROWS * STEP + 18;
const cx = c => GX + c * STEP + CELL / 2;
const cy = r => GY + r * STEP + CELL / 2;

// ---------- hunting path: greedy nearest unvisited lit cell ----------
const lit = [];
for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (weeks[c][r] > 0) lit.push({ c, r, count: weeks[c][r] });

function nnOrder(cells) {
  if (!cells.length) return [];
  const rest = cells.slice();
  rest.sort((a, b) => (a.c - b.c) || (a.r - b.r));
  const order = [rest.shift()];
  while (rest.length) {
    const cur = order[order.length - 1];
    let bi = 0, bd = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const d = (rest[i].c - cur.c) ** 2 + (rest[i].r - cur.r) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    order.push(rest.splice(bi, 1)[0]);
  }
  return order;
}
const foods = nnOrder(lit);

// step one cell at a time from a->b (excludes a, includes b); col first then row
function manhattan(a, b) {
  const pts = []; let c = a.c, r = a.r;
  const sc = Math.sign(b.c - c), sr = Math.sign(b.r - r);
  while (c !== b.c) { c += sc; pts.push({ c, r }); }
  while (r !== b.r) { r += sr; pts.push({ c, r }); }
  return pts;
}

// build closed-loop point path; record which point indices are food (+count)
let pts = [];
const foodAt = new Map();
if (foods.length) {
  pts.push({ c: foods[0].c, r: foods[0].r });
  foodAt.set(0, foods[0].count);
  for (let i = 1; i < foods.length; i++) {
    const seg = manhattan(foods[i - 1], foods[i]);
    for (const p of seg) pts.push(p);
    foodAt.set(pts.length - 1, foods[i].count);
  }
  for (const p of manhattan(foods[foods.length - 1], foods[0])) pts.push(p); // close loop
} else {
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) pts.push({ c, r });
}
const NP = pts.length;
const routeD = "M" + pts.map(p => `${cx(p.c)},${cy(p.r)}`).join(" L");

// ---------- timing ----------
const DUR = Math.min(26, Math.max(14, NP / 20)).toFixed(1) * 1;
const NSEG = 16;
const headBegin = -DUR * 0.5;
const frac = idx => NP > 1 ? idx / (NP - 1) : 0;
const foodTime = idx => (headBegin + frac(idx) * DUR);

// ---------- cells ----------
let cellSvg = "";
for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
  const lv = level(weeks[c][r]);
  const x = GX + c * STEP, y = GY + r * STEP;
  cellSvg += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${lv ? LEVEL[lv] : EMPTY}"/>`;
}
// eat overlays + bursts + halos (food cells only, synced to head arrival)
let eatSvg = "", burstSvg = "", haloSvg = "";
for (const [idx, count] of foodAt) {
  const p = pts[idx], lv = level(count);
  const x = GX + p.c * STEP, y = GY + p.r * STEP, d = foodTime(idx).toFixed(2);
  eatSvg += `<rect class="eat" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${LEVEL[lv]}" style="animation-delay:${d}s"/>`;
  burstSvg += `<circle class="burst" cx="${cx(p.c)}" cy="${cy(p.r)}" r="6" fill="none" stroke="${lv >= 3 ? "#8dffe0" : EMER}" stroke-width="1.6" style="animation-delay:${d}s"/>`;
  if (lv >= 3) haloSvg += `<circle class="halo" cx="${cx(p.c)}" cy="${cy(p.r)}" r="7" fill="${EMER}" style="animation-delay:${(idx % 11) * -0.37}s"/>`;
}

// ---------- snake (gradient tapered body + glow, follows #route) ----------
function seg(k) {
  const head = k === 0;
  const s = Math.max(5, 13 - k * 0.58);
  const col = head ? "#eafff9" : hexLerp("#7cf5d3", "#0a5c45", Math.min(1, (k - 1) / (NSEG - 2)));
  const op = (1 - k * 0.035).toFixed(2);
  const beginK = (headBegin + (k * 0.85 / (NP - 1)) * DUR).toFixed(3);
  const eyes = head
    ? `<rect x="2" y="-3.1" width="2.5" height="2.5" rx="1" fill="#05201a"/><rect x="2" y="0.7" width="2.5" height="2.5" rx="1" fill="#05201a"/>`
    : "";
  return `<g filter="url(#${head ? "glowH" : "glow"})" opacity="${op}">
    <rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${head ? 4.5 : 3}" fill="${col}"/>${eyes}
    <animateMotion dur="${DUR}s" begin="${beginK}s" repeatCount="indefinite" rotate="auto"><mpath xlink:href="#route"/></animateMotion>
  </g>`;
}
let snake = "";
for (let k = NSEG - 1; k >= 0; k--) snake += seg(k);

// ---------- running score (synced to eating) ----------
const CK = 14;
const foodFracs = [...foodAt.entries()].map(([idx, count]) => ({ f: frac(idx), count }));
let scoreSvg = "";
for (let s = 0; s < CK; s++) {
  const a = s / CK, b = (s + 1) / CK;
  const val = foodFracs.filter(x => x.f <= b + 1e-6).reduce((t, x) => t + x.count, 0);
  const a2 = Math.max(0.0008, a);
  scoreSvg += `<text class="t b" x="150" y="31" font-size="14" fill="${GOLD}" opacity="0">${val}` +
    `<animate attributeName="opacity" dur="${DUR}s" repeatCount="indefinite" ` +
    `keyTimes="0;${a2.toFixed(4)};${(a2 + 0.001).toFixed(4)};${b.toFixed(4)};${Math.min(1, b + 0.001).toFixed(4)};1" ` +
    `values="0;0;1;1;0;0"/></text>`;
}

const totalYear = cal.totalContributions;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
<defs>
  <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="glowH" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${GOLD}"/><stop offset=".5" stop-color="${EMER}"/><stop offset="1" stop-color="#118AB2"/></linearGradient>
  <linearGradient id="scanG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8dffe0" stop-opacity="0"/><stop offset=".5" stop-color="#8dffe0" stop-opacity=".07"/><stop offset="1" stop-color="#8dffe0" stop-opacity="0"/></linearGradient>
  <pattern id="scanlines" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1" fill="#ffffff" opacity="0.025"/></pattern>
  <path id="route" d="${routeD}"/>
</defs>
<style>
.t{font-family:${FONT}} .b{font-weight:bold}
@keyframes eat{0%{opacity:.08}7%{opacity:.08}22%{opacity:1}100%{opacity:1}}
.eat{animation:eat ${DUR}s linear infinite}
@keyframes burst{0%{transform:scale(.25);opacity:.95}8%{opacity:.8}20%{transform:scale(2.6);opacity:0}100%{transform:scale(2.6);opacity:0}}
.burst{transform-box:fill-box;transform-origin:center;animation:burst ${DUR}s linear infinite}
@keyframes halo{0%,100%{opacity:.05;transform:scale(.7)}50%{opacity:.33;transform:scale(1.5)}}
.halo{transform-box:fill-box;transform-origin:center;filter:url(#glow);animation:halo 2.4s ease-in-out infinite}
@keyframes scan{0%{transform:translateY(-30px)}100%{transform:translateY(${H}px)}}
.scan{animation:scan 5.5s linear infinite}
@keyframes blink{0%,55%{opacity:1}56%,100%{opacity:0}}
.blink{animation:blink 1s steps(1) infinite}
@keyframes flick{0%,100%{opacity:1}48%{opacity:.86}}
.frame{animation:flick 3.7s ease-in-out infinite}
</style>
<rect class="frame" x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="${BG}" stroke="${LINE}"/>
<rect x="0" y="0" width="${W}" height="6" fill="url(#accent)"/>
<text class="t b" x="18" y="31" font-size="15" fill="${TEXT}" letter-spacing="1">SNAKE.EXE</text>
<text class="t" x="112" y="31" font-size="13" fill="${MUTE}">SCORE</text>
${scoreSvg}
<text class="t" x="186" y="31" font-size="11" fill="${GOLD}" opacity=".75">HI ${totalYear.toLocaleString("en-US")}</text>
<g class="blink"><text class="t b" x="${W - 18}" y="31" font-size="11" fill="${GOLD}" text-anchor="end">&#9679; PLAYING</text></g>
<g>${cellSvg}</g>
<g>${haloSvg}</g>
<g>${eatSvg}</g>
<g>${burstSvg}</g>
${snake}
<rect x="1" y="44" width="${W - 2}" height="${H - 46}" fill="url(#scanlines)"/>
<rect class="scan" x="1" y="44" width="${W - 2}" height="26" fill="url(#scanG)"/>
</svg>`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/contrib-game.svg", svg);
console.log(`OK contrib-game.svg  cols=${COLS} foods=${foods.length} points=${NP} dur=${DUR}s year=${totalYear}`);
