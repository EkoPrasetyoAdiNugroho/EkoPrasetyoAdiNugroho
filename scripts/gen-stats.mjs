// Generates assets/stats.svg — an on-brand "SCOREBOARD" card.
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

const base = await gql(`
  query($login:String!){
    user(login:$login){
      name login createdAt
      followers{totalCount}
      repositories(first:100, ownerAffiliations:OWNER, isFork:false, orderBy:{field:STARGAZERS,direction:DESC}){
        totalCount
        nodes{ stargazerCount languages(first:10){edges{size node{name color}}} }
      }
      pullRequests{totalCount}
      issues{totalCount}
    }
  }`, { login: LOGIN });

const u = base.user;
const stars = u.repositories.nodes.reduce((a, n) => a + n.stargazerCount, 0);
const repos = u.repositories.totalCount;
const followers = u.followers.totalCount;
const prs = u.pullRequests.totalCount;
const issues = u.issues.totalCount;

const langMap = new Map();
for (const n of u.repositories.nodes)
  for (const e of n.languages.edges) {
    const cur = langMap.get(e.node.name) || { size: 0, color: e.node.color || "#8b949e" };
    cur.size += e.size; langMap.set(e.node.name, cur);
  }
const langTotal = [...langMap.values()].reduce((a, c) => a + c.size, 0) || 1;
const langs = [...langMap.entries()].map(([name, v]) => ({ name, pct: v.size / langTotal * 100, color: v.color }))
  .sort((a, b) => b.pct - a.pct).slice(0, 6);

const startYear = new Date(u.createdAt).getFullYear();
const nowYear = new Date().getFullYear();
let days = [];
let totalContrib = 0;
for (let y = startYear; y <= nowYear; y++) {
  const from = `${y}-01-01T00:00:00Z`;
  const to = `${y}-12-31T23:59:59Z`;
  const d = await gql(`
    query($login:String!,$from:DateTime!,$to:DateTime!){
      user(login:$login){ contributionsCollection(from:$from,to:$to){
        contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } } }
    }`, { login: LOGIN, from, to });
  const cal = d.user.contributionsCollection.contributionCalendar;
  totalContrib += cal.totalContributions;
  for (const w of cal.weeks) for (const cd of w.contributionDays) days.push(cd);
}
const today = new Date().toISOString().slice(0, 10);
days = days.filter(d => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));

let longest = 0, run = 0, current = 0;
for (const d of days) { if (d.contributionCount > 0) { run++; longest = Math.max(longest, run); } else run = 0; }
for (let i = days.length - 1; i >= 0; i--) {
  const d = days[i];
  if (d.contributionCount > 0) current++;
  else { if (d.date === today) continue; break; }
}

const BG="#0b0e14", EMER="#06D6A0", GOLD="#FFD166", CORAL="#EF476F", TEAL="#118AB2", TEXT="#e6edf3", MUTE="#8b949e", LINE="#1b2330";
const FONT="'JetBrains Mono','Fira Code',Consolas,'Courier New',monospace";
const W = 860, H = 392;
const fmt = (n) => n.toLocaleString("en-US");

function coin(x, y, b, delay) {
  const pat = ["0110","1001","1001","0110"]; let s = `<g class="coin" style="animation-delay:${delay}s">`;
  pat.forEach((row, r) => [...row].forEach((v, c) => { if (v === "1") s += `<rect x="${x+c*b}" y="${y+r*b}" width="${b}" height="${b}" fill="${GOLD}"/>`; }));
  return s + `<rect x="${x+1.4*b}" y="${y+1*b}" width="${b}" height="${2*b}" fill="#e0ad3a"/></g>`;
}
function tile(x, y, w, label, value, color, icon) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="92" rx="7" fill="#0d1117" stroke="${LINE}"/>
    <rect x="${x}" y="${y}" width="5" height="92" rx="2" fill="${color}"/>
    <text class="t" x="${x+22}" y="${y+30}" font-size="12" fill="${MUTE}">${icon}</text>
    <text class="t b" x="${x+22}" y="${y+62}" font-size="30" fill="${TEXT}">${value}</text>
    <text class="t" x="${x+22}" y="${y+82}" font-size="11" fill="${color}" letter-spacing="1">${label}</text>
  </g>`;
}

let lx = 40, barY = 316, barW = W - 80, seg = "";
for (const l of langs) { const w = Math.max(2, barW * l.pct / 100); seg += `<rect x="${lx}" y="${barY}" width="${w}" height="12" fill="${l.color}"/>`; lx += w; }
let legend = ""; let lgx = 40;
for (const l of langs) { legend += `<circle cx="${lgx}" cy="${barY+34}" r="5" fill="${l.color}"/><text class="t" x="${lgx+11}" y="${barY+39}" font-size="12" fill="${TEXT}">${l.name} <tspan fill="${MUTE}">${l.pct.toFixed(1)}%</tspan></text>`; lgx += 42 + l.name.length * 8.6 + String(l.pct.toFixed(1)).length * 8; }

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
<style>
.t{font-family:${FONT}} .b{font-weight:bold}
@keyframes flip{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.18)}}
.coin{transform-box:fill-box;transform-origin:center;animation:flip 1.8s ease-in-out infinite}
@keyframes blink{0%,55%{opacity:1}56%,100%{opacity:0}}
.blink{animation:blink 1.2s steps(1) infinite}
</style>
<rect x="1" y="1" width="${W-2}" height="${H-2}" rx="12" fill="${BG}" stroke="${LINE}"/>
<rect x="0" y="0" width="${W}" height="6" fill="${EMER}"/><rect x="0" y="0" width="300" height="6" fill="${GOLD}"/>
<text class="t b" x="40" y="54" font-size="19" fill="${TEXT}" letter-spacing="1">SCOREBOARD</text>
<text class="t" x="188" y="54" font-size="13" fill="${MUTE}">// @${u.login}</text>
${coin(W-70, 34, 5, 0)}
<g class="blink"><text class="t b" x="${W-40}" y="54" font-size="12" fill="${GOLD}" text-anchor="end">&#9679; LIVE</text></g>

${tile(40, 78, 196, "TOTAL CONTRIBUTIONS", fmt(totalContrib), EMER, "&#9632; all-time")}
${tile(252, 78, 196, "CURRENT STREAK", current + "d", GOLD, "&#9632; now")}
${tile(464, 78, 174, "LONGEST STREAK", longest + "d", CORAL, "&#9632; record")}
${tile(654, 78, 166, "STARS EARNED", fmt(stars), TEAL, "&#9632; repos")}

${tile(40, 180, 174, "PUBLIC REPOS", fmt(repos), EMER, "&#9632; shipped")}
${tile(230, 180, 174, "FOLLOWERS", fmt(followers), GOLD, "&#9632; players")}
${tile(420, 180, 174, "PULL REQUESTS", fmt(prs), CORAL, "&#9632; merged")}
${tile(610, 180, 210, "ISSUES OPENED", fmt(issues), TEAL, "&#9632; quests")}

<text class="t b" x="40" y="306" font-size="12" fill="${MUTE}" letter-spacing="1">LANGUAGE LOADOUT</text>
<rect x="40" y="${barY}" width="${barW}" height="12" rx="3" fill="#0d1117" stroke="${LINE}"/>
${seg}
${legend}
</svg>`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/stats.svg", svg);
console.log(`OK stats.svg  contrib=${totalContrib} cur=${current} long=${longest} stars=${stars} repos=${repos} langs=${langs.map(l=>l.name).join(",")}`);
