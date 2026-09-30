#!/usr/bin/env node
/**
 * tanashic0dex — profile build pipeline
 * ------------------------------------------------------------
 * Renders a monochrome, dashboard-style GitHub profile as SVGs
 * (one light + one dark version of each, picked by the viewer's
 * GitHub theme) and regenerates README.md.
 *
 *   node scripts/build.mjs            → live data (needs GH_TOKEN)
 *   node scripts/build.mjs --sample   → fake data, local preview only
 *   (no token)                        → static profile, activity hidden
 *
 * Zero dependencies. Edit profile.config.json — never README.md.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "assets");
const cfg = JSON.parse(await fs.readFile(path.join(ROOT, "profile.config.json"), "utf8"));
const ARGS = new Set(process.argv.slice(2));
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

/* ─────────────────────────── themes (strict monochrome) ─────────────────────────── */
const THEMES = {
  light: { name: "light", bg: "#FFFFFF", surface: "#FAFAFA", raised: "#FFFFFF", border: "#E5E5E5", text: "#0A0A0A", muted: "#525252", dim: "#A3A3A3", inv: "#FFFFFF", track: "#EFEFEF" },
  dark: { name: "dark", bg: "#0A0A0A", surface: "#0F0F0F", raised: "#141414", border: "#262626", text: "#FAFAFA", muted: "#A1A1A1", dim: "#5C5C5C", inv: "#0A0A0A", track: "#1C1C1C" },
};
const SANS = `'Geist','Inter','Segoe UI Variable Text','Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif`;
const MONO = `'Geist Mono','JetBrains Mono','SF Mono','Cascadia Mono',Consolas,Menlo,monospace`;

/* ─────────────────────────── helpers ─────────────────────────── */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (n) => +Number(n).toFixed(1);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const num = (n) => (n == null ? "—" : n.toLocaleString("en-US"));

function tw(s, size, bold = false) {
  let w = 0;
  for (const ch of String(s)) {
    if (" .,:;!|'il·".includes(ch)) w += 0.28;
    else if ("fjrt()[]/".includes(ch)) w += 0.36;
    else if ("mwMW@%".includes(ch)) w += 0.86;
    else if (ch >= "A" && ch <= "Z") w += 0.66;
    else if (ch >= "0" && ch <= "9") w += 0.58;
    else if (ch.codePointAt(0) > 0x2000) w += 0.8;
    else w += 0.54;
  }
  return w * size * (bold ? 1.07 : 1);
}
const twMono = (s, size) => String(s).length * size * 0.6;

const fmtDate = (d, opts) => new Intl.DateTimeFormat("en-US", { timeZone: cfg.timezone, ...opts }).format(d);
function relTime(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

const CSS = `
  .sans{font-family:${SANS}} .mono{font-family:${MONO};font-variant-numeric:tabular-nums}
  .live{animation:live 2.4s ease-in-out infinite} @keyframes live{50%{opacity:.25}}
  .sweep{animation:sweep 6s cubic-bezier(.45,0,.2,1) infinite} @keyframes sweep{0%{transform:translateX(0);opacity:0}8%{opacity:1}92%{opacity:1}100%{transform:translateX(var(--d));opacity:0}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

function svg(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${CSS}</style>
${body}
</svg>`;
}

const t = (x, y, s, { size = 14, fill, weight = 400, anchor = "start", cls = "sans", ls = 0 } = {}) =>
  `<text x="${f(x)}" y="${f(y)}" class="${cls}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls ? ` letter-spacing="${ls}"` : ""}>${esc(s)}</text>`;

const frame = (T, W, H, r = 12) => `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${r}" fill="${T.bg}" stroke="${T.border}"/>`;
const hr = (T, x, y, w) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="1" fill="${T.border}"/>`;
const vr = (T, x, y, h) => `<rect x="${f(x)}" y="${f(y)}" width="1" height="${f(h)}" fill="${T.border}"/>`;
const label = (color, x, y, s, anchor = "start") => t(x, y, s.toUpperCase(), { size: 10.5, fill: color, weight: 500, cls: "mono", ls: 0.9, anchor });

/** pill: solid (inverted) or outline, optional pulsing dot */
function chip(T, x, y, s, { solid = false, dot = false, anchor = "start" } = {}) {
  const w = tw(s, 11.5, true) + (dot ? 30 : 18), h = 22;
  const x0 = anchor === "end" ? x - w : x;
  return {
    w,
    svg: `<rect x="${f(x0 + 0.5)}" y="${f(y + 0.5)}" width="${f(w - 1)}" height="${h - 1}" rx="${h / 2}" fill="${solid ? T.text : T.raised}" stroke="${solid ? T.text : T.border}"/>
      ${dot ? `<circle cx="${f(x0 + 13)}" cy="${y + 11}" r="3.5" fill="${solid ? T.inv : T.text}" class="live"/>` : ""}
      ${t(x0 + (dot ? 22 : 9), y + 15, s, { size: 11.5, weight: 600, fill: solid ? T.inv : T.text })}`,
  };
}

/** breadcrumb bar shared by every panel */
function sectionBar(T, W, title, right = "") {
  const pre = `${cfg.login} / `;
  return `${t(24, 31, pre, { size: 13, fill: T.dim, cls: "mono" })}
    ${t(24 + twMono(pre, 13), 31, title, { size: 13, fill: T.text, weight: 600, cls: "mono" })}
    ${right}
    ${hr(T, 1, 50, W - 2)}`;
}

/* ─────────────────────────── data ─────────────────────────── */
const QUERY = `query($login:String!){
  user(login:$login){
    followers{totalCount}
    repositories(ownerAffiliations:OWNER, privacy:PUBLIC, first:100, orderBy:{field:PUSHED_AT, direction:DESC}){
      totalCount
      nodes{ name description url stargazerCount pushedAt isFork
        primaryLanguage{ name }
        languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name } } } }
    }
    contributionsCollection{
      totalCommitContributions totalPullRequestContributions totalIssueContributions totalPullRequestReviewContributions
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
  const u = json.data.user, cc = u.contributionsCollection;
  const repos = u.repositories.nodes.filter((r) => !r.isFork);
  const bytes = {};
  for (const r of repos) for (const e of r.languages.edges) {
    if (cfg.ignoreLanguages?.includes(e.node.name)) continue;
    bytes[e.node.name] = (bytes[e.node.name] || 0) + e.size;
  }
  return {
    followers: u.followers.totalCount,
    repoCount: u.repositories.totalCount,
    stars: sum(repos.map((r) => r.stargazerCount)),
    repos: repos.filter((r) => r.name.toLowerCase() !== cfg.login.toLowerCase()).map((r) => ({
      name: r.name, description: r.description, url: r.url, stars: r.stargazerCount, pushedAt: r.pushedAt, language: r.primaryLanguage?.name,
    })),
    days: cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays).map((d) => ({ date: d.date, count: d.contributionCount })),
    total: cc.contributionCalendar.totalContributions,
    breakdown: { Commits: cc.totalCommitContributions, "Pull requests": cc.totalPullRequestContributions, Issues: cc.totalIssueContributions, Reviews: cc.totalPullRequestReviewContributions },
    langs: Object.entries(bytes).map(([name, b]) => ({ name, bytes: b })),
  };
}

function sampleData() {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const days = [];
  for (let i = 370; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5), wk = d.getDay() % 6 === 0;
    const wave = 0.55 + 0.45 * Math.sin((370 - i) / 30);
    days.push({ date: d.toISOString().slice(0, 10), count: rnd() < (wk ? 0.3 : 0.75) ? Math.round(rnd() * 8 * wave + (rnd() < 0.06 ? 10 : 0)) : 0 });
  }
  return {
    followers: 48, repoCount: 23, stars: 67, total: sum(days.map((d) => d.count)), days,
    breakdown: { Commits: 612, "Pull requests": 41, Issues: 18, Reviews: 9 },
    langs: [{ name: "TypeScript", bytes: 420 }, { name: "JavaScript", bytes: 310 }, { name: "PHP", bytes: 150 }, { name: "Python", bytes: 40 }, { name: "Shell", bytes: 12 }],
    repos: [
      ["nebula-dashboard", "Realtime analytics dashboard built with React + TypeScript", "TypeScript", 21, 1],
      ["api-forge", "Opinionated Node.js REST API starter with auth and tests", "JavaScript", 14, 3],
      ["pix-checkout", "Brazilian PIX payment checkout flow", "PHP", 9, 6],
      ["portfolio-v3", "Personal site, rebuilt from scratch", "TypeScript", 5, 11],
    ].map(([name, description, language, stars, ago]) => ({ name, description, language, stars, url: `https://github.com/${cfg.login}/${name}`, pushedAt: new Date(Date.now() - ago * 864e5).toISOString() })),
  };
}

function derive(raw) {
  if (!raw) return { live: false, built: new Date(), repos: [] };
  const today = new Date().toISOString().slice(0, 10);
  const past = raw.days.filter((d) => d.date <= today);
  const weekly = [];
  for (let i = past.length; i > 0; i -= 7) weekly.unshift(sum(past.slice(Math.max(0, i - 7), i).map((d) => d.count)));
  let current = 0, longest = 0, run = 0;
  for (const d of past) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = past.length - 1;
  if (i >= 0 && past[i].count === 0) i--; // today isn't over yet
  while (i >= 0 && past[i].count > 0) { current++; i--; }
  const nonzero = past.map((x) => x.count).filter(Boolean).sort((a, b) => a - b);
  const q = (p) => nonzero[Math.floor(p * (nonzero.length - 1))] ?? 0;
  const level = (c) => (!c ? 0 : c <= q(0.25) ? 1 : c <= q(0.5) ? 2 : c <= q(0.75) ? 3 : 4);
  const last30 = sum(past.slice(-30).map((d) => d.count)), prev30 = sum(past.slice(-60, -30).map((d) => d.count));
  const byDay = Array(7).fill(0);
  for (const d of past) byDay[new Date(d.date + "T12:00:00Z").getUTCDay()] += d.count;
  const totalBytes = sum(raw.langs.map((l) => l.bytes)) || 1;
  return {
    live: true, built: new Date(), ...raw,
    weekly: weekly.slice(-52), current, longest,
    active90: past.slice(-90).filter((d) => d.count > 0).length,
    grid: past.slice(-91).map((d) => ({ ...d, level: level(d.count) })),
    trend: prev30 ? Math.round(((last30 - prev30) / prev30) * 100) : null,
    busiest: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][byDay.indexOf(Math.max(...byDay))],
    langs: raw.langs.sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((l) => ({ ...l, pct: (l.bytes / totalBytes) * 100 })),
  };
}

/* ═════════════════════════════ OVERVIEW ═════════════════════════════ */
function overview(T, d) {
  const W = 1000, H = 330, split = 372;
  const c1 = chip(T, W - 24, 14, cfg.availability, { solid: true, dot: true, anchor: "end" });
  const c2 = chip(T, W - 24 - c1.w - 8, 14, cfg.version, { anchor: "end" });
  const synced = d.live ? t(W - 24 - c1.w - c2.w - 22, 29, `synced ${fmtDate(d.built, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}`, { size: 11.5, fill: T.dim, cls: "mono", anchor: "end" }) : "";

  const meta = [["Location", cfg.location], ["Timezone", cfg.timezoneLabel], ["Education", cfg.education], ["Role", cfg.role]];
  const profile = `
    <rect x="24" y="74" width="52" height="52" rx="10" fill="${T.text}"/>
    ${t(50, 109, cfg.name[0].toUpperCase(), { size: 26, weight: 700, fill: T.inv, anchor: "middle" })}
    ${t(92, 96, cfg.name, { size: 22, weight: 700, fill: T.text, ls: -0.5 })}
    ${t(92, 118, `@${cfg.login}`, { size: 13, fill: T.muted, cls: "mono" })}
    ${meta.map(([k, v], i) => {
      const y = 158 + i * 40;
      return `${hr(T, 24, y - 16, split - 48)}${label(T.dim, 24, y + 9, k)}${t(split - 24, y + 9, v, { size: 13.5, fill: T.text, weight: 500, anchor: "end" })}`;
    }).join("")}`;

  const tiles = d.live
    ? [
        { label: "Contributions", value: num(d.total), sub: d.trend == null ? "last 12 months" : `${d.trend >= 0 ? "+" : ""}${d.trend}% vs previous 30 days`, spark: d.weekly.slice(-20) },
        { label: "Current streak", value: `${d.current}d`, sub: `longest ${d.longest} days` },
        { label: "Public repos", value: num(d.repoCount), sub: `${num(d.stars)} stars earned` },
        { label: "Active days", value: `${d.active90}/90`, sub: `busiest on ${d.busiest}s` },
      ]
    : cfg.highlights;
  const gx = split + 24, gw = W - gx - 24, gap = 12, tW = (gw - gap) / 2, tH = 112;
  const kpis = tiles.map((k, i) => {
    const x = gx + (i % 2) * (tW + gap), y = 74 + Math.floor(i / 2) * (tH + gap);
    let spark = "";
    if (k.spark) {
      const max = Math.max(1, ...k.spark), bw = 5, sx = x + tW - 20 - k.spark.length * (bw + 2);
      spark = k.spark.map((v, j) => {
        const h = Math.max(2, (v / max) * 38);
        return `<rect x="${f(sx + j * (bw + 2))}" y="${f(y + 70 - h)}" width="${bw}" height="${f(h)}" rx="1" fill="${T.text}" opacity="${j === k.spark.length - 1 ? 1 : 0.28}"/>`;
      }).join("");
    }
    return `<rect x="${f(x + 0.5)}" y="${f(y + 0.5)}" width="${f(tW - 1)}" height="${tH - 1}" rx="10" fill="${T.surface}" stroke="${T.border}"/>
      ${label(T.dim, x + 18, y + 28, k.label)}
      ${t(x + 18, y + 68, k.value, { size: 30, weight: 700, fill: T.text, ls: -1 })}
      ${t(x + 18, y + 92, k.sub, { size: 12.5, fill: T.muted })}${spark}`;
  }).join("");

  return svg(W, H, `${cfg.name} — ${cfg.role}`, `${frame(T, W, H)}
${sectionBar(T, W, "overview", `${c1.svg}${c2.svg}${synced}`)}
${profile}
${vr(T, split, 51, H - 52)}
${kpis}`);
}

/* ═════════════════════════════ ACTIVITY (live only) ═════════════════════════════ */
function activity(T, d) {
  const W = 1000, H = 350, split = 640;
  const cx = 24, cy = 112, cw = split - 48, ch = 160;
  const max = Math.max(1, ...d.weekly), n = d.weekly.length, slot = cw / n, bw = Math.max(3, slot - 3);
  const peak = d.weekly.indexOf(max);
  const bars = d.weekly.map((v, i) => {
    const h = Math.max(2, (v / max) * ch);
    return `<rect x="${f(cx + i * slot)}" y="${f(cy + ch - h)}" width="${f(bw)}" height="${f(h)}" rx="1.5" fill="${T.text}" opacity="${i === peak || i === n - 1 ? 1 : 0.22}"/>`;
  }).join("");
  const grid = [0.5, 1].map((p) => `<line x1="${cx}" x2="${cx + cw}" y1="${f(cy + ch - p * ch)}" y2="${f(cy + ch - p * ch)}" stroke="${T.border}" stroke-dasharray="2 4"/>`).join("");
  const now = new Date();
  const months = [0, 3, 6, 9, 11].map((m) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - 11 + m, 1);
    return t(cx + (m / 11) * (cw - bw), cy + ch + 22, fmtDate(dt, { month: "short" }), { size: 11, fill: T.dim, cls: "mono", anchor: m === 0 ? "start" : m === 11 ? "end" : "middle" });
  }).join("");
  const px = cx + peak * slot + bw / 2;
  const peakTxt = `peak · ${max}/wk`, pw = twMono(peakTxt, 11) + 16;
  const pbx = Math.min(Math.max(px - pw / 2, cx), cx + cw - pw);

  const rx = split + 24, cell = 18, g = 4, op = [0, 0.25, 0.45, 0.7, 1];
  const heat = d.grid.map((day, i) => {
    const col = Math.floor(i / 7), row = i % 7;
    return `<rect x="${f(rx + col * (cell + g))}" y="${f(86 + row * (cell + g))}" width="${cell}" height="${cell}" rx="3" fill="${day.level ? T.text : T.track}"${day.level ? ` opacity="${op[day.level]}"` : ""}/>`;
  }).join("");
  const lx = W - 24 - 34 - 5 * 16;
  const legend = op.map((o, i) => `<rect x="${f(lx + i * 16)}" y="${H - 40}" width="12" height="12" rx="2.5" fill="${i ? T.text : T.track}"${i ? ` opacity="${o}"` : ""}/>`).join("");

  return svg(W, H, "Contribution activity", `${frame(T, W, H)}
${sectionBar(T, W, "activity", t(W - 24, 31, "last 12 months", { size: 11.5, fill: T.dim, cls: "mono", anchor: "end" }))}
${t(24, 84, num(d.total), { size: 26, weight: 700, fill: T.text, ls: -0.8 })}
${t(24 + tw(num(d.total), 26, true) + 10, 84, "contributions · weekly", { size: 13, fill: T.muted })}
${grid}${bars}
<g class="sweep" style="--d:${f(cw)}px"><rect x="${cx}" y="${cy}" width="1" height="${ch}" fill="${T.text}" opacity=".35"/></g>
<rect x="${f(pbx)}" y="${f(cy - 26)}" width="${f(pw)}" height="20" rx="4" fill="${T.text}"/>
${t(pbx + pw / 2, cy - 12, peakTxt, { size: 11, fill: T.inv, cls: "mono", anchor: "middle", weight: 600 })}
${months}
${vr(T, split, 51, H - 52)}
${label(T.dim, rx, 72, "Last 91 days")}
${heat}
${t(lx - 8, H - 30, "less", { size: 11, fill: T.dim, cls: "mono", anchor: "end" })}
${legend}
${t(W - 24, H - 30, "more", { size: 11, fill: T.dim, cls: "mono", anchor: "end" })}`);
}

/* ═════════════════════════════ INSIGHTS (live only) ═════════════════════════════ */
function insights(T, d) {
  const W = 1000, rowH = 34, rows = Math.max(d.langs.length, 4), H = 110 + rows * rowH, split = 500;
  const row = (x0, x1, y, name, frac, value, opacity = 1) => {
    const bx = x0 + 146, bw = x1 - 70 - bx;
    return `${t(x0, y, name, { size: 13.5, fill: T.text, weight: 500 })}
      <rect x="${bx}" y="${y - 9}" width="${f(bw)}" height="8" rx="2" fill="${T.track}"/>
      <rect x="${bx}" y="${y - 9}" width="${f(Math.max(3, bw * frac))}" height="8" rx="2" fill="${T.text}" opacity="${opacity}"/>
      ${t(x1, y, value, { size: 12.5, fill: T.muted, cls: "mono", anchor: "end" })}`;
  };
  const langs = d.langs.map((l, i) => row(24, split - 24, 100 + i * rowH, l.name, l.pct / 100, `${l.pct.toFixed(1)}%`, 1 - i * 0.15)).join("");
  const bd = Object.entries(d.breakdown), bdMax = Math.max(1, ...bd.map(([, v]) => v));
  const bds = bd.map(([k, v], i) => row(split + 24, W - 24, 100 + i * rowH, k, v / bdMax, num(v))).join("");
  return svg(W, H, "Languages and contribution breakdown", `${frame(T, W, H)}
${sectionBar(T, W, "insights")}
${label(T.dim, 24, 74, "Languages · public repos")}
${label(T.dim, split + 24, 74, "Contribution breakdown")}
${langs}${bds}
${vr(T, split, 51, H - 52)}`);
}

/* ═════════════════════════════ STACK TABLE ═════════════════════════════ */
function stack(T) {
  const W = 1000, rowH = 44, head = 88, rows = cfg.stack;
  const H = head + rows.length * rowH + 8;
  const col = { name: 24, cat: 330, prof: 520, status: W - 24 }, barW = 260;
  const prod = rows.filter((r) => r.status === "Production").length;
  return svg(W, H, "Tech stack", `${frame(T, W, H)}
${sectionBar(T, W, "stack", t(W - 24, 31, `${rows.length} technologies · ${prod} in production`, { size: 11.5, fill: T.dim, cls: "mono", anchor: "end" }))}
<rect x="1" y="51" width="${W - 2}" height="36" fill="${T.surface}"/>
${label(T.dim, col.name, 73, "Technology")}${label(T.dim, col.cat, 73, "Category")}${label(T.dim, col.prof, 73, "Proficiency")}${label(T.dim, col.status, 73, "Status", "end")}
${hr(T, 1, 87, W - 2)}
${rows.map((r, i) => {
  const y = head + i * rowH, cy = y + rowH / 2, learning = r.status !== "Production";
  const c = chip(T, col.status, cy - 11, r.status, { solid: !learning, anchor: "end" });
  return `${i ? hr(T, 24, y, W - 48) : ""}
    <rect x="${col.name + 0.5}" y="${f(cy - 10.5)}" width="21" height="21" rx="5" fill="${T.raised}" stroke="${T.border}"/>
    ${t(col.name + 11, cy + 4.5, r.name[0], { size: 11.5, weight: 700, fill: T.text, anchor: "middle", cls: "mono" })}
    ${t(col.name + 34, cy + 5, r.name, { size: 14, weight: 600, fill: T.text })}
    ${t(col.cat, cy + 5, r.category, { size: 13.5, fill: T.muted })}
    <rect x="${col.prof}" y="${f(cy - 3)}" width="${barW}" height="6" rx="3" fill="${T.track}"/>
    <rect x="${col.prof}" y="${f(cy - 3)}" width="${f((barW * r.level) / 100)}" height="6" rx="3" fill="${T.text}" opacity="${learning ? 0.4 : 1}"/>
    ${t(col.prof + barW + 14, cy + 4.5, `${r.level}%`, { size: 12, fill: T.muted, cls: "mono" })}
    ${c.svg}`;
}).join("")}`);
}

/* ═════════════════════════════ SERVICES ═════════════════════════════ */
function services(T) {
  const W = 1000, P = 24, G = 12, top = 74, plans = cfg.services;
  const cw = (W - 2 * P - G * (plans.length - 1)) / plans.length;
  const maxF = Math.max(...plans.map((p) => p.features.length));
  const ch = 150 + maxF * 30 + 70, H = top + ch + P;
  const cards = plans.map((p, i) => {
    const x = P + i * (cw + G), y = top, hi = !!p.highlight;
    const fg = hi ? T.inv : T.text, mu = hi ? (T.name === "light" ? "#A3A3A3" : "#6B6B6B") : T.muted;
    const feats = p.features.map((ft, j) => {
      const fy = y + 152 + j * 30;
      return `<path d="M${f(x + 24)} ${fy - 4} l3.5 3.5 7-7.5" stroke="${fg}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>${t(x + 44, fy, ft, { size: 13.5, fill: fg })}`;
    }).join("");
    const by = y + ch - 62;
    return `<rect x="${f(x + 0.5)}" y="${y + 0.5}" width="${f(cw - 1)}" height="${ch - 1}" rx="12" fill="${hi ? T.text : T.surface}" stroke="${hi ? T.text : T.border}"/>
      ${label(mu, x + 24, y + 34, p.name)}
      ${hi ? `<rect x="${f(x + cw - 24 - 78 + 0.5)}" y="${y + 20.5}" width="77" height="19" rx="9.5" stroke="${T.inv}" stroke-opacity=".45"/>${t(x + cw - 24 - 39, y + 34, "POPULAR", { size: 10, weight: 600, fill: fg, anchor: "middle", cls: "mono", ls: 0.8 })}` : ""}
      ${t(x + 24, y + 80, p.price, { size: 28, weight: 700, fill: fg, ls: -0.8 })}
      ${t(x + 24, y + 106, p.description, { size: 13.5, fill: mu })}
      <rect x="${f(x + 24)}" y="${y + 126}" width="${f(cw - 48)}" height="1" fill="${hi ? T.inv : T.border}" opacity="${hi ? 0.2 : 1}"/>
      ${feats}
      <rect x="${f(x + 24.5)}" y="${by + 0.5}" width="${f(cw - 49)}" height="39" rx="8" fill="${hi ? T.inv : T.raised}" stroke="${hi ? T.inv : T.border}"/>
      ${t(x + cw / 2, by + 24.5, `${p.cta} →`, { size: 13.5, weight: 600, fill: T.text, anchor: "middle" })}`;
  }).join("");
  return svg(W, H, "Services", `${frame(T, W, H)}
${sectionBar(T, W, "services", t(W - 24, 31, "availability: now", { size: 11.5, fill: T.dim, cls: "mono", anchor: "end" }))}
${cards}`);
}

/* ═════════════════════════════ BUTTONS / TABS ═════════════════════════════ */
const ICONS = {
  mail: (x, y, c) => `<rect x="${x}" y="${y + 2}" width="15" height="11" rx="2" stroke="${c}" stroke-width="1.5"/><path d="M${x + 1} ${y + 3.5} l6.5 4.8 6.5-4.8" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`,
  linkedin: (x, y, c) => `<rect x="${x}" y="${y}" width="15" height="15" rx="3" stroke="${c}" stroke-width="1.5"/><path d="M${x + 4.5} ${y + 7} v4.5 M${x + 7.5} ${y + 11.5} v-4.5 c0-1 1-1.5 2-1.5 s2 .5 2 1.8 v4.2" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/><circle cx="${x + 4.5}" cy="${y + 4.3}" r=".9" fill="${c}"/>`,
  instagram: (x, y, c) => `<rect x="${x}" y="${y}" width="15" height="15" rx="4.5" stroke="${c}" stroke-width="1.5"/><circle cx="${x + 7.5}" cy="${y + 7.5}" r="3.2" stroke="${c}" stroke-width="1.5"/><circle cx="${x + 11.4}" cy="${y + 3.6}" r=".9" fill="${c}"/>`,
  x: (x, y, c) => `<path d="M${x + 1} ${y + 1} L${x + 14} ${y + 14} M${x + 14} ${y + 1} L${x + 1} ${y + 14}" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>`,
  code: (x, y, c) => `<path d="M${x + 5} ${y + 3} l-4.5 4.5 4.5 4.5 M${x + 10} ${y + 3} l4.5 4.5 -4.5 4.5" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  arrow: (x, y, c) => `<path d="M${x} ${y + 7.5} h13 M${x + 8.5} ${y + 3} l4.5 4.5 -4.5 4.5" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`,
};
function button(T, lbl, icon, solid = false) {
  const H = 38, w = Math.ceil(tw(lbl, 13.5, true) + (icon ? 58 : 36)), fg = solid ? T.inv : T.text;
  return svg(w, H, lbl, `<rect x=".5" y=".5" width="${w - 1}" height="${H - 1}" rx="8" fill="${solid ? T.text : T.bg}" stroke="${solid ? T.text : T.border}"/>
${icon ? ICONS[icon](16, 11.5, fg) : ""}
${t(icon ? 40 : w / 2, 24, lbl, { size: 13.5, weight: 600, fill: fg, anchor: icon ? "start" : "middle" })}`);
}

/* ═════════════════════════════ README ═════════════════════════════ */
const pic = (name, alt) =>
  `<picture><source media="(prefers-color-scheme: dark)" srcset="assets/${name}-dark.svg"/><img src="assets/${name}-light.svg" width="100%" alt="${esc(alt)}"/></picture>`;
const btnPic = (name, alt, href) =>
  `<a href="${href}"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/${name}-dark.svg"/><img src="assets/${name}-light.svg" height="38" alt="${esc(alt)}"/></picture></a>`;

function readme(d, tabs, socials) {
  const L = cfg.links, gh = `https://github.com/${cfg.login}`;
  const primary = L.email ? `mailto:${L.email}` : L.linkedin || gh;
  const projects = d.live && d.repos.length
    ? `| Project | Description | Language | Stars | Updated |\n|:--|:--|:--|--:|--:|\n` +
      d.repos.slice(0, 8).map((r) => `| [**${r.name}**](${r.url}) | ${(r.description || "—").replace(/\|/g, "\\|")} | ${r.language ? `\`${r.language}\`` : "—"} | ${r.stars} | ${relTime(r.pushedAt)} |`).join("\n")
    : `Browse everything I've published on [my repositories page](${gh}?tab=repositories).`;
  const q = (arr) => arr.map((s) => `"${s.name}"`).join(", ");
  const prod = cfg.stack.filter((s) => s.status === "Production"), learn = cfg.stack.filter((s) => s.status !== "Production");

  return `<!--
  Generated by scripts/build.mjs — edits here are overwritten.
  Change text, links, stack or services in profile.config.json.
-->

<a name="overview"></a>
${pic("overview", `${cfg.name} — ${cfg.role}, ${cfg.location}`)}

<p align="center">
  ${tabs.map((x) => btnPic(x.file, x.label, x.href)).join("&nbsp;\n  ")}
</p>

<details>
<summary><b>About me</b> <sub>· expand</sub></summary>
<br/>

\`\`\`ts
const ${cfg.name.toLowerCase()} = {
  role: "${cfg.role}",
  location: "${cfg.location} · ${cfg.timezoneLabel}",
  education: "${cfg.education}",
  stack: [${q(prod)}],
  learning: [${q(learn)}],
  status: "${cfg.availability}",
} as const;
\`\`\`

</details>
${d.live ? `
<a name="activity"></a>
${pic("activity", `${num(d.total)} contributions in the last 12 months`)}

${pic("insights", "Languages and contribution breakdown")}
` : ""}
<a name="projects"></a>
<details open>
<summary><b>Projects</b> <sub>· ${d.live ? "latest activity across public repositories" : "public repositories"}</sub></summary>
<br/>

${projects}

</details>

<a name="stack"></a>
${pic("stack", `Stack: ${cfg.stack.map((s) => s.name).join(", ")}`)}

<a name="services"></a>
${pic("services", "Services")}

<p align="center">
  ${btnPic("btn-repos", "Browse repos", `${gh}?tab=repositories`)}&nbsp;
  ${btnPic("btn-start", "Start a project", primary)}&nbsp;
  ${btnPic("btn-call", "Book a call", L.linkedin || primary)}
</p>

<a name="contact"></a>
<p align="center">
  ${socials.map((s) => btnPic(s.file, s.label, s.href)).join("&nbsp;\n  ")}
</p>

<p align="center"><sub>${cfg.name} · ${cfg.location} · generated by <a href="scripts/build.mjs">scripts/build.mjs</a>${d.live ? ` · last sync ${fmtDate(d.built, { month: "short", day: "numeric", year: "numeric" })}` : ""}</sub></p>
`;
}

/* ═════════════════════════════ BUILD ═════════════════════════════ */
let raw = null;
if (ARGS.has("--sample")) raw = sampleData();
else if (TOKEN) raw = await fetchGitHub();
else console.warn("⚠  No GH_TOKEN — building the static profile (activity sections hidden).");
const d = derive(raw);

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });

const L = cfg.links, gh = `https://github.com/${cfg.login}`;
const tabs = [["overview", "Overview"], ...(d.live ? [["activity", "Activity"]] : []), ["projects", "Projects"], ["stack", "Stack"], ["services", "Services"], ["contact", "Contact"]]
  .map(([id, lbl], i) => ({ file: `tab-${id}`, label: lbl, href: `#${id}`, solid: i === 0 }));
const socials = [
  ["email", "Email", "mail", L.email && `mailto:${L.email}`],
  ["linkedin", "LinkedIn", "linkedin", L.linkedin],
  ["instagram", "Instagram", "instagram", L.instagram],
  ["x", "X", "x", L.x],
  ["github", "GitHub", "code", gh],
].filter(([, , , href]) => href).map(([k, lbl, icon, href]) => ({ file: `btn-${k}`, label: lbl, icon, href }));

let count = 0;
for (const T of Object.values(THEMES)) {
  const files = {
    overview: overview(T, d), stack: stack(T), services: services(T),
    "btn-repos": button(T, cfg.services[0]?.cta || "Browse repos", "code"),
    "btn-start": button(T, cfg.services[1]?.cta || "Start a project", "arrow", true),
    "btn-call": button(T, cfg.services[2]?.cta || "Book a call", "mail"),
  };
  if (d.live) Object.assign(files, { activity: activity(T, d), insights: insights(T, d) });
  for (const tb of tabs) files[tb.file] = button(T, tb.label, null, tb.solid);
  for (const s of socials) files[s.file] = button(T, s.label, s.icon);
  for (const [name, content] of Object.entries(files)) { await fs.writeFile(path.join(OUT, `${name}-${T.name}.svg`), content); count++; }
}
await fs.writeFile(path.join(ROOT, "README.md"), readme(d, tabs, socials));
console.log(`✓ Built ${count} assets + README (${d.live ? (ARGS.has("--sample") ? "sample data" : "live data") : "static"})`);
