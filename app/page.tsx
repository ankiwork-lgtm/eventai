import type { Metadata } from "next";
import { LandingClient } from "@/components/LandingClient";

// title.template in the root layout does not apply to a page in the same
// segment, so the full title is spelled out here.
export const metadata: Metadata = {
  title: "Plan your event | EventAI",
};

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Event Planning Assistant
        </h1>
        <p className="text-muted-foreground">
          Tell us about your wedding, birthday or community event and get a
          budget, timeline, vendor checklist and ideas tailored to you.
        </p>
      </header>
      <LandingClient />
    </main>
  );
}
