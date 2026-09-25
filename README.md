# AI obchodní prodavač – prototyp

AI prodavačka pro e-shopy. Hned po příchodu na web se zákazníka zeptá, jestli chce poradit, nebo se porozhlédne sám. Pak se chová jako dobrá prodavačka v kamenném obchodě. Sleduje, co zákazník dělá, a ozve se ve správnou chvíli, třeba s akcí, kterou by jinak přehlédl. Přitom není otravná.

| Část | Adresa | Co to je |
|---|---|---|
| Demo e-shop | http://localhost:3000/ | Smyšlený obchod s elektronikou „TechMarket“ ve stylu velkých českých e-shopů (38 produktů, akce, sety, filtry, košík) |
| AI prodavačka | vpravo dole | Widget, který se vkládá na libovolný web jedním řádkem |
| Dashboard | http://localhost:3000/admin/ | Chování zákazníků, výkon prodavačky a AI doporučení pro majitele |
| Ukázka jiného webu | http://localhost:3000/demo/kavarna.html | Tmavý web kavárny: stejná prodavačka se sama přebarví a převezme písmo |

## Nasazení na Vercel

Projekt běží na Vercelu bez dalšího nastavení (Express se detekuje sám ze `server.js`).

1. **Import repozitáře:** ve Vercelu zvolte Add New → Project, vyberte repozitář a nechte výchozí nastavení (Framework Preset: Express / Other, žádný build command).
2. **Proměnné prostředí:** v Settings → Environment Variables nastavte `ANTHROPIC_API_KEY` a volitelně `ELEVENLABS_API_KEY`. Soubor `.env.local` se na Vercel nenahrává.
3. **Deploy.** Každý push na `main` nasadí novou verzi.

**Co se na Vercelu chová jinak:**
- Statické soubory servíruje Vercel přímo ze složky `public/` (`/` = e-shop, `/admin/`, `/demo/kavarna.html`, `/widget/prodavac.js`).
- Konverzace přežije i přeskočení mezi instancemi, protože widget posílá s každou zprávou i dosavadní přepis.
- **Data dashboardu a vymyšlená jména se ukládají jen do dočasné složky.** Jsou pro každou instanci zvlášť a po restartu zmizí. Pro trvalá data je potřeba databáze (např. Upstash Redis z Vercel Marketplace).

## Spuštění

Potřebujete Node.js 22+.

```bash
npm install
npm start
```

**Funguje i bez Claude API.** Pozdrav, proaktivní tipy a celý e-shop běží bez API. Chat pak odpovídá zjednodušeně (vyhledá produkty, odpoví na dotazy k dopravě apod.) a ukáže poznámku „ukázkový režim bez AI“.

Pro plnou AI dejte `ANTHROPIC_API_KEY` do souboru `.env.local` (nebo `.env`, vzor je v `.env.example`) (z https://platform.claude.com/) a restartujte server.

Tip na ukázku: v dashboardu klikněte na **„Naplnit demo daty“**. Vygeneruje se ~180 simulovaných návštěv.

## Jak se prodavačka chová

**1. Hned při příchodu se otevře pop-up okno (po ~1 s).** Pozdrav se přizpůsobí situaci:
- na úvodní stránce: „Dobrý den, vítejte… Chcete s něčím poradit, nebo se radši porozhlédnete sami?“
- na produktu: „Vidím, že vás zajímá Nova X15 Pro…“
- v kategorii: „Vybíráte notebooky?…“
- vracejícímu se zákazníkovi: „Vítejte zpátky! Minule vás zaujal Vektor Air 14…“

Zákazník si vybere 🎙️ **Promluvit si**, 💬 **Napsat**, nebo **„Děkuji, jen se dívám“**. Na odmítnutí odpoví jako člověk („Jasně, v klidu se porozhlédněte…“) a ustoupí.

**2. Sleduje chování a ozve se ve správnou chvíli.** Tipy vždy vycházejí z katalogu, takže si nic nevymýšlí.

| Situace | Co prodavačka udělá |
|---|---|
| Zákazník si prohlíží produkt, ke kterému je set se slevou | „Malý tip, který se snadno přehlédne: když si vezmete X15 Pro, dostanete sluchátka za polovic.“ |
| Do dopravy zdarma chybí málo | „Chybí vám jen 210 Kč – hodil by se třeba HDMI kabel za 290 Kč.“ |
| Hledání nic nenašlo | „Na ‚iphone‘ vyhledávání nic nenašlo. Řekněte mi, k čemu to potřebujete…“ |
| Produkt má službu (výkup, prodloužená záruka) | „Dobré vědět: k TV Aurora záruka 5 let zdarma.“ |
| V kategorii je výrazná sleva, kterou neviděl | „Jen ať vám to neuteče: RoboClean S8 je teď o 3 000 Kč levněji.“ |
| Košík bez typického příslušenství | „K telefonu si lidé berou i nabíječku – nové telefony se dodávají bez ní.“ |

**3. Pozná, když zákazník váhá, a sama nabídne pomoc, i když ji na začátku odmítl.** Jako prodavačka, která vidí, že někdo dlouho stojí u regálu. Text nabídky napíše Claude přesně pro danou situaci (bez API se použije připravený text).

| Co zákazník dělá | Co Klára pozná | Příklad nabídky |
|---|---|---|
| Přechází mezi produkty tam a zpátky (A → B → A) | Nemůže se rozhodnout | „Nechci rušit, ale vypadá to, že vybíráte mezi Lumen Book 15 a Vektor Air 14 – mám je porovnat?“ |
| Dlouho čte produkt, vrací se k textu, otevírá Parametry | Nerozumí technickým údajům | „Parametry u Aurora OLED umí být zamotané. Mám vám je vysvětlit srozumitelně?“ |
| Najíždí na „Do košíku“, ale neklikne | Má poslední pochybnost | „Vypadá to, že u sluchátek ještě váháte. Můžu pomoct s poslední nejasností?“ |
| Stojí na produktu a nehýbe se | Přemýšlí | „Kdyby vám u Pixelonu 8a něco nebylo jasné, ráda poradím.“ |
| Pořád mění filtry a řazení | Nemůže najít to pravé | „Řekněte mi, k čemu to potřebujete, a vyberu 2–3 nejlepší.“ |
| Zkouší různá hledání | Nezná správná slova | „Popište mi vlastními slovy, co potřebujete.“ |
| Stojí v košíku, odebírá věci | Váhá s objednávkou | „30 dní na vrácení, doprava zdarma… Mohu s něčím pomoci?“ |

Když zákazník na nabídku klikne, jeho otázka se rovnou pošle do chatu a Klára ví, v jaké situaci je.

**Pravidla, aby nebyla otravná:**
- Nikdy nepřeruší rozhovor.
- Mezi tipy je nejméně 35 s.
- Za návštěvu dá nejvýš 5 tipů.
- Když zákazník tip zavře, ozývá se méně často.
- Kdo řekl „jen se dívám“, dostane nejvýš 3 tipy s rozestupem aspoň 45 s: jen skutečně výhodné (slevy, sety, doprava zdarma) nebo nabídku pomoci, když zjevně váhá. Vždy s tlačítkem „Teď ne, díky“.
- Při otevřeném chatu řekne tip přímo v konverzaci.

**4. V rozhovoru** (s Claude API) prodává jako zkušená prodavačka:
- Nejdřív se zeptá na potřebu.
- Doporučí 1–3 produkty s vysvětlením.
- Ukáže kartičky s tlačítkem do košíku.
- Aktivně, ale střídmě upozorní na akce.
- Ví, co si zákazník prohlížel, co hledal a co má v košíku.

**Ochrana AI:**
- Ceny, parametry a akce smí brát jen z katalogu. Nesmí smlouvat ani si vymýšlet slevy.
- Na nesouvisející dotazy zdvořile odmítne a pokusy o zneužití ignoruje.
- Zprávy mají limit délky, konverzace limit počtu zpráv a server omezuje počet požadavků z jedné IP.
- Widget jasně označuje, že jde o AI (AI Act).

## Dashboard pro majitele

- Konverze s AI a bez AI a míra přijetí nabídky pomoci
- **Proaktivní tipy:** které typy tipů zákazníci využívají
- **Co zákazníci hledají** a **hledání bez výsledku**, tedy poptávka, kterou obchod nepokrývá
- Nejprohlíženější produkty a produkty „hodně prohlížené, málo kupované“
- Na co se zákazníci ptají prodavačky
- Tlačítko pro AI doporučení od Claude (potřebuje API klíč)

## Architektura

```
server.js            HTTP server (Express): API + statické soubory
lib/assistant.js     AI prodavačka (Claude): prompt, nástroje, streaming, ochrany
lib/proactive.js     Pozdrav a tipy podle chování (pravidla, bez API)
lib/hesitation.js    Rozpoznání váhání zákazníka (tam a zpět, dlouhé čtení, filtry, košík…)
lib/offline.js       Zjednodušené odpovědi, když není API klíč
lib/catalog.js       Katalog, vyhledávání, ceny košíku a sety (v ostré verzi feed e-shopu)
lib/images.js        Ilustrace produktů pro demo (v ostré verzi fotky z e-shopu)
lib/analytics.js     Sběr událostí a výpočty pro dashboard
catalog/store.json   Data demo obchodu
public/widget/       prodavac.js – vložitelný widget (Shadow DOM, funguje na jakémkoli webu)
public/              Demo e-shop (index.html, shop.js, shop.css) + vendor/ (ikony)
public/demo/         Ukázka jiného webu (kavárna Bohème)
lib/storage.js       Kam se smí zapisovat (lokálně data/, na Vercelu dočasná složka)
public/admin/        Dashboard
```

## Vložení na jiný web

```html
<script src="https://VÁŠ-SERVER/widget/prodavac.js" data-name="Klára" defer></script>
```

**Maskot a jméno se vytvoří z webu samy.** Widget na každém webu najde logo a udělá z něj postavičku s očima, obočím a pusou:
- **Logo jako obrázek (čtverec, kruh):** oči a pusu dostane přímo logo. Ukázka kavárny: oranžový odznak s kávovým zrnem.
- **Logo s barevnou značkou** (např. tmavě modrý čtverec s „t“): lesklá dlaždice v barvě značky s tím písmenem. TechMarket.
- **Logo jen jako nápis:** dlaždice v barvě značky s počátečním písmenem.

Jméno vymyslí Claude podle značky a toho, co obchod prodává. Je to krátké maskotí jméno, ne lidské: TechMarket → **Tekík**, kavárna → **Bafík**, zahradnictví → **Pupík**, knihkupectví → **Luxík**. Server si jméno pamatuje, takže ho každý zákazník potká stejné.

Postavička mrká, sleduje kurzor a zvedá obočí, když přemýšlí. **Pusu otevírá jen, když mluví.** S přirozeným hlasem se otevírá podle skutečné hlasitosti zvuku, s hlasem z prohlížeče v rytmu slov.

Ruční nastavení je volitelné: `data-name`, `data-brand`, `data-avatar-color`, `data-letter`, `data-avatar-image`.

**Hlas:**
- **Přirozený hlas (doporučeno):** s `ELEVENLABS_API_KEY` v `.env.local` mluví neuronovým hlasem ElevenLabs (česky, výchozí hravý hlas „Jessica“, jde změnit přes `ELEVENLABS_VOICE_ID`). Klíč zdarma na elevenlabs.io, zhruba 10 000 znaků měsíčně.
- **Bez klíče:** použije nejlepší hlas prohlížeče (v Edge „Vlasta Online (Natural)“).
- **Emoji a formátování se nikdy nečtou nahlas.**

**Přerušení hlasem:** když Klára mluví, pořád poslouchá. Stačí jí skočit do řeči: zmlkne, poslechne si novou otázku a odpoví na ni. Na „stop“, „počkej“ nebo „dost“ zmlkne hned. Vlastní hlas z reproduktorů pozná a nenechá se jím přerušit. Nejspolehlivěji to funguje se sluchátky. Při přerušení se na serveru zastaví i generování zbytku odpovědi.

**Košík:** agent umí na požádání produkty přidat i odebrat, nebo snížit jejich počet. E-shop k tomu nabízí `AIProdavac.onAddToCart` a `AIProdavac.onRemoveFromCart`.

**Vzhled se přizpůsobí webu sám.** Widget si při načtení zjistí:
- barvu značky podle tlačítek, hlavně v hlavičce webu
- písmo
- zaoblení tlačítek
- jestli je web světlý, nebo tmavý

Podle toho si nastaví barvy, pozadí panelu, písmo i rohy. Na světlém webu ve stylu Alzy je světlý s modrými akcenty, na tmavém webu kavárny tmavý, oranžový a s patkovým písmem. Ruční nastavení je volitelné: `data-color="#e8741a"`, `data-theme="light|dark"`, `data-font="…"`, `data-radius="8"`.

E-shop předává, co zákazník dělá. Čím víc toho předá, tím lépe prodavačka radí. Ukázka je v `public/shop.js`:

```js
AIProdavac.getContext = () => ({ pageType, category, currentProductId, viewedProductIds, cart });
AIProdavac.onAddToCart = (item) => mujKosik.pridat(item);
AIProdavac.track("search", { query, results });
```

## Náklady (hrubý odhad, nutno změřit)

**Bez API:** pozdrav a proaktivní tipy nestojí nic.

**Chat přes Claude API:** jedna zpráva zákazníka jsou 2–3 volání API.
- Opus 5 ($5 / $25 za milion tokenů): orientačně ~1–2 Kč za zprávu
- Sonnet 5 / Haiku 4.5: 2–5× levnější

Přesná čísla změříme na reálném provozu. Budou podkladem pro monetizaci.

## Další kroky

- **Hlas:** Kvalitní streamovaný hlas místo hlasů prohlížeče (ty jsou pro „wow“ demo slabé).
- **Reálný e-shop:** Napojení na Shoptet / WooCommerce / Heureka feed.
- **Úložiště:** Databáze místo souborů.
- **GDPR:** Cookie lišta a souhlas se sledováním chování.
- **Testování kvality:** Sada testovacích dotazů pro hlídání kvality AI.
