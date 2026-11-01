/* global SHOP, PRICE_BOARD, CALC_CATEGORIES, UNAVAILABLE_SERVICES */
(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => {
    const hasFraction = Math.round(n * 100) % 100 !== 0;
    return n.toLocaleString("th-TH", { minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2 });
  };

  /* ---------- Shop info ---------- */
  const shopText = {
    lineId: SHOP.lineId,
    email0: SHOP.emails[0],
    phone0: SHOP.phones[0],
    fax: SHOP.fax,
    facebookName: SHOP.facebookName,
    hoursLine: SHOP.hours ? `เวลาเปิดร้าน: ${SHOP.hours}` : `${SHOP.name} ${SHOP.province}`,
  };
  $$("[data-shop]").forEach((el) => { el.textContent = shopText[el.dataset.shop] ?? ""; });

  $$("[data-line-link]").forEach((a) => { a.href = SHOP.lineUrl; a.target = "_blank"; a.rel = "noopener"; });
  $$("[data-phone-link]").forEach((a) => { a.href = `tel:${SHOP.phones[0].replace(/-/g, "")}`; });

  $("#phoneLinks").innerHTML = SHOP.phones
    .map((p) => `<a href="tel:${p.replace(/-/g, "")}">${escapeHtml(p)}</a>`).join(", ");
  $("#emailLinks").innerHTML = SHOP.emails
    .map((e) => `<a href="mailto:${escapeHtml(e)}">${escapeHtml(e)}</a>`).join("<br>");
  $("#fbLink").href = SHOP.facebookUrl;

  const q = encodeURIComponent(SHOP.mapQuery);
  $("#mapFrame").src = `https://maps.google.com/maps?q=${q}&z=16&output=embed`;
  $("#mapLink").href = `https://www.google.com/maps/search/?api=1&query=${q}`;
  $("#year").textContent = new Date().getFullYear() + 543;

  /* ---------- Unavailable services ---------- */
  if (UNAVAILABLE_SERVICES.length) {
    $("#unavailableList").innerHTML = UNAVAILABLE_SERVICES
      .map((s) => `<li>${escapeHtml(s.name)}${s.note ? `<small>${escapeHtml(s.note)}</small>` : ""}</li>`).join("");
    $("#unavailable").hidden = false;
  }

  /* ---------- Price board ---------- */
  $("#priceBoard").innerHTML = PRICE_BOARD.map((card) => `
    <article class="pcard tone-${card.tone} reveal">
      <h3>${escapeHtml(card.title)}</h3>
      <table><tbody>
        ${card.rows.map(([a, b]) => `<tr><td>${escapeHtml(a)}</td><td>${escapeHtml(b)}</td></tr>`).join("")}
      </tbody></table>
      ${card.note ? `<p class="pcard__note">* ${escapeHtml(card.note)}</p>` : ""}
    </article>`).join("");

  /* ---------- Calculator ---------- */
  const rowsEl = $("#calcRows");
  const sumEl = $("#calcSum");
  const noteEl = $("#calcNote");
  const baseNote = noteEl.textContent.trim();

  const unitPrice = (item, qty) => {
    if (!item.tiers) return { price: item.price, tier: null };
    let tier = item.tiers[0];
    for (const t of item.tiers) if (qty >= t.min) tier = t;
    return { price: tier.price, tier };
  };

  const tierHint = (item, qty) => {
    const { price, tier } = unitPrice(item, qty);
    const parts = [`${item.unit}ละ ${fmt(price)} บาท`];
    if (tier && tier.min > 1) parts.push(`(ราคา ${tier.min} ${item.unit}ขึ้นไป)`);
    if (item.tiers) {
      const next = item.tiers.find((t) => t.min > qty);
      if (next) parts.push(`· ถ้าครบ ${next.min} ${item.unit} เหลือ${item.unit}ละ ${fmt(next.price)} บาท`);
    }
    if (item.startingAt) parts.push("· ราคาเริ่มต้น อาจสูงกว่านี้ตามงานจริง");
    return parts.join(" ");
  };

  const catOptions = CALC_CATEGORIES.map((c, i) => `<option value="${i}">${escapeHtml(c.name)}</option>`).join("");

  const addRow = () => {
    const row = document.createElement("div");
    row.className = "crow";
    row.innerHTML = `
      <div><label>บริการ</label><select class="c-cat" aria-label="บริการ">${catOptions}</select></div>
      <div><label>รายการ</label><select class="c-item" aria-label="รายการ"></select></div>
      <div><label>จำนวน (<span class="c-unit"></span>)</label><input class="c-qty" type="number" min="1" step="1" value="1" inputmode="numeric" aria-label="จำนวน"></div>
      <div class="crow__sub"><label>ราคา</label><strong class="c-sub">0 บาท</strong></div>
      <button class="crow__del" type="button" aria-label="ลบรายการ">✕</button>
      <div class="crow__hint c-hint"></div>`;

    const cat = $(".c-cat", row);
    const itemSel = $(".c-item", row);
    const fillItems = () => {
      itemSel.innerHTML = CALC_CATEGORIES[cat.value].items
        .map((it, i) => `<option value="${i}">${escapeHtml(it.name)}</option>`).join("");
    };
    cat.addEventListener("change", () => { fillItems(); recalc(); });
    itemSel.addEventListener("change", recalc);
    $(".c-qty", row).addEventListener("input", recalc);
    $(".crow__del", row).addEventListener("click", () => {
      row.remove();
      if (!rowsEl.children.length) addRow();
      recalc();
    });

    fillItems();
    rowsEl.appendChild(row);
    recalc();
  };

  function recalc() {
    let total = 0;
    let anyStarting = false;
    $$(".crow", rowsEl).forEach((row) => {
      const item = CALC_CATEGORIES[$(".c-cat", row).value].items[$(".c-item", row).value];
      const qtyInput = $(".c-qty", row);
      const qty = Math.max(0, Math.floor(Number(qtyInput.value) || 0));
      const { price } = unitPrice(item, qty);
      const sub = price * qty;
      total += sub;
      if (item.startingAt && qty > 0) anyStarting = true;
      $(".c-unit", row).textContent = item.unit;
      $(".c-sub", row).textContent = `${item.startingAt ? "เริ่ม " : ""}${fmt(sub)} บาท`;
      $(".c-hint", row).textContent = qty > 0 ? tierHint(item, qty) : "";
    });
    total = Math.max(0, total);
    sumEl.textContent = `${anyStarting ? "เริ่มต้น " : ""}${fmt(total)} บาท`;
    noteEl.textContent = anyStarting
      ? `${baseNote} บางรายการเป็นราคาเริ่มต้น ราคาจริงขึ้นอยู่กับปริมาณสี/ความหนาของงาน`
      : baseNote;
  }

  $("#calcAdd").addEventListener("click", addRow);
  addRow();

  /* ---------- Nav ---------- */
  const nav = $("#nav");
  const fab = $(".fab-line");
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle("is-solid", y > 40);
    fab.classList.toggle("is-visible", y > window.innerHeight * 0.7);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const toggle = $("#navToggle");
  const links = $("#navLinks");
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  $$("a", links).forEach((a) => a.addEventListener("click", () => {
    links.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }));

  /* ---------- Reveal on scroll ---------- */
  const revealEls = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(el); });
  } else {
    revealEls.forEach((el) => el.classList.add("is-in"));
  }
})();
