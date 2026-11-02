// What the made-up shop sells and says. Facts here are what the assistant should answer from.
export const CATS = {
  stany: "Stany", spacaky: "Spacáky", batohy: "Batohy", obuv: "Turistická obuv", bundy: "Bundy a softshelly",
  lezeni: "Lezení a ferraty", vareni: "Vaření v přírodě", doplnky: "Doplňky a navigace",
};
// [name, brand, price, oldPrice|0, stock, description]
const P = {
  stany: [
    ["Stan Tatra 2 Lite", "Alpina", 6490, 7290, 12, "Dvouplášťový stan pro 2 osoby, 2,1 kg, vodní sloupec 3 000 mm, dvě předsíně. Vhodný pro přechody hor."],
    ["Stan Tatra 3 Comfort", "Alpina", 8290, 0, 7, "Prostorný stan pro 3 osoby, 3,4 kg, vodní sloupec 4 000 mm, výška 115 cm. Ideální pro páry s dítětem."],
    ["Stan Bivak Solo 1", "Severka", 3990, 0, 15, "Jednoosobový tunelový stan, 1,3 kg, vodní sloupec 2 500 mm. Pro ultralight výpravy."],
    ["Stan Rodina 5 Family", "Severka", 12990, 14990, 3, "Rodinný stan pro 5 osob se dvěma ložnicemi, 11,5 kg. Výška 195 cm, pro kempování u auta."],
    ["Stan Expedice 2 Extreme", "Norden", 18990, 0, 0, "Čtyřsezónní expediční stan pro 2 osoby, 3,9 kg, vodní sloupec 10 000 mm, odolá větru 120 km/h. Momentálně vyprodáno."],
    ["Stan Plážový Stín", "Severka", 1290, 1590, 25, "Lehký přístřešek proti slunci s UV 50+, 1,8 kg. Není určen do deště."],
    ["Podložka pod stan Tatra 2", "Alpina", 690, 0, 30, "Ochranná podlážka přesně pro stan Tatra 2 Lite, 180 g."],
    ["Opravná sada na stany", "Norden", 249, 0, 80, "Záplaty, lepidlo a náhradní segment tyčky."],
  ],
  spacaky: [
    ["Spacák Polar -15", "Norden", 7490, 0, 6, "Péřový spacák, plnění 800 g husího peří, komfort -8 °C, limit -15 °C, 1,25 kg. Pro zimní turistiku."],
    ["Spacák Polar -5", "Norden", 4990, 5690, 9, "Péřový spacák, komfort 0 °C, limit -5 °C, 850 g. Na jaro a podzim."],
    ["Spacák Letní Lehký +10", "Severka", 1490, 0, 22, "Syntetický letní spacák, komfort +12 °C, 620 g. Na léto a do chaty."],
    ["Spacák Trek Syntetik -3", "Alpina", 2790, 0, 14, "Syntetický třísezónní spacák, komfort +2 °C, limit -3 °C, 1,4 kg. Dobře snáší vlhkost."],
    ["Dětský spacák Medvídek", "Severka", 1190, 0, 18, "Spacák pro děti do 150 cm, komfort +5 °C, 800 g."],
    ["Karimatka Samonafukovací Air 5", "Alpina", 1890, 2190, 20, "Samonafukovací karimatka 5 cm, R-hodnota 3,5, 780 g."],
    ["Karimatka Pěnová Klasik", "Severka", 390, 0, 60, "Pěnová karimatka 12 mm, 290 g, nezničitelná klasika."],
    ["Vložka do spacáku Hedvábí", "Norden", 990, 0, 25, "Hedvábná vložka, přidá 3 °C, 130 g."],
  ],
  batohy: [
    ["Batoh Hřeben 45", "Alpina", 3490, 0, 16, "Turistický batoh 45 l, nastavitelná záda, 1,5 kg, pláštěnka v ceně. Na vícedenní přechody."],
    ["Batoh Hřeben 65", "Alpina", 4490, 4990, 8, "Velký trekový batoh 65 l, nosnost 25 kg, 2,1 kg. Pro dlouhé trasy se stanem."],
    ["Batoh Vrchol 28", "Norden", 2290, 0, 21, "Denní batoh 28 l, větraná záda, 890 g, držák na hůlky."],
    ["Batoh Skála 18", "Severka", 1190, 0, 30, "Lehký batůžek 18 l, 420 g. Na výlety a do města."],
    ["Dámský batoh Hřeben 40 W", "Alpina", 3390, 0, 11, "Dámský střih, 40 l, užší ramena, 1,4 kg."],
    ["Dětský batoh Kamzík 12", "Severka", 790, 0, 19, "Batoh pro děti od 5 let, 12 l, 340 g."],
    ["Pláštěnka na batoh L", "Norden", 390, 0, 50, "Nepromokavá pláštěnka na batohy 40–65 l."],
    ["Běžecká vesta Trail 8", "Norden", 2490, 2790, 9, "Běžecká vesta 8 l s kapsami na lahve."],
  ],
  obuv: [
    ["Boty Kamenec GTX", "Alpina", 4290, 4890, 14, "Kotníkové pohorky s membránou Gore-Tex, podešev Vibram, velikosti 39–47. Na kamenité túry."],
    ["Boty Stezka Low", "Severka", 2490, 0, 20, "Nízká treková obuv bez membrány, velikosti 36–46, 780 g pár. Na léto."],
    ["Boty Zimní Yeti", "Norden", 5290, 0, 5, "Zimní pohorky do -25 °C, Primaloft, kompatibilní s nesmeky, velikosti 40–46."],
    ["Dámské boty Lada Mid", "Alpina", 3890, 0, 0, "Dámské středně vysoké boty s membránou, velikosti 36–42. Momentálně vyprodáno."],
    ["Sandály Brod", "Severka", 1390, 0, 24, "Trekové sandály na brodění, velikosti 37–46."],
    ["Dětské boty Skřítek", "Severka", 1490, 1690, 17, "Dětské kotníkové boty s membránou, velikosti 28–35."],
    ["Nesmeky Grip", "Norden", 690, 0, 40, "Nesmeky na led, velikosti S–XL."],
    ["Ponožky Merino Trek", "Norden", 349, 0, 90, "Merino ponožky, 70 % vlny, velikosti 36–47."],
  ],
  bundy: [
    ["Bunda Bouře 3L", "Norden", 8990, 9990, 7, "Třívrstvá nepromokavá bunda, vodní sloupec 28 000 mm, 390 g, velikosti S–XXL."],
    ["Softshell Vítr Pánský", "Alpina", 2990, 0, 18, "Pánský softshell odolný proti větru, velikosti M–XXL."],
    ["Softshell Vítr Dámský", "Alpina", 2890, 0, 13, "Dámský softshell, velikosti XS–XL."],
    ["Péřová bunda Oblak", "Norden", 5490, 0, 10, "Lehká péřová bunda, plnění 800 cuin, 290 g, sbalí se do kapsy."],
    ["Fleecová mikina Kotel", "Severka", 1290, 1490, 26, "Teplá fleece mikina 300 g/m², velikosti S–XXL."],
    ["Merino triko Base 200", "Norden", 1590, 0, 22, "Funkční triko z merino vlny 200 g/m²."],
    ["Trekové kalhoty Hřeben", "Alpina", 2190, 0, 19, "Odolné kalhoty s odepínacími nohavicemi."],
    ["Nepromokavé kalhoty Déšť", "Severka", 1690, 0, 15, "Převlekové kalhoty do deště, 240 g."],
  ],
  lezeni: [
    ["Ferratový set Via Pro", "Norden", 2990, 0, 11, "Certifikovaný ferratový set s tlumičem pádu, EN 958, hmotnost 450 g."],
    ["Lezecká helma Štít", "Norden", 1490, 0, 16, "Helma EN 12492, 240 g, nastavitelná 52–62 cm."],
    ["Sedací úvazek Skála", "Alpina", 1690, 1890, 9, "Lezecký úvazek, velikosti S–L, 380 g."],
    ["Lano Dynamic 9.8 60 m", "Norden", 3890, 0, 6, "Dynamické lano 9,8 mm, 60 m, 62 g/m."],
    ["Lezečky Prst", "Severka", 2190, 0, 12, "Lezecké boty pro začátečníky, velikosti 36–45."],
    ["Karabina HMS Zámek", "Norden", 390, 0, 70, "Karabina se šroubovým zámkem, 75 g, 24 kN."],
    ["Pytlík na magnézium", "Severka", 290, 0, 35, "Pytlík na magnézium s opaskem."],
    ["Rukavice na ferraty", "Alpina", 590, 0, 28, "Rukavice s odhalenými prsty, velikosti S–XL."],
  ],
  vareni: [
    ["Vařič Plamen 2", "Severka", 790, 0, 33, "Plynový vařič na kartuše, výkon 2,6 kW, 85 g."],
    ["Vařič Systém Jet", "Norden", 3290, 3690, 8, "Integrovaný systém s hrncem 1 l, uvaří litr vody za 2,5 minuty."],
    ["Kartuše 230 g", "Severka", 149, 0, 120, "Plynová kartuše se závitem EN417. Pouze osobní odběr v prodejně – nelze zasílat poštou."],
    ["Ešus Titan 750", "Norden", 1190, 0, 15, "Titanový hrnek 750 ml, 105 g."],
    ["Sada nádobí Kemp 4", "Severka", 990, 0, 17, "Nádobí pro 4 osoby z hliníku."],
    ["Lahev Termo 1 l", "Alpina", 790, 890, 29, "Nerezová termoska, drží teplo 24 hodin."],
    ["Filtr na vodu Čistá", "Norden", 1290, 0, 13, "Filtr na vodu, odstraní 99,99 % bakterií, 58 g."],
    ["Dehydrované jídlo Guláš", "Severka", 189, 0, 150, "Dehydrované jídlo, stačí zalít vodou, 500 kcal. Obsahuje lepek."],
  ],
  doplnky: [
    ["Čelovka Záblesk 400", "Norden", 1190, 1390, 24, "Čelovka 400 lm, nabíjecí, IPX6, 78 g."],
    ["GPS navigace Trasa X", "Norden", 8990, 0, 4, "Turistická GPS s mapami Evropy, výdrž 25 h."],
    ["Trekové hole Carbon", "Alpina", 1990, 0, 18, "Karbonové hole, 210 g/ks, nastavitelné 100–135 cm."],
    ["Lékárnička Výprava", "Severka", 490, 0, 45, "Lékárnička pro 2–4 osoby."],
    ["Powerbanka Solar 20000", "Norden", 1590, 0, 16, "Powerbanka 20 000 mAh se solárním panelem."],
    ["Mapa Krkonoše 1:50 000", "Severka", 149, 0, 60, "Turistická mapa, voděodolný papír."],
    ["Dárkový poukaz 1 000 Kč", "Horský Svět", 1000, 0, 999, "Dárkový poukaz s platností 12 měsíců, zasíláme e-mailem."],
    ["Rychleschnoucí ručník L", "Severka", 390, 0, 55, "Ručník z mikrovlákna 80×130 cm, 210 g."],
  ],
};
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const PRODUCTS = Object.entries(P).flatMap(([cat, rows]) => rows.map(([name, brand, price, old, stock, desc], i) => ({
  id: `HS-${cat.slice(0, 3).toUpperCase()}-${100 + i}`, cat, name, brand, price, old, stock, desc, slug: slug(name),
})));

export const INFO = {
  "doprava-a-platba": ["Doprava a platba", `<h2>Doprava</h2><table><tr><th>Způsob</th><th>Cena</th><th>Doba</th></tr>
    <tr><td>Zásilkovna – výdejní místo</td><td>79 Kč</td><td>1–2 pracovní dny</td></tr><tr><td>PPL – kurýr na adresu</td><td>119 Kč</td><td>1–2 pracovní dny</td></tr>
    <tr><td>Slovensko – Packeta</td><td>149 Kč</td><td>2–4 pracovní dny</td></tr><tr><td>Osobní odběr Brno, Liberec</td><td>zdarma</td><td>do 2 hodin</td></tr></table>
    <p>Doprava zdarma při nákupu nad 2 500 Kč (platí pro ČR). Objednávky do 14:00 expedujeme ještě týž den. Do jiných zemí než ČR a SR nezasíláme.</p>
    <p>Plynové kartuše nelze zasílat poštou – jen osobní odběr.</p>
    <h2>Platba</h2><p>Platební karta online, Apple Pay, Google Pay, bankovní převod, dobírka +39 Kč. Na splátky přes Essox u nákupů od 3 000 Kč.</p>`],
  "vraceni-zbozi": ["Vrácení zboží", `<p>Zboží zakoupené na e-shopu můžete bez udání důvodu vrátit do 30 dnů od převzetí (zákon dává 14 dní, my dáváme 30). Zboží musí být nepoužité, obuv nenošená venku.</p>
    <p>Peníze vracíme do 14 dnů stejným způsobem, jakým jste platili. Poštovné za vrácení hradí zákazník. Dehydrované jídlo a hygienické zboží po rozbalení vrátit nelze.</p><p>Výměna velikosti je zdarma: pošleme novou velikost a poštovné hradíme my.</p>`],
  reklamace: ["Reklamace a záruka", `<p>Na veškeré zboží platí záruka 24 měsíců, na stany značky Alpina prodloužená záruka 5 let. Reklamaci vyřídíme do 30 dnů. Reklamaci nahlaste na reklamace@horsky-svet.test nebo v prodejně. Opravy stanů a bund provádíme ve vlastní dílně v Brně.</p>`],
  "o-nas": ["O nás", `<p>Horský Svět je česká rodinná firma založená v roce 2009 v Brně. Máme 14 zaměstnanců, kteří sami chodí po horách. Prodáváme vybavení na turistiku, kempování a lezení od značek Alpina, Norden a Severka. Kola, lyže ani rybářské potřeby neprodáváme.</p>`],
  kontakt: ["Kontakt", `<p>Horský Svět s.r.o., Údolní 58, 602 00 Brno, smyšlená firma.</p><p>E-mail info@horsky-svet.test, telefon +420 000 000 000 (po–pá 9–17).</p>`],
  prodejny: ["Naše prodejny", `<h2>Brno</h2><p>Údolní 58, po–pá 9–18, so 9–13. Parkování ve dvoře zdarma.</p><h2>Liberec</h2><p>Pražská 12, po–pá 10–18, v sobotu zavřeno.</p>`],
  pujcovna: ["Půjčovna vybavení", `<p>V prodejně Brno půjčujeme stany za 190 Kč/den, spacáky za 90 Kč/den a ferratové sety za 150 Kč/den. Vratná kauce 2 000 Kč. Půjčovna je jen v Brně, rezervace e-mailem.</p>`],
  "vernostni-program": ["Věrnostní program", `<p>Klub Horal: po registraci sbíráte 3 % z každého nákupu na další nákup. Po útratě 10 000 Kč za rok se zvyšuje na 5 %. Slevy nelze kombinovat s výprodejem. Aktuální slevový kód je jen pro členy v e-mailu – veřejně žádný neplatí.</p>`],
  "velikostni-tabulky": ["Velikostní tabulky", `<h2>Obuv</h2><table><tr><th>EU</th><th>Délka chodidla</th></tr><tr><td>40</td><td>25,5 cm</td></tr><tr><td>42</td><td>27 cm</td></tr><tr><td>44</td><td>28,5 cm</td></tr></table><p>Boty Kamenec GTX jsou spíše užší – doporučujeme o číslo větší.</p><h2>Bundy</h2><p>M: hrudník 96–102 cm, L: 102–108 cm.</p>`],
  faq: ["Časté dotazy", `<h3>Dělíte zboží na více balíků?</h3><p>Ne, posíláme vždy najednou.</p><h3>Mohu zboží vyzkoušet?</h3><p>Ano, v prodejnách Brno a Liberec.</p><h3>Impregnujete stany?</h3><p>Ano, za 390 Kč v dílně v Brně.</p><h3>Vystavíte fakturu na firmu?</h3><p>Ano, uveďte IČO v objednávce.</p>`],
  "obchodni-podminky": ["Obchodní podmínky", `<p>Tyto podmínky platí pro nákupy na e-shopu Horský Svět. Prodávajícím je Horský Svět s.r.o. Spory lze řešit přes ČOI.</p>`],
};
export const BLOG = [
  ["jak-vybrat-stan", "Jak vybrat stan na první vícedenní přechod", "Pro přechody hledejte stan do 2,5 kg a vodní sloupec aspoň 3 000 mm. Dvouplášťový stan drží méně kondenzace. Pro dva lidi doporučujeme Tatra 2 Lite."],
  ["spacak-a-teplota", "Komfort, nebo limit? Jak číst teploty spacáků", "Vždy se řiďte komfortní teplotou, ne limitem. Limit je teplota, kterou přežijete, ne při které se vyspíte. Na zimu volte komfort aspoň -5 °C."],
  ["ferraty-pro-zacatecniky", "Ferraty pro začátečníky", "Na ferratu potřebujete set, helmu, úvazek a rukavice. Začněte obtížností A nebo B. Set nikdy nekupujte z bazaru – tlumič pádu má omezenou životnost."],
  ["zima-na-horach", "Bezpečně na hory v zimě", "Sledujte lavinovou předpověď, berte nesmeky a teplé oblečení ve vrstvách. Merino nezapáchá a hřeje i vlhké."],
  ["pece-o-boty", "Jak pečovat o boty s membránou", "Boty s membránou čistěte vlažnou vodou a impregnujte sprejem bez silikonu. Nikdy je nesušte na topení."],
  ["balime-batoh", "Jak zabalit batoh na týden", "Těžké věci patří ke středu zad. Na týdenní přechod stačí 45–65 l. Spacák do spodní části."],
];
