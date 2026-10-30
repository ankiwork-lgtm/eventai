import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/moodboard", () => {
  const originalEnv = process.env.UNSPLASH_ACCESS_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.UNSPLASH_ACCESS_KEY = originalEnv;
  });

  it("returns empty array when UNSPLASH_ACCESS_KEY is not configured", async () => {
    delete process.env.UNSPLASH_ACCESS_KEY;
    const { GET } = await import("@/app/api/moodboard/route");
    const req = new Request("http://localhost/api/moodboard?q=wedding+decor");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("returns empty array when query is empty", async () => {
    process.env.UNSPLASH_ACCESS_KEY = "mock-key";
    const { GET } = await import("@/app/api/moodboard/route");
    const req = new Request("http://localhost/api/moodboard?q=");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  // Contract change (task 2.5): 429 now returns the shared error envelope
  // (previously a bare []) plus Retry-After.
  it("returns the 429 envelope with Retry-After when rate limited", async () => {
    delete process.env.UNSPLASH_ACCESS_KEY;
    const { GET } = await import("@/app/api/moodboard/route");
    const mk = () =>
      new Request("http://localhost/api/moodboard?q=x", {
        headers: { "x-real-ip": "203.0.113.77" },
      });
    let res: Response = await GET(mk());
    for (let i = 0; i < 40 && res.status !== 429; i++) res = await GET(mk());

    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = await res.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.details).toEqual({});
  });

  it("returns empty array with 200 when upstream fails", async () => {
    process.env.UNSPLASH_ACCESS_KEY = "mock-key";
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as unknown as Response);
    const { GET } = await import("@/app/api/moodboard/route");
    const res = await GET(
      new Request("http://localhost/api/moodboard?q=a", {
        headers: { "x-real-ip": "203.0.113.78" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("fetches and maps images from Unsplash when key is configured", async () => {
    process.env.UNSPLASH_ACCESS_KEY = "mock-key";

    const mockUnsplashResponse = {
      results: [
        {
          urls: { regular: "https://images.unsplash.com/photo-1", small: "https://images.unsplash.com/photo-1-small" },
          alt_description: "Beautiful floral mandap",
          user: { name: "Ananya Sharma", links: { html: "https://unsplash.com/@ananya" } },
        },
        {
          urls: { regular: "https://images.unsplash.com/photo-2", small: "https://images.unsplash.com/photo-2-small" },
          alt_description: "Fairy lights canopy",
          user: { name: "David Miller", links: { html: "https://unsplash.com/@david" } },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockUnsplashResponse),
    } as unknown as Response);

    const { GET } = await import("@/app/api/moodboard/route");
    const req = new Request("http://localhost/api/moodboard?q=royal+wedding+decor");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data[0].credit).toBe("Ananya Sharma");
    expect(data[0].alt).toBe("Beautiful floral mandap");
    expect(data[0].link).toContain("utm_source=eventai");
  });
});
