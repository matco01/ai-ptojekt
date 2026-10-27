// The plans a shop can choose. What each client may use per calendar month; a client's
// monthly_message_limit overrides its plan (a custom deal we set).
// "messages" = everything Claude writes for the shop: chat answers, offers of help written for a
// hesitating customer and the owner's AI recommendations – each counts as one.
// When the month's messages are used up, the shop's assistant switches itself off until the next
// month (or until the shop picks a bigger plan). Used-up voice falls back to the browser's voice.
// Prices: an AI message costs us a few hundredths of a koruna (Claude Haiku 5.5) and the natural
// voice ≈ 0.4 Kč per 1 000 characters (Azure AI Speech) – a spoken answer is ≈ 400 characters.
// Self-signed-up shops pay their plan monthly through Stripe (lib/billing.js); shops we manage by
// hand ("manual" billing) are invoiced outside the app.
export const PLANS = {
  trial:    { name: "Zkušební", nameEn: "Trial",    messages: 300,    ttsChars: 20_000,    priceCzk: 0,     public: false },
  start:    { name: "Start",    nameEn: "Start",    messages: 2_000,  ttsChars: 300_000,   priceCzk: 990,   public: true },
  standard: { name: "Standard", nameEn: "Standard", messages: 10_000, ttsChars: 1_000_000, priceCzk: 2_990, public: true, popular: true },
  pro:      { name: "Pro",      nameEn: "Pro",      messages: 50_000, ttsChars: 3_000_000, priceCzk: 9_990, public: true },
  internal: { name: "Interní",  nameEn: "Internal", messages: 5_000,  ttsChars: 1_000_000, priceCzk: 0 }, // our own showcase sites
};
export const DEFAULT_PLAN = "trial";

/** The plans shops can pick (the Sella price list and the owner's dashboard). */
export const publicPlans = () => Object.entries(PLANS).filter(([, p]) => p.public)
  .map(([id, p]) => ({ id, name: p.name, nameEn: p.nameEn, priceCzk: p.priceCzk, messages: p.messages, ttsChars: p.ttsChars, popular: Boolean(p.popular) }));

export function limitsFor(client) {
  const plan = PLANS[client.plan] ?? PLANS[DEFAULT_PLAN];
  return {
    plan: PLANS[client.plan] ? client.plan : DEFAULT_PLAN,
    planName: plan.name,
    priceCzk: plan.priceCzk,
    messages: client.monthlyMessageLimit ?? plan.messages,
    ttsChars: plan.ttsChars,
  };
}
