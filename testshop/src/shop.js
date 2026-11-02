// Everything the shop's pages do in the browser. The cart lives in localStorage; the checkout sends nothing anywhere.
(() => {
  window.dataLayer = window.dataLayer || [];
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const kc = (n) => Number(n).toLocaleString("cs-CZ") + " Kč";
  const FREE_FROM = 2500;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const cart = () => read("hs-cart", []);
  const cartCount = (c = cart()) => c.reduce((n, i) => n + i.q, 0);
  const subtotal = (c = cart()) => c.reduce((n, i) => n + i.q * i.price, 0);
  function saveCart(c) {
    localStorage.setItem("hs-cart", JSON.stringify(c));
    $$(".cc").forEach((e) => { e.textContent = cartCount(c); });
  }
  saveCart(cart());
  const item = (i, quantity = i.q) => ({ item_id: i.id, item_name: i.name, price: i.price, quantity });

  function toast(html) {
    $(".toast")?.remove();
    const t = document.createElement("div");
    t.className = "toast"; t.innerHTML = html; t.setAttribute("role", "status");
    document.body.append(t);
    setTimeout(() => t.remove(), 4500);
  }

  // ---- buying: the shop's "Do košíku" buttons (the assistant presses the same one)
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".add-to-cart");
    if (!b || b.disabled) return;
    const size = $(".sizes button.on")?.textContent ?? "";
    const q = Math.max(1, Number($("#qty")?.value) || 1);
    const c = cart(), key = b.dataset.id + "|" + size;
    const line = c.find((i) => i.key === key);
    if (line) line.q += q;
    else c.push({ key, id: b.dataset.id, name: b.dataset.name, price: Number(b.dataset.price), slug: b.dataset.slug, size, pickup: b.dataset.pickup === "1", q });
    saveCart(c);
    window.dataLayer.push({ event: "add_to_cart", ecommerce: { currency: "CZK", value: q * Number(b.dataset.price), items: [item({ id: b.dataset.id, name: b.dataset.name, price: Number(b.dataset.price) }, q)] } });
    toast(`Přidáno do košíku: ${esc(b.dataset.name)} <a href="/kosik">Do košíku →</a>`);
  });

  // ---- menus and small pieces
  $(".burger")?.addEventListener("click", () => $(".catnav").classList.toggle("open"));
  $$(".catnav a").forEach((a) => { if (a.getAttribute("href") === location.pathname) a.classList.add("on"); });
  $$(".sidemenu a").forEach((a) => { if (a.getAttribute("href") === location.pathname) a.classList.add("on"); });
  $$("form.newsletter").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); f.innerHTML = "<strong>Díky! Na e-mail vám nic neposíláme, tohle je ukázkový obchod.</strong>"; }));
  $$("form.contact").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); f.innerHTML = "<p class='demo-note'>Zpráva se nikam neodeslala – tohle je ukázkový obchod.</p>"; }));
  if (!read("hs-cookie", false)) {
    const n = document.createElement("div");
    n.className = "cookie";
    n.innerHTML = `<p>Tento web používá jen cookies nezbytné pro chod košíku. <a href="/info/cookies">Více informací</a></p><button type="button">Rozumím</button>`;
    n.querySelector("button").onclick = () => { localStorage.setItem("hs-cookie", "1"); n.remove(); };
    document.body.append(n);
  }

  // ---- product page: gallery, sizes, quantity, tabs
  $$(".thumbs button").forEach((b) => b.addEventListener("click", () => {
    $(".gallery .main img").src = b.dataset.src;
    $$(".thumbs button").forEach((x) => x.classList.toggle("on", x === b));
  }));
  $$(".sizes button").forEach((b) => b.addEventListener("click", () => $$(".sizes button").forEach((x) => x.classList.toggle("on", x === b))));
  $$(".qty [data-d]").forEach((b) => b.addEventListener("click", () => { const i = $("input", b.parentElement); i.value = Math.max(1, (Number(i.value) || 1) + Number(b.dataset.d)); }));
  $$(".tabbar button").forEach((b) => b.addEventListener("click", () => {
    $$(".tabbar button").forEach((x) => x.classList.toggle("on", x === b));
    $$(".tab").forEach((t) => { t.hidden = t.id !== b.dataset.tab; });
  }));

  // ---- category page: filters and sorting
  const list = $("#products");
  if (list && $("#filters")) {
    const cards = $$(".card", list);
    const maxInput = $("#maxprice"), maxOut = $("#maxout");
    function apply() {
      const brands = $$("#filters [name=brand]:checked").map((x) => x.value);
      const onlyStock = $("#instock").checked, onlySale = $("#onsale").checked, max = Number(maxInput.value);
      let shown = 0;
      for (const c of cards) {
        const ok = (!brands.length || brands.includes(c.dataset.brand)) && (!onlyStock || c.dataset.stock === "1") && (!onlySale || c.dataset.sale === "1") && Number(c.dataset.price) <= max;
        c.hidden = !ok; c.style.display = ok ? "" : "none"; if (ok) shown++;
      }
      maxOut.textContent = kc(max);
      $("#count").textContent = `${shown} ${shown === 1 ? "produkt" : shown >= 2 && shown <= 4 ? "produkty" : "produktů"}`;
      window.dataLayer.push({ event: "filter_change" });
    }
    function sort() {
      const how = $("#sort").value;
      const val = { cheap: (c) => Number(c.dataset.price), dear: (c) => -Number(c.dataset.price), top: (c) => -Number(c.dataset.rank) }[how];
      [...cards].sort((a, b) => val(a) - val(b)).forEach((c) => list.append(c));
    }
    $("#filters").addEventListener("input", apply);
    $("#sort").addEventListener("change", sort);
    $(".showfilters")?.addEventListener("click", () => $("#filters").classList.toggle("open"));
    apply();
  }

  // ---- cart
  function drawSummary(box, extra = 0, label = "") {
    const sum = subtotal(), left = FREE_FROM - sum;
    box.innerHTML = `<h3>Souhrn objednávky</h3><div class="r"><span>Zboží</span><b>${kc(sum)}</b></div>${label ? `<div class="r"><span>${esc(label)}</span><b>${extra ? kc(extra) : "zdarma"}</b></div>` : ""}<div class="r tot"><span>Celkem</span><span>${kc(sum + extra)}</span></div>`;
    return left;
  }
  const cartBox = $("#cart-lines");
  function drawCart() {
    const c = cart();
    if (!c.length) {
      $("#cart-page").innerHTML = `<div class="okbox"><h2>Košík je prázdný</h2><p>Vyberte si z naší nabídky, doprava je zdarma od 2 500 Kč.</p><a class="btn" href="/">Zpět do obchodu</a></div>`;
      return;
    }
    cartBox.innerHTML = c.map((i, n) => `<div class="line"><img src="/img/${esc(i.slug)}-1.svg" alt="" width="90"><div><a class="n" href="/produkt/${esc(i.slug)}">${esc(i.name)}</a>${i.size ? `<small>Velikost: ${esc(i.size)}</small>` : ""}<small>${kc(i.price)} / ks</small><button class="rm" data-rm="${n}" type="button">Odebrat</button></div><span class="qty"><button type="button" data-q="-1" data-n="${n}" aria-label="Méně">−</button><input value="${i.q}" readonly aria-label="Počet"><button type="button" data-q="1" data-n="${n}" aria-label="Více">+</button></span><b>${kc(i.q * i.price)}</b></div>`).join("");
    const left = drawSummary($("#cart-sum"));
    const pct = Math.min(100, (subtotal() / FREE_FROM) * 100);
    $("#ship-note").innerHTML = `${left > 0 ? `Do dopravy zdarma zbývá <b>${kc(left)}</b>.` : "<b>Máte dopravu zdarma!</b> (ČR)"}<div class="ship-bar"><i style="width:${pct}%"></i></div>`;
  }
  if (cartBox) {
    drawCart();
    cartBox.addEventListener("click", (e) => {
      const c = cart();
      const rm = e.target.closest("[data-rm]"), q = e.target.closest("[data-q]");
      if (rm) {
        const [gone] = c.splice(Number(rm.dataset.rm), 1);
        window.dataLayer.push({ event: "remove_from_cart", ecommerce: { currency: "CZK", items: [item(gone)] } });
      } else if (q) {
        const line = c[Number(q.dataset.n)], d = Number(q.dataset.q);
        if (d < 0 && line.q === 1) { c.splice(Number(q.dataset.n), 1); window.dataLayer.push({ event: "remove_from_cart", ecommerce: { currency: "CZK", items: [item(line, 1)] } }); }
        else {
          line.q += d;
          window.dataLayer.push({ event: d > 0 ? "add_to_cart" : "remove_from_cart", ecommerce: { currency: "CZK", items: [item(line, 1)] } });
        }
      } else return;
      saveCart(c);
      drawCart();
    });
  }

  // ---- checkout: nothing leaves the browser
  const co = $("#checkout-form");
  if (co) {
    if (!cart().length) location.replace("/kosik");
    const onlyPickup = cart().some((i) => i.pickup);
    if (onlyPickup) {
      $$("[data-mail]", co).forEach((o) => o.classList.add("hidden"));
      $("#pickup-note").hidden = false;
      $('input[name=ship][value="brno"]', co).checked = true;
    }
    const draw = () => {
      const s = $("input[name=ship]:checked", co), p = $("input[name=pay]:checked", co);
      let ship = Number(s.dataset.price);
      if (s.dataset.cz === "1" && subtotal() >= FREE_FROM) ship = 0;
      const fee = Number(p.dataset.fee || 0);
      drawSummary($("#co-sum"), ship + fee, `${s.dataset.label}${fee ? " + dobírka" : ""}`);
      return ship + fee;
    };
    co.addEventListener("change", draw);
    draw();
    co.addEventListener("submit", (e) => {
      e.preventDefault();
      const c = cart();
      const order = { no: "HS" + String(Date.now()).slice(-8), value: subtotal(c), extra: draw(), lines: c };
      sessionStorage.setItem("hs-order", JSON.stringify(order));
      location.assign("/objednavka/dekujeme");
    });
  }
  const done = $("#order-done");
  if (done) {
    let o = null;
    try { o = JSON.parse(sessionStorage.getItem("hs-order")); } catch {}
    if (!o) { location.replace("/"); return; }
    $("#order-no").textContent = o.no;
    $("#order-lines").innerHTML = o.lines.map((i) => `<div class="r"><span>${i.q}× ${esc(i.name)}</span><b>${kc(i.q * i.price)}</b></div>`).join("") + `<div class="r tot"><span>Celkem</span><span>${kc(o.value + o.extra)}</span></div>`;
    if (!o.sent) {
      window.dataLayer.push({ event: "purchase", ecommerce: { transaction_id: o.no, currency: "CZK", value: o.value, items: o.lines.map((i) => item(i)) } });
      sessionStorage.setItem("hs-order", JSON.stringify({ ...o, sent: true }));
      saveCart([]);
    }
  }
})();
