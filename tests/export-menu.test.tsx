/**
 * ExportMenu: open, select and close behaviour that exists today.
 * The arrow-key contract is intentionally not asserted here.
 *
 * **Validates: Requirements 1.18, 2.18**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportMenu } from "@/components/ExportMenu";
import type { EventInput, Plan } from "@/lib/schema";

const { downloadIcsMock, toastSuccess, toastError } = vi.hoisted(() => ({
  downloadIcsMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/export")>();
  return { ...actual, downloadIcs: downloadIcsMock };
});
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

const input: EventInput = {
  eventType: "wedding",
  date: "2030-06-15",
  guestCount: 100,
  totalBudget: 500000,
  currency: "INR",
  city: "Pune",
};

const plan: Plan = {
  summary: "s",
  budget: [{ category: "Venue", estimatedCost: 250000, percent: 50, tips: "t" }],
  timeline: [{ task: "Book venue", monthsBefore: 6, priority: "high", when: "6 months before" }],
  vendors: [],
  ideas: [],
};

const trigger = () => screen.getByRole("button", { name: /export/i });

beforeEach(() => {
  downloadIcsMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});
afterEach(cleanup);

describe("ExportMenu", () => {
  it("is closed initially and toggles open on click", async () => {
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);

    await user.click(trigger());
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("links Print to the print route in a new tab and closes on select", async () => {
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.click(trigger());
    const print = screen.getByRole("menuitem", { name: /print/i });
    expect((print).getAttribute("href")).toBe("/plan/p1/print");
    expect((print).getAttribute("target")).toBe("_blank");
    expect(print.getAttribute("rel")).toContain("noopener");
    // Prevent jsdom navigation noise
    print.addEventListener("click", (e) => e.preventDefault());
    await user.click(print);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("downloads the calendar, toasts and closes", async () => {
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: /download calendar/i }));
    expect(downloadIcsMock).toHaveBeenCalledTimes(1);
    expect(downloadIcsMock.mock.calls[0][0]).toBe("wedding-schedule.ics");
    expect(toastSuccess).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows an error toast and stays open when the calendar build fails", async () => {
    downloadIcsMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: /download calendar/i }));
    expect(toastError).toHaveBeenCalledWith("boom");
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("copies a share link to the clipboard and closes", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: /copy link/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String(writeText.mock.calls[0][0])).toContain("/plan/shared#s=");
    expect(toastSuccess).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("shows an error toast when the clipboard write fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.click(trigger());
    await user.click(screen.getByRole("menuitem", { name: /copy link/i }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Failed to copy link"));
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ExportMenu planId="p1" input={input} plan={plan} />);
    await user.click(trigger());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on outside click but not on a click inside the menu container", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">outside</button>
        <ExportMenu planId="p1" input={input} plan={plan} />
      </div>,
    );
    await user.click(trigger());
    await user.click(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it.each([
    ["no plan", { plan: null, disabled: false }],
    ["disabled flag", { plan, disabled: true }],
  ])("trigger is disabled with %s", (_label, props) => {
    render(<ExportMenu planId="p1" input={input} {...props} />);
    expect((trigger()).hasAttribute("disabled")).toBe(true);
  });
});
