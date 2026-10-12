// Payments through Stripe: a shop that signed up pays its plan by card (Stripe Checkout), every
// month Stripe charges it again and issues the invoice, and the shop manages its card and downloads
// invoices in the Stripe customer portal. Stripe tells us what happened through a webhook; we keep
// the client's billing state and switch its widget on or off. See README → "Platby".
//
// Without STRIPE_SECRET_KEY (local development only) a payment is simulated: "pay" just marks the
// shop paid for a month, so the whole sign-up → pay → embed flow can be clicked through.
// PAYMENTS=demo does the same on a server (for testing the onboarding): a new account counts as
// paid the moment it is created, no card. Never leave it on with real customers.
import Stripe from "stripe";
import { PLANS } from "./plans.js";
import { getClient, setBilling, clientByStripeCustomer } from "./clients.js";
import { isProduction } from "./auth.js";
import { alert } from "./alerts.js";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
/** PAYMENTS=demo: every payment succeeds at once without Stripe – for testing the sign-up. */
export const demoPayments = () => process.env.PAYMENTS === "demo";
export const paymentsEnabled = () => Boolean(stripe) && !demoPayments();
/** Payments are simulated with PAYMENTS=demo, or locally without Stripe; otherwise a server without Stripe has none. */
export const simulated = () => demoPayments() || (!stripe && !isProduction());
const TRIAL_DAYS = Math.max(0, Number(process.env.STRIPE_TRIAL_DAYS) || 0);

const unavailable = () => Object.assign(new Error("Platby zatím nejsou zapnuté (chybí STRIPE_SECRET_KEY)."), { status: 503 });
const paidPlan = (plan) => {
  const p = PLANS[plan];
  if (!p || !p.public || !p.priceCzk) throw Object.assign(new Error("Neznámý tarif."), { status: 400 });
  return p;
};

/** Stripe subscription state → our billing state and whether the widget runs. */
export function billingFromSubscription(status) {
  switch (status) {
    case "active": case "trialing": return { status: "active", active: true };
    // the card failed, Stripe is retrying for a few days – the assistant keeps working meanwhile
    case "past_due": return { status: "past_due", active: true };
    case "incomplete": return { status: "unpaid", active: false };
    default: return { status: "canceled", active: false }; // canceled, unpaid, incomplete_expired, paused
  }
}

// one monthly CZK price per plan, created in Stripe on first use (found again by its lookup key)
const priceIds = new Map();
async function priceFor(planId) {
  const plan = paidPlan(planId);
  const key = `sella_${planId}_${plan.priceCzk}_czk_month`;
  if (priceIds.has(key)) return priceIds.get(key);
  const found = (await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 })).data[0];
  const price = found ?? await stripe.prices.create({
    currency: "czk", unit_amount: plan.priceCzk * 100, recurring: { interval: "month" },
    lookup_key: key, metadata: { plan: planId },
    product_data: { name: `Sella ${plan.name}`, metadata: { plan: planId } },
  });
  priceIds.set(key, price.id);
  return price.id;
}

const monthFromNow = () => new Date(Date.now() + 30 * 864e5).toISOString();

/**
 * Starts paying for a plan. Returns { url } of Stripe's payment page, or { done: true } when it
 * was handled right away (a plan change on an existing subscription, or a simulated payment).
 */
export async function startPayment(client, planId, { successUrl, cancelUrl, lang = "cs" }) {
  paidPlan(planId);
  if (hasSubscription(client)) return changePlan(client, planId);
  if (simulated()) {
    await setBilling(client.id, { status: "active", active: true, plan: planId, paidUntil: monthFromNow() });
    return { done: true };
  }
  if (!stripe) throw unavailable();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: await priceFor(planId), quantity: 1 }],
    client_reference_id: client.id,
    metadata: { clientId: client.id, plan: planId },
    subscription_data: { metadata: { clientId: client.id, plan: planId }, ...(TRIAL_DAYS ? { trial_period_days: TRIAL_DAYS } : {}) },
    ...(client.stripeCustomerId
      ? { customer: client.stripeCustomerId, customer_update: { name: "auto", address: "auto" } }
      : { customer_email: client.ownerEmail || undefined }),
    billing_address_collection: "required", // company address on the invoice
    tax_id_collection: { enabled: true },   // IČO / DIČ
    allow_promotion_codes: true,
    locale: lang === "en" ? "en" : "cs",
    success_url: successUrl, cancel_url: cancelUrl,
  });
  return { url: session.url };
}

/** In demo mode a new account is paid right away – as if the owner had paid on Stripe's page. */
export async function activateDemoAccount(clientId, planId) {
  if (!demoPayments()) return false;
  await setBilling(clientId, { status: "active", active: true, plan: planId, paidUntil: monthFromNow() });
  return true;
}

const hasSubscription = (c) => Boolean(c.stripeSubscriptionId) && ["active", "past_due"].includes(c.billing);

/** Moves an existing subscription to another plan; the difference is charged (or credited) right away. */
async function changePlan(client, planId) {
  if (simulated() || client.stripeSubscriptionId?.startsWith("sim_")) {
    await setBilling(client.id, { plan: planId });
    return { done: true };
  }
  if (!stripe) throw unavailable();
  const sub = await stripe.subscriptions.retrieve(client.stripeSubscriptionId);
  const updated = await stripe.subscriptions.update(sub.id, {
    items: [{ id: sub.items.data[0].id, price: await priceFor(planId) }],
    proration_behavior: "always_invoice",
    metadata: { ...sub.metadata, plan: planId },
    expand: ["items.data.price"],
  });
  await syncSubscription(updated, client.id);
  return { done: true };
}

/** Stripe's page where the shop changes its card, downloads invoices or cancels. */
export async function billingPortal(client, { returnUrl, lang = "cs" }) {
  if (!stripe) throw unavailable();
  if (!client.stripeCustomerId) throw Object.assign(new Error("Zatím tu nejsou žádné platby."), { status: 400 });
  const s = await stripe.billingPortal.sessions.create({ customer: client.stripeCustomerId, return_url: returnUrl, locale: lang === "en" ? "en" : "cs" });
  return { url: s.url };
}

/** Writes a Stripe subscription's state to its client. */
export async function syncSubscription(sub, clientIdHint) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const clientId = sub.metadata?.clientId || clientIdHint || (await clientByStripeCustomer(customerId))?.id;
  const client = clientId && (await getClient(clientId, { includeInactive: true }));
  if (!client) return console.warn(`Stripe: subscription ${sub.id} has no matching client`);
  // an old subscription ending must not switch off the shop's newer one
  if (client.stripeSubscriptionId && client.stripeSubscriptionId !== sub.id && ["canceled", "incomplete_expired"].includes(sub.status)) return;
  const item = sub.items?.data?.[0];
  const plan = item?.price?.metadata?.plan || sub.metadata?.plan;
  const end = sub.current_period_end ?? item?.current_period_end; // newer API versions keep it on the item
  const state = billingFromSubscription(sub.status);
  await setBilling(client.id, {
    ...state, customerId, subscriptionId: sub.id,
    paidUntil: end ? new Date(end * 1000).toISOString() : null,
    ...(PLANS[plan] && plan !== client.plan ? { plan } : {}),
  });
  if (state.status === "past_due") alert(`past-due:${client.id}`, `${client.name}: platba kartou selhala, Stripe to zkouší znovu.`, { everyMs: 864e5 });
  if (!state.active && client.active) alert(`billing-off:${client.id}`, `${client.name}: předplatné skončilo (${sub.status}) – asistent je vypnutý.`, { everyMs: 864e5 });
}

/** Verifies and handles a webhook call from Stripe (raw request body + Stripe-Signature header). */
export async function handleWebhook(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) throw unavailable();
  let event;
  try { event = stripe.webhooks.constructEvent(rawBody, signature, secret); }
  catch { throw Object.assign(new Error("Neplatný podpis webhooku."), { status: 400 }); }
  const o = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
      if (o.mode === "subscription" && o.subscription) {
        const sub = await stripe.subscriptions.retrieve(o.subscription, { expand: ["items.data.price"] });
        await syncSubscription(sub, o.client_reference_id || o.metadata?.clientId);
      }
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await syncSubscription(await stripe.subscriptions.retrieve(o.id, { expand: ["items.data.price"] }));
      break;
    case "invoice.paid":
    case "invoice.payment_failed": {
      // the renewal moved the paid-until date (or the card failed) – read the subscription again
      const subId = o.subscription ?? o.parent?.subscription_details?.subscription;
      if (subId) await syncSubscription(await stripe.subscriptions.retrieve(typeof subId === "string" ? subId : subId.id, { expand: ["items.data.price"] }));
      break;
    }
  }
  return event.type;
}
