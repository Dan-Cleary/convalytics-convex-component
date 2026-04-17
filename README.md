# convalytics-dev

Server-side analytics for Convex apps. Track events reliably from mutations and actions — server-side events aren't affected by ad blockers and are never dropped on page unload.

Pairs with the Convalytics browser script for full-stack analytics: web traffic + server-side product events in one dashboard.

## Install

```bash
npm install convalytics-dev
```

## Setup

### 1. Register the component

Add to `convex/convex.config.ts` (create it if it doesn't exist):

```typescript
import { defineApp } from "convex/server";
import analytics from "convalytics-dev/convex.config";

const app = defineApp();
app.use(analytics);

export default app;
```

### 2. Create an analytics singleton

Create `convex/analytics.ts`:

```typescript
import { components } from "./_generated/api";
import { Convalytics } from "convalytics-dev";

export const analytics = new Convalytics(components.convalytics, {
  writeKey: "YOUR_WRITE_KEY",
});
```

The write key is a public ingest identifier — safe to commit. It also ships in the browser script tag. No Convex environment variable is required: the component auto-detects the deployment (dev / preview / prod) from Convex's injected `CONVEX_CLOUD_URL` so events are tagged correctly without per-deployment config.

Get your write key from the [Convalytics dashboard](https://convalytics.dev) — or run `npx convalytics init` to auto-provision one.

## Usage

### Track events from mutations

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { analytics } from "./analytics";

export const createUser = mutation({
  args: { name: v.string(), email: v.string(), plan: v.string() },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", args);

    await analytics.track(ctx, {
      name: "user_signed_up",
      userId: String(userId),
      props: { plan: args.plan },
    });

    return userId;
  },
});
```

### Track events from actions

```typescript
import { httpAction } from "./_generated/server";
import { analytics } from "./analytics";

export const stripeWebhook = httpAction(async (ctx, req) => {
  const event = await req.json();

  if (event.type === "invoice.payment_succeeded") {
    await analytics.track(ctx, {
      name: "subscription_renewed",
      userId: event.data.object.customer,
      props: { amount: event.data.object.amount_paid },
    });
  }

  return new Response(null, { status: 200 });
});
```

## API

### `new Convalytics(component, options)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `writeKey` | `string` | Yes | Your Convalytics project write key |
| `ingestUrl` | `string` | No | Override ingest endpoint (for local dev) |
| `deploymentName` | `string` | No | Override deployment name tag (auto-detected from `CONVEX_CLOUD_URL` if omitted) |

### `analytics.track(ctx, event)`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Event name (e.g. `"user_signed_up"`) |
| `userId` | `string` | Yes | Stable user identifier |
| `userEmail` | `string` | No | User email — shown in dashboard instead of raw ID |
| `userName` | `string` | No | User display name — shown in dashboard |
| `sessionId` | `string` | No | Session ID (auto-generated if omitted) |
| `timestamp` | `number` | No | Unix ms timestamp (defaults to `Date.now()`) |
| `props` | `Record<string, string \| number \| boolean>` | No | Additional properties |

Events are delivered asynchronously and never throw — analytics failures are logged but never propagate to the caller.

## Web analytics

For browser page view tracking, add to your `<head>`:

```html
<script defer src="https://YOUR_CONVEX_SITE_URL/script.js?key=YOUR_WRITE_KEY"></script>
```

Your Convex site URL is shown in the [Convalytics dashboard](https://convalytics.dev) after claiming your project, or use the CLI (below) to insert it automatically.

## Quick setup via CLI

```bash
npx convalytics init
```

Auto-provisions a project, installs the package, patches `convex.config.ts`, creates `convex/analytics.ts` with the write key inlined, and inserts the browser script tag. No write key required — one is created for you. Pass an existing key to reuse a project:

```bash
npx convalytics init YOUR_WRITE_KEY
```

Verify the pipeline:
```bash
npx convalytics verify YOUR_WRITE_KEY
```
