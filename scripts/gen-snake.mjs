// Generates assets/contrib-game.svg — a self-hosted "snake eats my
// contributions" animation (no GitHub Action / external service needed).
// Data via GitHub GraphQL. Token: env GH_TOKEN / GITHUB_TOKEN.
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
  const col = new Array(7).fill(null);
  for (const d of w.contributionDays) col[d.weekday] = d.contributionCount;
  return col;
});
weeks = weeks.slice(-52);                       // last 52 columns
const COLS = weeks.length, ROWS = 7;
const maxC = Math.max(1, ...weeks.flat().map(v => v || 0));

// ---- theme ----
const BG = "#0b0e14", LINE = "#1b2330", TEXT = "#e6edf3", MUTE = "#8b949e";
const GOLD = "#FFD166", EMER = "#06D6A0";
const FONT = "'JetBrains Mono','Fira Code',Consolas,'Courier New',monospace";
const LEVEL = ["#13201b", "#0e5a40", "#12916a", "#06D6A0", "#7cf5d3"]; // 0..4
function level(c) {
  if (!c) return 0;
  const r = c / maxC;
  if (r <= 0.08) return 1;
  if (r <= 0.25) return 2;
  if (r <= 0.6) return 3;
  return 4;
}

// ---- layout ----
const STEP = 13, CELL = 11, GX = 18, GY = 46;
const W = GX * 2 + COLS * STEP, H = GY + ROWS * STEP + 20;
const cx = (col) => GX + col * STEP + CELL / 2;
const cy = (row) => GY + row * STEP + CELL / 2;

// ---- serpentine path + eat order (same order so eating syncs with the head) ----
const order = [];                               // {col,row} in visit order
for (let col = 0; col < COLS; col++) {
  if (col % 2 === 0) for (let row = 0; row < ROWS; row++) order.push({ col, row });
  else for (let row = ROWS - 1; row >= 0; row--) order.push({ col, row });
}
const N = order.length;
const pathD = "M" + order.map(o => `${cx(o.col)},${cy(o.row)}`).join(" L");

// ---- timing ----
const DUR = 16;                                 // seconds, full sweep
const NSEG = 6;                                 // snake length
const dt = DUR / N;                             // time between cells
const K = NSEG * dt;                            // preroll so segments sit on path at t=0

// ---- cells (each fades as the head arrives, then regrows) ----
let cells = "";
order.forEach((o, j) => {
  const lv = level(weeks[o.col][o.row]);
  const delay = ((j - NSEG) * dt).toFixed(3);   // head reaches cell j at this phase
  const cls = lv === 0 ? "c e" : "c";
  cells += `<rect class="${cls}" x="${GX + o.col * STEP}" y="${GY + o.row * STEP}" width="${CELL}" height="${CELL}" rx="2.5" fill="${LEVEL[lv]}" style="animation-delay:${delay}s"/>`;
});

// ---- snake (head + trailing body) following the serpentine path ----
function segment(i) {
  const isHead = i === 0;
  const s = isHead ? 13 : 11;
  const begin = ((i - NSEG) * dt).toFixed(3);    // all negative => on path immediately
  const fill = isHead ? "#7cf5d3" : (i < 3 ? EMER : "#0f8a66");
  const eyes = isHead
    ? `<rect x="2.2" y="-3" width="2.4" height="2.4" rx="1" fill="#06251d"/><rect x="2.2" y="0.6" width="2.4" height="2.4" rx="1" fill="#06251d"/>`
    : "";
  return `
  <g>
    <rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${isHead ? 4 : 3}" fill="${fill}">
      ${isHead ? `<animate attributeName="fill" values="#7cf5d3;#b8fde8;#7cf5d3" dur="0.5s" repeatCount="indefinite"/>` : ""}
    </rect>
    ${eyes}
    <animateMotion dur="${DUR}s" begin="${begin}s" repeatCount="indefinite" rotate="auto" path="${pathD}" calcMode="linear"/>
  </g>`;
}
let snake = "";
for (let i = NSEG - 1; i >= 0; i--) snake += segment(i);   // draw tail first, head on top

const totalYear = cal.totalContributions;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
<style>
.t{font-family:${FONT}}
@keyframes eat{0%{opacity:.15}5%{opacity:.15}16%{opacity:1}100%{opacity:1}}
.c{animation:eat ${DUR}s linear infinite}
.e{opacity:.5}.e.c{animation:none;opacity:1}
@keyframes blink{0%,55%{opacity:1}56%,100%{opacity:0}}
.blink{animation:blink 1.1s steps(1) infinite}
</style>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="${BG}" stroke="${LINE}"/>
<rect x="0" y="0" width="${W}" height="6" fill="${EMER}"/><rect x="0" y="0" width="240" height="6" fill="${GOLD}"/>
<text class="t" x="18" y="32" font-size="15" font-weight="bold" fill="${TEXT}" letter-spacing="1">SNAKE.EXE</text>
<text class="t" x="118" y="32" font-size="12" fill="${MUTE}">// eating ${totalYear.toLocaleString("en-US")} contributions</text>
<g class="blink"><text class="t" x="${W - 18}" y="32" font-size="11" font-weight="bold" fill="${GOLD}" text-anchor="end">&#9679; PLAYING</text></g>
${cells}
${snake}
</svg>`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/contrib-game.svg", svg);
console.log(`OK contrib-game.svg  cols=${COLS} cells=${N} year=${totalYear} max=${maxC}`);
