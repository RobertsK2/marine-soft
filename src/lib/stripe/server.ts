import "server-only";
import Stripe from "stripe";
import { getStripeServerEnv } from "@/lib/env";

let stripe: Stripe | undefined;

export function getStripe() {
  stripe ??= new Stripe(getStripeServerEnv().secretKey);
  return stripe;
}
