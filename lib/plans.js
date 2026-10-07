// What each client may use per calendar month. A client's monthly_message_limit overrides its plan.
// "messages" = everything Claude writes for the shop: chat answers, offers of help written for a
// hesitating customer and the owner's AI recommendations – each counts as one.
// Prices are for the shop owner's overview and the usage export; invoicing itself happens outside the app.
// When a limit is reached the shop keeps working: chat answers in the simple mode without AI and the
// natural voice falls back to the browser's voice.
export const PLANS = {
  trial:    { name: "Zkušební",  messages: 300,    ttsChars: 20_000,    priceCzk: 0 },
  start:    { name: "Start",     messages: 2_000,  ttsChars: 100_000,   priceCzk: null },
  standard: { name: "Standard",  messages: 10_000, ttsChars: 400_000,   priceCzk: null },
  pro:      { name: "Pro",       messages: 50_000, ttsChars: 1_500_000, priceCzk: null },
  internal: { name: "Interní",   messages: 5_000,  ttsChars: 200_000,   priceCzk: 0 }, // our own showcase sites
};
export const DEFAULT_PLAN = "trial";

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
