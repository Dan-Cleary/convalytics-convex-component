import type { FunctionReference } from "convex/server";

// The production Convalytics ingest endpoint.
// Override via options.ingestUrl for local development or self-hosting.
const DEFAULT_INGEST_URL = "https://api.convalytics.dev/ingest";

// Module-level flags to ensure each warning is emitted only once
let hasWarnedAboutUnparseableUrl = false;
let hasWarnedAboutMissingWriteKey = false;

// Reset the warning flags (for testing purposes)
export function resetWarningFlag(): void {
  hasWarnedAboutUnparseableUrl = false;
  hasWarnedAboutMissingWriteKey = false;
}

function warnMissingWriteKey(source: string): void {
  if (hasWarnedAboutMissingWriteKey) return;
  hasWarnedAboutMissingWriteKey = true;
  console.warn(
    `[convalytics] No writeKey configured (${source}). Events will NOT be recorded. ` +
    `Set a writeKey on the Convalytics constructor in convex/analytics.ts. ` +
    `The write key is a public ingest identifier and is safe to commit — ` +
    `see https://convalytics.dev/skill.md for setup.`,
  );
}

// Extract the Convex deployment slug (e.g. "uncommon-sandpiper-123") from the
// CONVEX_CLOUD_URL env var Convex injects into every deployment's function
// environment. Returns undefined if the URL is missing or malformed.
export function extractDeploymentSlug(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const match = url.match(/https?:\/\/([a-z]+-[a-z]+-\d+)\./);

  // If URL is present but doesn't match the expected pattern, warn once
  if (!match && !hasWarnedAboutUnparseableUrl) {
    hasWarnedAboutUnparseableUrl = true;
    console.warn(
      `[convalytics] Could not parse deployment slug from CONVEX_CLOUD_URL: "${url}". ` +
      `This may be a custom domain, self-hosted, or local deployment. ` +
      `Set the "deploymentName" option explicitly in your Convalytics constructor to tag events correctly.`
    );
  }

  return match?.[1];
}

type TrackArgs = {
  name: string;
  userId: string;
  sessionId?: string;
  timestamp?: number;
  userEmail?: string;
  userName?: string;
  props?: Record<string, string | number | boolean>;
};

// Minimal shape of the component API reference (typeof components.convalytics).
// TypeScript resolves this from the parent app's generated _generated/api.ts.
type ConvalyticsComponent = {
  lib: {
    track: FunctionReference<
      "mutation",
      "internal",
      { writeKey: string; ingestUrl: string; deploymentName?: string } & TrackArgs,
      null
    >;
  };
};

// Minimal context interface — satisfied by both MutationCtx and ActionCtx.
interface RunMutationCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runMutation(ref: FunctionReference<"mutation", any, any, any>, args?: any): Promise<any>;
}

export type { ConvalyticsComponent };

/**
 * Server-side Convalytics analytics for Convex.
 *
 * No setup mutation required — just instantiate and track.
 *
 * @example
 * ```typescript
 * // convex/analytics.ts
 * import { components } from "./_generated/api";
 * import { Convalytics } from "convalytics-dev";
 *
 * export const analytics = new Convalytics(components.convalytics, {
 *   writeKey: "wk_...",
 * });
 * ```
 *
 * The deployment name is auto-detected from `CONVEX_CLOUD_URL` at track-time,
 * so server-side events are tagged correctly on dev, preview, and prod without
 * any per-deployment configuration. Pass `deploymentName` explicitly to override.
 *
 * @example
 * ```typescript
 * // In any mutation or action:
 * await analytics.track(ctx, {
 *   name: "user_signed_up",
 *   userId: String(userId),
 *   userEmail: identity.email,
 *   props: { plan: "pro" },
 * });
 * ```
 */
export class Convalytics {
  private component: ConvalyticsComponent;
  private options: { writeKey: string; ingestUrl: string; deploymentName?: string };

  constructor(
    component: ConvalyticsComponent,
    options: { writeKey: string; ingestUrl?: string; deploymentName?: string },
  ) {
    this.component = component;
    const writeKey =
      typeof options.writeKey === "string" ? options.writeKey.trim() : "";
    if (!writeKey) {
      warnMissingWriteKey("constructor received empty or undefined writeKey");
    }
    this.options = {
      writeKey,
      ingestUrl: options.ingestUrl ?? DEFAULT_INGEST_URL,
      deploymentName: options.deploymentName,
    };
  }

  /**
   * Track a server-side event from any Convex mutation or action.
   *
   * Events are delivered asynchronously — this never blocks or throws in the caller.
   * Analytics failures are logged but never propagate.
   *
   * @example
   * ```typescript
   * export const createUser = mutation({
   *   handler: async (ctx, args) => {
   *     const userId = await ctx.db.insert("users", args);
   *     await analytics.track(ctx, {
   *       name: "user_signed_up",
   *       userId: String(userId),
   *       props: { plan: args.plan },
   *     });
   *     return userId;
   *   },
   * });
   * ```
   */
  async track(ctx: RunMutationCtx, event: TrackArgs): Promise<void> {
    if (typeof ctx.runMutation !== "function") {
      console.warn(
        `[convalytics] analytics.track("${event.name}") called from a query context — ` +
        `track() can only be used in mutations or actions. This call was ignored.`,
      );
      return;
    }
    if (!this.options.writeKey) {
      warnMissingWriteKey(`track("${event.name}") called with no writeKey`);
      return;
    }
    try {
      // Resolve deployment name at call-time so auto-detection picks up the
      // injected CONVEX_CLOUD_URL for whichever deployment is executing.
      // Typed access to process.env without pulling in @types/node.
      const env = (
        globalThis as unknown as {
          process?: { env?: Record<string, string | undefined> };
        }
      ).process?.env;
      const deploymentName =
        this.options.deploymentName ??
        extractDeploymentSlug(env?.CONVEX_CLOUD_URL);
      await ctx.runMutation(this.component.lib.track, {
        writeKey: this.options.writeKey,
        ingestUrl: this.options.ingestUrl,
        deploymentName,
        ...event,
      });
    } catch (e) {
      console.error(`[convalytics] Failed to track "${event.name}":`, e);
    }
  }
}
