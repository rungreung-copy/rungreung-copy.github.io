/* global SHOP, PRICE_BOARD, CALC_CATEGORIES, UNAVAILABLE_SERVICES, BIND_OPTIONS, THICKNESS_TIERS, SHEETS_PER_CM, WORK_CATEGORIES, SERVICE_CALC, PORTFOLIO, PRINT_MODES, COLOR_DETECT */
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
    facebookName: SHOP.facebookName,
  };
  // ช่องอื่น (ที่อยู่ เวลาเปิด) ถูกเขียนลง HTML โดย scripts/prerender.mjs แล้ว
  $$("[data-shop]").forEach((el) => { if (el.dataset.shop in shopText) el.textContent = shopText[el.dataset.shop]; });
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
  const thicknessIndex = (sheets) => {
    const cm = sheets / SHEETS_PER_CM;
    const idx = THICKNESS_TIERS.findIndex((t) => cm <= t.maxCm);
    return idx === -1 ? THICKNESS_TIERS.length - 1 : idx;
  };
  const laminateCat = CALC_CATEGORIES.find((c) => c.id === "laminate");
  const pricedOptions = (list) => list.map((x, i) => `<option value="${i}">${escapeHtml(x.name)}${x.price ? ` — ${x.startingAt ? "เริ่ม " : ""}${fmt(x.price)} บ.` : ""}</option>`).join("");

  const modeOptions = PRINT_MODES.map((m, i) => `<option value="${i}">${escapeHtml(m.name)}</option>`).join("");
  const bindOptions = BIND_OPTIONS.map((b, i) => `<option value="${i}">${escapeHtml(b.name)}</option>`).join("");
  const thickOptions = THICKNESS_TIERS.map((t, i) => `<option value="${i}">${escapeHtml(t.label)} ซม.</option>`).join("");
  const lamOptions = laminateCat.items.map((it, i) => `<option value="${i}"${it.name.includes("A4") ? " selected" : ""}>${escapeHtml(it.name)} — ${fmt(it.price)} บ./แผ่น</option>`).join("");
  const PAGE_KINDS = [["bw", "ขาวดำ"], ["light", "สีไม่มาก"], ["full", "สีเต็มแผ่น"]];

  /* =========================================================
     Calculator — uploaded files (jobs)
     ========================================================= */
  const jobsEl = $("#jobs");
  const msgEl = $("#calcMsg");
  const rowsEl = $("#calcRows");
  const sumEl = $("#calcSum");
  const noteEl = $("#calcNote");
  const baseNote = noteEl.textContent.trim();

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

  // ---- ตรวจสีของหน้า: วาดย่อแล้วนับสัดส่วนพิกเซลที่เป็นสี (ทำในเครื่องลูกค้าทั้งหมด) ----
  const THUMB_WIDTH = 120;
  const classifyCanvas = (ctx, w, h) => {
    const { data } = ctx.getImageData(0, 0, w, h);
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      if (max - min > COLOR_DETECT.chroma) colored += 1;
    }
    const ratio = colored / (w * h);
    if (ratio < COLOR_DETECT.bwMax) return "bw";
    return ratio < COLOR_DETECT.lightMax ? "light" : "full";
  };
  const makeThumbCanvas = () => {
    const canvas = document.createElement("canvas");
    return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true }) };
  };
  const classifyPdf = async (file, onProgress) => {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const counts = { bw: 0, light: 0, full: 0 };
    const { canvas, ctx } = makeThumbCanvas();
    let unread = 0;
    for (let i = 1; i <= doc.numPages; i += 1) {
      onProgress(i, doc.numPages);
      try {
        const page = await doc.getPage(i);
        const scale = THUMB_WIDTH / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // intent "print" ไม่ใช้ requestAnimationFrame: ลูกค้าสลับแท็บระหว่างตรวจแล้วงานไม่ค้าง
        await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
        counts[classifyCanvas(ctx, canvas.width, canvas.height)] += 1;
        page.cleanup();
      } catch {
        counts.bw += 1; // หน้าที่อ่านไม่ได้: นับเป็นขาวดำแล้วแจ้งให้ตรวจเอง
        unread += 1;
      }
    }
    const total = doc.numPages;
    doc.destroy();
    return { counts, total, unread };
  };
  const classifyImage = async (file) => {
    const bmp = await createImageBitmap(file);
    const { canvas, ctx } = makeThumbCanvas();
    canvas.width = THUMB_WIDTH;
    canvas.height = Math.max(1, Math.round((bmp.height / bmp.width) * THUMB_WIDTH));
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return classifyCanvas(ctx, canvas.width, canvas.height);
  };
  const countsText = (c) => PAGE_KINDS.filter(([k]) => c[k] > 0).map(([k, l]) => `${l} ${c[k]}`).join(" · ");

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
      const counts = { bw: 0, light: 0, full: 0 };
      let failed = 0;
      for (let i = 0; i < images.length; i += 1) {
        showMsg([...notes, `⏳ กำลังตรวจสีรูปภาพ ${i + 1}/${images.length}…`]);
        try {
          counts[await classifyImage(images[i])] += 1;
        } catch {
          counts.full += 1; // เปิดรูปไม่ได้ (เช่น HEIC): นับเป็นสีเต็มแผ่นไว้ก่อน
          failed += 1;
        }
      }
      if (failed) notes.push(`⚠️ ตรวจสีรูปไม่ได้ ${failed} รูป จึงนับเป็นสีเต็มแผ่นไว้ก่อน แก้ตัวเลขได้ในรายการด้านล่าง`);
      addJob({
        name: images.length === 1 ? images[0].name : `รูปภาพ ${images.length} ไฟล์`,
        icon: "🖼️",
        counts,
        detected: `รูปภาพ ${images.length} รูป · ${countsText(counts)}`,
      });
    }

    for (const f of pdfs) {
      try {
        const { counts, total, unread } = await classifyPdf(f, (i, n) => {
          showMsg([...notes, `⏳ กำลังตรวจสี <b>${escapeHtml(f.name)}</b> หน้า ${i}/${n}…`]);
        });
        if (unread) notes.push(`⚠️ <b>${escapeHtml(f.name)}</b> — อ่าน ${unread} หน้าไม่ได้ จึงนับเป็นขาวดำไว้ก่อน กรุณาตรวจตัวเลขอีกครั้ง`);
        addJob({ name: f.name, icon: "📄", counts, detected: `PDF ${total} หน้า · ${countsText(counts)}` });
      } catch (err) {
        const locked = err && err.name === "PasswordException";
        notes.push(`⚠️ <b>${escapeHtml(f.name)}</b> — ${locked ? "ไฟล์ติดรหัสผ่าน" : err && err.message === "load" ? "โหลดตัวนับหน้าไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)" : "อ่านไฟล์ไม่ได้"} ใส่จำนวนหน้าเองได้ในรายการด้านล่าง`);
        addJob({ name: f.name, icon: "📄", counts: { bw: 1, light: 0, full: 0 }, detected: "ตรวจไม่ได้ — กรุณาใส่จำนวนหน้าเอง", warn: true });
      }
    }
    showMsg(notes);
  };

  const addJob = ({ name, icon, counts, detected, warn = false }) => {
    const el = document.createElement("article");
    el.className = "job";
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
        <label class="job__print">กระดาษ / ขนาด<select class="j-mode">${modeOptions}</select></label>
        <label>จำนวนชุด<input class="j-sets" type="number" min="1" step="1" inputmode="numeric" value="1"></label>
      </div>
      <div class="pgrid">
        ${PAGE_KINDS.map(([k, label]) => `
          <label class="pgrow">
            <span class="pgrow__dot pgrow__dot--${k}" aria-hidden="true"></span>
            <span class="pgrow__name">${label}</span>
            <input class="j-${k}" type="number" min="0" step="1" inputmode="numeric" value="${counts[k]}" aria-label="จำนวนหน้า${label}">
            <span class="pgrow__unit">หน้า</span>
            <em class="pgrow__calc j-${k}-calc"></em>
          </label>`).join("")}
      </div>
      <label class="chk job__duplex j-duplex-wrap"><input type="checkbox" class="j-duplex"> <span>ปริ้นท์ขาวดำหน้า/หลัง</span></label>
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
    const mode = PRINT_MODES[$(".j-mode", el).value];
    const sets = toInt($(".j-sets", el).value, 1);
    const pages = { bw: toInt($(".j-bw", el).value), light: toInt($(".j-light", el).value), full: toInt($(".j-full", el).value) };
    const totalPages = pages.bw + pages.light + pages.full;
    const rate = (k) => (mode.all !== undefined ? mode.all : mode[k]);
    const setsText = sets > 1 ? ` × ${sets} ชุด` : "";

    const duplexWrap = $(".j-duplex-wrap", el);
    duplexWrap.hidden = !mode.duplex;
    const duplex = !!mode.duplex && $(".j-duplex", el).checked;

    let sub = 0;
    let starting = false;
    let tierNote = "";
    PAGE_KINDS.forEach(([k]) => {
      const out = $(`.j-${k}-calc`, el);
      if (k === "bw" && duplex) {
        const bwSheets = Math.ceil(pages.bw / 2);
        const totalSheets = bwSheets * sets;
        const { price, tier } = unitPrice(mode.duplex, totalSheets);
        const cost = price * totalSheets;
        sub += cost;
        out.textContent = pages.bw ? `→ ${bwSheets} แผ่น × ${fmt(price)}${setsText} = ${fmt(cost)} บ.` : "";
        if (tier.min > 1) tierNote = `หน้า/หลัง ${tier.min} แผ่นขึ้นไป แผ่นละ ${fmt(price)} บาท`;
        const nt = nextTier(mode.duplex, totalSheets);
        if (nt && pages.bw) tierNote = `หน้า/หลังครบ ${nt.min} แผ่น เหลือแผ่นละ ${fmt(nt.price)} บาท`;
        return;
      }
      const cost = rate(k) * pages[k] * sets;
      const isStart = pages[k] > 0 && (k === "bw" ? mode.bwStarting : mode.colorStarting);
      starting = starting || !!isStart;
      sub += cost;
      out.textContent = pages[k] ? `× ${isStart ? "เริ่ม " : ""}${fmt(rate(k))}${setsText} = ${fmt(cost)} บ.` : "";
    });

    const sheets = duplex ? Math.ceil(totalPages / 2) : totalPages; // แผ่นกระดาษจริงต่อชุด
    $(".j-calc", el).textContent = [
      `รวม ${totalPages} หน้า${duplex ? ` (${sheets} แผ่น)` : ""}${setsText}`,
      mode.all !== undefined ? "กระดาษนี้ราคาเดียวกันทุกแบบ" : "",
      tierNote,
    ].filter(Boolean).join(" · ");

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
     Portfolio — ปก / เนื้อใน / เข้าเล่ม แยกรายการ
     ใช้ร่วมกันทั้งในหน้าต่างบริการและเครื่องคำนวณใหญ่
     ========================================================= */
  const PF_FIELDS = [".p-cover", ".p-cover-qty", ".p-inner", ".p-inner-qty", ".p-bind", ".p-clear", ".p-sets"];
  const pfHtml = () => `
    <div class="pf">
      <label class="pf__file">
        <input type="file" class="p-file sr-only" multiple accept=".pdf,application/pdf,image/*">
        <span class="pf__file-title">📂 เลือกไฟล์ Portfolio เพื่อนับหน้า</span>
        <small>PDF หรือรูปภาพ · ไฟล์ไม่ถูกส่งออกจากเครื่องของคุณ</small>
      </label>
      <p class="pf__status p-status" role="status" aria-live="polite"></p>
      <fieldset class="pf__group">
        <legend>ปก</legend>
        <label>กระดาษ<select class="p-cover">${pricedOptions(PORTFOLIO.covers)}</select></label>
        <label>จำนวนหน้า<input class="p-cover-qty" type="number" min="0" step="1" inputmode="numeric" value="2"></label>
      </fieldset>
      <fieldset class="pf__group">
        <legend>เนื้อใน</legend>
        <label>กระดาษ<select class="p-inner">${pricedOptions(PORTFOLIO.inners)}</select></label>
        <label>จำนวนหน้า<input class="p-inner-qty" type="number" min="0" step="1" inputmode="numeric" value="20"></label>
      </fieldset>
      <fieldset class="pf__group">
        <legend>เข้าเล่ม</legend>
        <label>รูปแบบ<select class="p-bind">${pricedOptions(PORTFOLIO.binds)}</select></label>
        <label class="p-clear-wrap">แผ่นใส<select class="p-clear">${pricedOptions(PORTFOLIO.clearSheets)}</select></label>
      </fieldset>
      <label class="pf__sets">จำนวนเล่ม<input class="p-sets" type="number" min="1" step="1" inputmode="numeric" value="1"></label>
      <p class="pf__calc p-calc"></p>
    </div>`;
  const computePf = (root) => {
    const cover = PORTFOLIO.covers[$(".p-cover", root).value];
    const inner = PORTFOLIO.inners[$(".p-inner", root).value];
    const bind = PORTFOLIO.binds[$(".p-bind", root).value];
    const coverQty = toInt($(".p-cover-qty", root).value);
    const innerQty = toInt($(".p-inner-qty", root).value);
    const sets = toInt($(".p-sets", root).value, 1);
    const wrap = $(".p-clear-wrap", root);
    wrap.hidden = !bind.clearSheet;
    const clear = bind.clearSheet ? PORTFOLIO.clearSheets[$(".p-clear", root).value] : PORTFOLIO.clearSheets[0];
    const coverCost = cover.price * coverQty;
    const innerCost = inner.price * innerQty;
    const perBook = coverCost + innerCost + bind.price + clear.price;
    $(".p-calc", root).textContent = [
      `ปก ${fmt(coverCost)}`,
      `เนื้อใน ${fmt(innerCost)}`,
      `เข้าเล่ม ${bind.startingAt ? "เริ่ม " : ""}${fmt(bind.price)}`,
      clear.price ? `แผ่นใส ${fmt(clear.price)}` : "",
    ].filter(Boolean).join(" + ") + ` = เล่มละ ${fmt(perBook)} บาท${sets > 1 ? ` × ${sets} เล่ม` : ""}`;
    return { sub: perBook * sets, starting: !!bind.startingAt };
  };

  // นับหน้าไฟล์ Portfolio: ไฟล์ส่วนใหญ่รวมปกไว้แล้ว จึงหักหน้าปกออกก่อนเติมช่องเนื้อใน
  const pfApplyTotal = (root) => {
    const total = Number(root.dataset.pfTotal);
    const cover = toInt($(".p-cover-qty", root).value);
    const inner = Math.max(0, total - cover);
    $(".p-inner-qty", root).value = inner;
    $(".p-status", root).textContent = `ไฟล์ทั้งหมด ${total} หน้า = ปก ${Math.min(cover, total)} + เนื้อใน ${inner} หน้า (แก้ตัวเลขได้)`;
    $(".p-inner", root).dispatchEvent(new Event("input", { bubbles: true })); // ให้ราคาคำนวณใหม่
  };
  const pfCountFiles = async (root, fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    const status = $(".p-status", root);
    status.classList.remove("is-warn");
    status.textContent = "⏳ กำลังนับจำนวนหน้า…";
    let total = 0;
    const problems = [];
    for (const f of files) {
      if (isPdf(f)) {
        try {
          const pdfjs = await loadPdfjs();
          const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
          total += doc.numPages;
          doc.destroy();
        } catch (err) {
          problems.push(`${f.name}: ${err && err.name === "PasswordException" ? "ไฟล์ติดรหัสผ่าน" : "อ่านไฟล์ไม่ได้"}`);
        }
      } else if (isImage(f)) {
        total += 1;
      } else {
        problems.push(`${f.name}: ${/\.(docx?|odt|rtf)$/i.test(f.name) ? "กรุณา Save เป็น PDF ก่อน" : "รองรับเฉพาะ PDF และรูปภาพ"}`);
      }
    }
    if (total > 0) {
      root.dataset.pfTotal = total;
      pfApplyTotal(root);
    } else {
      delete root.dataset.pfTotal;
      status.textContent = "";
    }
    if (problems.length) {
      status.classList.add("is-warn");
      status.textContent = [status.textContent, ...problems.map((p) => `⚠️ ${p}`)].filter(Boolean).join(" ");
    }
  };
  document.addEventListener("change", (e) => {
    if (!e.target.matches(".p-file")) return;
    pfCountFiles(e.target.closest(".pf").parentElement, e.target.files);
    e.target.value = "";
  });
  document.addEventListener("input", (e) => {
    const pf = e.target.closest(".pf");
    if (!pf) return;
    const root = pf.parentElement;
    if (e.target.matches(".p-cover-qty") && root.dataset.pfTotal) pfApplyTotal(root);
    if (e.target.matches(".p-inner-qty")) { // ลูกค้าแก้เอง: เลิกคำนวณอัตโนมัติ
      delete root.dataset.pfTotal;
      $(".p-status", root).textContent = "";
    }
  });
  document.addEventListener("dragover", (e) => {
    const zone = e.target.closest && e.target.closest(".pf__file");
    $$(".pf__file.is-over").forEach((z) => { if (z !== zone) z.classList.remove("is-over"); });
    if (zone) zone.classList.add("is-over");
  });
  document.addEventListener("drop", (e) => {
    const zone = e.target.closest && e.target.closest(".pf__file");
    $$(".pf__file.is-over").forEach((z) => z.classList.remove("is-over"));
    if (zone) pfCountFiles(zone.closest(".pf").parentElement, e.dataTransfer.files);
  });

  const addPortfolio = (from) => {
    const el = document.createElement("article");
    el.className = "job pf-card";
    el.innerHTML = `
      <header class="job__head">
        <span class="job__icon" aria-hidden="true">🎓</span>
        <div class="job__title"><strong>พอร์ตโฟลิโอ</strong><small>เลือกปก เนื้อใน และเข้าเล่มแยกกัน</small></div>
        <button class="job__del" type="button" aria-label="ลบรายการนี้">✕</button>
      </header>
      ${pfHtml()}
      <footer class="job__foot">รวมรายการนี้ <strong class="j-sub">0 บาท</strong></footer>`;
    if (from) {
      PF_FIELDS.forEach((sel) => { $(sel, el).value = $(sel, from).value; });
      $(".p-status", el).textContent = $(".p-status", from).textContent;
      if (from.dataset.pfTotal) el.dataset.pfTotal = from.dataset.pfTotal;
    }
    el.addEventListener("input", recalc);
    el.addEventListener("change", recalc);
    $(".job__del", el).addEventListener("click", () => { el.remove(); recalc(); });
    rowsEl.appendChild(el);
    recalc();
  };
  const computePfCard = (el) => {
    const r = computePf(el);
    $(".j-sub", el).textContent = `${r.starting ? "เริ่ม " : ""}${fmt(r.sub)} บาท`;
    return r;
  };

  /* =========================================================
     Calculator — manual rows (งานที่ไม่มีไฟล์)
     ========================================================= */
  const catOptions = CALC_CATEGORIES.map((c, i) => `<option value="${i}">${escapeHtml(c.name)}</option>`).join("");
  const itemOptions = (cat) => cat.items.map((it, i) => `<option value="${i}">${escapeHtml(it.name)}</option>`).join("");

  const tierHint = (item, qty, cat) => {
    const { price, tier } = unitPrice(item, qty);
    const parts = [`${item.unit}ละ ${item.startingAt ? "เริ่ม " : ""}${fmt(price)} บาท`];
    if (tier && tier.min > 1) parts.push(`(ราคา ${tier.min} ${item.unit}ขึ้นไป)`);
    const next = nextTier(item, qty);
    if (next) parts.push(`· ถ้าครบ ${next.min} ${item.unit} เหลือ${item.unit}ละ ${fmt(next.price)} บาท`);
    if (cat.note) parts.push(`· ${cat.note}`);
    else if (item.startingAt) parts.push("· ราคาเริ่มต้น อาจสูงกว่านี้ตามงานจริง");
    return parts.join(" ");
  };

  const addRow = ({ cat: catIdx = 0, item: itemIdx = 0, qty } = {}) => {
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
    const qtyInput = $(".c-qty", row);
    const fillItems = () => {
      const c = CALC_CATEGORIES[cat.value];
      itemSel.innerHTML = itemOptions(c);
      qtyInput.value = c.defaultQty || 1;
    };
    cat.value = catIdx;
    fillItems();
    itemSel.value = itemIdx;
    if (qty) qtyInput.value = qty;
    cat.addEventListener("change", () => { fillItems(); recalc(); });
    itemSel.addEventListener("change", recalc);
    qtyInput.addEventListener("input", recalc);
    $(".crow__del", row).addEventListener("click", () => { row.remove(); recalc(); });
    rowsEl.appendChild(row);
    recalc();
  };

  const computeRow = (row) => {
    const cat = CALC_CATEGORIES[$(".c-cat", row).value];
    const item = cat.items[$(".c-item", row).value];
    const qty = toInt($(".c-qty", row).value);
    const { price } = unitPrice(item, qty);
    const sub = price * qty;
    $(".c-unit", row).textContent = item.unit;
    $(".c-sub", row).textContent = `${item.startingAt ? "เริ่ม " : ""}${fmt(sub)} บาท`;
    $(".c-hint", row).textContent = qty > 0 ? tierHint(item, qty, cat) : "";
    return { sub, starting: !!item.startingAt && qty > 0 };
  };

  function recalc() {
    let total = 0;
    let anyStarting = false;
    [
      ...$$(".job", jobsEl).map(computeJob),
      ...$$(".crow", rowsEl).map(computeRow),
      ...$$(".pf-card", rowsEl).map(computePfCard),
    ].forEach(({ sub, starting }) => {
      total += sub;
      anyStarting = anyStarting || starting;
    });
    sumEl.textContent = `${anyStarting ? "เริ่มต้น " : ""}${fmt(total)} บาท`;
    noteEl.textContent = anyStarting
      ? `${baseNote} บางรายการเป็นราคาเริ่มต้น ราคาจริงขึ้นอยู่กับปริมาณสี/ความหนาของงาน`
      : baseNote;
  }

  $("#calcAdd").addEventListener("click", () => addRow());
  $("#calcAddPf").addEventListener("click", () => addPortfolio());
  recalc();

  /* =========================================================
     Service modal — กดการ์ดบริการแล้วคำนวณราคาของบริการนั้น
     ========================================================= */
  const svc = $("#svcModal");
  const svcBody = $(".svc__body", svc);
  const svcSum = $(".svc__sum", svc);
  const svcNote = $(".svc__note", svc);
  let svcConf = null;
  let svcReturnFocus = null;

  const svcCompute = () => {
    if (svcConf.portfolio) {
      const r = computePf(svcBody);
      svcSum.textContent = `${r.starting ? "เริ่มต้น " : ""}${fmt(r.sub)} บาท`;
      svcNote.textContent = "";
      return;
    }
    const cat = CALC_CATEGORIES[$(".s-cat", svcBody).value];
    const item = cat.items[$(".s-item", svcBody).value];
    const qty = toInt($(".s-qty", svcBody).value);
    const { price } = unitPrice(item, qty);
    $(".s-unit", svcBody).textContent = item.unit;
    svcSum.textContent = `${item.startingAt ? "เริ่มต้น " : ""}${fmt(price * qty)} บาท`;
    svcNote.textContent = qty > 0 ? tierHint(item, qty, cat) : "";
  };

  const openService = (key) => {
    const conf = SERVICE_CALC[key];
    if (!conf) return;
    svcConf = conf;
    svcReturnFocus = document.activeElement;
    $("#svcTitle").textContent = conf.title;
    delete svcBody.dataset.pfTotal;
    if (conf.portfolio) {
      svcBody.innerHTML = pfHtml();
    } else {
      const cats = conf.cats.map((id) => CALC_CATEGORIES.findIndex((c) => c.id === id));
      svcBody.innerHTML = `
        <label ${cats.length > 1 ? "" : "hidden"}>ประเภท<select class="s-cat">${cats.map((i) => `<option value="${i}">${escapeHtml(CALC_CATEGORIES[i].name)}</option>`).join("")}</select></label>
        <label>รายการ<select class="s-item"></select></label>
        <label><span>จำนวน (<span class="s-unit"></span>)</span><input class="s-qty" type="number" min="1" step="1" inputmode="numeric" value="1"></label>`;
      const fill = () => {
        const c = CALC_CATEGORIES[$(".s-cat", svcBody).value];
        $(".s-item", svcBody).innerHTML = itemOptions(c);
        $(".s-qty", svcBody).value = c.defaultQty || 1;
      };
      fill();
      $(".s-cat", svcBody).addEventListener("change", fill);
    }
    svcCompute();
    svc.hidden = false;
    document.body.classList.add("no-scroll");
    $(".svc__close", svc).focus();
  };
  const closeService = () => {
    svc.hidden = true;
    document.body.classList.remove("no-scroll");
    if (svcReturnFocus) svcReturnFocus.focus();
  };

  svcBody.addEventListener("input", svcCompute);
  svcBody.addEventListener("change", svcCompute);
  $(".svc__close", svc).addEventListener("click", closeService);
  svc.addEventListener("click", (e) => { if (e.target === svc) closeService(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !svc.hidden) closeService(); });
  $(".svc__add", svc).addEventListener("click", () => {
    if (svcConf.portfolio) addPortfolio(svcBody);
    else addRow({ cat: Number($(".s-cat", svcBody).value), item: Number($(".s-item", svcBody).value), qty: toInt($(".s-qty", svcBody).value, 1) });
    closeService();
    $("#calculator").scrollIntoView();
  });
  $(".services").addEventListener("click", (e) => {
    const card = e.target.closest("[data-service]");
    if (card) openService(card.dataset.service);
  });

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
    // ใบหน้าสุด (ขวาสุดตอนกาง) = รูปแรก · มีไม่ถึง 3 รูป เติม "กระดาษเปล่า" ไว้ด้านหลัง
    const photos = imgs.slice(0, MAX_FAN).map((src, i) => ({ src, index: i })).reverse();
    const ghosts = Math.max(0, 3 - photos.length);
    const slots = [...Array(ghosts).fill(null), ...photos];
    const n = slots.length;
    const mid = (n - 1) / 2;
    const stepX = n > 1 ? 92 / (n - 1) : 0; // % ของความกว้างการ์ด
    const stepR = n > 1 ? 28 / (n - 1) : 0;  // องศา
    const cards = slots.map((slot, i) => {
      const off = i - mid;
      const side = Math.abs(off) / Math.max(mid, 1);
      const style = [
        `--sx:${(off * 4).toFixed(1)}px`, `--sy:0px`, `--sr:${(off * 3).toFixed(1)}deg`,
        `--ox:${(off * stepX).toFixed(1)}%`, `--oy:${off === 0 ? -5 : (side * 5).toFixed(1)}%`, `--or:${(off * stepR).toFixed(1)}deg`,
        `z-index:${10 + i}`,
      ].join(";");
      if (!slot) return `<span class="deck__card deck__card--ghost" style="${style}" aria-hidden="true"></span>`;
      return `<button class="deck__card" type="button" data-index="${slot.index}" data-label="${i === n - 1 ? escapeHtml(c.title) : ""}" style="${style}"
        aria-label="เปิดแกลเลอรี ${escapeHtml(c.title)}">
        <img src="${escapeHtml(slot.src)}" alt="ตัวอย่างงาน${escapeHtml(c.title)} ร้านรุ่งเรือง ก๊อปปี้ รูปที่ ${slot.index + 1}" loading="lazy">
      </button>`;
    }).join("");
    return `
      <article class="deck reveal" data-cat="${escapeHtml(c.id)}" tabindex="0" aria-label="${escapeHtml(c.title)} ${imgs.length} รูป">
        <div class="deck__stage">${cards}</div>
        <div class="deck__info">
          <h3>${escapeHtml(c.title)} <span class="deck__count">${imgs.length} รูป</span></h3>
          ${c.desc ? `<p>${escapeHtml(c.desc)}</p>` : ""}
          <button class="deck__more" type="button">ดูแกลเลอรี →</button>
        </div>
      </article>`;
  }).join("");

  // เมาส์: ชี้แล้วกาง คลิกเปิดแกลเลอรี · จอสัมผัส: แตะครั้งแรกกาง แตะอีกครั้งเปิดแกลเลอรี
  const noHover = window.matchMedia("(hover: none)");
  decksEl.addEventListener("click", (e) => {
    const deck = e.target.closest(".deck");
    if (!deck) return;
    if (e.target.closest(".deck__more")) { openGallery(deck.dataset.cat); return; }
    if (!e.target.closest(".deck__stage")) return;
    if (noHover.matches && !deck.classList.contains("is-open")) {
      $$(".deck.is-open", decksEl).forEach((d) => d.classList.remove("is-open"));
      deck.classList.add("is-open");
      return;
    }
    openGallery(deck.dataset.cat);
  });

  // ---- Gallery: รวมทุกรูปของหมวด ----
  const gal = $("#gallery");
  const galGrid = $(".gallery__grid", gal);
  let galCat = null;
  let galReturnFocus = null;
  const openGallery = (cat) => {
    const c = categories.find((x) => x.id === cat);
    galCat = cat;
    galReturnFocus = document.activeElement;
    $("#galleryTitle").textContent = `${c.title} · ${manifest[cat].length} รูป`;
    $(".gallery__desc", gal).textContent = c.desc || "";
    galGrid.innerHTML = manifest[cat].map((src, i) => `
      <button class="gallery__item" type="button" data-index="${i}" style="animation-delay:${Math.min(i, 12) * 45}ms" aria-label="ขยายรูปที่ ${i + 1}">
        <img src="${escapeHtml(src)}" alt="ตัวอย่างงาน${escapeHtml(c.title)} รูปที่ ${i + 1}" loading="lazy">
      </button>`).join("");
    gal.hidden = false;
    gal.scrollTop = 0;
    document.body.classList.add("no-scroll");
    $(".gallery__close", gal).focus();
  };
  const closeGallery = () => {
    gal.hidden = true;
    galCat = null;
    document.body.classList.remove("no-scroll");
    $$(".deck.is-open", decksEl).forEach((d) => d.classList.remove("is-open"));
    if (galReturnFocus) galReturnFocus.focus();
  };
  galGrid.addEventListener("click", (e) => {
    const item = e.target.closest(".gallery__item");
    if (item) openLightbox(galCat, Number(item.dataset.index));
  });
  $(".gallery__close", gal).addEventListener("click", closeGallery);
  gal.addEventListener("click", (e) => { if (e.target === gal) closeGallery(); });
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
    if (gal.hidden) document.body.classList.remove("no-scroll"); // ยังเปิดแกลเลอรีอยู่ → คงล็อกการเลื่อนไว้
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
      if (!gal.hidden && e.key === "Escape") closeGallery();
      else if (gal.hidden && e.key === "Enter" && e.target.matches(".deck")) openGallery(e.target.dataset.cat);
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
