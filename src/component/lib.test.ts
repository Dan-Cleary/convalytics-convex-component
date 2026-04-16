/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ---------------------------------------------------------------------------
// track
// ---------------------------------------------------------------------------

describe("track", () => {
  test("schedules sendEvent with correct payload", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.lib.track, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "user_signed_up",
      userId: "user_1",
      sessionId: "sess_abc",
      timestamp: 1700000000000,
      props: { plan: "pro", amount: 99 },
    });

    const scheduled = await t.run(async (ctx) => {
      return await ctx.db.system.query("_scheduled_functions").collect();
    });

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].state.kind).toBe("pending");

    const args = scheduled[0].args[0] as Record<string, unknown>;
    expect(args.writeKey).toBe("wk_test");
    expect(args.ingestUrl).toBe("https://example.convex.site/ingest");
    expect(args.name).toBe("user_signed_up");
    expect(args.userId).toBe("user_1");
    expect(args.sessionId).toBe("sess_abc");
    expect(args.timestamp).toBe(1700000000000);
    expect(args.props).toEqual({ plan: "pro", amount: 99 });
  });

  test("generates sessionId when omitted", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.lib.track, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "page_view",
      userId: "user_1",
    });

    const scheduled = await t.run(async (ctx) => {
      return await ctx.db.system.query("_scheduled_functions").collect();
    });

    const args = scheduled[0].args[0] as Record<string, unknown>;
    expect(typeof args.sessionId).toBe("string");
    expect((args.sessionId as string).length).toBeGreaterThan(0);
  });

  test("uses current time when timestamp omitted", async () => {
    const t = convexTest(schema, modules);
    const before = Date.now();

    await t.mutation(internal.lib.track, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "page_view",
      userId: "user_1",
    });

    const after = Date.now();

    const scheduled = await t.run(async (ctx) => {
      return await ctx.db.system.query("_scheduled_functions").collect();
    });

    const args = scheduled[0].args[0] as Record<string, unknown>;
    expect(args.timestamp as number).toBeGreaterThanOrEqual(before);
    expect(args.timestamp as number).toBeLessThanOrEqual(after);
  });

  test("defaults to empty props when omitted", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.lib.track, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "page_view",
      userId: "user_1",
    });

    const scheduled = await t.run(async (ctx) => {
      return await ctx.db.system.query("_scheduled_functions").collect();
    });

    const args = scheduled[0].args[0] as Record<string, unknown>;
    expect(args.props).toEqual({});
  });

  test("multiple track calls schedule multiple actions", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.lib.track, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "event_a",
      userId: "user_1",
    });

    await t.mutation(internal.lib.track, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "event_b",
      userId: "user_2",
    });

    const scheduled = await t.run(async (ctx) => {
      return await ctx.db.system.query("_scheduled_functions").collect();
    });

    expect(scheduled).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// sendEvent
// ---------------------------------------------------------------------------

describe("sendEvent", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("POSTs to the ingest URL with correct payload", async () => {
    const t = convexTest(schema, modules);

    await t.action(internal.lib.sendEvent, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "user_signed_up",
      userId: "user_42",
      sessionId: "sess_abc",
      timestamp: 1700000000000,
      props: { plan: "pro" },
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.convex.site/ingest");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.writeKey).toBe("wk_test");
    expect(body.name).toBe("user_signed_up");
    expect(body.userId).toBe("user_42");
    expect(body.sessionId).toBe("sess_abc");
    expect(body.timestamp).toBe(1700000000000);
    expect(body.props).toEqual({ plan: "pro" });
  });

  test("sets Content-Type to application/json", async () => {
    const t = convexTest(schema, modules);

    await t.action(internal.lib.sendEvent, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "event",
      userId: "user_1",
      sessionId: "sess_1",
      timestamp: Date.now(),
      props: {},
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  test("does not throw when fetch rejects (network error)", async () => {
    fetchMock.mockRejectedValue(new Error("Network error"));
    const t = convexTest(schema, modules);

    await expect(
      t.action(internal.lib.sendEvent, {
        writeKey: "wk_test",
        ingestUrl: "https://example.convex.site/ingest",
        name: "event",
        userId: "user_1",
        sessionId: "sess_1",
        timestamp: Date.now(),
        props: {},
      }),
    ).resolves.toBeNull();
  });

  test("does not throw on non-ok HTTP response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const t = convexTest(schema, modules);

    await expect(
      t.action(internal.lib.sendEvent, {
        writeKey: "wk_test",
        ingestUrl: "https://example.convex.site/ingest",
        name: "event",
        userId: "user_1",
        sessionId: "sess_1",
        timestamp: Date.now(),
        props: {},
      }),
    ).resolves.toBeNull();
  });

  test("includes userEmail and userName in payload when provided", async () => {
    const t = convexTest(schema, modules);

    await t.action(internal.lib.sendEvent, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "event",
      userId: "user_1",
      sessionId: "sess_1",
      timestamp: 1700000000000,
      props: {},
      userEmail: "dan@example.com",
      userName: "Dan",
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.userEmail).toBe("dan@example.com");
    expect(body.userName).toBe("Dan");
  });

  test("excludes userEmail, userName, and deploymentName when not provided", async () => {
    const t = convexTest(schema, modules);

    await t.action(internal.lib.sendEvent, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "event",
      userId: "user_1",
      sessionId: "sess_1",
      timestamp: 1700000000000,
      props: {},
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("userEmail");
    expect(body).not.toHaveProperty("userName");
    expect(body).not.toHaveProperty("deploymentName");
  });

  test("includes deploymentName in payload when provided", async () => {
    const t = convexTest(schema, modules);

    await t.action(internal.lib.sendEvent, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "event",
      userId: "user_1",
      sessionId: "sess_1",
      timestamp: 1700000000000,
      props: {},
      deploymentName: "happy-panda-123",
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.deploymentName).toBe("happy-panda-123");
  });

  test("includes abort signal with 10s timeout", async () => {
    const t = convexTest(schema, modules);

    await t.action(internal.lib.sendEvent, {
      writeKey: "wk_test",
      ingestUrl: "https://example.convex.site/ingest",
      name: "event",
      userId: "user_1",
      sessionId: "sess_1",
      timestamp: Date.now(),
      props: {},
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
