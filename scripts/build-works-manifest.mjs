// สร้างไฟล์ js/works-manifest.js จากรูปในโฟลเดอร์ images/works/<หมวด>/
// GitHub Actions รันไฟล์นี้ทุกครั้งที่ push — ร้านแค่วางรูปในโฟลเดอร์ ไม่ต้องแก้โค้ด
// รันเองในเครื่องได้ด้วย: node scripts/build-works-manifest.mjs
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const worksDir = join(root, "images", "works");
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
const collator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });

const manifest = {};
for (const folder of readdirSync(worksDir).sort(collator.compare)) {
  const dir = join(worksDir, folder);
  if (!statSync(dir).isDirectory()) continue;
  const files = readdirSync(dir)
    .filter((f) => IMAGE_EXT.test(f) && !f.startsWith("."))
    .sort(collator.compare)
    .map((f) => `images/works/${folder}/${f}`);
  if (files.length) manifest[folder] = files;
}

const out = `/* ไฟล์นี้สร้างอัตโนมัติโดย scripts/build-works-manifest.mjs — อย่าแก้ด้วยมือ */\n` +
  `window.WORKS_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n`;
writeFileSync(join(root, "js", "works-manifest.js"), out);
console.log(Object.entries(manifest).map(([k, v]) => `${k}: ${v.length}`).join("\n"));
