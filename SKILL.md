# Convalytics Agent Skill

Add analytics to a Convex project: web analytics (page views, sessions, bounce rate) + product analytics (event tracking from mutations/actions).

## Learn more

- Full product manual: https://convalytics.dev/llms-full.txt
- OpenAPI spec: https://convalytics.dev/openapi.json
- Agent card: https://convalytics.dev/.well-known/agent-card.json
- Dashboard: https://convalytics.dev

## When to use this skill

Use when the user asks to:
- Add analytics / event tracking to a Convex project
- Track user signups, purchases, feature usage, or other product events
- Set up page view analytics
- Integrate Convalytics

## Prerequisites

- A Convex project (has `convex/` directory and `convex` in dependencies)
- Authenticated with Convex (`npx convex dev` has been run before; this is already the case if the project is actively being developed)
- No Convalytics account or write key needed. The CLI auto-provisions one.

---

## First: ask the user what they want

Convalytics has two products. Ask the user before starting:

- **(A) Web analytics only:** automatic page views, sessions, bounce rate, referrers. Just a script tag, no Convex component needed.
- **(B) Web analytics + product analytics:** everything in A, plus custom event tracking from mutations/actions (signups, payments, feature usage).

If the user only wants web analytics, skip the event discovery and instrumentation steps below.

---

## Workflow

### 1. Install

Run the CLI. No write key required. It auto-provisions a project and returns a claim link for the human:

```bash
npx convalytics init
```

If the user already has a write key, pass it directly:

```bash
npx convalytics init YOUR_WRITE_KEY
```

This handles: package install, config patching, writing `convex/analytics.ts` with the write key inlined, browser script tag, and agent skill file. No Convex environment variables are set. The write key is safe to commit (it also ships in the browser script tag) and the deployment is auto-detected at runtime from `CONVEX_CLOUD_URL`.

The CLI outputs a **claim URL**. Share it with the user so they can connect the project to their Convalytics account. Events flow immediately, before claiming.

If `index.html` wasn't found (Next.js, Astro, etc.), add the script tag to the `<head>` manually:
```html
<script defer src="https://YOUR_CONVEX_SITE_URL/script.js?key=YOUR_WRITE_KEY"></script>
```
- Next.js: add to `app/layout.tsx` or use `next/script` with `strategy="afterInteractive"`
- Astro: add to your base layout

**Important:** After setup, let the user know that the changes are **local only**. Web analytics won't collect data in production until these changes are committed and deployed. Ask the user if they'd like you to commit and deploy, or if they'd prefer to handle it themselves.

**If the user chose (A) web analytics only, you're done.** Share the claim URL, let them know the changes need to be committed and deployed to go live, and stop here.

### 2. Discover what to track (option B only)

There are **two types** of events to instrument. Propose both in a single tracking plan:

#### Server-side events (Convex mutations/actions)

Read `convex/schema.ts` and every file in `convex/` to understand the data model and business logic. Identify every mutation and action that represents a meaningful user action (signups, payments, data changes, API calls).

#### Browser-side events (UI interactions)

Read the frontend components (`src/`, `app/`, etc.) and identify meaningful UI interactions that don't trigger a mutation: button clicks, navigation, feature discovery, form interactions, expanding/collapsing UI, selecting options. These are tracked directly in the browser without needing a Convex mutation wrapper.

#### Propose a combined tracking plan

For each event include:
- **Event name**: `snake_case`, `noun_verb` format (e.g. `user_signed_up`)
- **Type**: `server` or `browser`
- **File**: which file contains the mutation/action or React component
- **Function/Component**: which exported function or component to instrument
- **Props**: what metadata to attach

Example output:

```
Proposed tracking plan:

Server-side events (convex mutations/actions):
1. user_signed_up (convex/users.ts → createUser), props: { plan }
2. subscription_started (convex/billing.ts → createSubscription), props: { plan, interval }
3. payment_succeeded (convex/stripe.ts → handleWebhook), props: { amount, currency }
4. message_sent (convex/messages.ts → sendMessage), props: { channel }

Browser-side events (UI interactions):
5. pricing_plan_clicked (src/components/PricingTable.tsx), props: { plan }
6. feature_explored (src/pages/Dashboard.tsx), props: { feature }
7. settings_changed (src/pages/Settings.tsx), props: { setting, value }
```

Guidelines:
- Prefix AI-related events with `ai_` (e.g. `ai_completion_requested`)
- Don't over-track. Aim for 5–15 events total across both types that capture the core user journey.
- Skip internal/admin/migration functions
- **NEVER call `analytics.track()` inside a `query`.** Queries don't support mutations and will crash. Only use `track()` in `mutation` or `action` handlers.
- Skip read-only queries; only track mutations and actions that represent user intent
- Use browser-side tracking for interactions that don't write data (clicks, navigation, UI exploration)
- Use server-side tracking for events where transactional context matters (payments, signups, data mutations)

**Wait for the user to approve the plan before instrumenting.**

### 3. Instrument approved events

**Server-side events:** add a tracking call in the mutation/action, right after the core logic. If the app has auth, include `userEmail` for human-readable display in the dashboard:

```typescript
import { analytics } from "./analytics";

export const createUser = mutation({
  args: { name: v.string(), email: v.string(), plan: v.string() },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", args);
    const identity = await ctx.auth.getUserIdentity();
    await analytics.track(ctx, {
      name: "user_signed_up",
      userId: String(userId),
      userEmail: identity?.email,
      props: { plan: args.plan },
    });
    return userId;
  },
});
```

**Important:** Use the `userEmail` field (not `props.email`); it's a first-class field that the dashboard shows in the User column. Putting email in `props` will NOT display it as the user identifier.

**Browser-side events:** call `convalytics.track()` directly in the React component. No import needed; it's a global from the script tag:

```typescript
function PricingCard({ plan }: { plan: string }) {
  return (
    <button onClick={() => convalytics.track("pricing_plan_clicked", { plan })}>
      Select {plan}
    </button>
  );
}
```

### 4. Wire up user identity (apps with auth only)

If the app has user authentication, add two calls so page views and browser events show the real user instead of an anonymous UUID:

**After sign-in** (e.g. in the auth callback, session provider, or a `useEffect` that fires when the user is available):
```typescript
convalytics.identify(user.id, { email: user.email, name: user.name })
```

**On sign-out:**
```typescript
convalytics.reset()
```

This is critical for apps with auth. Without it, all browser-side page views and events will show anonymous UUIDs even for logged-in users.

### 5. Commit and deploy

All the changes from setup and instrumentation are local. Events won't flow in production until **both** of these ship:

1. **Frontend deploy** (whatever the project uses: `git push`, `vercel deploy`, etc.). Delivers the script tag that captures page views.
2. **Convex backend deploy.** Delivers the `convex/analytics.ts` component and any `analytics.track()` calls you instrumented. This is a **separate step** from your frontend deploy:

   ```bash
   npx convex deploy
   ```

   If you push to git and only the frontend auto-deploys, your Convex prod deployment will still be running the old code with no tracking. Events will fire from dev but silently drop in prod.

**If deploying Convex from CI** (e.g. Vercel, GitHub Actions): set `CONVEX_DEPLOY_KEY` in the CI environment and use `npx convex deploy --cmd '<your build command>'` so the Convex push runs as part of the build. Without it, the Convex backend will fall behind the frontend.

**Tell the user what files were changed** and remind them about the separate Convex deploy, then ask if they'd like you to commit and deploy or if they'll handle it themselves. Don't commit or deploy without their go-ahead.

### 6. Verify

```bash
npx convalytics verify YOUR_WRITE_KEY
```

`verify` sends a test event, polls the Convalytics backend to confirm the event landed in storage, and prints recent activity (events + pageviews over the last 5m / 1h / 24h, plus environments seen). If you see `Environments: dev, production`, both sides are reporting.

**What verify still can't prove:** it uses the same writeKey you pass as the argument; it doesn't know if your *code* is actually calling `analytics.track()` from the paths you instrumented. If recent activity shows only the CLI test event, check:
- Browser: the `<script>` tag is in your deployed `index.html`
- Server: `analytics.track()` is being called + `npx convex deploy` ran for prod

After deploying, trigger a real user action in each environment that should fire an instrumented event and re-run verify or check the dashboard.

### 7. Optional: install the Convalytics MCP server

Once events are flowing, the user can install the Convalytics MCP server to query their analytics from Claude Desktop, Claude Code, Cursor, Windsurf, or any MCP-capable AI assistant. Nine read-only tools:

- `list_projects`, `get_usage` — team-level.
- `top_pages`, `top_referrers`, `pageviews_count` — web traffic.
- `events_count`, `recent_events` — custom product events.
- `weekly_digest` — one-call summary of a project (traffic + events + period-over-period comparison).
- `user_activity` — one-call per-user snapshot (matches by userEmail or visitorId; returns identity, totals, pages visited, event names, recent events).

**The per-user tools only work if the app identifies its users.** Step 4 above wires up `convalytics.identify()` for browser events and `userEmail` / `userName` for server-side `analytics.track()` calls. Without that, `user_activity` and the `user` filter on other tools can only match on anonymous `visitorId`s — which aren't useful to a human asking "how is dan@example.com using my app?"

**Requires the Solo plan or higher** ($29/mo). Token creation is free on any plan, but the `/mcp` endpoint itself gates on Solo+.

1. Direct the user to generate an API token at https://convalytics.dev/tokens. It is shown only once; they should copy it.
2. For Claude Code:
   ```bash
   claude mcp add --transport http convalytics https://api.convalytics.dev/mcp \
     --header "Authorization: Bearer $CONVALYTICS_TOKEN"
   ```
3. For Claude Desktop, edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "convalytics": {
         "url": "https://api.convalytics.dev/mcp",
         "headers": { "Authorization": "Bearer cnv_..." }
       }
     }
   }
   ```
4. Cursor / Windsurf follow the same JSON shape in their MCP settings.

After install, the user can ask their assistant things like *"what are my top pages this week on Convalytics?"* or *"how many signup_completed events in the last 24 hours?"* and the agent will use the MCP server to answer.

Full MCP documentation: https://convalytics.dev/mcp. Server card: https://convalytics.dev/.well-known/mcp/server-card.json.

---

## Manual setup (if CLI isn't available)

**1. Install the package**
```bash
npm install convalytics-dev
```

**2. Register the component** in `convex/convex.config.ts` (create if missing):
```typescript
import { defineApp } from "convex/server";
import analytics from "convalytics-dev/convex.config";

const app = defineApp();
app.use(analytics);

export default app;
```

**3. Create the singleton** at `convex/analytics.ts`:
```typescript
import { components } from "./_generated/api";
import { Convalytics } from "convalytics-dev";

export const analytics = new Convalytics(components.convalytics, {
  writeKey: "YOUR_WRITE_KEY",
});
```

The write key is a public ingest identifier, safe to commit. No environment variables are required: the component auto-detects the deployment (dev / preview / prod) at runtime from Convex's injected `CONVEX_CLOUD_URL`, so events are tagged correctly on every deployment without per-deployment setup.

**4. Add browser page view tracking** to your HTML `<head>`:
```html
<script defer src="https://YOUR_CONVEX_SITE_URL/script.js?key=YOUR_WRITE_KEY"></script>
```

---

## track() API: server-side (Convex mutations/actions)

```typescript
await analytics.track(ctx, {
  name: string,        // required: event name in snake_case
  userId: string,      // required: stable identifier for the user
  userEmail?: string,  // optional: human-readable email for dashboard display
  userName?: string,   // optional: human-readable name for dashboard display
  sessionId?: string,  // optional: auto-generated if omitted
  timestamp?: number,  // optional: unix ms, defaults to Date.now()
  props?: Record<string, string | number | boolean>, // optional metadata
});
```

- Works from any `mutation` or `action`
- Never throws; analytics failures are logged but never propagate
- Events appear in the Convalytics dashboard within seconds
- When `userEmail` or `userName` is provided, the dashboard shows it instead of raw user IDs

## track() API: browser-side (UI interactions)

The script tag also exposes `window.convalytics.track()` for tracking frontend events directly from the browser, with no Convex mutation wrapper needed:

```typescript
// Track a UI interaction from any frontend code
convalytics.track("model_clicked", { model: "gpt-4o", source: "leaderboard" });
```

```typescript
// In a React component
function LeaderboardRow({ model }: { model: string }) {
  return (
    <tr onClick={() => convalytics.track("model_clicked", { model })}>
      ...
    </tr>
  );
}
```

- No import needed; available globally once the script tag loads
- Uses the same write key and visitor/session IDs as page views
- Fire-and-forget; never blocks the UI
- Use for UI clicks, form interactions, feature discovery, etc.
- Use server-side `analytics.track()` for backend events where transactional context matters (payments, signups, data mutations)

## identify() API: link anonymous visitors to real users

For apps with user authentication, call `identify()` after sign-in so that page views and browser events are attributed to the real user instead of an anonymous UUID:

```typescript
// After successful sign-in (e.g. in your auth callback or useEffect)
convalytics.identify(user.id, { email: user.email, name: user.name })
```

When called:
- All subsequent page views and `convalytics.track()` calls use the provided `userId` instead of the anonymous UUID
- `email` and `name` traits are included in every event payload and displayed in the dashboard
- The identity persists in `localStorage` across page reloads until `reset()` is called

On sign-out, call `reset()` to revert to anonymous tracking:

```typescript
// After sign-out
convalytics.reset()
```

**For agents integrating into apps with auth:** Add `convalytics.identify()` in the sign-in success handler or in a `useEffect` that runs when the user session is available. Add `convalytics.reset()` in the sign-out handler. Both are one-liners.

---

## Common patterns

**After a state change (with user identity):**
```typescript
const identity = await ctx.auth.getUserIdentity();
await analytics.track(ctx, {
  name: "subscription_upgraded",
  userId: args.userId,
  userEmail: identity?.email,
  props: { from: currentPlan, to: args.newPlan },
});
```

**In a Stripe webhook action:**
```typescript
if (event.type === "invoice.payment_succeeded") {
  await analytics.track(ctx, {
    name: "payment_succeeded",
    userId: event.data.object.customer,
    props: { amount: event.data.object.amount_paid, currency: event.data.object.currency },
  });
}
```

**AI feature usage:**
```typescript
await analytics.track(ctx, {
  name: "ai_message_sent",
  userId: String(userId),
  props: { model: "gpt-4o", tokens: completionTokens, feature: "chat" },
});
```

---

## Environment tagging

Events are automatically tagged as "development" or "production":

- **Server-side events** (from the Convex component): the component reads the deployment slug from `CONVEX_CLOUD_URL` (injected by Convex on every deployment) and the ingest endpoint resolves it against a cache of deployment types populated from the Convex Management API when the project is claimed. Dev deployments → "development", prod → "production".
- **Browser-side events** (from the script tag): the script includes the page's origin (`location.origin`) in each event payload. `localhost` / `127.0.0.1` → "development", everything else → "production".

Both are fully automatic; no configuration needed. The dashboard has an environment toggle (All / Prod / Dev) to filter views.

---

## Troubleshooting

**Events not appearing:**
- Check the write key in `convex/analytics.ts` matches the one in the Convalytics dashboard
- Check Convex function logs for `[Convalytics]` errors
- Re-run verify: `npx convalytics verify YOUR_WRITE_KEY`

**Events fire from dev but not prod:**
- Most common cause: the Convex **prod** deployment hasn't been updated with the instrumented code. `git push` typically only redeploys the frontend; the Convex backend needs its own deploy.
- Fix: run `npx convex deploy` (targets prod) or, in CI, ensure `CONVEX_DEPLOY_KEY` is set and your build step runs `npx convex deploy --cmd '...'`.
- `npx convalytics verify` now polls the backend and prints recent activity per environment. If you see only `dev` under `Environments:`, prod isn't reporting. Trigger a real user action in prod and re-run verify.

**Events show in "All" but not under Dev/Prod filter:**
- The deployment type cache is populated when the project is claimed. Make sure you've completed the claim flow via the link printed by `npx convalytics init`.
- If the project was claimed before the auto-detect feature shipped, re-claim or wait for the next deploy. The cache is keyed on the live `CONVEX_CLOUD_URL` slug.

**`runMutation is not a function` / crash in queries:**
- `analytics.track()` can only be called from mutations or actions. **Never from queries.**
- The component will log a warning and skip the call if used in a query context
- Move tracking calls to the mutation that performs the write, not the query that reads data

**TypeScript errors on `analytics.track`:**
- Make sure `convex/convex.config.ts` registers the component with `app.use(analytics)`
- Run `npx convex dev` to regenerate `_generated/` types

**`components.convalytics` not found:**
- The component must be registered in `convex/convex.config.ts` before `convex dev` generates types
