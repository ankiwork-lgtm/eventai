/**
 * tests/intake-form-characterization.test.tsx (task 5.1)
 *
 * Characterization tests for IntakeForm written before the split (task 5.3).
 *
 * Already covered elsewhere and NOT repeated:
 *   tests/intake-form.test.tsx  traditions label per type, type switching, validation,
 *                               valid submit with numeric guestCount/totalBudget/currency,
 *                               demo scenario fill, instant generate
 *   tests/landing.test.tsx      submit creates a stored record and navigates to /plan/<uuid>
 *
 * Added here: the full per-event-type template (labels, placeholders, chips for both
 * fields) and chip selection for both chip fields (append rules).
 *
 * **Validates: Requirements 3.1**
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { IntakeForm, FORM_TEMPLATES } from "@/components/IntakeForm";
import { EVENT_TYPES, type EventInput } from "@/lib/schema";

afterEach(cleanup);

function selectType(user: ReturnType<typeof userEvent.setup>, type: string) {
  const tablist = screen.getByRole("tablist", { name: /event type/i });
  return user.click(within(tablist).getByRole("tab", { name: new RegExp(type, "i") }));
}

/** The two chip-fed textareas, located by their accessible label (FormControl overrides ids). */
function field(name: "culturalTraditions" | "preferences"): HTMLTextAreaElement {
  const textareas = Array.from(document.querySelectorAll("textarea"));
  // DOM order: traditions first, preferences second.
  return textareas[name === "culturalTraditions" ? 0 : 1] as HTMLTextAreaElement;
}

describe("IntakeForm templates (per event type)", () => {
  it("exposes a template for every event type", () => {
    expect(Object.keys(FORM_TEMPLATES).sort()).toEqual([...EVENT_TYPES].sort());
  });

  for (const type of EVENT_TYPES) {
    it(`${type}: shows its labels, placeholders and both chip sets`, async () => {
      const user = userEvent.setup();
      render(<IntakeForm onSubmit={vi.fn()} />);
      if (type !== "wedding") await selectType(user, type);

      const t = FORM_TEMPLATES[type];
      expect(screen.getByText(t.traditionsLabel)).toBeTruthy();
      expect(screen.getAllByText(t.preferencesLabel).length).toBeGreaterThan(0);
      expect(field("culturalTraditions").placeholder).toBe(t.traditionsPlaceholder);
      expect(field("preferences").placeholder).toBe(t.preferencesPlaceholder);

      for (const chip of [...t.traditionsChips, ...t.preferencesChips]) {
        expect(screen.getByRole("button", { name: `Add ${chip}` })).toBeTruthy();
      }
      // Only this type's chips are rendered: 5 + 5.
      expect(screen.getAllByRole("button", { name: /^Add / })).toHaveLength(
        t.traditionsChips.length + t.preferencesChips.length,
      );
    });
  }

  it("switching type swaps the chip sets", async () => {
    const user = userEvent.setup();
    render(<IntakeForm onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add Mehendi ceremony" })).toBeTruthy();

    await selectType(user, "community");

    expect(screen.queryByRole("button", { name: "Add Mehendi ceremony" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add Permit required" })).toBeTruthy();
  });
});

describe("IntakeForm chip selection", () => {
  it("clicking a traditions chip fills that field only", async () => {
    const user = userEvent.setup();
    render(<IntakeForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add Sangeet night" }));

    expect(field("culturalTraditions").value).toBe("Sangeet night");
    expect(field("preferences").value).toBe("");
  });

  it("clicking a preferences chip fills that field only", async () => {
    const user = userEvent.setup();
    render(<IntakeForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add Live music" }));

    expect(field("preferences").value).toBe("Live music");
    expect(field("culturalTraditions").value).toBe("");
  });

  it("appends further chips with a comma separator, for both fields", async () => {
    const user = userEvent.setup();
    render(<IntakeForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add Mehendi ceremony" }));
    await user.click(screen.getByRole("button", { name: "Add Haldi ritual" }));
    expect(field("culturalTraditions").value).toBe("Mehendi ceremony, Haldi ritual");

    await user.click(screen.getByRole("button", { name: "Add Vegetarian only" }));
    await user.click(screen.getByRole("button", { name: "Add Outdoor venue" }));
    expect(field("preferences").value).toBe("Vegetarian only, Outdoor venue");
  });

  it("appends after typed text, and avoids a doubled comma when the text already ends with one", async () => {
    const user = userEvent.setup();
    render(<IntakeForm onSubmit={vi.fn()} />);

    await user.type(field("culturalTraditions"), "2-day ceremony");
    await user.click(screen.getByRole("button", { name: "Add Pheras / vows" }));
    expect(field("culturalTraditions").value).toBe("2-day ceremony, Pheras / vows");

    await user.type(field("preferences"), "No onions,");
    await user.click(screen.getByRole("button", { name: "Add Kid-friendly" }));
    expect(field("preferences").value).toBe("No onions, Kid-friendly");
  });

  it("chip text is included in the submitted values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(input: EventInput) => void>();
    render(<IntakeForm onSubmit={onSubmit} />);

    const d = new Date();
    d.setDate(d.getDate() + 3);
    const pad = (n: number) => String(n).padStart(2, "0");
    await user.type(
      screen.getByLabelText(/event date/i),
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    );
    await user.type(screen.getByLabelText(/number of guests/i), "80");
    await user.type(screen.getByLabelText(/total budget/i), "90000");
    await user.type(screen.getByLabelText(/city/i), "Goa");
    await user.click(screen.getByRole("button", { name: "Add Haldi ritual" }));
    await user.click(screen.getByRole("button", { name: "Add Live music" }));

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /generate my plan/i }));
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.culturalTraditions).toBe("Haldi ritual");
    expect(submitted.preferences).toBe("Live music");
  });
});
