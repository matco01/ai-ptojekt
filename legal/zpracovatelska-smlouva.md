# Smlouva o zpracování osobních údajů

> **NÁVRH.** Před použitím doplňte údaje v [HRANATÝCH ZÁVORKÁCH] a nechte smlouvu zkontrolovat advokátem. Uzavírá se s každým e-shopem spolu s [obchodními podmínkami](obchodni-podminky.md), podle čl. 28 obecného nařízení o ochraně osobních údajů (GDPR).

**Správce:** [NÁZEV E-SHOPU / FIRMY], IČO [ ], se sídlem [ ], zastoupený [ ] („Správce“)

**Zpracovatel:** [NÁZEV PROVOZOVATELE], IČO [ ], se sídlem [ ], zastoupený [ ] („Zpracovatel“)

## 1. Předmět

1.1 Zpracovatel poskytuje Správci službu AI prodavačka: asistentku vloženou na web Správce, která radí návštěvníkům s výběrem zboží, a přehled pro Správce (dále „Služba“), podle obchodních podmínek ze dne [ ] (dále „Podmínky“).

1.2 Při poskytování Služby zpracovává Zpracovatel osobní údaje návštěvníků webu Správce jménem Správce, v rozsahu a na dobu uvedenou v této smlouvě.

## 2. Rozsah zpracování

| | |
|---|---|
| **Účel** | a) odpovídat návštěvníkům na dotazy a radit s výběrem zboží; b) se souhlasem návštěvníka: statistiky chování a dotazů pro Správce |
| **Kategorie subjektů** | návštěvníci webu Správce, kteří používají AI prodavačku nebo (se souhlasem) web prohlížejí |
| **Kategorie údajů** | náhodný identifikátor návštěvy; text zpráv návštěvníka; stránka, na které se nachází; prohlížené a hledané zboží; obsah košíku; objednávka a její hodnota; IP adresa (jen dočasně pro ochranu proti zneužití) |
| **Zvláštní kategorie údajů** | nezpracovávají se; Služba o ně nežádá |
| **Povaha** | shromažďování, uložení, automatizované vyhodnocení pro odpověď, agregace do statistik, výmaz |
| **Doba** | po dobu trvání Podmínek; jednotlivé záznamy nejvýše [90] dní od pořízení |

## 3. Povinnosti Zpracovatele

3.1 Zpracovatel zpracovává osobní údaje jen na doložené pokyny Správce. Pokynem je i nastavení Služby a tato smlouva. Považuje-li Zpracovatel pokyn za rozporný s právními předpisy, neprodleně to Správci oznámí.

3.2 Zpracovatel zajistí, aby se osoby oprávněné zpracovávat osobní údaje zavázaly k mlčenlivosti.

3.3 Zpracovatel přijme technická a organizační opatření podle přílohy 1.

3.4 Zpracovatel nepoužije osobní údaje pro vlastní účely, zejména ne k reklamě ani k trénování modelů umělé inteligence, a neumožní to ani svým poddodavatelům.

3.5 Zpracovatel Správci pomáhá plnit povinnosti vůči subjektům údajů (přístup, výmaz, námitka aj.), zabezpečení, ohlašování porušení a posouzení vlivu, s ohledem na povahu zpracování a informace, které má k dispozici.

3.6 Porušení zabezpečení osobních údajů ohlásí Zpracovatel Správci bez zbytečného odkladu, nejpozději do 48 hodin od jeho zjištění, s informacemi podle čl. 33 odst. 3 GDPR, které má k dispozici.

3.7 Po skončení Podmínek Zpracovatel osobní údaje do 30 dnů vymaže, pokud Správce do té doby nepožádá o jejich vrácení (export statistik). Záznamy se mažou i průběžně podle čl. 2.

3.8 Zpracovatel Správci poskytne informace potřebné k doložení plnění této smlouvy a umožní audit, a to po předchozím oznámení nejméně 30 dní předem, nejvýše jednou ročně a na náklady Správce, pokud audit neodhalí podstatné porušení.

## 4. Poddodavatelé

4.1 Správce dává obecný souhlas se zapojením poddodavatelů uvedených v příloze 2.

4.2 O zamýšlené změně poddodavatele informuje Zpracovatel Správce nejméně 30 dní předem e-mailem. Správce může ze závažných důvodů vznést námitku; nedohodnou-li se strany, může Správce Podmínky vypovědět bez sankce.

4.3 Zpracovatel uloží poddodavatelům stejné povinnosti ochrany údajů, jaké má sám.

4.4 Předání do třetích zemí probíhá jen na základě rozhodnutí o odpovídající ochraně (včetně rámce EU–USA pro ochranu údajů) nebo standardních smluvních doložek EU.

## 5. Povinnosti Správce

5.1 Správce odpovídá za právní základ zpracování, zejména za získání souhlasu návštěvníků s analytikou a za jeho předání Službě (nástroj pro správu souhlasu na webu Správce, viz Podmínky).

5.2 Správce informuje návštěvníky o zpracování; může odkázat na [https://VÁŠ-SERVER/soukromi.html] nebo převzít jeho obsah do vlastních zásad.

## 6. Závěrečná ustanovení

6.1 Tato smlouva se řídí právem České republiky a platí po dobu trvání Podmínek. Při rozporu s Podmínkami v otázkách ochrany osobních údajů má přednost tato smlouva.

V [ ] dne [ ]

| Za Správce | Za Zpracovatele |
|---|---|
| | |

---

## Příloha 1: Technická a organizační opatření

- Šifrované spojení (HTTPS) mezi webem, serverem a všemi poddodavateli.
- Databáze přístupná jen serveru Služby přes tajný klíč; veřejný přístup je vypnutý (row level security).
- Přehled pro Správce chráněný heslem, uloženým jen jako otisk (scrypt); přihlášení přes podepsanou HttpOnly cookie; omezení počtu pokusů o přihlášení.
- Widget odpovídá jen na doménách Správce; omezení počtu požadavků proti zneužití.
- Bez souhlasu návštěvníka se neukládá jeho chování ani text dotazů; v uložených dotazech se automaticky skrývají e-maily, telefonní čísla a čísla karet.
- Automatický výmaz záznamů po [90] dnech.
- Identifikátor návštěvy je náhodný, bez vazby na identitu návštěvníka.
- Přístup k produkčním systémům má jen [POČET] pověřených osob Zpracovatele s dvoufázovým ověřením.
- Monitoring chyb a dostupnosti; záznamy o incidentech.

## Příloha 2: Poddodavatelé

| Poddodavatel | Činnost | Umístění dat | Záruka při předání |
|---|---|---|---|
| Anthropic PBC, USA | AI model pro odpovědi | USA | standardní smluvní doložky / rámec EU–USA |
| Supabase Inc., USA | databáze | [REGION, např. EU – Frankfurt] | standardní smluvní doložky |
| Vercel Inc., USA | provoz serveru | [REGION] | standardní smluvní doložky / rámec EU–USA |
| ElevenLabs Inc., USA | syntéza hlasu (jen hlasový režim, jen text odpovědí) | USA | standardní smluvní doložky |
