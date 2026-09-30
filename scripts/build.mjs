#!/usr/bin/env node
/**
 * tanashic0dex — profile build pipeline
 * ------------------------------------------------------------
 * Fetches real data from the GitHub GraphQL API and renders a
 * SaaS-style landing page as hand-built, animated SVGs + README.
 *
 *   node scripts/build.mjs            → real data (needs GH_TOKEN)
 *   node scripts/build.mjs --sample   → fake data, for local preview
 *   (no token)                        → "syncing" placeholders
 *
 * Zero dependencies. Edit profile.config.json, not this output.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "assets");
const cfg = JSON.parse(await fs.readFile(path.join(ROOT, "profile.config.json"), "utf8"));
const ARGS = new Set(process.argv.slice(2));
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

/* ─────────────────────────── design tokens ─────────────────────────── */
const C = {
  bg: "#07060D", surface: "#0E0D16", surface2: "#15131F", border: "#221F33", borderHi: "#2E2A45",
  text: "#F4F2FF", soft: "#C9C5E3", muted: "#9591B3", dim: "#5F5B7A",
  accent: "#7B68EE", violet: "#A78BFA", lilac: "#C4B5FD", cyan: "#22D3EE", pink: "#F472B6",
  green: "#34D399", amber: "#FBBF24",
};
const SANS = `'Inter','Segoe UI Variable Display','Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif`;
const MONO = `'JetBrains Mono','Cascadia Code','SF Mono',Consolas,Menlo,monospace`;

/* ─────────────────────────── helpers ─────────────────────────── */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (n) => +Number(n).toFixed(1);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const num = (n) => (n == null ? "—" : n.toLocaleString("en-US"));
const short = (n) => (n == null ? "—" : n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

/** rough text width estimate for system sans fonts */
function tw(s, size, bold = false) {
  let w = 0;
  for (const ch of String(s)) {
    if (" .,:;!|'il·".includes(ch)) w += 0.29;
    else if ("fjrt()[]/".includes(ch)) w += 0.36;
    else if ("mwMW@%".includes(ch)) w += 0.86;
    else if (ch >= "A" && ch <= "Z") w += 0.66;
    else if (ch >= "0" && ch <= "9") w += 0.58;
    else if (ch.codePointAt(0) > 0x2000) w += 0.9;
    else w += 0.54;
  }
  return w * size * (bold ? 1.07 : 1);
}

const fmtDate = (d, opts) => new Intl.DateTimeFormat("en-US", { timeZone: cfg.timezone, ...opts }).format(d);
function relTime(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** monotone cubic path — smooth, never overshoots below the baseline */
function smooth(pts) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return d;
}

function chartPaths(values, x, y, w, h, pad = 0.12) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [x + (i / Math.max(1, values.length - 1)) * w, y + h - (v / max) * h * (1 - pad)]);
  const line = smooth(pts);
  const area = `${line} L${f(x + w)},${f(y + h)} L${f(x)},${f(y + h)} Z`;
  return { line, area, pts, max };
}

/* ─────────────────────────── svg primitives ─────────────────────────── */
const BASE_CSS = `
  .sans{font-family:${SANS}} .mono{font-family:${MONO}}
  .up{animation:up .9s cubic-bezier(.2,.7,.2,1) both}
  @keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  .pulse{animation:pulse 2s ease-out infinite;transform-box:fill-box;transform-origin:center}
  @keyframes pulse{0%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(3)}}
  .draw{stroke-dasharray:2400;stroke-dashoffset:2400;animation:draw 2.4s .4s cubic-bezier(.4,0,.2,1) forwards}
  @keyframes draw{to{stroke-dashoffset:0}}
  .fadein{animation:fadein 1.6s .9s ease both} @keyframes fadein{from{opacity:0}to{opacity:1}}
  .blink{animation:blink 1.1s steps(1) infinite} @keyframes blink{50%{opacity:0}}
  .bob{animation:bob 6s ease-in-out infinite} @keyframes bob{50%{transform:translateY(-8px)}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;

function svg(w, h, title, body, css = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${BASE_CSS}${css}</style>
${body}
</svg>`;
}

/** rounded dark panel with a subtle top highlight */
function panel(x, y, w, h, { r = 16, fill = C.surface, stroke = C.border, id = "" } = {}) {
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${fill}" stroke="${stroke}"/>
<rect x="${f(x + r)}" y="${f(y)}" width="${f(w - 2 * r)}" height="1" fill="url(#hl${id})" opacity=".9"/>`;
}
const hlGrad = (id = "") => `<linearGradient id="hl${id}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;

const text = (x, y, s, { size = 14, fill = C.text, weight = 400, anchor = "start", cls = "sans", ls = 0, extra = "" } = {}) =>
  `<text x="${f(x)}" y="${f(y)}" class="${cls}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls ? ` letter-spacing="${ls}"` : ""} ${extra}>${esc(s)}</text>`;

/** section header: eyebrow + title + subtitle, centered */
function sectionHead(W, y, eyebrow, title, sub) {
  return `
  ${text(W / 2, y, eyebrow.toUpperCase(), { size: 12, fill: C.violet, weight: 700, anchor: "middle", ls: 2.4 })}
  ${text(W / 2, y + 46, title, { size: 38, weight: 800, anchor: "middle", ls: -1.2 })}
  ${sub ? text(W / 2, y + 78, sub, { size: 16, fill: C.muted, anchor: "middle" }) : ""}`;
}

const windowDots = (x, y) => [C.pink, C.amber, C.green].map((c, i) => `<circle cx="${x + i * 16}" cy="${y}" r="5" fill="${c}" opacity=".75"/>`).join("");
const check = (x, y, color = C.violet) =>
  `<circle cx="${x}" cy="${y}" r="9" fill="${color}" fill-opacity=".14"/><path d="M${x - 4} ${y} l2.8 2.8 L${x + 4.2} ${y - 3.2}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;

/* ─────────────────────────── data ─────────────────────────── */
const QUERY = `query($login:String!){
  user(login:$login){
    name login followers{totalCount}
    repositories(ownerAffiliations:OWNER, privacy:PUBLIC, first:100, orderBy:{field:PUSHED_AT, direction:DESC}){
      totalCount
      nodes{ name description url stargazerCount forkCount pushedAt isFork
        primaryLanguage{ name color }
        languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name color } } } }
    }
    contributionsCollection{
      totalCommitContributions totalPullRequestContributions totalIssueContributions
      totalPullRequestReviewContributions restrictedContributionsCount
      contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } }
    }
  }
}`;

async function fetchGitHub() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "tanashic0dex-profile" },
    body: JSON.stringify({ query: QUERY, variables: { login: cfg.login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors || !json.data?.user) throw new Error(`GitHub API error: ${JSON.stringify(json.errors || json)}`);
  const u = json.data.user;
  const cc = u.contributionsCollection;
  const repos = u.repositories.nodes.filter((r) => !r.isFork);
  const langBytes = {};
  for (const r of repos) for (const e of r.languages.edges) {
    if (cfg.ignoreLanguages?.includes(e.node.name)) continue;
    langBytes[e.node.name] ??= { name: e.node.name, color: e.node.color || C.accent, bytes: 0 };
    langBytes[e.node.name].bytes += e.size;
  }
  return {
    followers: u.followers.totalCount,
    repoCount: u.repositories.totalCount,
    stars: sum(repos.map((r) => r.stargazerCount)),
    repos: repos.filter((r) => r.name.toLowerCase() !== cfg.login.toLowerCase()).map((r) => ({
      name: r.name, description: r.description, url: r.url, stars: r.stargazerCount, pushedAt: r.pushedAt,
      language: r.primaryLanguage?.name, color: r.primaryLanguage?.color,
    })),
    days: cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays).map((d) => ({ date: d.date, count: d.contributionCount })),
    total: cc.contributionCalendar.totalContributions,
    breakdown: {
      Commits: cc.totalCommitContributions, "Pull requests": cc.totalPullRequestContributions,
      Issues: cc.totalIssueContributions, Reviews: cc.totalPullRequestReviewContributions,
    },
    langs: Object.values(langBytes),
  };
}

function sampleData() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const days = [];
  const today = new Date();
  for (let i = 370; i >= 0; i--) {
    const d = new Date(today - i * 864e5);
    const wk = d.getDay() === 0 || d.getDay() === 6;
    const wave = 0.5 + 0.5 * Math.sin((370 - i) / 28);
    const c = rnd() < (wk ? 0.35 : 0.8) ? Math.round(rnd() * 9 * wave + (rnd() < 0.08 ? 12 : 0)) : 0;
    days.push({ date: d.toISOString().slice(0, 10), count: c });
  }
  return {
    followers: 48, repoCount: 23, stars: 67, total: sum(days.map((d) => d.count)),
    days,
    breakdown: { Commits: 612, "Pull requests": 41, Issues: 18, Reviews: 9 },
    langs: [
      { name: "TypeScript", color: "#3178c6", bytes: 420 }, { name: "JavaScript", color: "#f1e05a", bytes: 310 },
      { name: "PHP", color: "#4F5D95", bytes: 150 }, { name: "Python", color: "#3572A5", bytes: 40 },
      { name: "Shell", color: "#89e051", bytes: 12 },
    ],
    repos: [
      ["nebula-dashboard", "Realtime analytics dashboard built with React + TypeScript", "TypeScript", "#3178c6", 21, 1],
      ["api-forge", "Opinionated Node.js REST API starter with auth and tests", "JavaScript", "#f1e05a", 14, 3],
      ["pix-checkout", "Brazilian PIX payment checkout flow", "PHP", "#4F5D95", 9, 6],
      ["portfolio-v3", "My personal site, now with dark mode everywhere", "TypeScript", "#3178c6", 5, 11],
      ["discord-tools", "Small automations for Discord communities", "JavaScript", "#f1e05a", 12, 19],
      ["css-lab", "Experiments with modern CSS: container queries, :has()", "CSS", "#663399", 6, 33],
    ].map(([name, description, language, color, stars, ago]) => ({
      name, description, language, color, stars, url: `https://github.com/${cfg.login}/${name}`,
      pushedAt: new Date(Date.now() - ago * 864e5).toISOString(),
    })),
  };
}

/** derive every number the visuals need, tolerating missing data */
function derive(raw) {
  const syncing = !raw;
  const days = raw?.days ?? Array.from({ length: 371 }, (_, i) => ({ date: new Date(Date.now() - (370 - i) * 864e5).toISOString().slice(0, 10), count: 0 }));
  const todayStr = new Date().toISOString().slice(0, 10);
  const past = days.filter((d) => d.date <= todayStr);
  // weekly totals, last 52 weeks
  const weeks = [];
  for (let i = past.length; i > 0; i -= 7) weeks.unshift(sum(past.slice(Math.max(0, i - 7), i).map((d) => d.count)));
  const weekly = weeks.slice(-52);
  // streaks (today not counted against you until it's over)
  let current = 0, longest = 0, run = 0;
  for (const d of past) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = past.length - 1;
  if (i >= 0 && past[i].count === 0) i--;
  while (i >= 0 && past[i].count > 0) { current++; i--; }
  const last90 = past.slice(-90);
  const active90 = last90.filter((d) => d.count > 0).length;
  const last30 = sum(past.slice(-30).map((d) => d.count));
  const prev30 = sum(past.slice(-60, -30).map((d) => d.count));
  const trend = prev30 ? Math.round(((last30 - prev30) / prev30) * 100) : null;
  const byWeekday = Array(7).fill(0);
  for (const d of past) byWeekday[new Date(d.date + "T12:00:00Z").getUTCDay()] += d.count;
  const busiest = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][byWeekday.indexOf(Math.max(...byWeekday))];
  const peakIdx = weekly.indexOf(Math.max(...weekly));
  const totalBytes = sum((raw?.langs ?? []).map((l) => l.bytes));
  const langs = (raw?.langs ?? []).sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((l) => ({ ...l, pct: (l.bytes / totalBytes) * 100 }));
  const levels = last90.map((d) => {
    if (!d.count) return 0;
    const sorted = past.map((x) => x.count).filter(Boolean).sort((a, b) => a - b);
    const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
    return d.count <= q(0.25) ? 1 : d.count <= q(0.5) ? 2 : d.count <= q(0.75) ? 3 : 4;
  });
  return {
    syncing, weekly, levels, last90, current, longest, active90, trend, busiest, peakIdx, langs,
    uptime: syncing ? null : (active90 / last90.length) * 100,
    total: raw?.total ?? null, stars: raw?.stars ?? null, followers: raw?.followers ?? null, repoCount: raw?.repoCount ?? null,
    breakdown: raw?.breakdown ?? { Commits: 0, "Pull requests": 0, Issues: 0, Reviews: 0 },
    repos: raw?.repos ?? [],
    built: new Date(),
  };
}

/* ═════════════════════════════ HERO ═════════════════════════════ */
function hero(d) {
  const W = 1000, H = 850;
  const nav = ["Product", "Stack", "Metrics", "Status", "Pricing"];
  const navW = nav.map((s) => tw(s, 14));
  const navTotal = sum(navW) + 34 * (nav.length - 1);
  let nx = W / 2 - navTotal / 2;
  const navLinks = nav.map((s, i) => { const t = text(nx, 49, s, { size: 14, fill: C.muted, weight: 500 }); nx += navW[i] + 34; return t; }).join("");

  // announcement pill
  const tag = "NEW", tagW = tw(tag, 11, true) + 18;
  const pillTxt = cfg.badge, pillTxtW = tw(pillTxt, 13, true);
  const pillW = 6 + tagW + 10 + pillTxtW + 30, pillX = W / 2 - pillW / 2, pillY = 108;

  // buttons
  const b1 = "Start a project", b1w = tw(b1, 15, true) + 64;
  const b2 = "View my work", b2w = tw(b2, 15, true) + 48;
  const bx = W / 2 - (b1w + 14 + b2w) / 2, by = 390;

  // product mock
  const mx = 100, my = 540, mw = 800, mh = 330;
  const side = 170;
  const cx = mx + side + 20, cw = mw - side - 40;
  const tileW = (cw - 24) / 3;
  const chart = chartPaths(d.weekly, cx, my + 208, cw, 84);
  const latest = d.repos[0];
  const tiles = [
    ["CONTRIBUTIONS", num(d.total), d.trend == null ? "last 12 months" : `${d.trend >= 0 ? "▲" : "▼"} ${Math.abs(d.trend)}% vs last month`, d.trend == null || d.trend >= 0 ? C.green : C.pink],
    ["CURRENT STREAK", d.syncing ? "—" : `${d.current} ${d.current === 1 ? "day" : "days"}`, `longest: ${d.syncing ? "—" : d.longest + " days"}`, C.muted],
    ["STARS EARNED", num(d.stars), `across ${num(d.repoCount)} public repos`, C.muted],
  ];

  const proof = [[short(d.stars), "stars"], [num(d.repoCount), "public repos"], [num(d.total), "contributions this year"]];
  const proofParts = proof.map(([n, l]) => ({ n, l, w: tw(n, 13, true) + 5 + tw(l, 13) }));
  const proofW = sum(proofParts.map((p) => p.w)) + 36 * (proofParts.length - 1);
  let px = W / 2 - proofW / 2;
  const proofRow = proofParts.map((p, i) => {
    const out = `${text(px, 480, p.n, { size: 13, weight: 700, fill: C.soft })}${text(px + tw(p.n, 13, true) + 5, 480, p.l, { size: 13, fill: C.dim })}${i < proofParts.length - 1 ? text(px + p.w + 18, 480, "·", { size: 13, fill: C.dim, anchor: "middle" }) : ""}`;
    px += p.w + 36;
    return out;
  }).join("");

  const body = `
<defs>
  <clipPath id="clip"><rect width="${W}" height="${H}" rx="24"/></clipPath>
  <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" stroke="#fff" stroke-opacity=".055"/></pattern>
  <radialGradient id="gridFade" cx=".5" cy=".32" r=".62"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <mask id="gridMask"><rect width="${W}" height="${H}" fill="url(#gridFade)"/></mask>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70"/></filter>
  <filter id="glow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="12"/></filter>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".55"/></filter>
  <linearGradient id="gText" gradientUnits="userSpaceOnUse" x1="240" y1="0" x2="760" y2="0" spreadMethod="reflect">
    <stop offset="0" stop-color="${C.lilac}"/><stop offset=".35" stop-color="${C.accent}"/><stop offset=".65" stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.pink}"/>
    <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="1040 0" dur="9s" repeatCount="indefinite"/>
  </linearGradient>
  <linearGradient id="gBtn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.accent}"/></linearGradient>
  <linearGradient id="gLogo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.lilac}"/><stop offset=".5" stop-color="${C.accent}"/><stop offset="1" stop-color="#4C3BCF"/></linearGradient>
  <linearGradient id="gBorder" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.violet}" stop-opacity=".9"/><stop offset=".45" stop-color="${C.borderHi}"/><stop offset="1" stop-color="${C.border}" stop-opacity="0"/></linearGradient>
  <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.accent}" stop-opacity=".45"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></linearGradient>
  <linearGradient id="gLine" x1="0" x2="1"><stop offset="0" stop-color="${C.violet}"/><stop offset=".6" stop-color="${C.accent}"/><stop offset="1" stop-color="${C.cyan}"/></linearGradient>
  <linearGradient id="gFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.bg}" stop-opacity="0"/><stop offset="1" stop-color="${C.bg}"/></linearGradient>
  ${hlGrad()}
</defs>

<g clip-path="url(#clip)">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <g filter="url(#blur)">
    <ellipse class="a1" cx="300" cy="140" rx="260" ry="150" fill="${C.accent}" opacity=".42"/>
    <ellipse class="a2" cx="740" cy="200" rx="220" ry="140" fill="${C.cyan}" opacity=".16"/>
    <ellipse class="a3" cx="500" cy="620" rx="340" ry="130" fill="${C.pink}" opacity=".14"/>
  </g>
  <rect width="${W}" height="${H}" fill="url(#grid)" mask="url(#gridMask)"/>

  <!-- navbar -->
  <g class="up">
    <rect x="40" y="26" width="32" height="32" rx="9" fill="url(#gLogo)"/>
    <path d="M51 37 l-5 5 5 5 M61 37 l5 5 -5 5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    ${text(84, 48, cfg.brand, { size: 17, weight: 700, ls: -0.3 })}
    ${navLinks}
    <circle cx="${W - 262}" cy="44" r="4" fill="${C.green}"/><circle class="pulse" cx="${W - 262}" cy="44" r="4" fill="${C.green}"/>
    ${text(W - 250, 49, "Open to work", { size: 13, fill: C.soft, weight: 500 })}
    <rect x="${W - 146}" y="26" width="106" height="36" rx="18" fill="#fff"/>
    ${text(W - 93, 49, "Hire me →", { size: 14, fill: "#0B0A12", weight: 700, anchor: "middle" })}
  </g>
  <rect x="0" y="84" width="${W}" height="1" fill="#fff" opacity=".05"/>

  <!-- announcement -->
  <g class="up" style="animation-delay:.1s">
    <rect x="${f(pillX)}" y="${pillY}" width="${f(pillW)}" height="32" rx="16" fill="${C.accent}" fill-opacity=".1" stroke="${C.accent}" stroke-opacity=".45"/>
    <rect x="${f(pillX + 5)}" y="${pillY + 5}" width="${f(tagW)}" height="22" rx="11" fill="${C.accent}"/>
    ${text(pillX + 5 + tagW / 2, pillY + 20.5, tag, { size: 11, weight: 800, anchor: "middle", ls: 0.8 })}
    ${text(pillX + 5 + tagW + 10, pillY + 21, pillTxt, { size: 13, weight: 600, fill: C.lilac })}
    ${text(pillX + pillW - 18, pillY + 21, "→", { size: 13, weight: 700, fill: C.lilac, anchor: "middle" })}
  </g>

  <!-- headline -->
  <g class="up" style="animation-delay:.2s">
    ${text(W / 2, 212, cfg.headline[0], { size: 62, weight: 800, anchor: "middle", ls: -2.6 })}
  </g>
  <g class="up" style="animation-delay:.3s">
    ${text(W / 2, 284, cfg.headline[1], { size: 62, weight: 800, anchor: "middle", ls: -2.6, extra: `fill="url(#gText)"` }).replace(`fill="${C.text}"`, "")}
  </g>
  <g class="up" style="animation-delay:.4s">
    ${cfg.subheadline.map((s, i) => text(W / 2, 330 + i * 25, s, { size: 18, fill: C.muted, anchor: "middle" })).join("")}
  </g>

  <!-- CTAs -->
  <g class="up" style="animation-delay:.5s">
    <rect x="${f(bx)}" y="${by + 10}" width="${f(b1w)}" height="40" rx="20" fill="${C.accent}" opacity=".6" filter="url(#glow)"/>
    <rect x="${f(bx)}" y="${by}" width="${f(b1w)}" height="50" rx="25" fill="url(#gBtn)"/>
    <rect x="${f(bx + 20)}" y="${by}" width="${f(b1w - 40)}" height="1" fill="#fff" opacity=".5"/>
    ${text(bx + b1w / 2 - 10, by + 31, b1, { size: 15, weight: 700, anchor: "middle" })}
    ${text(bx + b1w - 30, by + 31, "→", { size: 15, weight: 700, anchor: "middle" })}
    <rect x="${f(bx + b1w + 14)}" y="${by}" width="${f(b2w)}" height="50" rx="25" fill="#fff" fill-opacity=".04" stroke="#fff" stroke-opacity=".16"/>
    ${text(bx + b1w + 14 + b2w / 2, by + 31, b2, { size: 15, weight: 600, anchor: "middle", fill: C.soft })}
  </g>
  <g class="up" style="animation-delay:.6s">${proofRow}</g>

  <!-- product mock -->
  <g class="up" style="animation-delay:.7s">
    <rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="16" fill="${C.surface}" filter="url(#shadow)"/>
    <rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="16" fill="${C.surface}" stroke="url(#gBorder)"/>
    ${windowDots(mx + 22, my + 20)}
    <rect x="${mx + mw / 2 - 130}" y="${my + 9}" width="260" height="22" rx="11" fill="#fff" fill-opacity=".04"/>
    ${text(mx + mw / 2, my + 24.5, `app.${cfg.domain}/overview`, { size: 11.5, fill: C.dim, anchor: "middle", cls: "mono" })}
    <rect x="${mx}" y="${my + 40}" width="${mw}" height="1" fill="${C.border}"/>
    <rect x="${mx + side}" y="${my + 41}" width="1" height="${mh - 41}" fill="${C.border}"/>
    ${["Overview", "Projects", "Deployments", "Analytics", "Settings"].map((s, i) => `
      ${i === 0 ? `<rect x="${mx + 12}" y="${my + 56}" width="${side - 24}" height="30" rx="8" fill="${C.accent}" fill-opacity=".14"/>` : ""}
      <rect x="${mx + 24}" y="${my + 65 + i * 36}" width="12" height="12" rx="3.5" fill="${i === 0 ? C.violet : C.dim}" fill-opacity="${i === 0 ? 1 : 0.6}"/>
      ${text(mx + 46, my + 75.5 + i * 36, s, { size: 13, fill: i === 0 ? C.text : C.muted, weight: i === 0 ? 600 : 400 })}`).join("")}
    ${text(cx, my + 76, "Overview", { size: 17, weight: 700 })}
    ${text(cx + cw, my + 76, "Last 12 months", { size: 12, fill: C.dim, anchor: "end" })}
    ${tiles.map(([label, value, sub, subColor], i) => {
      const tx = cx + i * (tileW + 12);
      return `<rect x="${f(tx)}" y="${my + 96}" width="${f(tileW)}" height="96" rx="10" fill="${C.surface2}" stroke="${C.border}"/>
      ${text(tx + 14, my + 118, label, { size: 10.5, fill: C.dim, weight: 700, ls: 1 })}
      ${text(tx + 14, my + 150, value, { size: 26, weight: 800, ls: -0.8 })}
      ${text(tx + 14, my + 175, sub, { size: 11.5, fill: subColor, weight: 500 })}`;
    }).join("")}
    <path d="${chart.area}" fill="url(#gArea)" class="fadein"/>
    <path d="${chart.line}" stroke="url(#gLine)" stroke-width="2.4" stroke-linecap="round" class="draw"/>
  </g>

  <!-- floating toasts -->
  <g class="bob" style="animation-delay:-2s">
    <g class="up" style="animation-delay:1.2s">
      <rect x="${mx + mw - 180}" y="${my - 26}" width="230" height="52" rx="12" fill="${C.surface2}" stroke="${C.borderHi}" filter="url(#shadow)"/>
      <rect x="${mx + mw - 180}" y="${my - 26}" width="230" height="52" rx="12" fill="${C.surface2}" stroke="${C.borderHi}"/>
      <circle cx="${mx + mw - 154}" cy="${my}" r="12" fill="${C.green}" fill-opacity=".15"/>
      <path d="M${mx + mw - 159} ${my} l3.5 3.5 6.5-7" stroke="${C.green}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${text(mx + mw - 134, my - 3, "Build passed", { size: 13, weight: 700 })}
      ${text(mx + mw - 134, my + 14, "main · all checks green", { size: 11.5, fill: C.muted })}
    </g>
  </g>
  ${latest ? `<g class="bob" style="animation-delay:-4s">
    <g class="up" style="animation-delay:1.4s">
      <rect x="${mx - 50}" y="${my + 226}" width="${f(Math.max(210, tw(latest.name, 13, true) + 110))}" height="52" rx="12" fill="${C.surface2}" stroke="${C.borderHi}" filter="url(#shadow)"/>
      <rect x="${mx - 50}" y="${my + 226}" width="${f(Math.max(210, tw(latest.name, 13, true) + 110))}" height="52" rx="12" fill="${C.surface2}" stroke="${C.borderHi}"/>
      <circle cx="${mx - 24}" cy="${my + 252}" r="12" fill="${C.accent}" fill-opacity=".2"/>
      <circle cx="${mx - 24}" cy="${my + 252}" r="4" fill="none" stroke="${C.violet}" stroke-width="2"/>
      <path d="M${mx - 34} ${my + 252}h6 M${mx - 20} ${my + 252}h6" stroke="${C.violet}" stroke-width="2" stroke-linecap="round"/>
      ${text(mx - 4, my + 249, latest.name, { size: 13, weight: 700 })}
      ${text(mx - 4, my + 266, `pushed ${relTime(latest.pushedAt)}`, { size: 11.5, fill: C.muted })}
    </g>
  </g>` : ""}

  <rect x="0" y="${H - 120}" width="${W}" height="120" fill="url(#gFade)"/>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="24" stroke="#fff" stroke-opacity=".08"/>`;

  const css = `
  .a1{animation:a1 16s ease-in-out infinite alternate} @keyframes a1{to{transform:translate(120px,40px)}}
  .a2{animation:a2 19s ease-in-out infinite alternate} @keyframes a2{to{transform:translate(-140px,60px)}}
  .a3{animation:a3 22s ease-in-out infinite alternate} @keyframes a3{to{transform:translate(90px,-40px)}}`;
  return svg(W, H, `${cfg.brand} — ${cfg.headline.join(" ")}`, body, css);
}

/* ═════════════════════════════ STACK MARQUEE ═════════════════════════════ */
function stack() {
  const W = 1000, H = 120;
  const items = [...cfg.stack, ...cfg.learning];
  const chips = [];
  let x = 0;
  for (const it of items) {
    const w = tw(it.name, 14, true) + 44;
    chips.push(`<rect x="${f(x)}" y="0" width="${f(w)}" height="38" rx="19" fill="${C.surface}" stroke="${C.border}"/>
      <circle cx="${f(x + 19)}" cy="19" r="4.5" fill="${it.color}"/>
      ${text(x + 31, 24, it.name, { size: 14, weight: 600, fill: C.soft })}`);
    x += w + 12;
  }
  const rowW = x;
  const row = chips.join("");
  const body = `
<defs>
  <linearGradient id="edge" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".12" stop-color="#fff"/><stop offset=".88" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="m"><rect width="${W}" height="${H}" fill="url(#edge)"/></mask>
</defs>
${text(W / 2, 30, "BUILT WITH A MODERN STACK", { size: 12, weight: 700, fill: C.dim, anchor: "middle", ls: 2.4 })}
<g mask="url(#m)">
  <g transform="translate(0 58)"><g class="marquee">${row}<g transform="translate(${f(rowW)} 0)">${row}</g></g></g>
</g>`;
  const css = `.marquee{animation:mq ${Math.round(rowW / 38)}s linear infinite} @keyframes mq{to{transform:translateX(-${f(rowW)}px)}}`;
  return svg(W, H, "Tech stack", body, css);
}

/* ═════════════════════════════ FEATURES (bento) ═════════════════════════════ */
function features() {
  const W = 1000, P = 32, G = 16, top = 168;
  const inner = W - 2 * P;
  const r1h = 230, r2h = 230;
  const aW = Math.round((inner - G) * 0.62), bW = inner - G - aW;
  const cW = (inner - 2 * G) / 3;
  const H = top + r1h + G + r2h + P;
  const y2 = top + r1h + G;

  const cardTitle = (x, y, t, d) => `${text(x + 24, y + 40, t, { size: 19, weight: 700, ls: -0.3 })}
    ${d.map((s, i) => text(x + 24, y + 66 + i * 21, s, { size: 14, fill: C.muted })).join("")}`;

  // A — frontend: live UI mock with a cursor toggling a switch
  const ax = P, ay = top;
  const ux = ax + 300, uy = ay + 30, uw = aW - 330, uh = r1h - 60;
  const cardA = `${panel(ax, ay, aW, r1h)}
    ${cardTitle(ax, ay, "Frontends that feel instant", ["Pixel-perfect React interfaces,", "accessible and responsive", "on every screen."])}
    ${(() => { let chipX = ax + 24; return ["React", "TypeScript", "Tailwind"].map((s) => { const w = tw(s, 12, true) + 22; const out = `<rect x="${f(chipX)}" y="${ay + r1h - 50}" width="${f(w)}" height="26" rx="13" fill="#fff" fill-opacity=".04" stroke="${C.border}"/>${text(chipX + w / 2, ay + r1h - 32.5, s, { size: 12, weight: 600, fill: C.soft, anchor: "middle" })}`; chipX += w + 8; return out; }).join(""); })()}
    <rect x="${ux}" y="${uy}" width="${uw}" height="${uh}" rx="12" fill="${C.surface2}" stroke="${C.borderHi}"/>
    <circle cx="${ux + 30}" cy="${uy + 32}" r="14" fill="url(#gAv)"/>
    <rect x="${ux + 54}" y="${uy + 23}" width="90" height="8" rx="4" fill="${C.soft}" opacity=".8"/>
    <rect x="${ux + 54}" y="${uy + 36}" width="60" height="6" rx="3" fill="${C.dim}"/>
    <rect x="${ux + 16}" y="${uy + 62}" width="${uw - 32}" height="1" fill="${C.border}"/>
    ${text(ux + 16, uy + 88, "Dark mode", { size: 13, weight: 600, fill: C.soft })}
    <rect class="trk" x="${ux + uw - 58}" y="${uy + 76}" width="42" height="24" rx="12"/>
    <circle class="knob" cx="${ux + uw - 46}" cy="${uy + 88}" r="9" fill="#fff"/>
    ${text(ux + 16, uy + 122, "Deploy previews", { size: 13, weight: 600, fill: C.soft })}
    <rect x="${ux + uw - 58}" y="${uy + 110}" width="42" height="24" rx="12" fill="${C.accent}"/>
    <circle cx="${ux + uw - 28}" cy="${uy + 122}" r="9" fill="#fff"/>
    <rect x="${ux + 16}" y="${uy + 146}" width="${uw - 32}" height="6" rx="3" fill="#fff" fill-opacity=".06"/>
    <rect class="prog" x="${ux + 16}" y="${uy + 146}" width="${uw - 32}" height="6" rx="3" fill="url(#gBar)"/>
    <g class="cursor"><path d="M0 0 L0 17 L4.5 12.5 L7.5 19.5 L10.5 18 L7.5 11.2 L13.5 11.2 Z" fill="#fff" stroke="#0B0A12" stroke-width="1.2" stroke-linejoin="round" transform="translate(${ux + uw - 36} ${uy + 90})"/></g>`;

  // B — performance ring
  const bx = P + aW + G, by = top;
  const rcx = bx + bW / 2, rcy = by + 128, rr = 52, circ = 2 * Math.PI * rr;
  const cardB = `${panel(bx, by, bW, r1h)}
    ${text(bx + 24, by + 40, "Performance-first", { size: 19, weight: 700, ls: -0.3 })}
    ${text(bx + 24, by + 64, "Fast by default. Measured, not guessed.", { size: 13.5, fill: C.muted })}
    <circle cx="${rcx}" cy="${rcy}" r="${rr}" stroke="#fff" stroke-opacity=".07" stroke-width="10"/>
    <circle cx="${rcx}" cy="${rcy}" r="${rr}" stroke="${C.green}" stroke-width="10" stroke-linecap="round" transform="rotate(-90 ${rcx} ${rcy})"
      stroke-dasharray="${f(circ)}" stroke-dashoffset="${f(circ * 0.02)}" class="ring"/>
    ${text(rcx, rcy + 11, "98", { size: 34, weight: 800, anchor: "middle", fill: C.green, ls: -1 })}
    ${text(rcx, by + r1h - 22, "PERFORMANCE BUDGET", { size: 10.5, weight: 700, anchor: "middle", fill: C.dim, ls: 1.6 })}`;

  // C — API mock
  const cx = P, cy = y2;
  const cardC = `${panel(cx, cy, cW, r2h)}
    ${text(cx + 24, cy + 40, "APIs that scale", { size: 19, weight: 700, ls: -0.3 })}
    ${text(cx + 24, cy + 64, "REST services in Node.js & PHP.", { size: 13.5, fill: C.muted })}
    <rect x="${cx + 20}" y="${cy + 86}" width="${cW - 40}" height="120" rx="10" fill="#07060D" stroke="${C.border}"/>
    <rect x="${cx + 32}" y="${cy + 98}" width="40" height="18" rx="5" fill="${C.green}" fill-opacity=".15"/>
    ${text(cx + 52, cy + 111, "POST", { size: 10, weight: 800, anchor: "middle", fill: C.green, cls: "mono" })}
    ${text(cx + 80, cy + 111, "/api/v1/projects", { size: 12, fill: C.soft, cls: "mono" })}
    ${text(cx + 32, cy + 138, "{ \"name\": \"launch\" }", { size: 11.5, fill: C.muted, cls: "mono" })}
    <g class="resp">
      ${text(cx + 32, cy + 166, "201 Created", { size: 12, weight: 700, fill: C.green, cls: "mono" })}
      ${text(cx + cW - 32, cy + 166, "38 ms", { size: 11.5, fill: C.dim, anchor: "end", cls: "mono" })}
      ${text(cx + 32, cy + 190, "{ \"id\": 1042, \"status\": \"live\" }", { size: 11.5, fill: C.lilac, cls: "mono" })}
    </g>`;

  // D — type-safe snippet
  const dx = P + cW + G, dy = y2;
  const code = [
    [["type ", C.pink], ["Dev", C.cyan], [" = {", C.soft]],
    [["  name", C.lilac], [": ", C.soft], [`"${cfg.name}"`, C.green], [";", C.soft]],
    [["  stack", C.lilac], [": ", C.soft], ["Stack", C.cyan], ["[];", C.soft]],
    [["  shipping", C.lilac], [": ", C.soft], ["true", C.amber], [";", C.soft]],
    [["}", C.soft]],
  ];
  const codeLines = code.map((parts, i) => {
    let xx = dx + 44;
    return `${text(dx + 30, dy + 112 + i * 20, String(i + 1), { size: 11, fill: C.dim, anchor: "end", cls: "mono" })}` +
      parts.map(([s, col]) => { const t = text(xx, dy + 112 + i * 20, s, { size: 12.5, fill: col, cls: "mono", extra: 'xml:space="preserve"' }); xx += s.length * 7.5; return t; }).join("");
  }).join("");
  const cardD = `${panel(dx, dy, cW, r2h)}
    ${text(dx + 24, dy + 40, "Type-safe by default", { size: 19, weight: 700, ls: -0.3 })}
    ${text(dx + 24, dy + 64, "TypeScript end-to-end. Fewer bugs.", { size: 13.5, fill: C.muted })}
    <rect x="${dx + 20}" y="${dy + 86}" width="${cW - 40}" height="120" rx="10" fill="#07060D" stroke="${C.border}"/>
    ${codeLines}
    <rect class="blink" x="${dx + 58}" y="${dy + 184}" width="7" height="15" fill="${C.violet}"/>`;

  // E — always learning
  const ex = P + 2 * (cW + G), ey = y2;
  const cardE = `${panel(ex, ey, cW, r2h)}
    ${text(ex + 24, ey + 40, "Always learning", { size: 19, weight: 700, ls: -0.3 })}
    ${text(ex + 24, ey + 64, "Currently leveling up in:", { size: 13.5, fill: C.muted })}
    ${cfg.learning.map((l, i) => {
      const yy = ey + 100 + i * 40, bw = cW - 48;
      return `${text(ex + 24, yy, l.name, { size: 13, weight: 600, fill: C.soft })}
        ${text(ex + cW - 24, yy, `${l.progress}%`, { size: 12, fill: C.dim, anchor: "end", cls: "mono" })}
        <rect x="${ex + 24}" y="${yy + 9}" width="${f(bw)}" height="7" rx="3.5" fill="#fff" fill-opacity=".06"/>
        <rect x="${ex + 24}" y="${yy + 9}" width="${f((bw * l.progress) / 100)}" height="7" rx="3.5" fill="${l.color === "#FFFFFF" ? C.lilac : l.color}" class="grow" style="animation-delay:${0.3 + i * 0.2}s"/>`;
    }).join("")}`;

  const body = `
<defs>
  ${hlGrad()}
  <linearGradient id="gAv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.pink}"/><stop offset="1" stop-color="${C.accent}"/></linearGradient>
  <linearGradient id="gBar" x1="0" x2="1"><stop offset="0" stop-color="${C.accent}"/><stop offset="1" stop-color="${C.cyan}"/></linearGradient>
  <radialGradient id="glowBg" cx=".5" cy="0" r=".7"><stop offset="0" stop-color="${C.accent}" stop-opacity=".22"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" rx="24" fill="${C.bg}"/>
<rect width="${W}" height="${H}" rx="24" fill="url(#glowBg)"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="24" stroke="#fff" stroke-opacity=".08"/>
${sectionHead(W, 56, "Features", "Everything you need to ship.", "One developer, the whole stack — from pixels to production.")}
${cardA}${cardB}${cardC}${cardD}${cardE}`;

  const css = `
  .trk{animation:trk 4s ease-in-out infinite} @keyframes trk{0%,35%{fill:#2A2740}45%,85%{fill:${C.accent}}95%,100%{fill:#2A2740}}
  .knob{animation:knob 4s ease-in-out infinite} @keyframes knob{0%,35%{transform:none}45%,85%{transform:translateX(18px)}95%,100%{transform:none}}
  .cursor{animation:cur 4s ease-in-out infinite} @keyframes cur{0%{transform:translate(40px,60px);opacity:0}15%{opacity:1}30%,40%{transform:none}33%{transform:scale(.92)}60%{transform:translate(-30px,40px);opacity:1}80%,100%{transform:translate(40px,60px);opacity:0}}
  .prog{transform-box:fill-box;animation:prog 4s ease-in-out infinite} @keyframes prog{0%{transform:scaleX(0)}70%,100%{transform:scaleX(1)}}
  .ring{animation:ring 2s .3s cubic-bezier(.3,.7,.2,1) both} @keyframes ring{from{stroke-dashoffset:${f(circ)}}}
  .grow{transform-box:fill-box;animation:grow 1.6s cubic-bezier(.3,.7,.2,1) both} @keyframes grow{from{transform:scaleX(0)}}
  .resp{animation:resp 4s ease infinite} @keyframes resp{0%,25%{opacity:0}35%,90%{opacity:1}100%{opacity:0}}`;
  return svg(W, H, "Features", body, css);
}

/* ═════════════════════════════ LIVE METRICS DASHBOARD ═════════════════════════════ */
function dashboard(d) {
  const W = 1000, H = 600, P = 32;
  const synced = fmtDate(d.built, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const tiles = [
    { label: "Contributions", value: num(d.total), sub: "last 12 months", spark: d.weekly.slice(-16) },
    { label: "Current streak", value: d.syncing ? "—" : `${d.current}d`, sub: `longest ${d.syncing ? "—" : d.longest + "d"}` },
    { label: "Active days", value: d.syncing ? "—" : `${d.active90}/90`, sub: "last 90 days" },
    { label: "Stars earned", value: num(d.stars), sub: `${num(d.followers)} followers` },
  ];
  const tW = (W - 2 * P - 3 * 14) / 4, tY = 138, tH = 96;

  const cx = P, cy = 256, cw = 590, ch = 300;
  const gx = cx + 24, gy = cy + 96, gw = cw - 78, gh = 150;
  const chart = chartPaths(d.weekly, gx, gy, gw, gh);
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const yy = gy + gh - t * gh * 0.88;
    return `<line x1="${gx}" x2="${gx + gw + 8}" y1="${f(yy)}" y2="${f(yy)}" stroke="#fff" stroke-opacity="${t === 0 ? 0.1 : 0.04}" ${t === 0 ? "" : 'stroke-dasharray="3 5"'}/>
      ${(t === 0.5 || t === 1) && !d.syncing ? text(gx + gw + 30, yy + 4, String(Math.round(chart.max * t)), { size: 10, fill: C.dim, anchor: "end", cls: "mono" }) : ""}`;
  }).join("");
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i += 2) {
    const dt = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    months.push(text(gx + (i / 11) * gw, gy + gh + 22, fmtDate(dt, { month: "short" }), { size: 11, fill: C.dim, anchor: i === 0 ? "start" : "middle" }));
  }
  const [pkx, pky] = chart.pts[d.peakIdx] ?? [gx, gy + gh];
  const peakLabel = `Peak · ${d.weekly[d.peakIdx] ?? 0} in a week`;
  const plw = tw(peakLabel, 11.5, true) + 20;
  const plx = Math.min(Math.max(pkx - plw / 2, gx), gx + gw - plw);

  const rx = cx + cw + 16, ry = cy, rw = W - P - rx, rh = ch;
  const barW = rw - 48;
  let acc = 0;
  const langBar = d.langs.length
    ? d.langs.map((l) => { const w = (barW * l.pct) / 100; const s = `<rect x="${f(rx + 24 + acc)}" y="${ry + 64}" width="${f(Math.max(0, w - 2))}" height="10" fill="${l.color}"/>`; acc += w; return s; }).join("")
    : `<rect x="${rx + 24}" y="${ry + 64}" width="${barW}" height="10" fill="#fff" fill-opacity=".06"/>`;
  const langList = d.langs.map((l, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const lx = rx + 24 + col * (barW / 2), ly = ry + 100 + row * 24;
    return `<circle cx="${f(lx + 4)}" cy="${ly - 4}" r="4" fill="${l.color}"/>${text(lx + 14, ly, l.name, { size: 12.5, fill: C.soft, weight: 500 })}${text(lx + barW / 2 - 12, ly, `${l.pct.toFixed(1)}%`, { size: 11.5, fill: C.dim, anchor: "end", cls: "mono" })}`;
  }).join("");
  const bd = Object.entries(d.breakdown);
  const bdMax = Math.max(1, ...bd.map(([, v]) => v));
  const bdY = ry + 100 + Math.ceil(Math.max(1, d.langs.length) / 2) * 24 + 4;
  const breakdown = bd.map(([k, v], i) => {
    const yy = bdY + 30 + i * 27;
    return `${text(rx + 24, yy, k, { size: 12.5, fill: C.muted })}
      <rect x="${rx + 130}" y="${yy - 9}" width="${f(barW - 150)}" height="8" rx="4" fill="#fff" fill-opacity=".05"/>
      <rect x="${rx + 130}" y="${yy - 9}" width="${f(Math.max(4, ((barW - 150) * v) / bdMax))}" height="8" rx="4" fill="url(#gLine)" class="grow" style="animation-delay:${0.2 + i * 0.12}s"/>
      ${text(rx + rw - 24, yy, num(v), { size: 12, fill: C.soft, anchor: "end", cls: "mono", weight: 600 })}`;
  }).join("");

  const body = `
<defs>
  ${hlGrad()}
  <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.accent}" stop-opacity=".5"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></linearGradient>
  <linearGradient id="gLine" x1="0" x2="1"><stop offset="0" stop-color="${C.violet}"/><stop offset=".6" stop-color="${C.accent}"/><stop offset="1" stop-color="${C.cyan}"/></linearGradient>
  <clipPath id="reveal"><rect x="${gx - 4}" y="${gy - 20}" width="${gw + 8}" height="${gh + 24}"><animate attributeName="width" from="0" to="${gw + 8}" dur="2.2s" begin="0.3s" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1" keyTimes="0;1"/></rect></clipPath>
</defs>
<rect width="${W}" height="${H}" rx="20" fill="${C.bg}"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="20" stroke="#fff" stroke-opacity=".09"/>
${windowDots(P - 6, 26)}
${text(W / 2, 31, `${cfg.brand} / metrics`, { size: 12.5, fill: C.dim, anchor: "middle", cls: "mono" })}
<rect x="0" y="52" width="${W}" height="1" fill="#fff" fill-opacity=".06"/>
${text(P, 98, "Live metrics", { size: 26, weight: 800, ls: -0.8 })}
${text(P, 122, "Real numbers from the GitHub API, rebuilt every day by GitHub Actions.", { size: 14, fill: C.muted })}
<rect x="${W - P - 214}" y="78" width="214" height="30" rx="15" fill="${d.syncing ? C.amber : C.green}" fill-opacity=".1" stroke="${d.syncing ? C.amber : C.green}" stroke-opacity=".35"/>
<circle cx="${W - P - 196}" cy="93" r="4" fill="${d.syncing ? C.amber : C.green}"/><circle class="pulse" cx="${W - P - 196}" cy="93" r="4" fill="${d.syncing ? C.amber : C.green}"/>
${text(W - P - 184, 97.5, d.syncing ? "Waiting for first sync…" : `Synced ${synced}`, { size: 12, weight: 600, fill: d.syncing ? C.amber : C.green })}

${tiles.map((t, i) => {
  const x = P + i * (tW + 14);
  let spark = "";
  if (t.spark) {
    const sp = chartPaths(t.spark, x + tW - 96, tY + 40, 80, 34);
    spark = `<path d="${sp.area}" fill="url(#gArea)" opacity=".7"/><path d="${sp.line}" stroke="${C.violet}" stroke-width="1.8"/>`;
  }
  return `${panel(x, tY, tW, tH, { r: 14 })}
    ${text(x + 18, tY + 28, t.label.toUpperCase(), { size: 10.5, weight: 700, fill: C.dim, ls: 1.2 })}
    ${text(x + 18, tY + 64, t.value, { size: 30, weight: 800, ls: -1 })}
    ${text(x + 18, tY + 84, t.sub, { size: 12, fill: C.muted })}${spark}`;
}).join("")}

${panel(cx, cy, cw, ch, { r: 14 })}
${text(cx + 24, cy + 34, "Contribution activity", { size: 15, weight: 700 })}
${text(cx + 24, cy + 54, `Weekly contributions · most active on ${d.syncing ? "—" : d.busiest}`, { size: 12, fill: C.muted })}
${gridLines}
<g clip-path="url(#reveal)">
  <path d="${chart.area}" fill="url(#gArea)"/>
  <path d="${chart.line}" stroke="url(#gLine)" stroke-width="2.5" stroke-linecap="round"/>
  ${d.syncing ? "" : `<line x1="${f(pkx)}" x2="${f(pkx)}" y1="${f(pky)}" y2="${gy + gh}" stroke="${C.violet}" stroke-opacity=".4" stroke-dasharray="2 4"/>
  <circle cx="${f(pkx)}" cy="${f(pky)}" r="9" fill="${C.accent}" fill-opacity=".25"/><circle cx="${f(pkx)}" cy="${f(pky)}" r="4.5" fill="#fff" stroke="${C.accent}" stroke-width="2"/>`}
</g>
${d.syncing ? text(gx + gw / 2, gy + gh / 2, "Syncing with GitHub…", { size: 14, fill: C.dim, anchor: "middle" }) : `<g class="fadein" style="animation-delay:2.3s">
  <rect x="${f(plx)}" y="${f(Math.max(gy - 26, pky - 40))}" width="${f(plw)}" height="24" rx="7" fill="${C.surface2}" stroke="${C.borderHi}"/>
  ${text(plx + plw / 2, Math.max(gy - 26, pky - 40) + 16, peakLabel, { size: 11.5, weight: 600, anchor: "middle", fill: C.soft })}
</g>`}
${months.join("")}

${panel(rx, ry, rw, rh, { r: 14 })}
${text(rx + 24, ry + 34, "Languages", { size: 15, weight: 700 })}
<clipPath id="lb"><rect x="${rx + 24}" y="${ry + 64}" width="${barW}" height="10" rx="5"/></clipPath>
<g clip-path="url(#lb)">${langBar}</g>
${d.langs.length ? langList : text(rx + 24, ry + 100, "Syncing…", { size: 12.5, fill: C.dim })}
<rect x="${rx + 24}" y="${bdY}" width="${barW}" height="1" fill="#fff" fill-opacity=".06"/>
${breakdown}`;

  const css = `.grow{transform-box:fill-box;animation:grow 1.4s cubic-bezier(.3,.7,.2,1) both} @keyframes grow{from{transform:scaleX(0)}}`;
  return svg(W, H, "Live GitHub metrics", body, css);
}

/* ═════════════════════════════ STATUS PAGE ═════════════════════════════ */
function status(d) {
  const W = 1000, P = 32;
  const rows = cfg.status;
  const panelH = 128 + rows.length * 52;
  const H = 142 + panelH + 30;
  const bars = 90, gap = 3, bw = (W - 2 * P - 48 - gap * (bars - 1)) / bars;
  const palette = ["#23212F", "#1F6E55", "#27A67A", "#34D399", "#86EFAC"];
  const updated = fmtDate(d.built, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const levels = d.levels.length === bars ? d.levels : Array(bars).fill(0);
  const ok = !d.syncing;

  const body = `
<defs>${hlGrad()}<linearGradient id="scan" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="bars"><rect x="${P + 24}" y="190" width="${W - 2 * P - 48}" height="36"/></clipPath></defs>
<rect width="${W}" height="${H}" rx="20" fill="${C.bg}"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="20" stroke="#fff" stroke-opacity=".09"/>
<rect x="${P}" y="30" width="22" height="22" rx="6" fill="${C.green}" fill-opacity=".15"/>
<path d="M${P + 6} 41 h3 l2-5 3 10 2-5 h3" stroke="${C.green}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
${text(P + 34, 46, `status.${cfg.domain}`, { size: 15, weight: 700, cls: "mono" })}
${text(W - P, 46, `Updated ${updated} ${cfg.timezoneLabel.split(" ")[0]}`, { size: 12, fill: C.dim, anchor: "end" })}

<rect x="${P}" y="72" width="${W - 2 * P}" height="54" rx="12" fill="${ok ? C.green : C.amber}" fill-opacity=".1" stroke="${ok ? C.green : C.amber}" stroke-opacity=".3"/>
<circle cx="${P + 26}" cy="99" r="5" fill="${ok ? C.green : C.amber}"/><circle class="pulse" cx="${P + 26}" cy="99" r="5" fill="${ok ? C.green : C.amber}"/>
${text(P + 44, 104.5, ok ? "All systems operational" : "Syncing status…", { size: 16, weight: 700, fill: ok ? C.green : C.amber })}

${panel(P, 142, W - 2 * P, panelH, { r: 14 })}
${text(P + 24, 176, "Shipping code", { size: 14.5, weight: 700 })}
${text(P + 138, 176, "· a green bar means I pushed something that day", { size: 12.5, fill: C.dim })}
${text(W - P - 24, 176, ok ? `${d.uptime.toFixed(1)}% uptime` : "—", { size: 13, weight: 700, fill: ok ? C.green : C.dim, anchor: "end" })}
${levels.map((lv, i) => `<rect x="${f(P + 24 + i * (bw + gap))}" y="192" width="${f(bw)}" height="32" rx="2" fill="${palette[lv]}"/>`).join("")}
<g clip-path="url(#bars)"><rect class="scan" x="${P + 24}" y="190" width="60" height="36" fill="url(#scan)"/></g>
${text(P + 24, 244, "90 days ago", { size: 11, fill: C.dim })}
${text(W - P - 24, 244, "Today", { size: 11, fill: C.dim, anchor: "end" })}
${rows.map((r, i) => {
  const yy = 262 + i * 52;
  const good = /operational/i.test(r.state);
  return `<rect x="${P + 1}" y="${yy}" width="${W - 2 * P - 2}" height="1" fill="#fff" fill-opacity=".05"/>
    ${text(P + 24, yy + 32, r.name, { size: 14, fill: C.soft, weight: 500 })}
    ${good ? check(W - P - 24 - tw(r.state, 13, true) - 16, yy + 27.5, C.green) : ""}
    ${text(W - P - 24, yy + 32, r.state, { size: 13, weight: 700, fill: good ? C.green : C.lilac, anchor: "end" })}`;
}).join("")}`;
  const css = `.scan{animation:scan 5s linear infinite} @keyframes scan{from{transform:translateX(-60px)}to{transform:translateX(${W - 2 * P - 24}px)}}`;
  return svg(W, H, "Status page", body, css);
}

/* ═════════════════════════════ PRICING ═════════════════════════════ */
function pricing() {
  const W = 1000, P = 32, G = 18, top = 180;
  const plans = cfg.pricing;
  const cw = (W - 2 * P - G * (plans.length - 1)) / plans.length;
  const maxFeat = Math.max(...plans.map((p) => p.features.length));
  const ch = 196 + maxFeat * 32 + 92;
  const H = top + ch + 44;

  const cards = plans.map((p, i) => {
    const x = P + i * (cw + G), y = top, hi = !!p.highlight;
    const priceSize = p.price.length > 5 ? 34 : 42;
    const feats = p.features.map((ft, j) => `${check(x + 36, y + 196 + j * 32, hi ? C.violet : C.muted)}${text(x + 54, y + 201 + j * 32, ft, { size: 14, fill: C.soft })}`).join("");
    const btnY = y + ch - 70;
    return `
    ${hi ? `<rect x="${f(x - 1)}" y="${y - 1}" width="${f(cw + 2)}" height="${ch + 2}" rx="19" fill="url(#gHi)" filter="url(#glow)" opacity=".55"/>` : ""}
    <rect x="${f(x)}" y="${y}" width="${f(cw)}" height="${ch}" rx="18" fill="${hi ? "#120F22" : C.surface}" stroke="${hi ? "url(#gHi)" : C.border}" stroke-width="${hi ? 1.5 : 1}"/>
    <rect x="${f(x + 18)}" y="${y}" width="${f(cw - 36)}" height="1" fill="url(#hl)"/>
    ${hi ? `<rect x="${f(x + cw - 132)}" y="${y + 22}" width="110" height="24" rx="12" fill="${C.accent}"/>${text(x + cw - 77, y + 38.5, "MOST POPULAR", { size: 10, weight: 800, anchor: "middle", ls: 1 })}` : ""}
    ${text(x + 28, y + 40, p.name, { size: 16, weight: 700, fill: hi ? C.lilac : C.soft })}
    ${text(x + 28, y + 98, p.price, { size: priceSize, weight: 800, ls: -1.5 })}
    ${text(x + 28 + tw(p.price, priceSize, true) - p.price.length * 1.5 + 8, y + 98, p.per, { size: 13.5, fill: C.dim })}
    ${text(x + 28, y + 130, p.description, { size: 14, fill: C.muted })}
    <rect x="${f(x + 28)}" y="${y + 160}" width="${f(cw - 56)}" height="1" fill="#fff" fill-opacity=".07"/>
    ${feats}
    <rect x="${f(x + 28)}" y="${btnY}" width="${f(cw - 56)}" height="44" rx="12" fill="${hi ? "url(#gBtn)" : "#fff"}" fill-opacity="${hi ? 1 : 0.05}" stroke="${hi ? "none" : "#fff"}" stroke-opacity=".12"/>
    ${text(x + cw / 2, btnY + 27.5, `${p.cta}  →`, { size: 14, weight: 700, anchor: "middle", fill: hi ? "#fff" : C.soft, extra: 'xml:space="preserve"' })}`;
  }).join("");

  const body = `
<defs>
  ${hlGrad()}
  <linearGradient id="gHi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.lilac}"/><stop offset=".5" stop-color="${C.accent}"/><stop offset="1" stop-color="${C.cyan}"/></linearGradient>
  <linearGradient id="gBtn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.accent}"/></linearGradient>
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
  <radialGradient id="glowBg" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="${C.accent}" stop-opacity=".16"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" rx="24" fill="${C.bg}"/>
<rect width="${W}" height="${H}" rx="24" fill="url(#glowBg)"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="24" stroke="#fff" stroke-opacity=".08"/>
${sectionHead(W, 56, "Pricing", "Simple, transparent plans.", "Every plan includes clean code, clear communication and zero ghosting.")}
${cards}`;
  return svg(W, H, "Pricing", body);
}

/* ═════════════════════════════ FOOTER ═════════════════════════════ */
function footer(d) {
  const W = 1000, H = 280;
  const built = fmtDate(d.built, { year: "numeric", month: "short", day: "numeric" });
  const body = `
<defs>
  <linearGradient id="gWord" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="${C.violet}" stop-opacity=".45"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></linearGradient>
  <radialGradient id="glowBg" cx=".5" cy="1" r=".7"><stop offset="0" stop-color="${C.accent}" stop-opacity=".3"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></radialGradient>
  <clipPath id="clip"><rect width="${W}" height="${H}" rx="24"/></clipPath>
</defs>
<g clip-path="url(#clip)">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#glowBg)"/>
  ${text(W / 2, 62, "Built in Brazil. Shipped everywhere.", { size: 22, weight: 700, anchor: "middle", ls: -0.5 })}
  ${text(W / 2, 90, `© ${d.built.getFullYear()} ${cfg.name} · this README is generated by code (scripts/build.mjs) · last build ${built}`, { size: 12.5, fill: C.dim, anchor: "middle" })}
  <text x="${W / 2}" y="${H + 22}" class="sans" font-size="150" font-weight="900" letter-spacing="-7" text-anchor="middle" fill="url(#gWord)">${esc(cfg.brand)}</text>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="24" stroke="#fff" stroke-opacity=".08"/>`;
  return svg(W, H, "Footer", body);
}

/* ═════════════════════════════ BUTTONS ═════════════════════════════ */
const ICONS = {
  mail: (x, y, c) => `<rect x="${x}" y="${y + 2}" width="16" height="12" rx="2.5" stroke="${c}" stroke-width="1.6"/><path d="M${x + 1} ${y + 4} l7 5 7-5" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
  linkedin: (x, y, c) => `<rect x="${x}" y="${y}" width="16" height="16" rx="3.5" fill="${c}"/><text x="${x + 8}" y="${y + 12.5}" class="sans" font-size="10.5" font-weight="800" fill="#0B0A12" text-anchor="middle">in</text>`,
  instagram: (x, y, c) => `<rect x="${x}" y="${y}" width="16" height="16" rx="5" stroke="${c}" stroke-width="1.6"/><circle cx="${x + 8}" cy="${y + 8}" r="3.4" stroke="${c}" stroke-width="1.6"/><circle cx="${x + 12.2}" cy="${y + 3.8}" r="1" fill="${c}"/>`,
  x: (x, y, c) => `<path d="M${x + 1} ${y + 1} L${x + 15} ${y + 15} M${x + 15} ${y + 1} L${x + 1} ${y + 15}" stroke="${c}" stroke-width="1.9" stroke-linecap="round"/>`,
  code: (x, y, c) => `<path d="M${x + 5} ${y + 3} l-5 5 5 5 M${x + 11} ${y + 3} l5 5 -5 5" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  arrow: (x, y, c) => `<path d="M${x} ${y + 8} h14 M${x + 9} ${y + 3} l5 5 -5 5" stroke="${c}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`,
};
function button(label, icon, primary = false) {
  const H = 44, w = Math.ceil(tw(label, 14, true) + 70);
  const fg = primary ? "#fff" : C.soft;
  const body = `
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.accent}"/></linearGradient></defs>
<rect x=".5" y=".5" width="${w - 1}" height="${H - 1}" rx="${H / 2}" fill="${primary ? "url(#g)" : C.surface}" stroke="${primary ? "none" : C.borderHi}"/>
${ICONS[icon](20, 14, primary ? "#fff" : C.violet)}
${text(46, 27, label, { size: 14, weight: 700, fill: fg })}`;
  return { svg: svg(w, H, label, body), w, h: H };
}

/* ═════════════════════════════ README ═════════════════════════════ */
function readme(d, buttons) {
  const L = cfg.links;
  const primaryHref = L.email ? `mailto:${L.email}` : L.linkedin || `https://github.com/${cfg.login}`;
  const btn = (file, href, alt) => `<a href="${href}"><img src="assets/${file}" height="44" alt="${esc(alt)}"/></a>`;
  const socials = buttons.map((b) => btn(b.file, b.href, b.label)).join("&nbsp;\n  ");

  const changelog = d.repos.length
    ? `| Release | Project | What shipped | Stack |\n|:--|:--|:--|:--|\n` +
      d.repos.slice(0, 6).map((r) =>
        `| \`${r.pushedAt.slice(0, 10).replace(/-/g, ".")}\` | **[${r.name}](${r.url})**${r.stars ? ` ★${r.stars}` : ""} | ${(r.description || "—").replace(/\|/g, "\\|")} | ${r.language ? `\`${r.language}\`` : "—"} |`).join("\n")
    : `> ⏳ Syncing with GitHub… the changelog appears after the first workflow run.`;

  return `<!--
  ⚠️  This file is generated by scripts/build.mjs — edits here are overwritten daily.
      To change text, links, stack or plans, edit profile.config.json.
-->

<a href="${primaryHref}"><img src="assets/hero.svg" width="100%" alt="${esc(cfg.brand)} — ${esc(cfg.headline.join(" "))}"/></a>

<div align="center">
  ${socials}
</div>

<br/>
<img src="assets/stack.svg" width="100%" alt="Tech stack: ${esc([...cfg.stack, ...cfg.learning].map((s) => s.name).join(", "))}"/>

<img src="assets/features.svg" width="100%" alt="Features"/>

<img src="assets/dashboard.svg" width="100%" alt="Live metrics: ${num(d.total)} contributions in the last year, ${d.current}-day current streak, ${num(d.stars)} stars"/>

<img src="assets/status.svg" width="100%" alt="Status page"/>

<img src="assets/pricing.svg" width="100%" alt="Pricing plans"/>

<div align="center">
  ${btn("btn-repos.svg", `https://github.com/${cfg.login}?tab=repositories`, "Browse repos")}&nbsp;
  ${btn("btn-start.svg", primaryHref, "Start a project")}&nbsp;
  ${btn("btn-call.svg", L.linkedin || primaryHref, "Book a call")}
</div>

<h2 align="center">Changelog</h2>
<p align="center"><sub>Latest releases, pulled from my public repositories on every build.</sub></p>

${changelog}

<br/>
<img src="assets/footer.svg" width="100%" alt="Built in Brazil. Shipped everywhere."/>
`;
}

/* ═════════════════════════════ BUILD ═════════════════════════════ */
let raw = null;
if (ARGS.has("--sample")) raw = sampleData();
else if (TOKEN) raw = await fetchGitHub();
else console.warn("⚠  No GH_TOKEN/GITHUB_TOKEN — building in 'syncing' mode.");

const d = derive(raw);
await fs.mkdir(OUT, { recursive: true });

const L = cfg.links;
const socialDefs = [
  ["email", "Email me", "mail", L.email && `mailto:${L.email}`],
  ["linkedin", "LinkedIn", "linkedin", L.linkedin],
  ["instagram", "Instagram", "instagram", L.instagram],
  ["x", "X / Twitter", "x", L.x],
  ["github", "Follow on GitHub", "code", `https://github.com/${cfg.login}`],
].filter(([, , , href]) => href);

const files = {
  "hero.svg": hero(d),
  "stack.svg": stack(),
  "features.svg": features(),
  "dashboard.svg": dashboard(d),
  "status.svg": status(d),
  "pricing.svg": pricing(),
  "footer.svg": footer(d),
  "btn-repos.svg": button(cfg.pricing[0]?.cta || "Browse repos", "code").svg,
  "btn-start.svg": button(cfg.pricing[1]?.cta || "Start a project", "arrow", true).svg,
  "btn-call.svg": button(cfg.pricing[2]?.cta || "Book a call", "mail").svg,
};
const socialButtons = socialDefs.map(([key, label, icon, href], i) => {
  const file = `btn-${key}.svg`;
  files[file] = button(label, icon, i === 0).svg;
  return { file, href, label };
});

for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(OUT, name), content);
await fs.writeFile(path.join(ROOT, "README.md"), readme(d, socialButtons));
console.log(`✓ Built ${Object.keys(files).length} assets + README (${d.syncing ? "syncing" : raw && ARGS.has("--sample") ? "sample data" : "live data"})`);
