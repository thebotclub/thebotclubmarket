import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      return null;
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    });
  }
  return _stripe;
}

/** Proxy that lazily initialises Stripe — accessing any property when
 *  STRIPE_SECRET_KEY is unset will throw at call-time, NOT at import-time. */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const s = getStripe();
    if (!s) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
    return s[prop as keyof Stripe];
  },
});
