import { describe, it, expect } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"

describe("Toaster (sonner wrapper)", () => {
  it("renders without a ThemeProvider and shows a toast", async () => {
    const { container } = render(<Toaster />)
    expect(container.ownerDocument.querySelector("section[aria-label]")).not.toBeNull()
    act(() => {
      toast.success("Saved")
    })
    expect(await screen.findByText("Saved")).toBeTruthy()
  })
})
