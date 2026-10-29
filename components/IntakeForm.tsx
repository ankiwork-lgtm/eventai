"use client";

import { useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { IntakeFormSchema, getTomorrowString } from "@/lib/form-schema";
import { EVENT_TYPES, type EventInput, type EventInputForm } from "@/lib/schema";
import { DemoScenarios } from "@/components/DemoScenarios";
import type { DemoScenario } from "@/lib/demo";

// ─── Per-type template config ────────────────────────────────────────────────

export type FormTemplate = {
  traditionsLabel: string;
  traditionsPlaceholder: string;
  traditionsChips: string[];
  preferencesLabel: string;
  preferencesPlaceholder: string;
  preferencesChips: string[];
};

export const FORM_TEMPLATES: Record<(typeof EVENT_TYPES)[number], FormTemplate> = {
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

// ─── Chip helper ─────────────────────────────────────────────────────────────

function Chip({
  label,
  onAppend,
}: {
  label: string;
  onAppend: (text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onAppend(label)}
      aria-label={`Add ${label}`}
      className="inline-flex min-h-[40px] cursor-pointer items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <Badge variant="outline" className="cursor-pointer pointer-events-none" aria-hidden="true">
        + {label}
      </Badge>
    </button>
  );
}

// ─── Component props ──────────────────────────────────────────────────────────

export type IntakeFormProps = {
  onSubmit: (input: EventInput) => void;
  onInstantGenerate?: (scenario: DemoScenario) => void;
};

// ─── IntakeForm ───────────────────────────────────────────────────────────────

const subscribeNoop = () => () => {};

export function IntakeForm({ onSubmit, onInstantGenerate }: IntakeFormProps) {
  // Tomorrow in the browser's local time; undefined on the server so SSR and
  // hydration markup match (no `min` attribute until the client takes over).
  const minDate = useSyncExternalStore(
    subscribeNoop,
    getTomorrowString,
    () => undefined,
  );

  const form = useForm<EventInputForm, unknown, EventInput>({
    resolver: zodResolver(IntakeFormSchema),
    defaultValues: {
      eventType: "wedding",
      eventName: "",
      date: "",
      guestCount: "" as unknown as number,
      totalBudget: "" as unknown as number,
      currency: "INR",
      city: "",
      theme: "",
      culturalTraditions: "",
      preferences: "",
    },
    mode: "onTouched",
  });

  const eventType = useWatch({
    control: form.control,
    name: "eventType",
  }) as (typeof EVENT_TYPES)[number];
  const template = FORM_TEMPLATES[eventType] ?? FORM_TEMPLATES.wedding;

  function appendToField(
    field: "culturalTraditions" | "preferences",
    text: string
  ) {
    const current = form.getValues(field) ?? "";
    const next = current
      ? current.trimEnd() + (current.trimEnd().endsWith(",") ? " " : ", ") + text
      : text;
    form.setValue(field, next, { shouldValidate: true, shouldDirty: true });
  }

  function handleFillScenario(scenario: DemoScenario) {
    const input = scenario.buildInput(new Date());
    form.reset(
      {
        eventType: input.eventType,
        eventName: input.eventName ?? "",
        date: input.date,
        guestCount: input.guestCount,
        totalBudget: input.totalBudget,
        currency: input.currency ?? "INR",
        city: input.city,
        theme: input.theme ?? "",
        culturalTraditions: input.culturalTraditions ?? "",
        preferences: input.preferences ?? "",
      },
      {
        keepDefaultValues: false,
      }
    );
    void form.trigger();
  }

  const {
    formState: { isValid },
  } = form;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mx-auto w-full max-w-xl space-y-5 px-4 py-6"
        noValidate
      >
        {/* ── Demo scenarios ────────────────────────────────────── */}
        <DemoScenarios
          onSelectScenario={handleFillScenario}
          onInstantGenerate={onInstantGenerate}
        />

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or customize your own
            </span>
          </div>
        </div>

        {/* ── Event type ────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="eventType"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="eventType-tabs">Event type</FormLabel>
              <Tabs
                value={field.value}
                onValueChange={(val) => field.onChange(val)}
                className="w-full"
              >
                <TabsList
                  id="eventType-tabs"
                  className="w-full"
                  aria-label="Event type"
                >
                  {EVENT_TYPES.map((t) => (
                    <TabsTrigger key={t} value={t} className="flex-1 capitalize">
                      {t}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Event name (optional) ─────────────────────────────── */}
        <FormField
          control={form.control}
          name="eventName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event name (optional)</FormLabel>
              <FormControl>
                <Input
                  id="eventName"
                  placeholder="e.g. Priya & Rohan's Wedding"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Date ─────────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event date</FormLabel>
              <FormControl>
                <Input
                  id="date"
                  type="date"
                  min={minDate}
                  suppressHydrationWarning
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Guest count ───────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="guestCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number of guests</FormLabel>
              <FormControl>
                <Input
                  id="guestCount"
                  type="number"
                  min={1}
                  max={10000}
                  placeholder="e.g. 150"
                  {...field}
                  value={field.value as string | number | undefined}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Budget + currency ─────────────────────────────────── */}
        <div className="flex gap-2">
          <FormField
            control={form.control}
            name="totalBudget"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Total budget</FormLabel>
                <FormControl>
                  <Input
                    id="totalBudget"
                    type="number"
                    min={1}
                    placeholder="e.g. 1500000"
                    {...field}
                    value={field.value as string | number | undefined}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="currency"
            render={({ field, fieldState }) => (
              <FormItem className="w-28">
                <FormLabel htmlFor="currency">Currency</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(val) => field.onChange(val)}
                >
                  <SelectTrigger
                    id="currency"
                    className="w-full"
                    aria-invalid={!!fieldState.error}
                  >
                    <SelectValue placeholder="INR" />
                  </SelectTrigger>
                  <SelectContent>
                    {(["INR", "USD", "EUR", "GBP", "AED"] as const).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* ── City ─────────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>City / location</FormLabel>
              <FormControl>
                <Input
                  id="city"
                  placeholder="e.g. Mumbai"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Theme (optional) ─────────────────────────────────── */}
        <FormField
          control={form.control}
          name="theme"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Theme (optional)</FormLabel>
              <FormControl>
                <Input
                  id="theme"
                  placeholder="e.g. royal blue, garden party, retro…"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Traditions / chips per event type ─────────────────── */}
        <FormField
          control={form.control}
          name="culturalTraditions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{template.traditionsLabel}</FormLabel>
              <FormControl>
                <Textarea
                  id="culturalTraditions"
                  placeholder={template.traditionsPlaceholder}
                  rows={3}
                  {...field}
                />
              </FormControl>
              <div className="flex flex-wrap gap-1 pt-1">
                {template.traditionsChips.map((chip) => (
                  <Chip
                    key={chip}
                    label={chip}
                    onAppend={(t) => appendToField("culturalTraditions", t)}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Preferences / chips per event type ───────────────── */}
        <FormField
          control={form.control}
          name="preferences"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{template.preferencesLabel}</FormLabel>
              <FormControl>
                <Textarea
                  id="preferences"
                  placeholder={template.preferencesPlaceholder}
                  rows={3}
                  {...field}
                />
              </FormControl>
              <div className="flex flex-wrap gap-1 pt-1">
                {template.preferencesChips.map((chip) => (
                  <Chip
                    key={chip}
                    label={chip}
                    onAppend={(t) => appendToField("preferences", t)}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Submit ───────────────────────────────────────────── */}
        <Button type="submit" className="w-full" disabled={!isValid}>
          Generate my plan →
        </Button>

        {/* ── Privacy notice (TDD §15.4) ───────────────────────── */}
        <p className="text-center text-xs text-muted-foreground">
          Your event details are sent to an AI provider to generate the plan.
          Don&apos;t enter sensitive personal data.
        </p>
      </form>
    </Form>
  );
}
