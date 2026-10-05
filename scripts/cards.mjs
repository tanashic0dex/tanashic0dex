#!/usr/bin/env node
/**
 * Project cards in GitHub's own visual language (light + dark).
 *   node scripts/cards.mjs  →  assets/work-*-{light,dark}.svg
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PROJECTS = [
  {
    slug: "armpay", n: "01", name: "ArmPay", status: "live", url: "https://armpay.vercel.app",
    desc: ["Multi-tenant PIX payments — billing, invoices and", "recurring charges, one isolated database per tenant."],
    stack: [".NET 8", "C#", "GraphQL", "PostgreSQL", "React", "Docker"],
  },
  {
    slug: "mangastore", n: "02", name: "Manga Store", status: "live", url: "https://marketmanga.vercel.app",
    desc: ["P2P marketplace for game accounts, items and gold —", "stores, order chat, reviews, PIX and push alerts."],
    stack: ["Next.js", "TypeScript", "Drizzle", "Neon", "Better Auth", "GSAP"],
  },
  {
    slug: "reobote", n: "03", name: "Reobote", status: "live", url: "https://reobote-omega.vercel.app",
    desc: ["Real-estate consultancy site with an admin panel", "for listings, photo uploads and leads via WhatsApp."],
    stack: ["Next.js", "Prisma", "PostgreSQL", "NextAuth", "Motion"],
  },
  {
    slug: "vbl", n: "04", name: "VBL Tournaments", status: "private",
    desc: ["Tournament manager for 1v1 to 4v4 brackets,", "team registration and a 3D animated interface."],
    stack: ["Next.js", "MongoDB", "Three.js", "shadcn/ui"],
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
    const w = s.length * 7 + 16;
    const out = `<rect x="${x + 0.5}" y="152.5" width="${w - 1}" height="21" rx="10.5" fill="${T.chip}" stroke="${T.border}"/><text x="${x + w / 2}" y="166.5" class="m" text-anchor="middle">${esc(s)}</text>`;
    x += w + 6;
    return out;
  }).join("");
  const live = p.status === "live";
  const badge = live
    ? `<circle cx="${W - 82}" cy="31" r="3.5" fill="${T.green}" class="pulse"/><text x="${W - 24}" y="35" class="m" text-anchor="end" fill="${T.green}">live ↗</text>`
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

await fs.mkdir(path.join(ROOT, "assets"), { recursive: true });
for (const p of PROJECTS) for (const [name, T] of Object.entries(THEMES)) {
  await fs.writeFile(path.join(ROOT, "assets", `work-${p.slug}-${name}.svg`), card(p, T));
}
console.log(`✓ ${PROJECTS.length} project cards`);
