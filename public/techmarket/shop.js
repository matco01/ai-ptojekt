// Demo shop front-end (hash router, cart in localStorage) + integration hooks for the AI widget.
// Czech or English (demo-lang.js): the texts below, the catalogue from /api/catalog?lang= and the
// assistant all follow the same choice.
(async () => {
  const L = window.DemoLang ?? { lang: "cs", locale: "cs-CZ", use: () => (k) => k, apply() {} };
  const EN = L.lang === "en";
  const t = L.use({
    cs: {
      added: (n) => `✓ ${n} je v košíku`, setAdded: "✓ Celý set je v košíku", stockMany: "Skladem > 5 ks", stockFew: (n) => `Skladem ${n} ks`, toOrder: "Na objednávku",
      bundleGift: "+ dárek v setu", toCart: "Do košíku", addNamed: (n) => `Přidat ${n} do košíku`, more: "Více »", nextProducts: "Další produkty",
      categories: "Kategorie", clubDeals: "Klub+ slevy", laptopWeek: "Týden notebooků", tradeIn: "Výkup telefonů", installments: "Splátky 0 %", services: "Instalace a služby",
      s1kicker: "tech<b>market</b>+ ti právě teď", s1title: "přináší <u>slevy</u><br>na stovky produktů",
      s2kicker: "jen do neděle", s2title: "RoboClean S8<br>o <u>3 000 Kč</u> levněji", s3kicker: "5 let záruka zdarma", s3title: "OLED televize<br>Aurora <u>−17 %</u>",
      moreBtn: "Více", buyNow: "Kup teď", p1brand: "tech <span>% dny</span>", p1title: "Ušetři za elektroniku na doma i do školy",
      p2brand: "výkup <span style=\"background:var(--blue)\">+ bonus</span>", p2title: "Nový mobil s bonusem až 3 000 Kč", p2text: "Při nákupu mobilu nad 10 000 Kč vykoupíme váš starý telefon.",
      p3text: "Vysává i mopuje, sám se vysype. Jen do neděle.", freeDelivery: "Doprava zdarma", zeroInst: "0 % splátky",
      lastViewed: "Naposledy jste si prohlíželi", forYou: "Mohlo by se vám hodit", weekDeals: "Akce týdne", bestPhones: "To nejlepší z mobilů", bestsellers: "Nejprodávanější",
      endsIn: (d) => `končí za ${d}`, price: "Cena", from: "od", to: "do", maker: "Výrobce", other: "Ostatní", onlySale: "Jen ve slevě",
      sortSold: "Nejprodávanější", sortCheap: "Nejlevnější", sortExp: "Nejdražší", sortRating: "Nejlépe hodnocené", noMatch: "Filtrům neodpovídá žádný produkt.", count: (n) => `${n} produktů`,
      deals: "Akce a slevy", dealsCrumb: "Akce", search: "Hledání", nothing: (q) => `Pro „${q}“ jsme nic nenašli`, nothingHint: "Zkuste jiné slovo – nebo se zeptejte naší prodavačky vpravo dole, najde to i podle popisu.",
      results: (q) => `Výsledky pro „${q}“`, reviews: (r, s) => `${r} hodnocení · prodáno ${s}× za měsíc`, was: "Původně", save: (a, p) => `Ušetříte ${a} (−${p} %)`,
      deliver: (d) => `Doručíme ${d}, při objednání do 23:59`, qty: "Počet kusů", instalment: (a) => `nebo na splátky 0 % – ${a} × 10 měsíců`,
      ret30: "30 dní na vrácení", warranty: (y) => `Záruka ${y}`, y5: "5 let", y2: "2 roky", pickup: "Osobní odběr zdarma v Praze a Brně", freeOver: "Doprava zdarma nad 1 500 Kč",
      fbt: "Často kupováno společně", total: "Celkem", buyAll: "Koupit vše", tabDesc: "Popis", tabParams: "Parametry", tabRating: "Hodnocení", verified: (n) => `${n} ověřených hodnocení zákazníků (demo).`,
      emptyCart: "Košík je prázdný", emptyHint: "Nevíte, co vybrat? Zeptejte se naší prodavačky vpravo dole.", keepShopping: "Pokračovat v nákupu",
      step1: "1. Košík", step2: "2. Doprava a platba", step3: "3. Údaje", tomorrow: "doručíme zítra", remove: "Odebrat", subtotal: "Mezisoučet", delivery: "Doprava",
      shipFrom: "od 49 Kč", free: "zdarma", toFree: (a) => `Do dopravy zdarma chybí <b>${a}</b>`, haveFree: "✓ Máte dopravu zdarma", toOrderBtn: "Pokračovat k objednávce",
      demoOrder: "Demo – objednávka se neodešle", fits: "K nákupu se hodí", thanks: "Děkujeme za objednávku!",
      thanksText: "Tohle je demo – nic se neodesílá. Podívejte se, jak se nákup propsal do <a href=\"/admin/\" style=\"color:var(--link)\">přehledu pro majitele</a>.",
      backShop: "Zpět do obchodu", notFound: "Stránka nenalezena", backHome: "Zpět na úvod", banner: (i) => `Banner ${i}`,
      "h.demo": "DEMO obchod pro ukázku AI prodavačky – smyšlené produkty, nic se neprodává", "h.home": "TechMarket – úvod", "h.search": "Co hledáte? Např. sluchátka, notebook do školy…",
      "h.searchLabel": "Hledat", "h.searchBtn": "Hledat", "h.nav": "Účet a košík", "h.my": "Můj TechMarket", "h.login": "Přihlásit se", "h.orders": "Objednávky", "h.fav": "Oblíbené", "h.cart": "Košík",
      "h.club": "S <span class=\"plus\">Klubem+</span><br><span class=\"big\">ušetříš</span><br>pokaždé,<br>když<br>nakoupíš", "h.more": "Více",
      "f.buy": "Nákup", "f.ship": "Doprava a platba", "f.inst": "Splátky 0 %", "f.trade": "Výkup telefonů", "f.services": "Služby", "f.claims": "Reklamace", "f.tv": "Instalace TV", "f.warranty": "Prodloužená záruka",
      "f.contact": "Kontakt", "f.stores": "Prodejny Praha · Brno", "f.about": "O projektu", "f.aboutText": "Ukázka AI prodavačky pro e-shopy.", "f.dash": "Přehled pro majitele →", "f.sella": "Sella – úvodní stránka",
    },
    en: {
      added: (n) => `✓ ${n} is in your cart`, setAdded: "✓ The whole set is in your cart", stockMany: "In stock > 5", stockFew: (n) => `In stock: ${n}`, toOrder: "On order",
      bundleGift: "+ gift in a set", toCart: "Add to cart", addNamed: (n) => `Add ${n} to cart`, more: "More »", nextProducts: "More products",
      categories: "Categories", clubDeals: "Club+ deals", laptopWeek: "Laptop week", tradeIn: "Phone trade-in", installments: "0 % instalments", services: "Installation & services",
      s1kicker: "tech<b>market</b>+ right now", s1title: "brings <u>discounts</u><br>on hundreds of products",
      s2kicker: "until Sunday only", s2title: "RoboClean S8<br><u>3,000 CZK</u> off", s3kicker: "5-year warranty free", s3title: "OLED TVs<br>Aurora <u>−17 %</u>",
      moreBtn: "More", buyNow: "Buy now", p1brand: "tech <span>% days</span>", p1title: "Save on electronics for home and school",
      p2brand: "trade-in <span style=\"background:var(--blue)\">+ bonus</span>", p2title: "A new phone with a bonus of up to 3,000 CZK", p2text: "Buy a phone over 10,000 CZK and we'll buy back your old one.",
      p3text: "Vacuums and mops, empties itself. Until Sunday only.", freeDelivery: "Free delivery", zeroInst: "0 % instalments",
      lastViewed: "Recently viewed", forYou: "You might also like", weekDeals: "Deals of the week", bestPhones: "Best of phones", bestsellers: "Bestsellers",
      endsIn: (d) => `ends in ${d}`, price: "Price", from: "from", to: "to", maker: "Brand", other: "Other", onlySale: "On sale only",
      sortSold: "Bestselling", sortCheap: "Cheapest", sortExp: "Most expensive", sortRating: "Top rated", noMatch: "No product matches the filters.", count: (n) => `${n} products`,
      deals: "Deals & discounts", dealsCrumb: "Deals", search: "Search", nothing: (q) => `Nothing found for "${q}"`, nothingHint: "Try another word – or ask our shop assistant at the bottom right, who can find it from a description too.",
      results: (q) => `Results for "${q}"`, reviews: (r, s) => `${r} reviews · ${s} sold this month`, was: "Was", save: (a, p) => `You save ${a} (−${p} %)`,
      deliver: (d) => `Delivered ${d} if you order by 23:59`, qty: "Quantity", instalment: (a) => `or 0 % instalments – ${a} × 10 months`,
      ret30: "30 days to return", warranty: (y) => `${y} warranty`, y5: "5-year", y2: "2-year", pickup: "Free pick-up in Prague and Brno", freeOver: "Free delivery over 1,500 CZK",
      fbt: "Frequently bought together", total: "Total", buyAll: "Buy all", tabDesc: "Description", tabParams: "Specs", tabRating: "Reviews", verified: (n) => `${n} verified customer reviews (demo).`,
      emptyCart: "Your cart is empty", emptyHint: "Not sure what to choose? Ask our shop assistant at the bottom right.", keepShopping: "Continue shopping",
      step1: "1. Cart", step2: "2. Delivery & payment", step3: "3. Details", tomorrow: "delivered tomorrow", remove: "Remove", subtotal: "Subtotal", delivery: "Delivery",
      shipFrom: "from 49 CZK", free: "free", toFree: (a) => `<b>${a}</b> to free delivery`, haveFree: "✓ You have free delivery", toOrderBtn: "Continue to checkout",
      demoOrder: "Demo – no order is sent", fits: "Goes well with your order", thanks: "Thank you for your order!",
      thanksText: "This is a demo – nothing is sent. See how the purchase shows up in the <a href=\"/admin/\" style=\"color:var(--link)\">owner's insights</a>.",
      backShop: "Back to the shop", notFound: "Page not found", backHome: "Back home", banner: (i) => `Banner ${i}`,
      "h.demo": "DEMO shop showing the AI salesperson – made-up products, nothing is for sale", "h.home": "TechMarket – home", "h.search": "What are you looking for? E.g. headphones, a laptop for school…",
      "h.searchLabel": "Search", "h.searchBtn": "Search", "h.nav": "Account and cart", "h.my": "My TechMarket", "h.login": "Sign in", "h.orders": "Orders", "h.fav": "Favourites", "h.cart": "Cart",
      "h.club": "With <span class=\"plus\">Club+</span><br><span class=\"big\">you save</span><br>every<br>time<br>you shop", "h.more": "More",
      "f.buy": "Shopping", "f.ship": "Delivery & payment", "f.inst": "0 % instalments", "f.trade": "Phone trade-in", "f.services": "Services", "f.claims": "Complaints", "f.tv": "TV installation", "f.warranty": "Extended warranty",
      "f.contact": "Contact", "f.stores": "Stores in Prague · Brno", "f.about": "About", "f.aboutText": "A demo of the AI salesperson for online shops.", "f.dash": "Owner insights →", "f.sella": "Sella – home page",
    },
  });

  const app = document.getElementById("app");
  const { categories, products, promotions, related } = await (await fetch(`/api/catalog?lang=${L.lang}`)).json();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const catName = (id) => categories.find((c) => c.id === id)?.name ?? id;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const kc = (n) => (EN ? Math.round(n).toLocaleString("en-GB") + " CZK" : Math.round(n).toLocaleString("cs-CZ") + " Kč");
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
    if (!silent) toast(t("added", byId[id].name));
    if (page.type === "cart") route();
  }
  function setQty(id, q) {
    const before = cart.find((c) => c.id === id)?.quantity ?? 0;
    if (q < before) track("cart_remove", { productId: id });
    cart = q > 0 ? cart.map((c) => (c.id === id ? { ...c, quantity: q } : c)) : cart.filter((c) => c.id !== id);
    save("tm_cart", cart);
    updateHeader();
    route();
  }
  const priceCart = () => fetch("/api/cart/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client: "techmarket", lang: L.lang, cart }) }).then((r) => r.json());
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
      for (const [ty, d] of pending.splice(0)) window.AIProdavac.track(ty, d);
      window.AIProdavac.track(type, data);
    } else pending.push([type, data]);
  }
  addEventListener("load", () => { if (window.AIProdavac?.track) for (const [ty, d] of pending.splice(0)) window.AIProdavac.track(ty, d); });

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
    onRemoveFromCart: (item) => {
      const line = cart.find((c) => c.id === item.id);
      if (!line) return;
      const q = Math.max(0, line.quantity - (item.quantity ?? line.quantity));
      cart = q ? cart.map((c) => (c.id === item.id ? { ...c, quantity: q } : c)) : cart.filter((c) => c.id !== item.id);
      save("tm_cart", cart);
      updateHeader();
      if (page.type === "cart") cartView(); // re-render only the cart page, don't jump anywhere else
    },
    onOpenProduct: (id) => (location.hash = `#/produkt/${id}`),
  });

  // ---- building blocks ----
  const CAT_ICON = {
    mobily: "fa-mobile-screen-button", notebooky: "fa-laptop", tv: "fa-tv", audio: "fa-headphones", hodinky: "fa-clock",
    tablety: "fa-tablet-screen-button", herni: "fa-gamepad", prislusenstvi: "fa-plug", domacnost: "fa-blender",
  };
  const pr = (n) => (EN ? Math.round(n).toLocaleString("en-GB") + " CZK" : Math.round(n).toLocaleString("cs-CZ") + ",-"); // "21 490,-" price style
  const dec = (n) => (EN ? String(n) : String(n).replace(".", ","));
  const stars = (r) => {
    const full = Math.floor(r), half = r - full >= 0.3 && r - full < 0.8, fullish = r - full >= 0.8;
    return [...Array(5)].map((_, i) => `<i class="fa-${i < full + (fullish ? 1 : 0) ? "solid fa-star" : i === full && half ? "solid fa-star-half-stroke" : "regular fa-star"}"></i>`).join("");
  };
  const ratingRow = (p) => `<div class="rating"><span class="stars">${stars(p.rating)}</span><b>${dec(p.rating)}</b><small>${p.reviews}×</small></div>`;
  const stockText = (p) => (p.stock > 5 ? t("stockMany") : p.stock > 0 ? t("stockFew", p.stock) : t("toOrder"));
  const tile = (p) => `
    <div class="tile">
      <div class="badges">
        ${disc(p) ? `<span class="badge">−${disc(p)} %</span>` : ""}
        ${bundleMain.has(p.id) ? `<span class="badge tip">${t("bundleGift")}</span>` : ""}
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
        <button class="add" data-add="${p.id}" title="${t("toCart")}" aria-label="${esc(t("addNamed", p.name))}"><i class="fa-solid fa-cart-shopping"></i></button>
      </div>
    </div>`;
  const shelf = (id, title, items, { more, extra = "" } = {}) => items.length ? `
    <section class="shelf">
      <div class="shelf-h"><h2>${title}${extra}</h2>${more ? `<a class="more" href="${more}">${t("more")}</a>` : ""}</div>
      <div class="shelf-body">
        <div class="shelf-row" id="${id}">${items.map(tile).join("")}</div>
        ${items.length > 6 ? `<button class="arrow next" data-scroll="${id}" aria-label="${t("nextProducts")}"><i class="fa-solid fa-chevron-right"></i></button>` : ""}
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
      { id: "m1", bg: "linear-gradient(100deg,#1c2a72 0%,#223394 55%,#1c296f 100%)", glow: "#3b82f6", kicker: t("s1kicker"), title: t("s1title"), link: "#/akce" },
      { id: "h1", bg: "linear-gradient(100deg,#3b1a78 0%,#5b2a9e 60%,#3b1a78 100%)", glow: "#c084fc", kicker: t("s2kicker"), title: t("s2title"), link: "#/produkt/h1" },
      { id: "t1", bg: "linear-gradient(100deg,#0f1b33 0%,#1d3557 60%,#0f1b33 100%)", glow: "#38bdf8", kicker: t("s3kicker"), title: t("s3title"), link: "#/produkt/t1" },
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
        <nav class="side" aria-label="${t("categories")}">
          <a class="hot" href="#/akce"><i class="fa-solid fa-percent"></i>${t("clubDeals")}</a>
          <a class="hot red" href="#/kategorie/notebooky"><i class="fa-solid fa-tags"></i>${t("laptopWeek")}</a>
          <div class="sep"></div>
          ${categories.map((c) => `<a href="#/kategorie/${c.id}"><i class="fa-solid ${CAT_ICON[c.id] ?? "fa-box"}"></i>${esc(c.name)}</a>`).join("")}
          <div class="sep"></div>
          <a href="#/kategorie/mobily"><i class="fa-solid fa-rotate"></i>${t("tradeIn")}</a>
          <a href="#/akce"><i class="fa-solid fa-credit-card"></i>${t("installments")}</a>
          <a href="#/kategorie/tv"><i class="fa-solid fa-screwdriver-wrench"></i>${t("services")}</a>
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
                  <a class="btn" href="${s.link}">${t("moreBtn")}</a>
                </div>
                <div class="art">
                  <span class="coin c1">+</span><span class="coin c2">%</span><span class="coin c3">+</span>
                  <img src="${img(byId[s.id])}" alt="">
                </div>
              </div>`).join("")}
            <div class="dots">${slides.map((_, i) => `<button class="${i ? "" : "on"}" data-i="${i}" aria-label="${t("banner", i + 1)}"></button>`).join("")}</div>
          </div>

          <section class="promos">
            <div class="pc dark">
              <div class="brandline">${t("p1brand")}</div>
              <h3>${t("p1title")}</h3>
              <span class="tag" style="right:118px;top:30px">−15 %</span>
              <span class="tag" style="right:12px;top:62px">−13 %</span>
              <span class="tag" style="right:70px;bottom:22px">−23 %</span>
              <img class="pimg" src="${img(byId.n3)}" alt="">
              <a class="btn" href="#/akce">${t("buyNow")}</a>
            </div>
            <div class="pc light">
              <div class="brandline" style="color:var(--navy)">${t("p2brand")}</div>
              <h3>${t("p2title")}</h3>
              <p>${t("p2text")}</p>
              <img class="pimg" src="${img(byId.m1)}" alt="">
              <a class="btn" href="#/kategorie/mobily">${t("buyNow")}</a>
            </div>
            <div class="pc light">
              <div class="brandline" style="color:#7a3fb8">RoboClean</div>
              <h3>RoboClean S8 <span style="color:var(--red);white-space:nowrap">−23 %</span></h3>
              <p>${t("p3text")}</p>
              <div class="chips"><span class="chip">${t("freeDelivery")}</span><span class="chip r">${t("zeroInst")}</span></div>
              <img class="pimg" src="${img(byId.h1)}" alt="">
              <a class="btn" href="#/produkt/h1">${t("buyNow")}</a>
            </div>
          </section>

          ${shelf("s-last", t("lastViewed"), lastViewed)}
          ${shelf("s-foryou", t("forYou"), forYou)}
          ${shelf("s-deals", t("weekDeals"), weekDeals, { more: "#/akce", extra: ` <span class="countdown" id="countdown"></span>` })}
          ${shelf("s-phones", t("bestPhones"), novaPhones, { more: "#/kategorie/mobily" })}
          ${shelf("s-best", t("bestsellers"), bestsellers)}
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
      el.textContent = t("endsIn", `${d ? d + " d " : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`);
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
          <h4>${t("price")}</h4>
          <div class="range"><input type="number" id="fmin" placeholder="${t("from")}" value="${f.min}"> – <input type="number" id="fmax" placeholder="${t("to")}" value="${f.max}"></div>
          <h4>${t("maker")}</h4>
          ${brands.map((b) => `<label><input type="checkbox" data-brand="${esc(b)}" ${f.brands.has(b) ? "checked" : ""}> ${esc(b)}</label>`).join("")}
          <h4>${t("other")}</h4>
          <label><input type="checkbox" id="fsale" ${f.sale ? "checked" : ""}> ${t("onlySale")}</label>
        </aside>
        <div>
          <div class="sortbar">
            ${[["sold", t("sortSold")], ["cheap", t("sortCheap")], ["exp", t("sortExp")], ["rating", t("sortRating")]].map(([k, l]) => `<button data-sort="${k}" class="${f.sort === k ? "on" : ""}">${l}</button>`).join("")}
            <span class="cnt" id="cnt"></span>
          </div>
          <div class="grid" id="grid"></div>
        </div>
      </div>`;
    const render = () => {
      let list = items.filter((p) => (!f.brands.size || f.brands.has(p.brand)) && (!f.sale || p.oldPrice) && (!f.min || p.price >= +f.min) && (!f.max || p.price <= +f.max));
      const sorters = { sold: (a, b) => b.sold - a.sold, cheap: (a, b) => a.price - b.price, exp: (a, b) => b.price - a.price, rating: (a, b) => b.rating - a.rating };
      list = list.sort(sorters[f.sort]);
      document.getElementById("grid").innerHTML = list.length ? list.map(tile).join("") : `<p class="muted">${t("noMatch")}</p>`;
      document.getElementById("cnt").textContent = t("count", list.length);
    };
    app.querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => { track("filter_change"); f.sort = b.dataset.sort; app.querySelectorAll("[data-sort]").forEach((x) => x.classList.toggle("on", x === b)); render(); }));
    app.querySelectorAll("[data-brand]").forEach((c) => (c.onchange = () => { track("filter_change"); c.checked ? f.brands.add(c.dataset.brand) : f.brands.delete(c.dataset.brand); render(); }));
    document.getElementById("fsale").onchange = (e) => { track("filter_change"); f.sale = e.target.checked; render(); };
    document.getElementById("fmin").oninput = (e) => { f.min = e.target.value; render(); };
    document.getElementById("fmax").oninput = (e) => { f.max = e.target.value; render(); };
    for (const id of ["fmin", "fmax"]) document.getElementById(id).onchange = () => track("filter_change");
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
    listing({ title: t("deals"), crumbs: `<a href="#/">TechMarket</a> › ${t("dealsCrumb")}`, items: products.filter((p) => p.oldPrice || bundleMain.has(p.id)), key: "akce" });
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
      app.innerHTML = `<div class="crumbs"><a href="#/">TechMarket</a> › ${t("search")}</div><div class="box empty"><h1>${esc(t("nothing", q))}</h1><p class="muted">${t("nothingHint")}</p></div>`;
      return;
    }
    listing({ title: t("results", q), crumbs: `<a href="#/">TechMarket</a> › ${t("search")}`, items: res, key: "q:" + q });
  }

  function product(id) {
    const p = byId[id];
    if (!p) return notFound();
    page = { type: "product", category: p.category, productId: id };
    viewed = [...viewed.filter((v) => v !== id), id].slice(-12);
    save("tm_viewed", viewed);
    track("product_view", { productId: id });

    const promos = promotions.filter((x) => x.productIds.includes(id) || (x.categories?.includes(p.category) && (!x.minPrice || p.price >= x.minPrice)) || (x.id === "promo-splatky" && p.price >= x.minPrice));
    const rel = (related[id] ?? []).map((r) => byId[r]).filter(Boolean);
    const fbt = [p, ...rel.slice(0, 2)];
    const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString(L.locale, { weekday: "long", day: "numeric", month: EN ? "long" : "numeric" });

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
          <div class="rating" style="font-size:13px"><span class="stars" style="font-size:13px">${stars(p.rating)}</span><b>${dec(p.rating)}</b><small style="font-size:12.5px">${t("reviews", p.reviews, p.sold)}</small></div>
          <ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
          ${promos.filter((x) => x.id !== "promo-splatky").map((x) => `<div class="perk ${x.type === "service" ? "service" : "deal"}"><i class="fa-solid ${x.type === "service" ? "fa-shield-halved" : "fa-gift"}"></i><div><b>${esc(x.title)}</b>${esc(x.description)}</div></div>`).join("")}
        </div>
        <div class="pricebox box">
          ${p.oldPrice ? `<span class="old">${t("was")} ${pr(p.oldPrice)}</span>` : ""}
          <div class="price">${pr(p.price)}</div>
          ${p.oldPrice ? `<div class="save">${t("save", kc(p.oldPrice - p.price), disc(p))}</div>` : ""}
          <div class="stock ${p.stock <= 5 ? "low" : ""}"><i class="fa-solid fa-check"></i>${stockText(p)}</div>
          <div class="deliv">${t("deliver", tomorrow)}</div>
          <div class="qty"><input type="number" id="qty" value="1" min="1" max="10" aria-label="${t("qty")}"><button class="btn big green" id="add"><i class="fa-solid fa-cart-shopping"></i> ${t("toCart")}</button></div>
          ${p.price >= 5000 ? `<div class="inst">${t("instalment", kc(p.price / 10))}</div>` : ""}
          <ul class="perks"><li><i class="fa-solid fa-rotate-left"></i>${t("ret30")}</li><li><i class="fa-solid fa-shield-halved"></i>${t("warranty", promos.some((x) => x.id === "promo-tv-zaruka") ? t("y5") : t("y2"))}</li><li><i class="fa-solid fa-store"></i>${t("pickup")}</li><li><i class="fa-solid fa-truck-fast"></i>${t("freeOver")}</li></ul>
        </div>
      </div>
      ${rel.length ? `
      <div class="fbt box">
        <h2>${t("fbt")}</h2>
        <div class="items">
          ${fbt.map((x, i) => `${i ? '<span class="plus">+</span>' : ""}<a class="it" href="#/produkt/${x.id}"><img src="${img(x)}" alt=""><div><div class="nm">${esc(x.name)}</div><b>${pr(x.price)}</b></div></a>`).join("")}
          <div class="sum"><div class="muted">${t("total")}</div><div class="price">${pr(fbt.reduce((s, x) => s + x.price, 0))}</div><button class="btn" id="addall" style="margin-top:8px">${t("buyAll")}</button></div>
        </div>
      </div>` : ""}
      <div class="tabs box">
        <div class="tabbar"><button class="on" data-tab="desc">${t("tabDesc")}</button><button data-tab="params">${t("tabParams")}</button><button data-tab="rating">${t("tabRating")}</button></div>
        <div id="tab"></div>
      </div>`;

    const tabs = {
      desc: `<p style="line-height:1.7;font-size:15px">${esc(p.description)}</p>`,
      params: `<table class="params">${Object.entries(p.params).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`,
      rating: `<p><span class="price">${p.rating}</span> / 5 <span class="stars">${stars(p.rating)}</span></p><p class="muted">${t("verified", p.reviews)}</p>`,
    };
    const tabEl = document.getElementById("tab");
    tabEl.innerHTML = tabs.desc;
    app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => {
      track("tab_view", { tab: b.dataset.tab });
      app.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
      tabEl.innerHTML = tabs[b.dataset.tab];
    }));
    const addBtn = document.getElementById("add");
    let hoverTimer = null;
    addBtn.onmouseenter = () => { hoverTimer = setTimeout(() => track("hover_add", { productId: id }), 1200); };
    addBtn.onmouseleave = () => clearTimeout(hoverTimer);
    addBtn.onclick = () => clearTimeout(hoverTimer) || addToCart(id, Math.max(1, Math.min(10, Number(document.getElementById("qty").value) || 1)));
    const addAll = document.getElementById("addall");
    if (addAll) addAll.onclick = () => { fbt.forEach((x) => addToCart(x.id, 1, { silent: true })); toast(t("setAdded")); };
  }

  async function cartView() {
    page = { type: "cart", category: null, productId: null };
    const lines = cart.filter((c) => byId[c.id]);
    if (!lines.length) {
      app.innerHTML = `<div class="box empty"><h1>${t("emptyCart")}</h1><p class="muted">${t("emptyHint")}</p><a class="btn" href="#/">${t("keepShopping")}</a></div>`;
      return;
    }
    const pc = await priceCart();
    const inCart = new Set(lines.map((l) => l.id));
    const extras = [...new Set(lines.flatMap((l) => (related[l.id]) ?? []))].filter((id) => !inCart.has(id)).map((id) => byId[id]).filter(Boolean).slice(0, 6);
    app.innerHTML = `
      <div class="steps"><span class="on">${t("step1")}</span><span>${t("step2")}</span><span>${t("step3")}</span></div>
      <div class="cartwrap">
        <div class="box">
          ${lines.map((l) => { const p = byId[l.id]; return `
            <div class="line">
              <img src="${img(p)}" alt="">
              <div><a class="nm" href="#/produkt/${p.id}">${esc(p.name)}</a><div class="stock">${stockText(p)} · ${t("tomorrow")}</div></div>
              <div class="stepper"><button data-q="${p.id}" data-d="-1">−</button><span>${l.quantity}</span><button data-q="${p.id}" data-d="1">+</button></div>
              <div class="lp">${kc(p.price * l.quantity)}</div>
              <button class="rm" data-rm="${p.id}" aria-label="${t("remove")}">✕</button>
            </div>`; }).join("")}
        </div>
        <div class="summary box">
          <div class="r"><span>${t("subtotal")}</span><span>${kc(pc.subtotal)}</span></div>
          ${pc.discounts.map((d) => `<div class="r disc"><span>${esc(d.title)}</span><span>−${kc(d.amount)}</span></div>`).join("")}
          <div class="r"><span>${t("delivery")}</span><span>${pc.freeShippingRemaining ? t("shipFrom") : t("free")}</span></div>
          <div class="ship">${pc.freeShippingRemaining ? t("toFree", kc(pc.freeShippingRemaining)) : t("haveFree")}
            <div class="bar"><div style="width:${Math.min(100, (pc.total / pc.freeShippingFrom) * 100)}%"></div></div></div>
          <div class="r tot"><span>${t("total")}</span><span>${kc(pc.total)}</span></div>
          <button class="btn big" id="order" style="margin-top:14px">${t("toOrderBtn")}</button>
          <p class="muted" style="font-size:12px;text-align:center">${t("demoOrder")}</p>
        </div>
      </div>
      <div style="margin-top:28px">${shelf("s-extra", t("fits"), extras)}</div>`;
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
    app.innerHTML = `<div class="box thanks"><div class="big"><i class="fa-solid fa-circle-check"></i></div><h1>${t("thanks")}</h1><p class="muted">${t("thanksText")}</p><a class="btn" href="#/">${t("backShop")}</a></div>`;
  }
  const notFound = () => { page = { type: "other" }; app.innerHTML = `<div class="box empty"><h1>${t("notFound")}</h1><a class="btn" href="#/">${t("backHome")}</a></div>`; };

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
    const el = Object.assign(document.createElement("div"), { className: "toast", textContent: text });
    document.body.append(el);
    setTimeout(() => el.remove(), 2200);
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
