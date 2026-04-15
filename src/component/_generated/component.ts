/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      track: FunctionReference<
        "mutation",
        "internal",
        {
          deploymentName?: string;
          ingestUrl: string;
          name: string;
          props?: Record<string, string | number | boolean>;
          sessionId?: string;
          timestamp?: number;
          userEmail?: string;
          userId: string;
          userName?: string;
          writeKey: string;
        },
        null,
        Name
      >;
    };
  };
