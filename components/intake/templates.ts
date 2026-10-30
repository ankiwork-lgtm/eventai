import type { EventType } from "@/lib/schema";

// Per-event-type form copy and quick-add chips.

export type FormTemplate = {
  traditionsLabel: string;
  traditionsPlaceholder: string;
  traditionsChips: string[];
  preferencesLabel: string;
  preferencesPlaceholder: string;
  preferencesChips: string[];
};

export const FORM_TEMPLATES: Record<EventType, FormTemplate> = {
  wedding: {
    traditionsLabel: "Traditions / ceremonies",
    traditionsPlaceholder:
      "e.g. Maharashtrian wedding, 2-day ceremony, mehendi, sangeet…",
    traditionsChips: [
      "Mehendi ceremony",
      "Sangeet night",
      "Haldi ritual",
      "Pheras / vows",
      "Multi-day event",
    ],
    preferencesLabel: "Preferences & requirements",
    preferencesPlaceholder:
      "e.g. vegetarian menu, outdoor venue, live music, 500 guests…",
    preferencesChips: [
      "Vegetarian only",
      "Outdoor venue",
      "Live music",
      "Destination wedding",
      "Kid-friendly",
    ],
  },
  birthday: {
    traditionsLabel: "Age & interests",
    traditionsPlaceholder:
      "e.g. turning 7, loves superheroes, adult milestone birthday…",
    traditionsChips: [
      "Kid's party",
      "Teen party",
      "Milestone (18/21/30/50)",
      "Surprise party",
      "Superhero theme",
    ],
    preferencesLabel: "Preferences & requirements",
    preferencesPlaceholder:
      "e.g. return gifts, cake flavour, entertainment, outdoor…",
    preferencesChips: [
      "Return gifts",
      "Outdoor setting",
      "DJ / live music",
      "Photo booth",
      "Activities for kids",
    ],
  },
  community: {
    traditionsLabel: "Expected attendance & permits",
    traditionsPlaceholder:
      "e.g. neighbourhood Diwali mela, 300 attendees, requires park permit…",
    traditionsChips: [
      "Park / public space",
      "Permit required",
      "Volunteer-run",
      "Sponsorship needed",
      "Outdoor stalls",
    ],
    preferencesLabel: "Preferences & requirements",
    preferencesPlaceholder:
      "e.g. accessibility, safety marshals, publicity plan, low budget…",
    preferencesChips: [
      "Accessibility provisions",
      "Safety marshals",
      "Publicity / flyers",
      "Stall vendors",
      "Cultural programme",
    ],
  },
};
