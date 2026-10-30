/**
 * MoodBoard gaps not covered by client-contracts-*.test.tsx: request query
 * construction, no-input behaviour, credits rendering and unmount safety.
 *
 * **Validates: Requirements 1.18, 2.18**
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MoodBoard } from "@/components/MoodBoard";
import type { EventInput } from "@/lib/schema";

const input: EventInput = {
  eventType: "wedding",
  date: "2030-06-15",
  guestCount: 100,
  totalBudget: 500000,
  currency: "INR",
  city: "Pune",
};

const image = {
  url: "https://images.unsplash.com/a.jpg",
  alt: "Garden decor",
  credit: "Jane Doe",
  link: "https://unsplash.com/@jane",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown) {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("MoodBoard", () => {
  it("does not fetch and renders nothing without input", () => {
    const f = stubFetch([]);
    const { container } = render(<MoodBoard input={null} />);
    expect(f).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });

  it("builds the query from theme, first tradition and 'decor'", async () => {
    const f = stubFetch([]);
    render(<MoodBoard input={{ ...input, theme: " garden ", culturalTraditions: "Haldi, Mehendi" }} />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    const q = new URL(String(f.mock.calls[0][0]), "http://x").searchParams.get("q");
    expect(q).toBe("garden Haldi decor");
  });

  it("falls back to the event type when there is no theme", async () => {
    const f = stubFetch([]);
    render(<MoodBoard input={input} />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    const q = new URL(String(f.mock.calls[0][0]), "http://x").searchParams.get("q");
    expect(q).toBe("wedding decor");
  });

  it("renders images with alt text and credit links for a valid response", async () => {
    stubFetch([image]);
    render(<MoodBoard input={input} />);
    expect((await screen.findByRole("img", { name: "Garden decor" })).getAttribute("src")).toBe(image.url);
    const credit = screen.getByRole("link", { name: "Jane Doe" });
    expect((credit).getAttribute("href")).toBe(image.link);
    expect((credit).getAttribute("target")).toBe("_blank");
    expect(credit.getAttribute("rel")).toContain("noopener");
  });

  it("ignores a response that arrives after unmount", async () => {
    let resolve!: (r: Response) => void;
    const f = vi.fn().mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", f);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount, container } = render(<MoodBoard input={input} />);
    unmount();
    resolve(new Response(JSON.stringify([image]), { status: 200 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector("section")).toBeNull();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
