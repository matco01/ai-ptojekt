# AI obchodní prodavač – prototyp

AI prodavačka pro e-shopy. Hned po příchodu na web se zákazníka zeptá, jestli chce poradit, nebo se porozhlédne sám. Pak se chová jako dobrá prodavačka v kamenném obchodě. Sleduje, co zákazník dělá, a ozve se ve správnou chvíli, třeba s akcí, kterou by jinak přehlédl. Přitom není otravná.

| Část | Adresa | Co to je |
|---|---|---|
| Demo e-shop | http://localhost:3000/ | Smyšlený obchod s elektronikou „TechMarket“ ve stylu velkých českých e-shopů (38 produktů, akce, sety, filtry, košík) |
| AI prodavačka | vpravo dole | Widget, který se vkládá na libovolný web jedním řádkem |
| Dashboard | http://localhost:3000/admin/ | Chování zákazníků, výkon prodavačky, využití tarifu a AI doporučení pro majitele (s přihlášením) |
| Klienti | http://localhost:3000/admin/clients.html | Jen pro provozovatele: zakládání obchodů, přihlášení majitelů, využití a export pro fakturaci |
| Ukázka jiného webu | http://localhost:3000/kavarna | Pražírna kávy „Bohème“: vlastní produkty z XML feedu, napojená bez jediného řádku kódu navíc (viz níže) |

## Klienti (více e-shopů)

Každý e-shop, který prodavačku používá, je klient s vlastním ID. Ukázkové weby jsou klienti `techmarket` a `kavarna`.

**Jak funguje ID klienta:** web obchodu vkládá widget s `data-client="id"`. Server podle ID načte nastavení obchodu, ověří, že stránka běží na jedné z jeho domén (jinak 403), načte jeho produkty z feedu a všechno, co se stane, uloží pod tímto ID. Obchody tak nikdy nevidí data jiných obchodů. Vložení bez `data-client` se nespustí (dřív se tiše počítalo jako TechMarket).

**Přidání nového klienta** (potřebuje Supabase):
1. Přihlaste se na `/admin/` jako **admin** s heslem `ADMIN_TOKEN` a otevřete **Klienti** → **+ Nový klient**.
2. Vyplňte ID (např. `datart`), název, domény obchodu, adresu produktového feedu (Heureka / Zboží.cz nebo Google Merchant), popis obchodu, tarif a e-mail majitele. Informace o obchodě (doprava, vrácení, platba, kontakt) zadejte jako JSON – na tyhle otázky AI odpovídá jen odsud.
3. Po uložení klikněte **Vytvořit nové přihlášení majitele**. Stránka ukáže kód pro web, adresu přehledu, ID a vygenerované heslo – jako hotovou zprávu, kterou zkopírujete nebo otevřete v e-mailu. Heslo se ukáže jen jednou; ukládá se jen jeho otisk.

Kód pro web klienta (přímo, nebo přes jeho Google Tag Manager):
```html
<script src="https://ai-ptojekt.vercel.app/widget/prodavac.js" data-client="datart" defer></script>
```

**Přihlášení do přehledu:** majitel se přihlásí na `/admin/` svým ID a heslem a vidí jen svůj obchod. Vy se přihlásíte ID `admin` a heslem `ADMIN_TOKEN` a přepínáte mezi všemi klienty. Přihlášení drží podepsaná HttpOnly cookie 14 dní; hesla nikdy nejsou v adrese. Staré odkazy s `?token=` už nefungují – klient se přihlásí formulářem; jeho staré heslo z `admin_token` platí a při prvním přihlášení se převede na otisk. Lokálně bez `ADMIN_TOKEN` je přehled otevřený jen z vašeho počítače.

**Tarify a limity** (`lib/plans.js`): každý tarif má měsíční limit zpráv, které napíše AI (odpověď v chatu, nabídka pomoci napsaná na míru váhajícímu zákazníkovi i doporučení pro majitele se počítají každá jako jedna), a znaků přirozeného hlasu; u klienta jde nastavit vlastní limit. Server počítá každé volání Claude (tokeny → cena v USD) a hlas do tabulky `usage`. Po vyčerpání limitu obchod dál funguje: chat odpovídá zjednodušeně bez AI a hlas přejde na hlas prohlížeče. Při 80 % a 100 % limitu přijde upozornění. Majitel vidí čerpání v přehledu, vy u všech klientů na stránce Klienti, kde je i **export CSV za měsíc** pro fakturaci. Ceny tarifů doplňte v `lib/plans.js`; fakturace sama zatím běží mimo aplikaci.

**Produkty z feedu:** server feed stáhne při první návštěvě a pak každých 6 hodin (a každou noc v rámci údržby). Uloží ho zabalený (gzip) do Supabase Storage, takže nový server ho nemusí stahovat znovu, a AI doporučuje jen z něj. Feed větší než 60 MB se odmítne. Když stažení selže, jede se dál na posledním funkčním katalogu, chyba se ukáže v přehledu a přijde upozornění.

**Napojení bez kódu u klienta:** widget si sám přečte, co web publikuje kvůli Googlu:
- na jakém produktu zákazník je – ze strukturovaných dat produktu (JSON-LD / microdata) nebo z adresy stránky porovnané s URL ve feedu,
- co dal do košíku, co odebral a kdy nakoupil (i s částkou) – z e-commerce událostí Google Analytics v `dataLayer` (GA4 i starší Universal Analytics); záložně pozná stránku „Děkujeme za objednávku“,
- co hledal – z adresy stránky s výsledky hledání.

Když AI přidává do košíku, widget stiskne tlačítko „Do košíku“ přímo na stránce obchodu. Když tam takové tlačítko není, kartička produktu místo toho otevře stránku produktu (chat se na počítači otevře znovu vedle něj). Z košíku obchodu AI odebírat neumí a zákazníkovi to řekne.

Neobvyklý web opravíte v nastavení klienta (pole „Úpravy napojení“), ne u klienta, např. `{"addToCart": "#buy-button", "cart": ".header-cart", "thankYou": "objednavka/hotovo"}` (tlačítko do košíku na stránce produktu, ikona košíku, adresa stránky po objednávce).

TechMarket má místo toho vlastní napojení přes JavaScript (`window.AIProdavac.getContext`, `onAddToCart` – viz začátek `public/widget/prodavac.js`), které umí i odebírat z košíku.

## GDPR a souhlas

- **Souhlas s analytikou:** chování návštěvníka (prohlížení, hledání, košík, objednávka), text jeho dotazů a „vracející se návštěvník“ (localStorage) se ukládají jen s jeho souhlasem. Widget ho čte sám z nástroje obchodu: Google Consent Mode (`analytics_storage`), Cookiebot, OneTrust. Jinak ho obchod předá sám: `data-consent="granted"` (když widget načítá až po souhlasu), `AIProdavac.setConsent(true|false)`, nebo `window.AIProdavac = { consent: true }` před načtením widgetu. Bez souhlasu widget dál zdraví, radí a chatuje, jen si nic neukládá. Ukázkové weby mají jednoduchou lištu (`public/consent-demo.js`).
- **Maskování:** v uložených dotazech se e-maily, telefonní čísla a čísla karet nahradí `[e-mail]` / `[číslo]`.
- **Mazání:** události a dotazy starší než `RETENTION_DAYS` (výchozí 90 dní) maže noční údržba. Přehled ukazuje stejné období.
- **Dokumenty (návrhy, nechte zkontrolovat právníkem):** `public/soukromi.html` – informace pro návštěvníky, na které odkazuje widget (obchod může přes `data-privacy-url` odkázat na své zásady); `legal/zpracovatelska-smlouva.md` – smlouva o zpracování s každým e-shopem; `legal/obchodni-podminky.md` – podmínky služby.

## Provoz a hlídání

- **Upozornění:** s `ALERT_WEBHOOK_URL` (Slack nebo Discord webhook) přijde zpráva při chybě serveru nebo Claude API, při rozbitém feedu a když se klient blíží limitu. Každé upozornění nejvýš jednou za čas, i když běží víc instancí.
- **Dostupnost:** `/api/health` vrací 503, když nejde databáze – nastavte na ni monitor (např. UptimeRobot, Better Stack).
- **Noční údržba:** Vercel Cron (`vercel.json`) volá každý den ve 3:00 UTC `/api/cron/daily` s `CRON_SECRET`: smaže stará data a staré počítadlo požadavků a znovu stáhne feedy všech klientů.
- **Ochrana proti zneužití:** limity požadavků na AI, hlas a přihlášení se počítají v databázi společně pro všechny instance. Hlavička Origin se dá mimo prohlížeč podvrhnout, takže doménová kontrola chrání obchody před cizími weby, ne API před skripty – útratu proti skriptům drží limity požadavků a měsíční limity tarifů.
- **Testy:** `npm test` (spouští je i GitHub Actions při každém pushi). Mimo jiné spustí schéma v in-memory Postgresu a ověří, že souhrn přehledu v databázi dává stejná čísla jako výpočet v JavaScriptu.

## Nasazení na Vercel

Projekt běží na Vercelu bez dalšího nastavení (Express se detekuje sám ze `server.js`).

1. **Import repozitáře:** ve Vercelu zvolte Add New → Project, vyberte repozitář a nechte výchozí nastavení (Framework Preset: Express / Other, žádný build command).
2. **Proměnné prostředí:** v Settings → Environment Variables nastavte `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_TOKEN`, `CRON_SECRET` a doporučeně `ALERT_WEBHOOK_URL`; volitelně `ELEVENLABS_API_KEY` (vše viz `.env.example`). Soubor `.env.local` se na Vercel nenahrává.
3. **Databáze:** spusťte `supabase/schema.sql` v Supabase → SQL Editor – poprvé i po každé aktualizaci (přidá jen to, co chybí, a smaže dřívější simulovaná demo data).
4. **Deploy.** Každý push na `main` nasadí novou verzi.

**Co se na Vercelu chová jinak:**
- Statické soubory servíruje Vercel přímo ze složky `public/` (`/` = e-shop, `/admin/`, `/admin/clients.html`, `/demo/kavarna.html`, `/widget/prodavac.js`, `/soukromi.html`).
- Konverzace přežije i přeskočení mezi instancemi, protože widget posílá s každou zprávou i dosavadní přepis.
- **Data dashboardu se ukládají do Supabase.** Bez `SUPABASE_URL` a `SUPABASE_SECRET_KEY` jdou jen do dočasné složky, jsou pro každou instanci zvlášť a po restartu zmizí.

## Spuštění

Potřebujete Node.js 22+.

```bash
npm install
npm start
```

**Funguje i bez Claude API.** Pozdrav, proaktivní tipy a celý e-shop běží bez API. Chat pak odpovídá zjednodušeně (vyhledá produkty, odpoví na dotazy k dopravě apod.) a ukáže poznámku o zjednodušeném režimu.

Testy: `npm test`.

Pro plnou AI dejte `ANTHROPIC_API_KEY` do souboru `.env.local` (nebo `.env`, vzor je v `.env.example`) (z https://platform.claude.com/) a restartujte server.

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

- Přihlášení ID obchodu a heslem; čerpání tarifu v aktuálním měsíci
- Kolik návštěvníků prodavačku využilo, počet dotazů, míra přijetí nabídky pomoci a využitých tipů
- **Na co se zákazníci ptají** prodavačky (hned nahoře v sekci AI prodavačka)
- **Proaktivní tipy:** které typy tipů zákazníci využívají
- **Co zákazníci hledají** a **hledání bez výsledku**, tedy poptávka, kterou obchod nepokrývá
- Nejprohlíženější produkty a produkty „hodně prohlížené, málo kupované“
- Tlačítko pro AI doporučení od Claude (potřebuje API klíč, počítá se do využití)

Konverze a tržby s AI / bez AI server dál počítá (`/api/analytics`), ale přehled je neukazuje: bez měření objednávek v e-shopu by ukazovaly nuly a ani s ním nejsou čistým přínosem prodavačky (o pomoc si říkají hlavně ti, kdo už chtějí koupit).

## Architektura

```
server.js            HTTP server (Express): API, přihlášení, správa klientů, noční údržba + statické soubory
lib/assistant.js     AI prodavačka (Claude): prompt, nástroje, streaming, ochrany
lib/proactive.js     Pozdrav a tipy podle chování (pravidla, bez API)
lib/hesitation.js    Rozpoznání váhání zákazníka (tam a zpět, dlouhé čtení, filtry, košík…)
lib/offline.js       Zjednodušené odpovědi bez AI (bez API klíče nebo po vyčerpání limitu)
lib/catalog.js       Katalog, vyhledávání, ceny košíku a sety
lib/catalogs.js      Katalog každého klienta z jeho feedu (stažení, limit velikosti, uložení do Storage)
lib/feed.js          Čtení feedů Heureka / Zboží.cz a Google Merchant
lib/clients.js       Klienti: nastavení, domény, validace změn
lib/auth.js          Hesla (scrypt) a podepsané přihlašovací cookie
lib/plans.js         Tarify a jejich limity
lib/usage.js         Měření využití AI a hlasu (tokeny → cena) a kontrola limitů
lib/ratelimit.js     Limity požadavků sdílené přes databázi
lib/alerts.js        Upozornění do Slacku / Discordu
lib/analytics.js     Sběr událostí, maskování, mazání starých dat, souhrn pro přehled
lib/images.js        Ilustrace produktů pro demo
catalog/store.js     Data demo obchodu
public/widget/       prodavac.js – vložitelný widget (Shadow DOM, funguje na jakémkoli webu)
public/              Demo e-shop (index.html, shop.js, shop.css), soukromi.html, consent-demo.js + vendor/ (ikony)
public/demo/         Ukázka jiného webu (kavárna Bohème)
public/admin/        Přehled pro majitele (index.html) a správa klientů (clients.html)
supabase/schema.sql  Databáze: tabulky a funkce pro limity, využití a souhrn přehledu
legal/               Návrhy smlouvy o zpracování a obchodních podmínek
test/                Testy (npm test)
```

## Vložení na jiný web

```html
<script src="https://VÁŠ-SERVER/widget/prodavac.js" data-client="id-obchodu" defer></script>
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

## Náklady

**Bez API:** pozdrav a běžné tipy (akce, sety, doprava zdarma) nestojí nic. Nabídku pomoci pro váhajícího zákazníka píše Claude, takže stojí jako jedna zpráva a počítá se do tarifu.

**Chat přes Claude API:** výchozí model je Claude Haiku 5.5 s úsilím `medium` ($0,10 vstup / $0,50 výstup za milion tokenů, čtení z cache $0,01; u promptů nad 100 000 tokenů 5× víc). Haiku 5.5 nemá záložní model při odmítnutí – zákazník pak dostane připravenou odpověď. Chytřejší a 20× dražší je `MODEL=claude-sonnet-5-5`. Jedna zpráva zákazníka jsou 2–3 volání API. Skutečné náklady každého klienta se teď měří (tabulka `usage`, stránka Klienti, export CSV) – z nich nastavte ceny tarifů. Model a úsilí jdou změnit přes `MODEL` a `EFFORT`.

## Další kroky

- **Platby:** napojit fakturaci (např. Stripe nebo Fakturoid) na export využití; doplnit ceny tarifů.
- **Právní dokumenty:** doplnit údaje a nechat zkontrolovat právníkem (`legal/`, `public/soukromi.html`).
- **Měření přínosu:** kontrolní skupina návštěvníků bez prodavačky, aby šel přínos prokázat čistě.
- **Velké katalogy:** vyhledávání přímo v databázi (Postgres full-text) místo načítání celého katalogu do paměti každé instance.
- **Testování kvality AI:** sada testovacích dotazů pro hlídání kvality odpovědí.
