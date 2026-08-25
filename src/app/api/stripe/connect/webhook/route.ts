import { getStripeServerEnv } from "@/lib/env";
import { captureServerError } from "@/lib/monitoring/server";
import { getStripe } from "@/lib/stripe/server";
import { processStripeConnectEvent } from "@/domain/checkout/webhook";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, getStripeServerEnv().webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    await processStripeConnectEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    captureServerError(error, { operation: "stripe_connect_webhook", eventId: event.id });
    return new Response("Webhook processing failed", { status: 500 });
  }
}
