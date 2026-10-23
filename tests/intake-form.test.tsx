/**
 * tests/intake-form.test.tsx
 * P1-T08 — IntakeForm: switching type, validation errors, valid submit.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { IntakeForm, FORM_TEMPLATES } from "@/components/IntakeForm";
import type { EventInput } from "@/lib/schema";

// Clean up the DOM between tests so rendered trees don't accumulate.
afterEach(cleanup);

/** Returns a local YYYY-MM-DD string offset by `days` from today. */
function localDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dayAfterTomorrow = localDate(2);

/** Get the first tab button with given text within the Event type tablist. */
function getEventTypeTab(name: string) {
  const tablist = screen.getByRole("tablist", { name: /event type/i });
  return within(tablist).getByRole("tab", { name: new RegExp(name, "i") });
}

describe("IntakeForm — FORM_TEMPLATES", () => {
  it("wedding template has traditions label 'Traditions / ceremonies'", () => {
    expect(FORM_TEMPLATES.wedding.traditionsLabel).toBe(
      "Traditions / ceremonies"
    );
  });

  it("birthday template has traditions label 'Age & interests'", () => {
    expect(FORM_TEMPLATES.birthday.traditionsLabel).toBe("Age & interests");
  });

  it("community template has traditions label 'Expected attendance & permits'", () => {
    expect(FORM_TEMPLATES.community.traditionsLabel).toBe(
      "Expected attendance & permits"
    );
  });
});

describe("IntakeForm — render and type switching", () => {
  it("renders wedding labels by default", () => {
    render(<IntakeForm onSubmit={vi.fn()} />);
    expect(
      screen.getByText(FORM_TEMPLATES.wedding.traditionsLabel)
    ).toBeDefined();
  });

  it("switching to birthday changes the traditions label", async () => {
    const user = userEvent.setup();
    render(<IntakeForm onSubmit={vi.fn()} />);

    await user.click(getEventTypeTab("birthday"));

    expect(
      screen.getByText(FORM_TEMPLATES.birthday.traditionsLabel)
    ).toBeDefined();
    // Wedding label is gone
    expect(
      screen.queryByText(FORM_TEMPLATES.wedding.traditionsLabel)
    ).toBeNull();
  });

  it("switching to community changes the traditions label", async () => {
    const user = userEvent.setup();
    render(<IntakeForm onSubmit={vi.fn()} />);

    await user.click(getEventTypeTab("community"));

    expect(
      screen.getByText(FORM_TEMPLATES.community.traditionsLabel)
    ).toBeDefined();
    expect(
      screen.queryByText(FORM_TEMPLATES.wedding.traditionsLabel)
    ).toBeNull();
  });

  it("switching type does not change the number of text inputs", async () => {
    const user = userEvent.setup();
    render(<IntakeForm onSubmit={vi.fn()} />);

    const beforeCount = screen.getAllByRole("textbox").length;

    await user.click(getEventTypeTab("birthday"));

    const afterCount = screen.getAllByRole("textbox").length;
    expect(afterCount).toBe(beforeCount);
  });
});

describe("IntakeForm — validation errors", () => {
  it("shows date error when past date field is blurred", async () => {
    const user = userEvent.setup();
    render(<IntakeForm onSubmit={vi.fn()} />);

    // Type a complete past date into the date field, then blur.
    // After the first blur, react-hook-form (onTouched) validates the field.
    const dateInput = screen.getByLabelText(/event date/i);
    await user.type(dateInput, localDate(-1));
    await user.tab(); // triggers blur → validation runs

    await waitFor(
      () => {
        // After blur, either "Use YYYY-MM-DD" or "at least tomorrow" indicates date error
        const errorEls = screen
          .getAllByRole("paragraph")
          .filter((el) => el.textContent && el.textContent.trim().length > 0);
        expect(errorEls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  it("shows an error message when guest count is too small", async () => {
    const user = userEvent.setup();
    render(<IntakeForm onSubmit={vi.fn()} />);

    const guestInput = screen.getByLabelText(/number of guests/i);
    await user.type(guestInput, "0");
    await user.tab();

    await waitFor(
      () => {
        // Any error paragraph is present
        const errorEls = screen
          .getAllByRole("paragraph")
          .filter((el) => el.textContent && el.textContent.trim().length > 0);
        expect(errorEls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  it("submit button is disabled when required fields are empty", () => {
    render(<IntakeForm onSubmit={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /generate my plan/i });
    // base-ui Button renders a native <button> so native disabled applies
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("IntakeForm — valid submit produces correct types", () => {
  it("calls onSubmit with numbers and currency for a valid wedding form", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn<(input: EventInput) => void>();
    render(<IntakeForm onSubmit={handleSubmit} />);

    await user.type(
      screen.getByLabelText(/event name/i),
      "Priya & Rohan's Wedding"
    );
    await user.type(screen.getByLabelText(/event date/i), dayAfterTomorrow);
    await user.type(screen.getByLabelText(/number of guests/i), "150");
    await user.type(screen.getByLabelText(/total budget/i), "1500000");
    await user.type(screen.getByLabelText(/city/i), "Mumbai");

    // Currency defaults to INR — no interaction needed

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /generate my plan/i }));
    });

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });

    const submitted = handleSubmit.mock.calls[0][0];

    expect(typeof submitted.guestCount).toBe("number");
    expect(typeof submitted.totalBudget).toBe("number");
    expect(submitted.guestCount).toBe(150);
    expect(submitted.totalBudget).toBe(1500000);
    expect(submitted.currency).toBe("INR");
    expect(submitted.eventType).toBe("wedding");
    expect(submitted.city).toBe("Mumbai");
  });

  it("submitted eventType reflects the selected tab and values remain numbers", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn<(input: EventInput) => void>();
    render(<IntakeForm onSubmit={handleSubmit} />);

    await user.click(getEventTypeTab("birthday"));

    await user.type(screen.getByLabelText(/event date/i), dayAfterTomorrow);
    await user.type(screen.getByLabelText(/number of guests/i), "50");
    await user.type(screen.getByLabelText(/total budget/i), "50000");
    await user.type(screen.getByLabelText(/city/i), "Delhi");

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /generate my plan/i }));
    });

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    }, { timeout: 3000 });

    const submitted = handleSubmit.mock.calls[0][0];

    expect(submitted.eventType).toBe("birthday");
    expect(typeof submitted.guestCount).toBe("number");
    expect(typeof submitted.totalBudget).toBe("number");
    expect(submitted.currency).toBe("INR");
  });

  it("clicking demo scenario fills the form and enables immediate submission", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn<(input: EventInput) => void>();
    render(<IntakeForm onSubmit={handleSubmit} />);

    // Click "Fill form" on Mumbai wedding scenario
    const fillWeddingBtn = screen.getByRole("button", {
      name: /fill form with mumbai wedding/i,
    });
    await act(async () => {
      await user.click(fillWeddingBtn);
    });

    // Form inputs should be filled
    expect((screen.getByLabelText(/event name/i) as HTMLInputElement).value).toBe(
      "Maharashtrian Wedding"
    );
    expect((screen.getByLabelText(/number of guests/i) as HTMLInputElement).value).toBe(
      "200"
    );
    expect((screen.getByLabelText(/total budget/i) as HTMLInputElement).value).toBe(
      "1000000"
    );
    expect((screen.getByLabelText(/city/i) as HTMLInputElement).value).toBe(
      "Mumbai"
    );

    // Submit button should be enabled immediately
    const submitBtn = screen.getByRole("button", { name: /generate my plan/i });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      await user.click(submitBtn);
    });

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    const submitted = handleSubmit.mock.calls[0][0];
    expect(submitted.eventType).toBe("wedding");
    expect(submitted.guestCount).toBe(200);
    expect(submitted.totalBudget).toBe(1000000);
    expect(submitted.city).toBe("Mumbai");
    expect(submitted.culturalTraditions).toBe("Maharashtrian wedding, 2-day ceremony");
  });

  it("clicking birthday demo scenario switches event type and template chips", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn<(input: EventInput) => void>();
    render(<IntakeForm onSubmit={handleSubmit} />);

    const fillBdayBtn = screen.getByRole("button", {
      name: /fill form with superhero birthday/i,
    });
    await act(async () => {
      await user.click(fillBdayBtn);
    });

    expect(screen.getByText(FORM_TEMPLATES.birthday.traditionsLabel)).toBeDefined();
    expect((screen.getByLabelText(/city/i) as HTMLInputElement).value).toBe("Pune");
    expect((screen.getByLabelText(/number of guests/i) as HTMLInputElement).value).toBe("25");

    const submitBtn = screen.getByRole("button", { name: /generate my plan/i });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("clicking instant generate calls onInstantGenerate with scenario", async () => {
    const user = userEvent.setup();
    const handleInstant = vi.fn();
    render(<IntakeForm onSubmit={vi.fn()} onInstantGenerate={handleInstant} />);

    const instantBtn = screen.getByRole("button", {
      name: /generate instantly \(cached\): superhero birthday/i,
    });
    await user.click(instantBtn);

    expect(handleInstant).toHaveBeenCalledTimes(1);
    expect(handleInstant.mock.calls[0][0].id).toBe("birthday-superhero");
  });
});
