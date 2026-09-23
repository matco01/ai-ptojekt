// Demo shop front-end (hash router, cart in localStorage) + integration hooks for the AI widget.
(async () => {
  const app = document.getElementById("app");
  const { categories, products, promotions, related } = await (await fetch("/api/catalog")).json();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const catName = (id) => categories.find((c) => c.id === id)?.name ?? id;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const kc = (n) => Math.round(n).toLocaleString("cs-CZ") + " Kč";
  const disc = (p) => (p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);
  const img = (p) => `/api/img/${p.id}.svg`;
  const topSellers = new Set([...products].sort((a, b) => b.sold - a.sold).slice(0, 5).map((p) => p.id));
  const bundleMain = new Map(promotions.filter((p) => p.bundle).map((p) => [p.bundle.main, p]));

  // ---- cart & browsing state ----
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let cart = load("tm_cart", []);
  let viewed = load("tm_viewed", []);
  let page = { type: "home", category: null, productId: null };

  function addToCart(id, quantity = 1, { silent = false, source = "user" } = {}) {
    const line = cart.find((c) => c.id === id);
    if (line) line.quantity += quantity; else cart.push({ id, quantity });
    save("tm_cart", cart);
    updateHeader();
    if (source === "user") track("add_to_cart", { productId: id, quantity, source });
    if (!silent) toast(`✓ ${byId[id].name} je v košíku`);
    if (page.type === "cart") route();
  }
  function setQty(id, q) {
    cart = q > 0 ? cart.map((c) => (c.id === id ? { ...c, quantity: q } : c)) : cart.filter((c) => c.id !== id);
    save("tm_cart", cart);
    updateHeader();
    route();
  }
  const priceCart = () => fetch("/api/cart/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cart }) }).then((r) => r.json());
  function updateHeader() {
    const n = cart.reduce((s, c) => s + c.quantity, 0);
    const el = document.getElementById("cart-count");
    el.textContent = n;
    el.classList.toggle("zero", !n);
  }

  // Events sent before the widget script has loaded are buffered here.
  const pending = [];
  function track(type, data) {
    if (window.AIProdavac?.track) {
      for (const [t, d] of pending.splice(0)) window.AIProdavac.track(t, d);
      window.AIProdavac.track(type, data);
    } else pending.push([type, data]);
  }
  addEventListener("load", () => { if (window.AIProdavac?.track) for (const [t, d] of pending.splice(0)) window.AIProdavac.track(t, d); });

  // ---- hooks for the AI widget: what a salesperson standing next to the customer would see ----
  window.AIProdavac = Object.assign(window.AIProdavac || {}, {
    getContext: () => ({
      pageType: page.type,
      category: page.category,
      currentProductId: page.productId,
      viewedProductIds: viewed.slice(-8),
      cart,
    }),
    onAddToCart: (item) => addToCart(item.id, item.quantity ?? 1, { silent: true, source: "ai" }),
    onOpenProduct: (id) => (location.hash = `#/produkt/${id}`),
  });

  // ---- building blocks ----
  const CAT_ICON = {
    mobily: "fa-mobile-screen-button", notebooky: "fa-laptop", tv: "fa-tv", audio: "fa-headphones", hodinky: "fa-clock",
    tablety: "fa-tablet-screen-button", herni: "fa-gamepad", prislusenstvi: "fa-plug", domacnost: "fa-blender",
  };
  const pr = (n) => Math.round(n).toLocaleString("cs-CZ") + ",-"; // "21 490,-" price style
  const stars = (r) => {
    const full = Math.floor(r), half = r - full >= 0.3 && r - full < 0.8, fullish = r - full >= 0.8;
    return [...Array(5)].map((_, i) => `<i class="fa-${i < full + (fullish ? 1 : 0) ? "solid fa-star" : i === full && half ? "solid fa-star-half-stroke" : "regular fa-star"}"></i>`).join("");
  };
  const ratingRow = (p) => `<div class="rating"><span class="stars">${stars(p.rating)}</span><b>${String(p.rating).replace(".", ",")}</b><small>${p.reviews}×</small></div>`;
  const stockText = (p) => (p.stock > 5 ? `Skladem > 5 ks` : p.stock > 0 ? `Skladem ${p.stock} ks` : "Na objednávku");
  const tile = (p) => `
    <div class="tile">
      <div class="badges">
        ${disc(p) ? `<span class="badge">−${disc(p)} %</span>` : ""}
        ${bundleMain.has(p.id) ? `<span class="badge tip">+ dárek v setu</span>` : ""}
        ${topSellers.has(p.id) ? `<span class="badge top">TOP</span>` : ""}
      </div>
      <a class="pic" href="#/produkt/${p.id}"><img src="${img(p)}" alt="${esc(p.name)}" loading="lazy"></a>
      ${ratingRow(p)}
      <a class="name" href="#/produkt/${p.id}">${esc(p.name)}</a>
      <div class="hl">${esc(p.highlights.slice(0, 2).join(" · "))}</div>
      <div class="tfoot">
        <div>
          <div class="stock ${p.stock <= 5 ? "low" : ""}"><i class="fa-solid fa-check"></i>${stockText(p)}</div>
          <div class="price">${p.oldPrice ? `<span class="old">${pr(p.oldPrice)}</span>` : ""}${pr(p.price)}</div>
        </div>
        <button class="add" data-add="${p.id}" title="Do košíku" aria-label="Přidat ${esc(p.name)} do košíku"><i class="fa-solid fa-cart-shopping"></i></button>
      </div>
    </div>`;
  const shelf = (id, title, items, { more, extra = "" } = {}) => items.length ? `
    <section class="shelf">
      <div class="shelf-h"><h2>${title}${extra}</h2>${more ? `<a class="more" href="${more}">Více »</a>` : ""}</div>
      <div class="shelf-body">
        <div class="shelf-row" id="${id}">${items.map(tile).join("")}</div>
        ${items.length > 6 ? `<button class="arrow next" data-scroll="${id}" aria-label="Další produkty"><i class="fa-solid fa-chevron-right"></i></button>` : ""}
      </div>
    </section>` : "";
  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (b) { e.preventDefault(); addToCart(b.dataset.add); return; }
    const s = e.target.closest("[data-scroll]");
    if (s) {
      const row = document.getElementById(s.dataset.scroll);
      const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
      row.scrollTo({ left: atEnd ? 0 : row.scrollLeft + row.clientWidth, behavior: "smooth" });
    }
  });

  // ---- views ----
  let slideTimer = null;
  function home() {
    // hero slides: highlighted words get the orange underline, like the big e-shops' campaign banners
    const slides = [
      { id: "m1", bg: "linear-gradient(100deg,#1c2a72 0%,#223394 55%,#1c296f 100%)", glow: "#3b82f6", kicker: "tech<b>market</b>+ ti právě teď", title: "přináší <u>slevy</u><br>na stovky produktů", link: "#/akce" },
      { id: "h1", bg: "linear-gradient(100deg,#3b1a78 0%,#5b2a9e 60%,#3b1a78 100%)", glow: "#c084fc", kicker: "jen do neděle", title: "RoboClean S8<br>o <u>3 000 Kč</u> levněji", link: "#/produkt/h1" },
      { id: "t1", bg: "linear-gradient(100deg,#0f1b33 0%,#1d3557 60%,#0f1b33 100%)", glow: "#38bdf8", kicker: "5 let záruka zdarma", title: "OLED televize<br>Aurora <u>−17 %</u>", link: "#/produkt/t1" },
    ];
    const weekDeals = products.filter((p) => p.oldPrice).sort((a, b) => disc(b) - disc(a));
    const bestsellers = [...products].sort((a, b) => b.sold - a.sold).slice(0, 12);
    const novaPhones = products.filter((p) => p.brand === "Nova" || p.category === "mobily").sort((a, b) => b.sold - a.sold);
    // personalisation from browsing behaviour
    const seen = new Set(viewed);
    const lastViewed = viewed.slice(-8).reverse().map((id) => byId[id]).filter(Boolean);
    const forYou = [...new Set(viewed.slice(-4).reverse().flatMap((id) => related[id] ?? []))]
      .filter((id) => !seen.has(id)).map((id) => byId[id]).filter(Boolean).slice(0, 8);

    app.innerHTML = `
      <div class="home">
        <nav class="side" aria-label="Kategorie">
          <a class="hot" href="#/akce"><i class="fa-solid fa-percent"></i>Klub+ slevy</a>
          <a class="hot red" href="#/kategorie/notebooky"><i class="fa-solid fa-tags"></i>Týden notebooků</a>
          <div class="sep"></div>
          ${categories.map((c) => `<a href="#/kategorie/${c.id}"><i class="fa-solid ${CAT_ICON[c.id] ?? "fa-box"}"></i>${esc(c.name)}</a>`).join("")}
          <div class="sep"></div>
          <a href="#/kategorie/mobily"><i class="fa-solid fa-rotate"></i>Výkup telefonů</a>
          <a href="#/akce"><i class="fa-solid fa-credit-card"></i>Splátky 0 %</a>
          <a href="#/kategorie/tv"><i class="fa-solid fa-screwdriver-wrench"></i>Instalace a služby</a>
        </nav>
        <div class="home-main">
          <div class="hero" id="hero">
            ${slides.map((s, i) => `
              <div class="slide ${i ? "" : "on"}" style="background:${s.bg}">
                <span class="glow" style="background:${s.glow};width:260px;height:260px;right:-40px;top:-60px"></span>
                <span class="glow" style="background:#6366f1;width:200px;height:200px;right:30%;bottom:-80px"></span>
                <div class="txt">
                  <div class="kicker">${s.kicker}</div>
                  <h3>${s.title}</h3>
                  <a class="btn" href="${s.link}">Více</a>
                </div>
                <div class="art">
                  <span class="coin c1">+</span><span class="coin c2">%</span><span class="coin c3">+</span>
                  <img src="${img(byId[s.id])}" alt="">
                </div>
              </div>`).join("")}
            <div class="dots">${slides.map((_, i) => `<button class="${i ? "" : "on"}" data-i="${i}" aria-label="Banner ${i + 1}"></button>`).join("")}</div>
          </div>

          <section class="promos">
            <div class="pc dark">
              <div class="brandline">tech <span>% dny</span></div>
              <h3>Ušetři za elektroniku na doma i do školy</h3>
              <span class="tag" style="right:118px;top:30px">−15 %</span>
              <span class="tag" style="right:12px;top:62px">−13 %</span>
              <span class="tag" style="right:70px;bottom:22px">−23 %</span>
              <img class="pimg" src="${img(byId.n3)}" alt="">
              <a class="btn" href="#/akce">Kup teď</a>
            </div>
            <div class="pc light">
              <div class="brandline" style="color:var(--navy)">výkup <span style="background:var(--blue)">+ bonus</span></div>
              <h3>Nový mobil s bonusem až 3 000 Kč</h3>
              <p>Při nákupu mobilu nad 10 000 Kč vykoupíme váš starý telefon.</p>
              <img class="pimg" src="${img(byId.m1)}" alt="">
              <a class="btn" href="#/kategorie/mobily">Kup teď</a>
            </div>
            <div class="pc light">
              <div class="brandline" style="color:#7a3fb8">RoboClean</div>
              <h3>RoboClean S8 <span style="color:var(--red);white-space:nowrap">−23 %</span></h3>
              <p>Vysává i mopuje, sám se vysype. Jen do neděle.</p>
              <div class="chips"><span class="chip">Doprava zdarma</span><span class="chip r">0 % splátky</span></div>
              <img class="pimg" src="${img(byId.h1)}" alt="">
              <a class="btn" href="#/produkt/h1">Kup teď</a>
            </div>
          </section>

          ${shelf("s-last", "Naposledy jste si prohlíželi", lastViewed)}
          ${shelf("s-foryou", "Mohlo by se vám hodit", forYou)}
          ${shelf("s-deals", "Akce týdne", weekDeals, { more: "#/akce", extra: ` <span class="countdown" id="countdown"></span>` })}
          ${shelf("s-phones", "To nejlepší z mobilů", novaPhones, { more: "#/kategorie/mobily" })}
          ${shelf("s-best", "Nejprodávanější", bestsellers)}
        </div>
      </div>`;

    let cur = 0;
    const show = (i) => {
      cur = i;
      app.querySelectorAll(".slide").forEach((s, j) => s.classList.toggle("on", j === i));
      app.querySelectorAll(".dots button").forEach((d, j) => d.classList.toggle("on", j === i));
    };
    app.querySelectorAll(".dots button").forEach((d) => (d.onclick = () => show(Number(d.dataset.i))));
    clearInterval(slideTimer);
    slideTimer = setInterval(() => (document.getElementById("hero") ? show((cur + 1) % slides.length) : clearInterval(slideTimer)), 6000);
    startCountdown();
  }

  function startCountdown() {
    const ends = promotions.filter((p) => p.type === "discount" && p.validUntil).map((p) => new Date(p.validUntil + "T23:59:59")).sort((a, b) => a - b)[0];
    const tick = () => {
      const el = document.getElementById("countdown");
      if (!el || !ends) return;
      const s = Math.max(0, Math.floor((ends - Date.now()) / 1000));
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      el.textContent = `končí za ${d ? d + " d " : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
      setTimeout(tick, 1000);
    };
    tick();
  }

  const filterState = {};
  function listing({ title, crumbs, items, key }) {
    const f = (filterState[key] ??= { sort: "sold", brands: new Set(), sale: false, min: "", max: "" });
    const brands = [...new Set(items.map((p) => p.brand))].sort();
    app.innerHTML = `
      <div class="crumbs">${crumbs}</div>
      <h1>${esc(title)}</h1>
      <div class="listing">
        <aside class="filters box">
          <h4>Cena</h4>
          <div class="range"><input type="number" id="fmin" placeholder="od" value="${f.min}"> – <input type="number" id="fmax" placeholder="do" value="${f.max}"></div>
          <h4>Výrobce</h4>
          ${brands.map((b) => `<label><input type="checkbox" data-brand="${esc(b)}" ${f.brands.has(b) ? "checked" : ""}> ${esc(b)}</label>`).join("")}
          <h4>Ostatní</h4>
          <label><input type="checkbox" id="fsale" ${f.sale ? "checked" : ""}> Jen ve slevě</label>
        </aside>
        <div>
          <div class="sortbar">
            ${[["sold", "Nejprodávanější"], ["cheap", "Nejlevnější"], ["exp", "Nejdražší"], ["rating", "Nejlépe hodnocené"]].map(([k, l]) => `<button data-sort="${k}" class="${f.sort === k ? "on" : ""}">${l}</button>`).join("")}
            <span class="cnt" id="cnt"></span>
          </div>
          <div class="grid" id="grid"></div>
        </div>
      </div>`;
    const render = () => {
      let list = items.filter((p) => (!f.brands.size || f.brands.has(p.brand)) && (!f.sale || p.oldPrice) && (!f.min || p.price >= +f.min) && (!f.max || p.price <= +f.max));
      const sorters = { sold: (a, b) => b.sold - a.sold, cheap: (a, b) => a.price - b.price, exp: (a, b) => b.price - a.price, rating: (a, b) => b.rating - a.rating };
      list = list.sort(sorters[f.sort]);
      document.getElementById("grid").innerHTML = list.length ? list.map(tile).join("") : `<p class="muted">Filtrům neodpovídá žádný produkt.</p>`;
      document.getElementById("cnt").textContent = `${list.length} produktů`;
    };
    app.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => { f.sort = b.dataset.sort; app.querySelectorAll("[data-sort]").forEach((x) => x.classList.toggle("on", x === b)); render(); }));
    app.querySelectorAll("[data-brand]").forEach((c) => (c.onchange = () => { c.checked ? f.brands.add(c.dataset.brand) : f.brands.delete(c.dataset.brand); render(); }));
    document.getElementById("fsale").onchange = (e) => { f.sale = e.target.checked; render(); };
    document.getElementById("fmin").oninput = (e) => { f.min = e.target.value; render(); };
    document.getElementById("fmax").oninput = (e) => { f.max = e.target.value; render(); };
    render();
  }

  function category(id) {
    if (!categories.some((c) => c.id === id)) return notFound();
    page = { type: "category", category: id, productId: null };
    track("category_view", { category: id });
    listing({ title: catName(id), crumbs: `<a href="#/">TechMarket</a> › ${esc(catName(id))}`, items: products.filter((p) => p.category === id), key: id });
  }

  function deals() {
    page = { type: "category", category: null, productId: null };
    listing({ title: "Akce a slevy", crumbs: `<a href="#/">TechMarket</a> › Akce`, items: products.filter((p) => p.oldPrice || bundleMain.has(p.id)), key: "akce" });
  }

  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function search(q) {
    page = { type: "search", category: null, productId: null };
    const words = norm(q).split(/[^a-z0-9]+/).filter((w) => w.length > 1).map((w) => (w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2))));
    const res = products.filter((p) => {
      const text = norm(`${p.name} ${p.brand} ${catName(p.category)} ${p.description} ${p.tags.join(" ")} ${p.highlights.join(" ")}`);
      return words.length && words.every((w) => text.includes(w));
    });
    track("search", { query: q, results: res.length });
    if (!res.length) {
      app.innerHTML = `<div class="crumbs"><a href="#/">TechMarket</a> › Hledání</div><div class="box empty"><h1>Pro „${esc(q)}“ jsme nic nenašli</h1><p class="muted">Zkuste jiné slovo – nebo se zeptejte naší prodavačky Kláry vpravo dole, najde to i podle popisu.</p></div>`;
      return;
    }
    listing({ title: `Výsledky pro „${q}“`, crumbs: `<a href="#/">TechMarket</a> › Hledání`, items: res, key: "q:" + q });
  }

  function product(id) {
    const p = byId[id];
    if (!p) return notFound();
    page = { type: "product", category: p.category, productId: id };
    viewed = [...viewed.filter((v) => v !== id), id].slice(-12);
    save("tm_viewed", viewed);
    track("product_view", { productId: id });

    const promos = promotions.filter((pr) => pr.productIds.includes(id) || (pr.categories?.includes(p.category) && (!pr.minPrice || p.price >= pr.minPrice)) || (pr.id === "promo-splatky" && p.price >= pr.minPrice));
    const rel = (related[id] ?? []).map((r) => byId[r]).filter(Boolean);
    const fbt = [p, ...rel.slice(0, 2)];
    const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" });

    app.innerHTML = `
      <div class="crumbs"><a href="#/">TechMarket</a> › <a href="#/kategorie/${p.category}">${esc(catName(p.category))}</a> › ${esc(p.name)}</div>
      <div class="detail">
        <div class="gallery box">
          <div class="badges">${disc(p) ? `<span class="badge">−${disc(p)} %</span>` : ""}${topSellers.has(p.id) ? `<span class="badge top">TOP</span>` : ""}</div>
          <img src="${img(p)}" alt="${esc(p.name)}">
        </div>
        <div class="info">
          <a class="brand" href="#/kategorie/${p.category}">${esc(p.brand)}</a>
          <h1>${esc(p.name)}</h1>
          <div class="rating" style="font-size:13px"><span class="stars" style="font-size:13px">${stars(p.rating)}</span><b>${String(p.rating).replace(".", ",")}</b><small style="font-size:12.5px">${p.reviews} hodnocení · prodáno ${p.sold}× za měsíc</small></div>
          <ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
          ${promos.filter((pr) => pr.id !== "promo-splatky").map((pr) => `<div class="perk ${pr.type === "service" ? "service" : "deal"}"><i class="fa-solid ${pr.type === "service" ? "fa-shield-halved" : "fa-gift"}"></i><div><b>${esc(pr.title)}</b>${esc(pr.description)}</div></div>`).join("")}
        </div>
        <div class="pricebox box">
          ${p.oldPrice ? `<span class="old">Původně ${pr(p.oldPrice)}</span>` : ""}
          <div class="price">${pr(p.price)}</div>
          ${p.oldPrice ? `<div class="save">Ušetříte ${kc(p.oldPrice - p.price)} (−${disc(p)} %)</div>` : ""}
          <div class="stock ${p.stock <= 5 ? "low" : ""}"><i class="fa-solid fa-check"></i>${stockText(p)}</div>
          <div class="deliv">Doručíme ${tomorrow}, při objednání do 23:59</div>
          <div class="qty"><input type="number" id="qty" value="1" min="1" max="10" aria-label="Počet kusů"><button class="btn big green" id="add"><i class="fa-solid fa-cart-shopping"></i> Do košíku</button></div>
          ${p.price >= 5000 ? `<div class="inst">nebo na splátky 0 % – ${kc(p.price / 10)} × 10 měsíců</div>` : ""}
          <ul class="perks"><li><i class="fa-solid fa-rotate-left"></i>30 dní na vrácení</li><li><i class="fa-solid fa-shield-halved"></i>Záruka ${promos.some((x) => x.id === "promo-tv-zaruka") ? "5 let" : "2 roky"}</li><li><i class="fa-solid fa-store"></i>Osobní odběr zdarma v Praze a Brně</li><li><i class="fa-solid fa-truck-fast"></i>Doprava zdarma nad 1 500 Kč</li></ul>
        </div>
      </div>
      ${rel.length ? `
      <div class="fbt box">
        <h2>Často kupováno společně</h2>
        <div class="items">
          ${fbt.map((x, i) => `${i ? '<span class="plus">+</span>' : ""}<a class="it" href="#/produkt/${x.id}"><img src="${img(x)}" alt=""><div><div class="nm">${esc(x.name)}</div><b>${pr(x.price)}</b></div></a>`).join("")}
          <div class="sum"><div class="muted">Celkem</div><div class="price">${pr(fbt.reduce((s, x) => s + x.price, 0))}</div><button class="btn" id="addall" style="margin-top:8px">Koupit vše</button></div>
        </div>
      </div>` : ""}
      <div class="tabs box">
        <div class="tabbar"><button class="on" data-tab="desc">Popis</button><button data-tab="params">Parametry</button><button data-tab="rating">Hodnocení</button></div>
        <div id="tab"></div>
      </div>`;

    const tabs = {
      desc: `<p style="line-height:1.7;font-size:15px">${esc(p.description)}</p>`,
      params: `<table class="params">${Object.entries(p.params).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`,
      rating: `<p><span class="price">${p.rating}</span> / 5 <span class="stars">${stars(p.rating)}</span></p><p class="muted">${p.reviews} ověřených hodnocení zákazníků (demo).</p>`,
    };
    const tabEl = document.getElementById("tab");
    tabEl.innerHTML = tabs.desc;
    app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => {
      app.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
      tabEl.innerHTML = tabs[b.dataset.tab];
    }));
    document.getElementById("add").onclick = () => addToCart(id, Math.max(1, Math.min(10, Number(document.getElementById("qty").value) || 1)));
    const addAll = document.getElementById("addall");
    if (addAll) addAll.onclick = () => { fbt.forEach((x) => addToCart(x.id, 1, { silent: true })); toast("✓ Celý set je v košíku"); };
  }

  async function cartView() {
    page = { type: "cart", category: null, productId: null };
    const lines = cart.filter((c) => byId[c.id]);
    if (!lines.length) {
      app.innerHTML = `<div class="box empty"><h1>Košík je prázdný</h1><p class="muted">Nevíte, co vybrat? Zeptejte se Kláry vpravo dole.</p><a class="btn" href="#/">Pokračovat v nákupu</a></div>`;
      return;
    }
    const pc = await priceCart();
    const inCart = new Set(lines.map((l) => l.id));
    const extras = [...new Set(lines.flatMap((l) => (related[l.id]) ?? []))].filter((id) => !inCart.has(id)).map((id) => byId[id]).filter(Boolean).slice(0, 6);
    app.innerHTML = `
      <div class="steps"><span class="on">1. Košík</span><span>2. Doprava a platba</span><span>3. Údaje</span></div>
      <div class="cartwrap">
        <div class="box">
          ${lines.map((l) => { const p = byId[l.id]; return `
            <div class="line">
              <img src="${img(p)}" alt="">
              <div><a class="nm" href="#/produkt/${p.id}">${esc(p.name)}</a><div class="stock">${stockText(p)} · doručíme zítra</div></div>
              <div class="stepper"><button data-q="${p.id}" data-d="-1">−</button><span>${l.quantity}</span><button data-q="${p.id}" data-d="1">+</button></div>
              <div class="lp">${kc(p.price * l.quantity)}</div>
              <button class="rm" data-rm="${p.id}" aria-label="Odebrat">✕</button>
            </div>`; }).join("")}
        </div>
        <div class="summary box">
          <div class="r"><span>Mezisoučet</span><span>${kc(pc.subtotal)}</span></div>
          ${pc.discounts.map((d) => `<div class="r disc"><span>${esc(d.title)}</span><span>−${kc(d.amount)}</span></div>`).join("")}
          <div class="r"><span>Doprava</span><span>${pc.freeShippingRemaining ? "od 49 Kč" : "zdarma"}</span></div>
          <div class="ship">${pc.freeShippingRemaining ? `Do dopravy zdarma chybí <b>${kc(pc.freeShippingRemaining)}</b>` : "✓ Máte dopravu zdarma"}
            <div class="bar"><div style="width:${Math.min(100, (pc.total / pc.freeShippingFrom) * 100)}%"></div></div></div>
          <div class="r tot"><span>Celkem</span><span>${kc(pc.total)}</span></div>
          <button class="btn big" id="order" style="margin-top:14px">Pokračovat k objednávce</button>
          <p class="muted" style="font-size:12px;text-align:center">Demo – objednávka se neodešle</p>
        </div>
      </div>
      <div style="margin-top:28px">${shelf("s-extra", "K nákupu se hodí", extras)}</div>`;
    app.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { const l = cart.find((c) => c.id === b.dataset.q); setQty(l.id, l.quantity + Number(b.dataset.d)); }));
    app.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => setQty(b.dataset.rm, 0)));
    document.getElementById("order").onclick = () => {
      track("purchase", { value: pc.total });
      cart = []; save("tm_cart", cart); updateHeader();
      location.hash = "#/dekujeme";
    };
  }

  function thanks() {
    page = { type: "other", category: null, productId: null };
    app.innerHTML = `<div class="box thanks"><div class="big"><i class="fa-solid fa-circle-check"></i></div><h1>Děkujeme za objednávku!</h1><p class="muted">Tohle je demo – nic se neodesílá. Podívejte se, jak se nákup propsal do <a href="/admin/" style="color:var(--link)">dashboardu pro majitele</a>.</p><a class="btn" href="#/">Zpět do obchodu</a></div>`;
  }
  const notFound = () => { page = { type: "other" }; app.innerHTML = `<div class="box empty"><h1>Stránka nenalezena</h1><a class="btn" href="#/">Zpět na úvod</a></div>`; };

  function route() {
    const [, view, ...rest] = (location.hash || "#/").split("/");
    const arg = decodeURIComponent(rest.join("/"));
    page = { type: "home", category: null, productId: null };
    app.classList.toggle("padded", Boolean(view)); // home has its own sidebar layout
    if (!view) home();
    else if (view === "kategorie") category(arg);
    else if (view === "produkt") product(arg);
    else if (view === "kosik") cartView();
    else if (view === "hledat") search(arg);
    else if (view === "akce") deals();
    else if (view === "dekujeme") thanks();
    else notFound();
    track("page_view");
    scrollTo(0, 0);
  }

  function toast(text) {
    const t = Object.assign(document.createElement("div"), { className: "toast", textContent: text });
    document.body.append(t);
    setTimeout(() => t.remove(), 2200);
  }


  document.getElementById("search").onsubmit = (e) => {
    e.preventDefault();
    const q = e.target.querySelector("input").value.trim();
    if (q) location.hash = `#/hledat/${encodeURIComponent(q)}`;
  };
  addEventListener("hashchange", route);
  updateHeader();
  route();
})();
