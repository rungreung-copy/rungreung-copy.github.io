// เขียนข้อมูลร้าน (ชื่อ เบอร์ LINE อีเมล) ตารางราคา และ JSON-LD ลงใน index.html ตรงๆ
// เพื่อให้ Google / บอท AI ที่ไม่รัน JavaScript เห็นเนื้อหาครบ
// GitHub Actions รันไฟล์นี้ทุกครั้งที่ push · รันเองได้: node scripts/prerender.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, "js", "data.js"), "utf8") +
  "\n;globalThis.__d = { SHOP, PRICE_BOARD, WORK_CATEGORIES };", ctx);
const { SHOP, PRICE_BOARD } = ctx.__d;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tel = (p) => p.replace(/-/g, "");
const intl = (p) => "+66" + tel(p).replace(/^0/, "");
const abs = (path) => new URL(path, SHOP.siteUrl).href;
const a = SHOP.address || {};
const addressLine = [a.street, a.subdistrict && `ต.${a.subdistrict}`, a.district && `อ.${a.district}`, a.province && `จ.${a.province}`, a.postalCode]
  .filter(Boolean).join(" ");
const realFacebook = SHOP.facebookUrl && !SHOP.facebookUrl.includes("/search/") ? SHOP.facebookUrl : null;

let html = readFileSync(join(root, "index.html"), "utf8");

const between = (name, content) => {
  const re = new RegExp(`(<!-- prerender:${name} -->)[\\s\\S]*?(<!-- /prerender:${name} -->)`);
  if (!re.test(html)) throw new Error(`marker not found: ${name}`);
  html = html.replace(re, `$1${content}$2`);
};
const fillId = (id, inner) => {
  const re = new RegExp(`(<(\\w+)\\b[^>]*\\bid="${id}"[^>]*>)[\\s\\S]*?(</\\2>)`);
  html = html.replace(re, `$1${inner}$3`);
};
const setAttrOnTags = (tagMatch, attrs) => {
  html = html.replace(tagMatch, (tag) => {
    for (const [k, v] of Object.entries(attrs)) {
      const attrRe = new RegExp(`\\s${k}="[^"]*"`);
      tag = attrRe.test(tag) ? tag.replace(attrRe, ` ${k}="${esc(v)}"`) : tag.replace(/\s*>$/, ` ${k}="${esc(v)}">`);
    }
    return tag;
  });
};

// ---------- ข้อความ data-shop ----------
const shopText = {
  lineId: SHOP.lineId,
  email0: SHOP.emails[0],
  phone0: SHOP.phones[0],
  fax: SHOP.fax,
  facebookName: SHOP.facebookName,
  hoursLine: [addressLine && `📍 ${addressLine}`, SHOP.hours && `🕘 เวลาเปิดร้าน: ${SHOP.hours}`].filter(Boolean).join(" · ") || `${SHOP.name} ${SHOP.province}`,
};
html = html.replace(/(<(\w+)\b[^>]*\bdata-shop="(\w+)"[^>]*>)[^<]*(<\/\2>)/g,
  (m, open, tag, key, close) => (key in shopText ? `${open}${esc(shopText[key])}${close}` : m));

// ---------- ลิงก์ ----------
setAttrOnTags(/<a\b[^>]*\bdata-line-link\b[^>]*>/g, { href: SHOP.lineUrl, target: "_blank", rel: "noopener" });
setAttrOnTags(/<a\b[^>]*\bdata-phone-link\b[^>]*>/g, { href: `tel:${tel(SHOP.phones[0])}` });
setAttrOnTags(/<a\b[^>]*\bid="fbLink"[^>]*>/g, { href: SHOP.facebookUrl });
const q = encodeURIComponent(SHOP.geo ? `${SHOP.geo.lat},${SHOP.geo.lng}` : SHOP.mapQuery);
setAttrOnTags(/<iframe\b[^>]*\bid="mapFrame"[^>]*>/g, { src: `https://maps.google.com/maps?q=${q}&z=16&output=embed` });
setAttrOnTags(/<a\b[^>]*\bid="mapLink"[^>]*>/g, { href: `https://www.google.com/maps/search/?api=1&query=${q}` });
fillId("phoneLinks", SHOP.phones.map((p) => `<a href="tel:${tel(p)}">${esc(p)}</a>`).join(", "));
fillId("emailLinks", SHOP.emails.map((e) => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join("<br>"));
fillId("year", String(new Date().getFullYear() + 543));

// ---------- ตารางราคา ----------
between("prices", PRICE_BOARD.map((card) => `
          <article class="pcard tone-${card.tone} reveal">
            <h3>${esc(card.title)}</h3>
            <table><tbody>${card.rows.map(([x, y]) => `<tr><td>${esc(x)}</td><td>${esc(y)}</td></tr>`).join("")}</tbody></table>
            ${card.note ? `<p class="pcard__note">* ${esc(card.note)}</p>` : ""}
          </article>`).join("") + "\n        ");

// ---------- NAP ท้ายเว็บ ----------
between("nap", [
  `<strong>${esc("ร้าน" + SHOP.name)}</strong>`,
  addressLine ? esc(addressLine) : esc(SHOP.province),
  `โทร ${SHOP.phones.map((p) => `<a href="tel:${tel(p)}">${esc(p)}</a>`).join(", ")} · แฟกซ์ ${esc(SHOP.fax)}`,
  `LINE: <a href="${esc(SHOP.lineUrl)}" target="_blank" rel="noopener">${esc(SHOP.lineId)}</a> · <a href="mailto:${esc(SHOP.emails[0])}">${esc(SHOP.emails[0])}</a>`,
  SHOP.hours ? `เวลาเปิด: ${esc(SHOP.hours)}` : "",
].filter(Boolean).join("<br>"));

// ---------- JSON-LD ----------
const services = ["ถ่ายเอกสารขาวดำและสี", "ปริ้นท์งานขาวดำและสี", "ถ่ายสำเนาบัตรประชาชน", "สแกนเอกสาร PDF/JPG", "เข้าเล่มรายงาน", "เคลือบบัตร", "ทำพอร์ตโฟลิโอ", "แฟกซ์", "จำหน่ายอุปกรณ์เครื่องเขียน"];
const ld = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": abs("#business"),
  name: "ร้าน" + SHOP.name,
  alternateName: "Rungreung Copy",
  description: "ร้านถ่ายเอกสาร ปริ้นท์ขาวดำ-สี สแกน เข้าเล่ม เคลือบบัตร พอร์ตโฟลิโอ แฟกซ์ และอุปกรณ์เครื่องเขียน จังหวัดตรัง",
  url: SHOP.siteUrl,
  image: [abs("images/og.jpg"), abs("images/crops/logo.webp")],
  logo: abs("images/crops/logo.webp"),
  telephone: intl(SHOP.phones[0]),
  faxNumber: intl(SHOP.fax),
  email: SHOP.emails[0],
  contactPoint: SHOP.phones.map((p) => ({ "@type": "ContactPoint", telephone: intl(p), contactType: "customer service", availableLanguage: "th" })),
  priceRange: "฿",
  currenciesAccepted: "THB",
  areaServed: { "@type": "AdministrativeArea", name: "จังหวัดตรัง" },
  address: Object.fromEntries(Object.entries({
    "@type": "PostalAddress",
    streetAddress: a.street,
    addressLocality: [a.subdistrict && `ต.${a.subdistrict}`, a.district && `อ.${a.district}`].filter(Boolean).join(" ") || undefined,
    addressRegion: a.province || "ตรัง",
    postalCode: a.postalCode,
    addressCountry: "TH",
  }).filter(([, v]) => v)),
  sameAs: [SHOP.lineUrl, realFacebook].filter(Boolean),
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "บริการของร้าน",
    itemListElement: services.map((name) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name } })),
  },
};
if (SHOP.geo) ld.geo = { "@type": "GeoCoordinates", latitude: SHOP.geo.lat, longitude: SHOP.geo.lng };
if (SHOP.openingHours && SHOP.openingHours.length) {
  const dayMap = { Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday", Sa: "Saturday", Su: "Sunday" };
  ld.openingHoursSpecification = SHOP.openingHours.map((h) => ({
    "@type": "OpeningHoursSpecification", dayOfWeek: h.days.map((d) => dayMap[d] || d), opens: h.opens, closes: h.closes,
  }));
}
between("jsonld", `\n  <script type="application/ld+json">\n${JSON.stringify(ld, null, 2).replace(/</g, "\\u003c")}\n  </script>\n  `);

writeFileSync(join(root, "index.html"), html);

// ---------- sitemap.xml ----------
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${SHOP.siteUrl}</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n</urlset>\n`);

console.log(`prerendered: ${PRICE_BOARD.length} price cards, NAP, JSON-LD${a.street ? " (with street address)" : " (no street address yet)"}`);
