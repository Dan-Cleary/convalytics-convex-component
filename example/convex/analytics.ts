import { components } from "./_generated/api";
import { Convalytics } from "convalytics-dev";

// Create a singleton — import this wherever you need to track events.
// The write key is a public ingest identifier — safe to commit. It also ships
// in the browser script tag. The deployment is auto-detected at runtime from
// CONVEX_CLOUD_URL, so events are tagged correctly on every deployment.
export const analytics = new Convalytics(components.convalytics, {
  writeKey: "YOUR_WRITE_KEY",
});

// --- Usage examples ---

// In a mutation:
// import { analytics } from "./analytics";
// export const createUser = mutation({
//   handler: async (ctx, args) => {
//     const userId = await ctx.db.insert("users", args);
//     await analytics.track(ctx, {
//       name: "user_signed_up",
//       userId: String(userId),
//       props: { plan: args.plan },
//     });
//     return userId;
//   },
// });

// In an action (e.g., webhook handler):
// export const stripeWebhook = httpAction(async (ctx, req) => {
//   const event = await req.json();
//   if (event.type === "invoice.payment_succeeded") {
//     await analytics.track(ctx, {
//       name: "subscription_renewed",
//       userId: event.data.object.customer,
//       props: { amount: event.data.object.amount_paid },
//     });
//   }
//   return new Response(null, { status: 200 });
// });
