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

// Grouped stack with real logos. Icon paths are vendored in icons.json from
// Simple Icons (CC0) and Devicon (MIT) for C#, Oracle and AWS.
const ICONS = JSON.parse(await fs.readFile(path.join(ROOT, "scripts", "icons.json"), "utf8"));

export const STACK = [
  ["languages", ["TypeScript", "Go", "Rust", "Swift", "C#", "Python", "PHP"]],
  ["frontend", ["React", "Next.js", "Angular", "TanStack", "Tailwind", "GSAP", "Three.js", "Figma"]],
  ["backend & desktop", ["Node.js", ".NET", "Laravel", "GraphQL", "Tauri"]],
  ["databases", ["PostgreSQL", "Oracle", "MySQL", "MongoDB", "Redis", "SQLite", "Prisma", "Drizzle"]],
  ["cloud & infra", ["AWS", "Docker", "Linux", "Git", "GitHub Actions"]],
];

const lum = (hex) => {
  const [r, g, b] = hex.replace("#", "").padEnd(6, hex.slice(-1)).match(/../g).map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
// Brand colours that vanish on the chip (black logos in dark mode, neon ones in light) fall back to the text colour.
const ink = (fill, T) => (fill === "text" || (fill !== "#fff" && contrast(fill, T.chip) < 2) ? T.text : fill);

function logo(name, x, y, T) {
  const icon = ICONS[name];
  if (!icon) throw new Error(`no icon for ${name}`);
  return `<svg x="${x}" y="${y}" width="14" height="14" viewBox="${icon.viewBox}">${icon.paths.map((p) => `<path d="${p.d}" fill="${ink(p.fill, T)}"${p.rule ? ` fill-rule="${p.rule}"` : ""}/>`).join("")}</svg>`;
}

function stack(T) {
  const W = 940, PAD = 24, COL = 160, CH = 28, GAP = 6, LINE = CH + GAP, SECTION = 18;
  let y = PAD;
  const rows = STACK.map(([label, items], r) => {
    const rule = r ? `<line x1="${PAD}" x2="${W - PAD}" y1="${y - SECTION / 2 - 0.5}" y2="${y - SECTION / 2 - 0.5}" stroke="${T.border}" stroke-dasharray="2 4"/>` : "";
    const head = `<text x="${PAD}" y="${y + 18}" class="m">${esc(label)}</text>`;
    let x = COL;
    const chips = items.map((name) => {
      const w = Math.ceil(name.length * 7.2 + 40);
      if (x + w > W - PAD) { x = COL; y += LINE; }
      const out = `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${CH - 1}" rx="${CH / 2}" fill="${T.chip}" stroke="${T.border}"/>${logo(name, x + 10, y + 7, T)}<text x="${x + 30}" y="${y + 18}" class="m" style="fill:${T.text}">${esc(name)}</text>`;
      x += w + GAP;
      return out;
    }).join("");
    y += CH + SECTION;
    return rule + head + chips;
  }).join("\n");
  const H = y - SECTION + PAD;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Stack: ${esc(STACK.flatMap(([, i]) => i).join(", "))}">
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
