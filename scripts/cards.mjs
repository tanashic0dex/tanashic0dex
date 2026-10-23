#!/usr/bin/env node
/**
 * Project cards in GitHub's own visual language (light + dark).
 *   node scripts/cards.mjs  →  assets/{work-<slug>,stack}-<hash>-{light,dark}.svg
 * The content hash in the filename busts GitHub's image cache; README.md is rewritten to match.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PROJECTS = [
  {
    slug: "loop", n: "01", name: "LOOP Agency", status: "live", url: "https://oloop.com.br",
    desc: ["Digital architecture & branding studio — high-", "performance sites, motion design and brand identity."],
    stack: ["Next.js", "React", "TypeScript", "Motion", "Branding"],
  },
  {
    slug: "forky", n: "02", name: "Forky", status: "live", url: "https://useforky.lol",
    desc: ["Desktop companion for your AI coding agents — lives", "on top of the screen and calls you when one needs you."],
    stack: ["Rust", "Swift", "TanStack"],
  },
];

const THEMES = {
  light: { bg: "#ffffff", border: "#d1d9e0", text: "#1f2328", muted: "#59636e", chip: "#f6f8fa", green: "#1a7f37" },
  dark: { bg: "#0d1117", border: "#3d444d", text: "#f0f6fc", muted: "#9198a1", chip: "#151b23", green: "#3fb950" },
};
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function card(p, T) {
  const W = 460, H = 200;
  let x = 24;
  const chips = p.stack.map((s) => {
    const w = Math.ceil(s.length * 7.2 + 18);
    if (x + w > W - 24) return ""; // never let a chip spill past the card edge
    const out = `<rect x="${x + 0.5}" y="152.5" width="${w - 1}" height="21" rx="10.5" fill="${T.chip}" stroke="${T.border}"/><text x="${x + w / 2}" y="166.5" class="m" text-anchor="middle">${esc(s)}</text>`;
    x += w + 6;
    return out;
  }).join("");
  const live = p.status === "live";
  const badge = live
    ? `<circle cx="${W - 82}" cy="31" r="3.5" fill="${T.green}" class="pulse"/><text x="${W - 24}" y="35" class="m" text-anchor="end" style="fill:${T.green}">live ↗</text>`
    : `<path d="M${W - 92} 30 h8 v6 h-8z M${W - 90} 30 v-2.5 a2 2 0 0 1 4 0 v2.5" stroke="${T.muted}" stroke-width="1.3" fill="none"/><text x="${W - 24}" y="35" class="m" text-anchor="end">private</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(p.name)}">
<style>
text{font-family:${SANS};fill:${T.text}}
.m{font-family:${MONO};font-size:11.5px;fill:${T.muted}}
.pulse{animation:p 2.4s ease-in-out infinite}@keyframes p{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.pulse{animation:none}}
</style>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="${T.bg}" stroke="${T.border}"/>
<text x="24" y="35" class="m">${p.n}</text>
${badge}
<text x="24" y="76" font-size="22" font-weight="600" letter-spacing="-.4">${esc(p.name)}</text>
<text x="24" y="104" font-size="14" fill="${T.muted}" style="fill:${T.muted}">${esc(p.desc[0])}</text>
<text x="24" y="124" font-size="14" style="fill:${T.muted}">${esc(p.desc[1])}</text>
${chips}
</svg>`;
}

// Grouped stack, one dot per tool in its own brand colour (light, dark).
export const STACK = [
  ["languages", [["TypeScript", "#3178c6"], ["Rust", "#dea584"], ["Swift", "#f05138"], ["C#", "#178600"], ["Python", "#3572a5"], ["PHP", "#4f5d95"]]],
  ["frontend", [["React", "#61dafb"], ["Next.js", null], ["TanStack", "#ff4154"], ["Tailwind", "#38bdf8"], ["GSAP", "#88ce02"], ["Three.js", null], ["Figma", "#f24e1e"]]],
  ["backend & data", [["Node.js", "#5fa04e"], [".NET", "#512bd4"], ["GraphQL", "#e10098"], ["PostgreSQL", "#4169e1"], ["Drizzle", "#c5f74f"], ["Prisma", "#5a67d8"], ["MongoDB", "#47a248"]]],
  ["infra & tools", [["Docker", "#2496ed"], ["Vercel", null], ["Neon", "#00e599"], ["Git", "#f05032"], ["GitHub Actions", "#2088ff"]]],
];

function stack(T) {
  const W = 940, ROW = 44, TOP = 22, H = TOP * 2 + (STACK.length - 1) * ROW + 27;
  const rows = STACK.map(([label, items], r) => {
    const y = TOP + r * ROW;
    let x = 168;
    const chips = items.map(([name, color]) => {
      const w = Math.ceil(name.length * 7.2 + 36);
      const out = `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="27" rx="13.5" fill="${T.chip}" stroke="${T.border}"/><circle cx="${x + 15}" cy="${y + 14}" r="4" fill="${color ?? T.text}"/><text x="${x + 25}" y="${y + 18}" class="m" style="fill:${T.text}">${esc(name)}</text>`;
      x += w + 8;
      return out;
    }).join("");
    const rule = r ? `<line x1="24" x2="${W - 24}" y1="${y - 8.5}" y2="${y - 8.5}" stroke="${T.border}" stroke-dasharray="2 4"/>` : "";
    return `${rule}<g><text x="24" y="${y + 18}" class="m">${esc(label)}</text>${chips}</g>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stack: ${esc(STACK.flatMap(([, i]) => i.map(([n]) => n)).join(", "))}">
<style>
text{font-family:${SANS};fill:${T.text}}
.m{font-family:${MONO};font-size:11.5px;fill:${T.muted}}
</style>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="${T.bg}" stroke="${T.border}"/>
${rows}
</svg>`;
}

const ASSETS = path.join(ROOT, "assets");
await fs.mkdir(ASSETS, { recursive: true });
for (const f of await fs.readdir(ASSETS)) if (/^(work|stack)-/.test(f)) await fs.rm(path.join(ASSETS, f));
let readme = await fs.readFile(path.join(ROOT, "README.md"), "utf8");
const outputs = [...PROJECTS.map((p) => [`work-${p.slug}`, (T) => card(p, T)]), ["stack", stack]];
for (const [base, render] of outputs) {
  const svgs = Object.entries(THEMES).map(([name, T]) => [name, render(T)]);
  const hash = crypto.createHash("sha1").update(svgs.map(([, s]) => s).join("")).digest("hex").slice(0, 7);
  for (const [name, svg] of svgs) await fs.writeFile(path.join(ASSETS, `${base}-${hash}-${name}.svg`), svg);
  readme = readme.replace(new RegExp(`assets/${base}-(?:[0-9a-f]{7}-)?(light|dark)\\.svg`, "g"), `assets/${base}-${hash}-$1.svg`);
}
await fs.writeFile(path.join(ROOT, "README.md"), readme);
console.log(`✓ ${PROJECTS.length} project cards + stack`);
