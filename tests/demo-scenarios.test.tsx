import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { DemoScenarios } from "@/components/DemoScenarios";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/demo";

afterEach(cleanup);

describe("DemoScenarios component", () => {
  it("renders all 3 demo scenarios with titles and descriptions", () => {
    render(<DemoScenarios />);

    for (const scenario of DEMO_SCENARIOS) {
      expect(screen.getByText(scenario.label)).toBeDefined();
      expect(screen.getByText(scenario.description)).toBeDefined();
    }
  });

  it("has accessible section label and button labels", () => {
    render(<DemoScenarios onSelectScenario={vi.fn()} onInstantGenerate={vi.fn()} />);

    expect(screen.getByRole("region", { name: /demo scenarios/i })).toBeDefined();

    for (const scenario of DEMO_SCENARIOS) {
      expect(
        screen.getByRole("button", { name: `Fill form with ${scenario.label} scenario` })
      ).toBeDefined();
      expect(
        screen.getByRole("button", { name: `Generate instantly (cached): ${scenario.label}` })
      ).toBeDefined();
    }
  });

  it("calls onSelectScenario when 'Fill form' button is clicked", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn<(scenario: DemoScenario) => void>();
    render(<DemoScenarios onSelectScenario={handleSelect} />);

    const fillButton = screen.getByRole("button", {
      name: `Fill form with ${DEMO_SCENARIOS[0].label} scenario`,
    });
    await user.click(fillButton);

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(DEMO_SCENARIOS[0]);
  });

  it("calls onInstantGenerate when 'Generate instantly (cached)' button is clicked", async () => {
    const user = userEvent.setup();
    const handleInstant = vi.fn<(scenario: DemoScenario) => void>();
    render(<DemoScenarios onInstantGenerate={handleInstant} />);

    const instantButton = screen.getByRole("button", {
      name: `Generate instantly (cached): ${DEMO_SCENARIOS[1].label}`,
    });
    await user.click(instantButton);

    expect(handleInstant).toHaveBeenCalledTimes(1);
    expect(handleInstant).toHaveBeenCalledWith(DEMO_SCENARIOS[1]);
  });

  it("does not render instant generate button when onInstantGenerate is omitted", () => {
    render(<DemoScenarios onSelectScenario={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /instantly \(cached\)/i })).toBeNull();
  });
});
