#!/usr/bin/env node
/**
 * Draws a GitHub-style contribution graph that resolves into a name.
 *   node scripts/name-graph.mjs
 * Outputs assets/graph-light.svg and assets/graph-dark.svg.
 * Static files — no API, no token, no Actions needed.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORD = "WATANASHI";
const CAPTION = "full-stack product engineer · brazil";

// 5×7 pixel font — 7 rows, exactly the height of a contribution graph
const FONT = {
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
};

const THEMES = {
  light: { bg: "transparent", text: "#59636e", levels: ["#eff2f5", "#aceebb", "#4ac26b", "#2da44e", "#116329"] },
  dark: { bg: "transparent", text: "#9198a1", levels: ["#151b23", "#033a16", "#196c2e", "#2ea043", "#56d364"] },
};

// letter mask, 53 columns × 7 rows
const mask = Array.from({ length: 7 }, () => []);
[...WORD].forEach((ch, i) => {
  for (let r = 0; r < 7; r++) {
    for (const bit of FONT[ch][r]) mask[r].push(bit === "1");
    if (i < WORD.length - 1) mask[r].push(false);
  }
});
const COLS = mask[0].length; // 53

// deterministic noise that looks like a real year of commits
let seed = 20261005;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const noiseLevel = (row, col) => {
  const weekend = row === 0 || row === 6;
  const season = 0.55 + 0.45 * Math.sin(col / 7);
  const p = rnd() * (weekend ? 0.55 : 1) * season;
  return p < 0.3 ? 0 : p < 0.5 ? 1 : p < 0.68 ? 2 : p < 0.82 ? 3 : 4;
};

const CELL = 10, GAP = 3, PITCH = CELL + GAP;
const LEFT = 32, TOP = 22;
const W = LEFT + COLS * PITCH, H = TOP + 7 * PITCH + 34;
const DUR = 9; // seconds per loop

function build(T) {
  const cells = [], used = new Set();
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < 7; r++) {
      const on = mask[r][c];
      const from = noiseLevel(r, c);
      const to = on ? 4 : rnd() < 0.06 ? 1 : 0; // a few faint dots so it still feels real
      used.add(`${from}${to}`);
      const delay = (c * 0.028 + r * 0.012).toFixed(3);
      cells.push(`<rect x="${LEFT + c * PITCH}" y="${TOP + r * PITCH}" width="${CELL}" height="${CELL}" rx="2" fill="${T.levels[to]}" class="k${from}${to}" style="animation-delay:${delay}s"/>`);
    }
  }
  // one keyframe set per (noise → final) pair: real graph → name → real graph
  const kf = [...used].map((k) => {
    const a = T.levels[+k[0]], b = T.levels[+k[1]];
    return `.k${k}{animation:a${k} ${DUR}s cubic-bezier(.65,0,.35,1) infinite}@keyframes a${k}{0%,28%{fill:${a}}40%,88%{fill:${b}}100%{fill:${a}}}`;
  }).join("");

  // month labels like the real graph (last 53 weeks)
  const months = [];
  const start = new Date();
  start.setDate(start.getDate() - (COLS - 1) * 7 - start.getDay());
  let last = -1;
  for (let c = 0; c < COLS; c++) {
    const d = new Date(start.getTime() + c * 7 * 864e5);
    if (d.getMonth() !== last && c < COLS - 2) {
      if (last !== -1 || d.getDate() <= 7) months.push(`<text x="${LEFT + c * PITCH}" y="12">${d.toLocaleString("en-US", { month: "short" })}</text>`);
      last = d.getMonth();
    }
  }
  const days = [[1, "Mon"], [3, "Wed"], [5, "Fri"]].map(([r, s]) => `<text x="0" y="${TOP + r * PITCH + 9}">${s}</text>`).join("");
  const ly = TOP + 7 * PITCH + 16;
  const legend = T.levels.map((col, i) => `<rect x="${W - 30 - (5 - i) * PITCH}" y="${ly}" width="${CELL}" height="${CELL}" rx="2" fill="${col}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${WORD} written in a GitHub contribution graph">
<title>${WORD}</title>
<style>
text{font:12px -apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif;fill:${T.text}}
${kf}
@media (prefers-reduced-motion:reduce){rect{animation:none!important}}
</style>
${months.join("")}
${days}
${cells.join("\n")}
<text x="${LEFT}" y="${ly + 9}">${CAPTION}</text>
<text x="${W - 30 - 5 * PITCH - 6}" y="${ly + 9}" text-anchor="end">Less</text>
${legend}
<text x="${W}" y="${ly + 9}" text-anchor="end">More</text>
</svg>`;
}

await fs.mkdir(path.join(ROOT, "assets"), { recursive: true });
for (const [name, T] of Object.entries(THEMES)) {
  seed = 20261005; // same pattern in both themes
  await fs.writeFile(path.join(ROOT, "assets", `graph-${name}.svg`), build(T));
}
console.log(`✓ assets/graph-{light,dark}.svg (${COLS} columns)`);
