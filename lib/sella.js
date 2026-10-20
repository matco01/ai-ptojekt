// What the assistant on Sella's own website knows. Our site links to the demo shops (/techmarket/,
// /kavarna) and shows their products in the intro film, so reading it like a client's website would
// teach Sella's own assistant about phones and coffee. Instead it gets this fixed description of
// Sella – and never reads the website (lib/catalogs.js).
import { publicPlans } from "./plans.js";

export const SELLA_ID = "sella";

const price = (n) => n.toLocaleString("cs-CZ") + " Kč";
const priceEn = (n) => "CZK " + n.toLocaleString("en-GB");

function pages() {
  const plans = publicPlans();
  return [
    {
      url: "/", title: "Sella – AI prodavačka pro e-shopy",
      text: `Sella je AI prodavačka, kterou si e-shop vloží na svůj web jedním řádkem kódu. Když zákazník přijde, zeptá se ho, jestli chce poradit – chatem nebo hlasem. Doporučuje jen z katalogu daného obchodu, porovná produkty, poradí s velikostí nebo s výběrem, přidá zboží do košíku a odpoví na otázky o dopravě, vrácení a platbě podle informací obchodu. Když zákazník váhá (dlouho se dívá na produkt, přebíhá mezi dvěma, hledá a nic nenajde), sama nabídne pomoc nebo tip. Umí česky i anglicky, rozumí fotkám a PDF, které jí zákazník pošle, a přebírá vzhled webu, na kterém běží (barvy, písmo, logo jako maskota).
Majitel obchodu má přehled: kolik lidí prodavačku využilo, kolik z nich nakoupilo ve srovnání s ostatními, průměrnou objednávku, na co se zákazníci ptají, co hledají a nenajdou, a doporučení od AI, na co se zaměřit.
Zásady: prodavačka neruší (nabídne se jednou a když zákazník nechce, nechá ho být), nevymýšlí si produkty ani ceny, data zákazníků ukládá jen s jejich souhlasem a dotazy po 90 dnech maže.
Ukázky na webu Selly: obchod s elektronikou TechMarket (/techmarket/) a pražírna kávy Bohème (/kavarna). Jsou to jen ukázky toho, jak Sella na e-shopu vypadá – nejsou to obchody Selly a Sella nic z nich neprodává.`,
    },
    {
      url: "/#cenik", title: "Ceník",
      text: `Tarify (měsíčně, ceny bez DPH) se liší jen počtem zpráv od AI a znaků přirozeného hlasu; všechno ostatní mají všechny:
${plans.map((p) => `- ${p.name}: ${price(p.priceCzk)} měsíčně – ${p.messages.toLocaleString("cs-CZ")} zpráv od AI a ${p.ttsChars.toLocaleString("cs-CZ")} znaků hlasu${p.popular ? " (nejoblíbenější)" : ""}.`).join("\n")}
Zpráva = odpověď v chatu, nabídka pomoci napsaná na míru nebo doporučení pro majitele. Když se zprávy tarifu vyčerpají, prodavačka se do konce měsíce sama vypne, takže obchod nikdy nezaplatí víc. Tarif jde kdykoli změnit nebo zrušit v přehledu.`,
    },
    {
      url: "/sella/registrace.html", title: "Jak začít (Chci Sellu)",
      text: `1. Registrace na /sella/registrace.html (tlačítko „Chci Sellu“): název obchodu, adresa e-shopu, e-mail, heslo a tarif. Volitelně XML feed produktů (Heureka, Zboží.cz, Google); bez něj si Sella produkty přečte přímo z webu obchodu.
2. Zaplacení tarifu kartou v přehledu (platby zpracovává Stripe, každý měsíc se strhnou samy a faktura přijde e-mailem).
3. V přehledu se odemkne kód – jeden řádek, který se vloží na všechny stránky e-shopu před </body> (nebo přes Google Tag Manager). Kód funguje jen na doménách obchodu. Kdo si to nechce vkládat sám, může v přehledu požádat, abychom to udělali za něj.
Napojení na e-shop nepotřebuje programátora: Sella čte produkty z feedu nebo webu a košík a objednávky pozná z dat pro Google Analytics.
Přihlášení do přehledu: /sella/prihlaseni.html (e-mail nebo ID obchodu a heslo).`,
    },
  ];
}

function pagesEn() {
  const plans = publicPlans();
  return [
    {
      url: "/", title: "Sella – an AI salesperson for online shops",
      text: `Sella is an AI salesperson a shop adds to its website with one line of code. When a customer arrives it asks whether they'd like help – by chat or voice. It recommends only from that shop's catalogue, compares products, helps choose, adds items to the cart and answers questions about delivery, returns and payment from the shop's information. When a customer hesitates it offers help or a tip by itself. It speaks Czech and English, understands photos and PDFs, and takes on the look of the website it runs on.
The owner gets insights: how many people used the assistant, how many of them bought compared with the rest, the average order, what customers ask and search for, and AI advice on what to focus on.
Rules: it doesn't pester (offers itself once), never invents products or prices, stores customer data only with consent and deletes questions after 90 days.
Demos on Sella's website: the electronics shop TechMarket (/techmarket/) and the coffee roastery Bohème (/kavarna). They only show what Sella looks like on a shop – Sella doesn't sell their products.`,
    },
    {
      url: "/#cenik", title: "Pricing",
      text: `Plans (monthly, excluding VAT) differ only in AI messages and characters of natural voice:
${plans.map((p) => `- ${p.nameEn}: ${priceEn(p.priceCzk)} a month – ${p.messages.toLocaleString("en-GB")} AI messages and ${p.ttsChars.toLocaleString("en-GB")} characters of voice${p.popular ? " (most popular)" : ""}.`).join("\n")}
When a plan's messages run out the assistant switches itself off until the month ends, so a shop never pays more. Plans can be changed or cancelled any time in the insights.`,
    },
    {
      url: "/sella/registrace.html", title: "Getting started (Get Sella)",
      text: `1. Sign up at /sella/registrace.html: shop name, web address, e-mail, password and plan; optionally an XML product feed (otherwise Sella reads the products from the website).
2. Pay for the plan by card in the insights (Stripe; charged monthly, invoice by e-mail).
3. The embed code unlocks – one line added to every page before </body> or via Google Tag Manager. It works only on the shop's domains; we can also install it for you.
Sign in at /sella/prihlaseni.html with your e-mail or shop ID.`,
    },
  ];
}

const STARTERS = {
  cs: [
    { label: "💬 Co Sella umí", ask: "Co všechno Sella umí a jak pomůže mému e-shopu?" },
    { label: "💰 Kolik to stojí", ask: "Kolik Sella stojí a jaké jsou tarify?" },
    { label: "🛒 Jak ji dát na web", ask: "Jak Sellu dostanu na svůj e-shop?" },
  ],
  en: [
    { label: "💬 What Sella does", ask: "What can Sella do and how does it help my shop?" },
    { label: "💰 Pricing", ask: "How much does Sella cost and what are the plans?" },
    { label: "🛒 Adding it to my site", ask: "How do I get Sella on my online shop?" },
  ],
  idle: {
    cs: "Zajímá vás, jak by Sella prodávala na vašem e-shopu? Klidně se zeptejte.",
    en: "Wondering how Sella would sell on your shop? Just ask.",
  },
};

/** The fixed knowledge for Sella's own assistant, or null for any other client. */
export function ownSiteFor(client, lang = "cs") {
  if (client.id !== SELLA_ID) return null;
  const en = lang === "en";
  return {
    description: en ? "the website of Sella, an AI salesperson for online shops" : "web Selly – AI prodavačky pro e-shopy",
    welcome: "na webu Selly", welcomeEn: "to Sella",
    site: en ? pagesEn() : pages(),
    starters: STARTERS,
  };
}
