/**
 * IdeasGrid: complete ideas render as cards, partial ones are skipped, and the
 * empty state shows when nothing is complete. MoodBoard is stubbed.
 *
 * **Validates: Requirements 1.18, 2.18**
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { IdeasGrid } from "@/components/IdeasGrid";
import { PlanProvider } from "@/components/PlanContext";
import type { EventInput } from "@/lib/schema";

const { moodBoardSpy } = vi.hoisted(() => ({ moodBoardSpy: vi.fn() }));
vi.mock("@/components/MoodBoard", () => ({
  MoodBoard: (props: { input?: unknown }) => {
    moodBoardSpy(props.input);
    return <div data-testid="moodboard" />;
  },
}));

afterEach(() => {
  cleanup();
  moodBoardSpy.mockClear();
});

describe("IdeasGrid", () => {
  it("renders a card per complete idea", () => {
    render(
      <IdeasGrid
        ideas={[
          { title: "Lantern walk", description: "Evening lanterns" },
          { title: "Photo booth", description: "Retro props" },
        ]}
      />,
    );
    expect(screen.getByText("Lantern walk")).toBeTruthy();
    expect(screen.getByText("Evening lanterns")).toBeTruthy();
    expect(screen.getByText("Photo booth")).toBeTruthy();
    expect(screen.getByTestId("moodboard")).toBeTruthy();
  });

  it("skips half-streamed, null and blank ideas", () => {
    render(
      <IdeasGrid
        ideas={[
          { title: "Only title" },
          { description: "Only description" },
          null,
          undefined,
          { title: "  ", description: "blank title" },
          { title: "Complete", description: "Done" },
        ]}
      />,
    );
    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.queryByText("Only title")).toBeNull();
    expect(screen.queryByText("Only description")).toBeNull();
    expect(screen.queryByText("blank title")).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["empty array", []],
    ["only partial ideas", [{ title: "x" }, null]],
  ])("shows the empty state for %s", (_l, ideas) => {
    render(<IdeasGrid ideas={ideas} />);
    expect(screen.getByText("No ideas yet.")).toBeTruthy();
    expect(screen.queryByTestId("moodboard")).toBeNull();
  });

  it("passes the plan context input to MoodBoard, undefined without a provider", () => {
    const ideas = [{ title: "A", description: "B" }];
    render(<IdeasGrid ideas={ideas} />);
    expect(moodBoardSpy).toHaveBeenLastCalledWith(undefined);
    cleanup();

    const input = { eventType: "wedding", city: "Pune" } as EventInput;
    render(
      <PlanProvider
        value={{
          input,
          plan: null,
          progress: { timeline: {}, vendors: {} },
          isStreaming: false,
          status: "ready",
          toggle: () => {},
        }}
      >
        <IdeasGrid ideas={ideas} />
      </PlanProvider>,
    );
    expect(moodBoardSpy).toHaveBeenLastCalledWith(input);
  });
});
