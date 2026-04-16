import { describe, expect, test, vi, beforeEach } from "vitest";
import { Convalytics, extractDeploymentSlug, resetWarningFlag } from "./index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockCtx(overrides?: Partial<{ runMutation: unknown }>) {
  return {
    runMutation: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

const fakeComponent = {
  lib: { track: { __type: "mutation" } },
} as any;

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("Convalytics constructor", () => {
  test("uses default ingest URL when not provided", () => {
    const c = new Convalytics(fakeComponent, { writeKey: "wk_test" });
    // Verify by tracking and inspecting what gets passed
    const ctx = mockCtx();
    c.track(ctx, { name: "evt", userId: "u1" });
    expect(ctx.runMutation).toHaveBeenCalledWith(
      fakeComponent.lib.track,
      expect.objectContaining({
        ingestUrl: "https://basic-goshawk-557.convex.site/ingest",
      }),
    );
  });

  test("uses custom ingest URL when provided", () => {
    const c = new Convalytics(fakeComponent, {
      writeKey: "wk_test",
      ingestUrl: "https://custom.example.com/ingest",
    });
    const ctx = mockCtx();
    c.track(ctx, { name: "evt", userId: "u1" });
    expect(ctx.runMutation).toHaveBeenCalledWith(
      fakeComponent.lib.track,
      expect.objectContaining({
        ingestUrl: "https://custom.example.com/ingest",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// track()
// ---------------------------------------------------------------------------

describe("Convalytics.track", () => {
  test("passes writeKey, ingestUrl, and event fields to component mutation", async () => {
    const c = new Convalytics(fakeComponent, {
      writeKey: "wk_abc",
      deploymentName: "happy-panda-123",
    });
    const ctx = mockCtx();

    await c.track(ctx, {
      name: "user_signed_up",
      userId: "u42",
      props: { plan: "pro" },
    });

    expect(ctx.runMutation).toHaveBeenCalledOnce();
    expect(ctx.runMutation).toHaveBeenCalledWith(fakeComponent.lib.track, {
      writeKey: "wk_abc",
      ingestUrl: "https://basic-goshawk-557.convex.site/ingest",
      deploymentName: "happy-panda-123",
      name: "user_signed_up",
      userId: "u42",
      props: { plan: "pro" },
    });
  });

  test("passes userEmail and userName when provided", async () => {
    const c = new Convalytics(fakeComponent, { writeKey: "wk_test" });
    const ctx = mockCtx();

    await c.track(ctx, {
      name: "evt",
      userId: "u1",
      userEmail: "dan@example.com",
      userName: "Dan",
    });

    expect(ctx.runMutation).toHaveBeenCalledWith(
      fakeComponent.lib.track,
      expect.objectContaining({
        userEmail: "dan@example.com",
        userName: "Dan",
      }),
    );
  });

  test("warns and skips when called from a query context (no runMutation)", async () => {
    const c = new Convalytics(fakeComponent, { writeKey: "wk_test" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Query contexts don't have runMutation
    const queryCtx = { db: {} } as any;
    await c.track(queryCtx, { name: "evt", userId: "u1" });

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("query context");
    warnSpy.mockRestore();
  });

  test("does not throw when runMutation rejects (swallows analytics errors)", async () => {
    const c = new Convalytics(fakeComponent, { writeKey: "wk_test" });
    const ctx = mockCtx({
      runMutation: vi.fn().mockRejectedValue(new Error("Convex error")),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Should not throw
    await expect(c.track(ctx, { name: "evt", userId: "u1" })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toContain('Failed to track "evt"');
    errorSpy.mockRestore();
  });

  test("does not throw when runMutation throws synchronously", async () => {
    const c = new Convalytics(fakeComponent, { writeKey: "wk_test" });
    const ctx = mockCtx({
      runMutation: vi.fn().mockImplementation(() => {
        throw new Error("sync boom");
      }),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(c.track(ctx, { name: "evt", userId: "u1" })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// extractDeploymentSlug
// ---------------------------------------------------------------------------

describe("extractDeploymentSlug", () => {
  beforeEach(() => {
    // Clear console mocks and reset warning flag before each test
    vi.restoreAllMocks();
    resetWarningFlag();
  });

  test("extracts slug from valid Convex cloud URL", () => {
    const result = extractDeploymentSlug("https://uncommon-sandpiper-123.convex.cloud");
    expect(result).toBe("uncommon-sandpiper-123");
  });

  test("returns undefined for undefined input", () => {
    const result = extractDeploymentSlug(undefined);
    expect(result).toBe(undefined);
  });

  test("returns undefined for malformed URL and warns", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = extractDeploymentSlug("not-a-url");
    expect(result).toBe(undefined);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not parse deployment slug from CONVEX_CLOUD_URL")
    );
  });

  test("returns undefined for custom domain URL and warns", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = extractDeploymentSlug("https://app.example.com");
    expect(result).toBe(undefined);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not parse deployment slug from CONVEX_CLOUD_URL")
    );
  });

  test("extracts slug from http URL (not just https)", () => {
    const result = extractDeploymentSlug("http://brave-monkey-456.convex.cloud");
    expect(result).toBe("brave-monkey-456");
  });

  test("extracts slug from URL with path", () => {
    const result = extractDeploymentSlug("https://happy-turtle-789.convex.cloud/some/path");
    expect(result).toBe("happy-turtle-789");
  });

  test("returns undefined for URL with incorrect slug pattern and warns", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = extractDeploymentSlug("https://invalid-123.convex.cloud");
    expect(result).toBe(undefined);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not parse deployment slug from CONVEX_CLOUD_URL")
    );
  });

  test("returns undefined for empty string without warning", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = extractDeploymentSlug("");
    expect(result).toBe(undefined);
    // Empty string is falsy, so it returns early without warning
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});