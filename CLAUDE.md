# Convalytics — Convex Component

This project uses `convalytics-dev` for server-side analytics.

## Tracking events

Import the singleton from `convex/analytics.ts`:

```typescript
import { analytics } from "./analytics";
```

Track from any mutation or action:

```typescript
await analytics.track(ctx, {
  name: "event_name",        // snake_case, required
  userId: String(userId),    // stable user ID, required
  userEmail: identity.email, // optional — human-readable email for dashboard
  userName: identity.name,   // optional — human-readable name for dashboard
  props: { key: "value" },   // optional key/value metadata
});
```

## User identity

### Server-side (mutations/actions)

Pass `userEmail` and/or `userName` to `track()` for human-readable display in the dashboard:

```typescript
const identity = await ctx.auth.getUserIdentity();
await analytics.track(ctx, {
  name: "user_signed_up",
  userId: String(userId),
  userEmail: identity?.email,
  userName: identity?.name,
  props: { plan: args.plan },
});
```

### Browser-side (script tag)

Call `convalytics.identify()` after sign-in to link anonymous visitors to real users:

```typescript
convalytics.identify(user.id, { email: user.email, name: user.name })
```

On sign-out, call `convalytics.reset()` to revert to anonymous tracking:

```typescript
convalytics.reset()
```

The dashboard shows: `userEmail` > `userName` > anonymous `visitorId` (truncated).

## Common patterns

**After inserting a record:**
```typescript
const userId = await ctx.db.insert("users", args);
await analytics.track(ctx, { name: "user_created", userId: String(userId) });
```

**After a state change (with user identity):**
```typescript
const identity = await ctx.auth.getUserIdentity();
await ctx.db.patch(subscriptionId, { status: "active" });
await analytics.track(ctx, {
  name: "subscription_activated",
  userId: args.userId,
  userEmail: identity?.email,
  props: { plan: args.plan, interval: args.interval },
});
```

**In a webhook action:**
```typescript
await analytics.track(ctx, {
  name: "payment_succeeded",
  userId: customerId,
  props: { amount: amountCents, currency: "usd" },
});
```

## Configuration

The write key is stored in `CONVALYTICS_WRITE_KEY` environment variable.
The deployment name is stored in `CONVALYTICS_DEPLOYMENT_NAME` for environment tagging.

Set them via Convex dashboard or:
```bash
npx convex env set CONVALYTICS_WRITE_KEY your_key_here
npx convex env set CONVALYTICS_DEPLOYMENT_NAME your_deployment_slug
```

## Verify events are flowing

1. Open the [Convalytics dashboard](https://convalytics.dev)
2. Navigate to Custom Events
3. Events appear within a few seconds of being tracked

## Event naming conventions

- Use `snake_case`
- Format: `noun_verb` — e.g. `user_signed_up`, `subscription_canceled`, `payment_failed`
- Prefix AI-related events with `ai_` — e.g. `ai_completion_requested`
