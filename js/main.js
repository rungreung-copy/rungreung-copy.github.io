/* global SHOP, PRICE_BOARD, CALC_CATEGORIES, UNAVAILABLE_SERVICES, BIND_OPTIONS, THICKNESS_TIERS, SHEETS_PER_CM, WORK_CATEGORIES */
(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => {
    const hasFraction = Math.round(n * 100) % 100 !== 0;
    return n.toLocaleString("th-TH", { minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2 });
  };
  const toInt = (v, min = 0) => Math.max(min, Math.floor(Number(v) || 0));

  /* =========================================================
     Shop info
     ========================================================= */
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

  if (UNAVAILABLE_SERVICES.length) {
    $("#unavailableList").innerHTML = UNAVAILABLE_SERVICES
      .map((s) => `<li>${escapeHtml(s.name)}${s.note ? `<small>${escapeHtml(s.note)}</small>` : ""}</li>`).join("");
    $("#unavailable").hidden = false;
  }

  /* =========================================================
     Price board
     ========================================================= */
  // ปกติ scripts/prerender.mjs เขียนตารางไว้ใน HTML แล้ว — สร้างด้วย JS เฉพาะตอนยังไม่มี
  if (!$("#priceBoard .pcard")) $("#priceBoard").innerHTML = PRICE_BOARD.map((card) => `
    <article class="pcard tone-${card.tone} reveal">
      <h3>${escapeHtml(card.title)}</h3>
      <table><tbody>
        ${card.rows.map(([a, b]) => `<tr><td>${escapeHtml(a)}</td><td>${escapeHtml(b)}</td></tr>`).join("")}
      </tbody></table>
      ${card.note ? `<p class="pcard__note">* ${escapeHtml(card.note)}</p>` : ""}
    </article>`).join("");

  /* =========================================================
     Pricing helpers
     ========================================================= */
  const unitPrice = (item, qty) => {
    if (!item.tiers) return { price: item.price, tier: null };
    let tier = item.tiers[0];
    for (const t of item.tiers) if (qty >= t.min) tier = t;
    return { price: tier.price, tier };
  };
  const nextTier = (item, qty) => item.tiers && item.tiers.find((t) => t.min > qty);
  const itemByKey = (key) => {
    const [c, i] = key.split(":").map(Number);
    return CALC_CATEGORIES[c].items[i];
  };
  const thicknessIndex = (sheets) => {
    const cm = sheets / SHEETS_PER_CM;
    const idx = THICKNESS_TIERS.findIndex((t) => cm <= t.maxCm);
    return idx === -1 ? THICKNESS_TIERS.length - 1 : idx;
  };
  const laminateCat = CALC_CATEGORIES.find((c) => c.id === "laminate");

  const printOptions = CALC_CATEGORIES.map((c, ci) => (c.printable ? `
    <optgroup label="${escapeHtml(c.name)}">
      ${c.items.map((it, ii) => `<option value="${ci}:${ii}">${escapeHtml(it.name)} — ${it.tiers ? "ตามจำนวน" : `${it.startingAt ? "เริ่ม " : ""}${fmt(it.price)} บ./${it.unit}`}</option>`).join("")}
    </optgroup>` : "")).join("");
  const defaultPrintKey = (() => {
    const ci = CALC_CATEGORIES.findIndex((c) => c.id === "bw-print");
    return `${Math.max(ci, 0)}:0`;
  })();
  const bindOptions = BIND_OPTIONS.map((b, i) => `<option value="${i}">${escapeHtml(b.name)}</option>`).join("");
  const thickOptions = THICKNESS_TIERS.map((t, i) => `<option value="${i}">${escapeHtml(t.label)} ซม.</option>`).join("");
  const lamOptions = laminateCat.items.map((it, i) => `<option value="${i}"${it.name.includes("A4") ? " selected" : ""}>${escapeHtml(it.name)} — ${fmt(it.price)} บ./แผ่น</option>`).join("");

  /* =========================================================
     Calculator — uploaded files (jobs)
     ========================================================= */
  const jobsEl = $("#jobs");
  const msgEl = $("#calcMsg");
  const rowsEl = $("#calcRows");
  const sumEl = $("#calcSum");
  const noteEl = $("#calcNote");
  const baseNote = noteEl.textContent.trim();
  let jobSeq = 0;

  const showMsg = (lines) => {
    msgEl.innerHTML = lines.length ? lines.map((l) => `<p>${l}</p>`).join("") : "";
  };

  // ---- pdf.js (โหลดเมื่อมีไฟล์ PDF ครั้งแรก) ----
  const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  let pdfjsPromise = null;
  const loadPdfjs = () => {
    if (!pdfjsPromise) {
      pdfjsPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `${PDFJS_CDN}pdf.min.js`;
        s.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}pdf.worker.min.js`;
          resolve(window.pdfjsLib);
        };
        s.onerror = () => { pdfjsPromise = null; reject(new Error("load")); };
        document.head.appendChild(s);
      });
    }
    return pdfjsPromise;
  };
  const countPdfPages = async (file) => {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const n = doc.numPages;
    doc.destroy();
    return n;
  };

  const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
  const isImage = (f) => f.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(f.name);

  const handleFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    const notes = [];
    const images = files.filter((f) => !isPdf(f) && isImage(f));
    const pdfs = files.filter(isPdf);
    const others = files.filter((f) => !isPdf(f) && !isImage(f));

    others.forEach((f) => {
      const word = /\.(docx?|odt|rtf)$/i.test(f.name);
      notes.push(`⚠️ <b>${escapeHtml(f.name)}</b> — ${word ? "ไฟล์ Word นับหน้าไม่ได้ กรุณา Save เป็น PDF ก่อน (ร้านแนะนำ PDF อยู่แล้ว ฟอนต์จะไม่เลื่อน)" : "ไฟล์ชนิดนี้นับหน้าไม่ได้ รองรับเฉพาะ PDF และรูปภาพ"}`);
    });

    if (images.length) {
      addJob({
        name: images.length === 1 ? images[0].name : `รูปภาพ ${images.length} ไฟล์`,
        icon: "🖼️",
        pages: images.length,
        detected: `${images.length} รูป = ${images.length} หน้า`,
        printKey: (() => {
          const ci = CALC_CATEGORIES.findIndex((c) => c.id === "color-print-a4");
          return ci >= 0 ? `${ci}:1` : defaultPrintKey;
        })(),
      });
    }

    if (pdfs.length) showMsg([...notes, "⏳ กำลังนับจำนวนหน้า PDF…"]);
    for (const f of pdfs) {
      try {
        const n = await countPdfPages(f);
        addJob({ name: f.name, icon: "📄", pages: n, detected: `PDF ${n} หน้า` });
      } catch (err) {
        const locked = err && err.name === "PasswordException";
        notes.push(`⚠️ <b>${escapeHtml(f.name)}</b> — ${locked ? "ไฟล์ติดรหัสผ่าน" : err && err.message === "load" ? "โหลดตัวนับหน้าไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)" : "อ่านไฟล์ไม่ได้"} ใส่จำนวนหน้าเองได้ในรายการด้านล่าง`);
        addJob({ name: f.name, icon: "📄", pages: 1, detected: "นับหน้าไม่ได้ — กรุณาใส่จำนวนหน้าเอง", warn: true });
      }
    }
    showMsg(notes);
  };

  const addJob = ({ name, icon, pages, detected, warn = false, printKey = defaultPrintKey }) => {
    const id = ++jobSeq;
    const el = document.createElement("article");
    el.className = "job";
    el.dataset.id = id;
    el.innerHTML = `
      <header class="job__head">
        <span class="job__icon" aria-hidden="true">${icon}</span>
        <div class="job__title">
          <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
          <small class="${warn ? "is-warn" : ""}">${escapeHtml(detected)}</small>
        </div>
        <button class="job__del" type="button" aria-label="ลบไฟล์นี้">✕</button>
      </header>
      <div class="job__grid">
        <label class="job__print">งานพิมพ์<select class="j-print">${printOptions}</select></label>
        <label>จำนวนหน้า<input class="j-pages" type="number" min="1" step="1" inputmode="numeric" value="${pages}"></label>
        <label>จำนวนชุด<input class="j-sets" type="number" min="1" step="1" inputmode="numeric" value="1"></label>
      </div>
      <p class="job__calc j-calc"></p>
      <div class="job__addons">
        <div class="addon">
          <label class="chk"><input type="checkbox" class="j-bind-on"> <span>📚 เข้าเล่ม</span></label>
          <div class="addon__body j-bind" hidden>
            <select class="j-bind-type" aria-label="รูปแบบเข้าเล่ม">${bindOptions}</select>
            <select class="j-thick" aria-label="ความหนาเล่ม">${thickOptions}</select>
            <small class="j-bind-hint"></small>
          </div>
        </div>
        <div class="addon">
          <label class="chk"><input type="checkbox" class="j-lam-on"> <span>✨ เคลือบ</span></label>
          <div class="addon__body j-lam" hidden>
            <select class="j-lam-size" aria-label="ขนาดเคลือบ">${lamOptions}</select>
            <label class="inline">จำนวน <input class="j-lam-qty" type="number" min="0" step="1" inputmode="numeric"> แผ่น</label>
            <small class="j-lam-hint"></small>
          </div>
        </div>
      </div>
      <footer class="job__foot">รวมไฟล์นี้ <strong class="j-sub">0 บาท</strong></footer>`;
    $(".j-print", el).value = printKey;
    el._auto = { thick: true, lam: true };

    el.addEventListener("input", (e) => {
      if (e.target.matches(".j-thick")) el._auto.thick = false;
      if (e.target.matches(".j-lam-qty")) el._auto.lam = false;
      recalc();
    });
    el.addEventListener("change", (e) => {
      if (e.target.matches(".j-bind-on")) $(".j-bind", el).hidden = !e.target.checked;
      if (e.target.matches(".j-lam-on")) $(".j-lam", el).hidden = !e.target.checked;
      if (e.target.matches(".j-thick")) el._auto.thick = false;
      recalc();
    });
    $(".job__del", el).addEventListener("click", () => { el.remove(); recalc(); });

    jobsEl.appendChild(el);
    recalc();
  };

  const computeJob = (el) => {
    const item = itemByKey($(".j-print", el).value);
    const pages = toInt($(".j-pages", el).value);
    const sets = toInt($(".j-sets", el).value, 1);
    const units = item.duplex ? Math.ceil(pages / 2) : pages; // หน่วยที่ป้ายคิด (หน้า หรือ แผ่น)
    const sheets = item.duplex ? units : pages; // แผ่นกระดาษจริงต่อชุด
    const totalUnits = units * sets;
    const { price, tier } = unitPrice(item, totalUnits);
    let sub = price * totalUnits;
    let starting = !!item.startingAt;

    // ข้อความอธิบายการคิดราคา
    const parts = [];
    parts.push(item.duplex
      ? `${pages} หน้า → ${units} แผ่น (หน้า/หลัง)`
      : `${pages} หน้า`);
    if (sets > 1) parts.push(`× ${sets} ชุด = ${totalUnits} ${item.unit}`);
    parts.push(`· ${item.unit}ละ ${fmt(price)} บาท${tier && tier.min > 1 ? ` (ราคา ${tier.min} ${item.unit}ขึ้นไป)` : ""}`);
    const nt = nextTier(item, totalUnits);
    if (nt) parts.push(`· ครบ ${nt.min} ${item.unit} เหลือ${item.unit}ละ ${fmt(nt.price)} บาท`);
    $(".j-calc", el).textContent = parts.join(" ");

    // เข้าเล่ม
    if ($(".j-bind-on", el).checked) {
      const opt = BIND_OPTIONS[$(".j-bind-type", el).value];
      const thickSel = $(".j-thick", el);
      thickSel.hidden = !opt.byThickness;
      let bindPrice;
      if (opt.byThickness) {
        if (el._auto.thick) thickSel.value = String(thicknessIndex(sheets));
        bindPrice = opt.byThickness[thickSel.value];
        $(".j-bind-hint", el).textContent = `${sheets} แผ่น ≈ ${(sheets / SHEETS_PER_CM).toFixed(1)} ซม.${el._auto.thick ? " (เลือกให้อัตโนมัติ)" : ""} · เล่มละ ${fmt(bindPrice)} × ${sets} = ${fmt(bindPrice * sets)} บาท`;
      } else {
        bindPrice = opt.price;
        starting = starting || !!opt.startingAt;
        $(".j-bind-hint", el).textContent = `เริ่มที่เล่มละ ${fmt(bindPrice)} × ${sets} = ${fmt(bindPrice * sets)} บาท (เพิ่มตามความหนา)`;
      }
      sub += bindPrice * sets;
    }

    // เคลือบ
    if ($(".j-lam-on", el).checked) {
      const lamItem = laminateCat.items[$(".j-lam-size", el).value];
      const qtyInput = $(".j-lam-qty", el);
      if (el._auto.lam) qtyInput.value = sheets * sets;
      const lamQty = toInt(qtyInput.value);
      sub += lamItem.price * lamQty;
      $(".j-lam-hint", el).textContent = `${lamQty} แผ่น × ${fmt(lamItem.price)} = ${fmt(lamItem.price * lamQty)} บาท${el._auto.lam ? " (คิดทุกแผ่น แก้จำนวนได้)" : ""}`;
    }

    $(".j-sub", el).textContent = `${starting ? "เริ่ม " : ""}${fmt(sub)} บาท`;
    return { sub, starting };
  };

  // ---- drop zone ----
  const drop = $("#dropZone");
  const fileInput = $("#fileInput");
  fileInput.addEventListener("change", () => { handleFiles(fileInput.files); fileInput.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "dragend", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("is-over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
  // กันเบราว์เซอร์เปิดไฟล์เมื่อวางพลาดนอกกรอบ
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  /* =========================================================
     Calculator — manual rows (งานที่ไม่มีไฟล์)
     ========================================================= */
  const catOptions = CALC_CATEGORIES.map((c, i) => `<option value="${i}">${escapeHtml(c.name)}</option>`).join("");

  const tierHint = (item, qty) => {
    const { price, tier } = unitPrice(item, qty);
    const parts = [`${item.unit}ละ ${fmt(price)} บาท`];
    if (tier && tier.min > 1) parts.push(`(ราคา ${tier.min} ${item.unit}ขึ้นไป)`);
    const next = nextTier(item, qty);
    if (next) parts.push(`· ถ้าครบ ${next.min} ${item.unit} เหลือ${item.unit}ละ ${fmt(next.price)} บาท`);
    if (item.startingAt) parts.push("· ราคาเริ่มต้น อาจสูงกว่านี้ตามงานจริง");
    return parts.join(" ");
  };

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
    $(".crow__del", row).addEventListener("click", () => { row.remove(); recalc(); });
    fillItems();
    rowsEl.appendChild(row);
    recalc();
  };

  const computeRow = (row) => {
    const item = CALC_CATEGORIES[$(".c-cat", row).value].items[$(".c-item", row).value];
    const qty = toInt($(".c-qty", row).value);
    const { price } = unitPrice(item, qty);
    const sub = price * qty;
    $(".c-unit", row).textContent = item.unit;
    $(".c-sub", row).textContent = `${item.startingAt ? "เริ่ม " : ""}${fmt(sub)} บาท`;
    $(".c-hint", row).textContent = qty > 0 ? tierHint(item, qty) : "";
    return { sub, starting: !!item.startingAt && qty > 0 };
  };

  function recalc() {
    let total = 0;
    let anyStarting = false;
    [...$$(".job", jobsEl).map(computeJob), ...$$(".crow", rowsEl).map(computeRow)].forEach(({ sub, starting }) => {
      total += sub;
      anyStarting = anyStarting || starting;
    });
    total = Math.max(0, total);
    sumEl.textContent = `${anyStarting ? "เริ่มต้น " : ""}${fmt(total)} บาท`;
    noteEl.textContent = anyStarting
      ? `${baseNote} บางรายการเป็นราคาเริ่มต้น ราคาจริงขึ้นอยู่กับปริมาณสี/ความหนาของงาน`
      : baseNote;
  }

  $("#calcAdd").addEventListener("click", addRow);
  recalc();

  /* =========================================================
     Works — Fan-Out decks + lightbox
     ========================================================= */
  const manifest = window.WORKS_MANIFEST || {};
  const knownIds = WORK_CATEGORIES.map((c) => c.id);
  const categories = [
    ...WORK_CATEGORIES,
    ...Object.keys(manifest).filter((id) => !knownIds.includes(id)).map((id) => ({ id, title: id.replace(/[-_]/g, " "), desc: "" })),
  ].filter((c) => (manifest[c.id] || []).length);

  const MAX_FAN = 5;
  const decksEl = $("#decks");
  decksEl.innerHTML = categories.map((c) => {
    const imgs = manifest[c.id];
    // รูปจริงอยู่ตรงกลาง ถ้ามีไม่ถึง 3 รูป เติม "กระดาษเปล่า" ไว้ด้านข้างให้ยังเป็นกองการ์ด
    const photos = imgs.slice(0, MAX_FAN).map((src, i) => ({ src, index: i }));
    const ghosts = Math.max(0, 3 - photos.length);
    const slots = [...Array(Math.ceil(ghosts / 2)).fill(null), ...photos, ...Array(Math.floor(ghosts / 2)).fill(null)];
    const n = slots.length;
    const mid = (n - 1) / 2;
    const spread = n > 1 ? Math.min(13, 36 / (n - 1)) : 0; // องศาระหว่างใบ (หมุนรอบจุดใต้การ์ด → กางเป็นพัด)
    const cards = slots.map((slot, i) => {
      const off = i - mid;
      const style = `--r0:${(off * 2.5).toFixed(1)}deg;--r1:${(off * spread).toFixed(1)}deg;--x1:${(off * 4).toFixed(1)}%;--y1:0%;z-index:${slot ? 10 + n - Math.abs(Math.round(off)) : 1}`;
      if (!slot) return `<span class="deck__card deck__card--ghost" style="${style}" aria-hidden="true"></span>`;
      return `<button class="deck__card" type="button" data-index="${slot.index}" style="${style}"
        aria-label="ดูรูป ${escapeHtml(c.title)} รูปที่ ${slot.index + 1}">
        <img src="${escapeHtml(slot.src)}" alt="ตัวอย่างงาน${escapeHtml(c.title)} ร้านรุ่งเรือง ก๊อปปี้ รูปที่ ${slot.index + 1}" loading="lazy">
      </button>`;
    }).join("");
    return `
      <article class="deck reveal" data-cat="${escapeHtml(c.id)}" tabindex="0" aria-label="${escapeHtml(c.title)} ${imgs.length} รูป">
        <div class="deck__stage">${cards}</div>
        <div class="deck__info">
          <h3>${escapeHtml(c.title)} <span class="deck__count">${imgs.length} รูป</span></h3>
          ${c.desc ? `<p>${escapeHtml(c.desc)}</p>` : ""}
        </div>
      </article>`;
  }).join("");

  // แตะบนจอสัมผัส: แตะครั้งแรกกาง แตะรูปอีกครั้งเปิดดู
  const noHover = window.matchMedia("(hover: none)");
  decksEl.addEventListener("click", (e) => {
    const deck = e.target.closest(".deck");
    if (!deck) return;
    const card = e.target.closest(".deck__card");
    if (noHover.matches && !deck.classList.contains("is-open")) {
      $$(".deck.is-open", decksEl).forEach((d) => d.classList.remove("is-open"));
      deck.classList.add("is-open");
      return;
    }
    if (card) openLightbox(deck.dataset.cat, Number(card.dataset.index));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".deck")) $$(".deck.is-open", decksEl).forEach((d) => d.classList.remove("is-open"));
  });

  const lb = $("#lightbox");
  const lbImg = $(".lightbox__img", lb);
  const lbCap = $(".lightbox__cap", lb);
  let lbState = { cat: null, index: 0 };
  let lastFocus = null;

  const renderLightbox = () => {
    const imgs = manifest[lbState.cat];
    const cat = categories.find((c) => c.id === lbState.cat);
    lbImg.src = imgs[lbState.index];
    lbImg.alt = `${cat.title} รูปที่ ${lbState.index + 1}`;
    lbCap.textContent = `${cat.title} · ${lbState.index + 1} / ${imgs.length}`;
    const multi = imgs.length > 1;
    $$(".lightbox__nav", lb).forEach((b) => { b.hidden = !multi; });
  };
  const openLightbox = (cat, index) => {
    lastFocus = document.activeElement;
    lbState = { cat, index };
    renderLightbox();
    lb.hidden = false;
    document.body.classList.add("no-scroll");
    $(".lightbox__close", lb).focus();
  };
  const closeLightbox = () => {
    lb.hidden = true;
    document.body.classList.remove("no-scroll");
    if (lastFocus) lastFocus.focus();
  };
  const step = (d) => {
    const n = manifest[lbState.cat].length;
    lbState.index = (lbState.index + d + n) % n;
    renderLightbox();
  };
  $(".lightbox__close", lb).addEventListener("click", closeLightbox);
  $(".lightbox__nav--prev", lb).addEventListener("click", () => step(-1));
  $(".lightbox__nav--next", lb).addEventListener("click", () => step(1));
  lb.addEventListener("click", (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", (e) => {
    if (lb.hidden) {
      if (e.key === "Enter" && e.target.matches(".deck")) openLightbox(e.target.dataset.cat, 0);
      return;
    }
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
  let touchX = null;
  lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  });

  /* =========================================================
     Nav
     ========================================================= */
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

  /* =========================================================
     Reveal on scroll
     ========================================================= */
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
