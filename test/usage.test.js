import { test } from "node:test";
import assert from "node:assert/strict";
import { costOf, recordUsage, allowance, getUsage } from "../lib/usage.js";
import { limitsFor, plansFor, publicPlans } from "../lib/plans.js";

test("cost of a Claude response (Sonnet 5.5 prices)", () => {
  const cost = costOf("claude-sonnet-5-5", { input_tokens: 1e6, output_tokens: 1e5, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 0 });
  assert.equal(Math.round(cost * 100) / 100, 2 + 1 + 0.2);
});

test("plans and per-client overrides", () => {
  assert.equal(limitsFor({ plan: "start" }).messages, 2000);
  assert.equal(limitsFor({ plan: "start", monthlyMessageLimit: 50 }).messages, 50);
  assert.equal(limitsFor({ plan: "nonsense" }).plan, "trial");
  assert.equal(limitsFor({ plan: "start", monthlyTtsLimit: 1000 }).ttsChars, 1000);
});

test("a custom plan takes its price and limits from the client", () => {
  const deal = { plan: "custom", customPriceCzk: 5000, monthlyMessageLimit: 30000, monthlyTtsLimit: 2000000 };
  assert.deepEqual(limitsFor(deal), { plan: "custom", planName: "Na míru", priceCzk: 5000, messages: 30000, ttsChars: 2000000 });
  // a public plan never takes a custom price
  assert.equal(limitsFor({ plan: "start", customPriceCzk: 1 }).priceCzk, publicPlans()[0].priceCzk);
  // the shop with the deal sees it among the plans; nobody else does
  assert.deepEqual(plansFor(deal).at(-1), { id: "custom", name: "Na míru", nameEn: "Custom", priceCzk: 5000, messages: 30000, ttsChars: 2000000, popular: false, custom: true });
  assert.deepEqual(plansFor({ plan: "start" }), publicPlans());
});

test("usage is summed and the monthly limit switches the AI off", async () => {
  const client = { id: "test-shop", name: "Test", plan: "trial", monthlyMessageLimit: 2 };
  assert.equal((await allowance(client)).chat, true);
  await recordUsage(client, { messages: 1, claude: [{ input_tokens: 100, output_tokens: 10 }, { input_tokens: 50, output_tokens: 5 }], model: "claude-sonnet-5-5" });
  let u = await getUsage(client.id);
  assert.equal(u.messages, 1);
  assert.equal(u.ai_calls, 2);
  assert.equal(u.input_tokens, 150);
  await recordUsage(client, { messages: 1 });
  assert.equal((await allowance(client)).chat, false);
  await recordUsage(client, { ttsChars: 500 });
  u = await getUsage(client.id);
  assert.equal(u.tts_chars, 500);
});
