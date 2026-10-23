"use client";

import React from "react";
import { Sparkles, Zap } from "lucide-react";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/demo";
import { Button } from "@/components/ui/button";

export type DemoScenariosProps = {
  onSelectScenario?: (scenario: DemoScenario) => void;
  onInstantGenerate?: (scenario: DemoScenario) => void;
  className?: string;
};

export function DemoScenarios({
  onSelectScenario,
  onInstantGenerate,
  className = "",
}: DemoScenariosProps) {
  return (
    <section
      aria-label="Sample demo scenarios"
      className={`space-y-3 ${className}`}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
        <span>Try a sample scenario</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {DEMO_SCENARIOS.map((scenario) => (
          <div
            key={scenario.id}
            data-testid={`demo-scenario-${scenario.id}`}
            className="flex flex-col justify-between rounded-lg border bg-card p-3.5 text-card-foreground shadow-xs transition-colors hover:border-primary/50"
          >
            <div className="space-y-1">
              <h2 className="font-semibold text-sm leading-tight text-foreground">
                {scenario.label}
              </h2>
              <p className="text-xs text-muted-foreground leading-snug">
                {scenario.description}
              </p>
            </div>

            <div className="mt-3 flex flex-col gap-1.5 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center text-xs h-8 cursor-pointer"
                onClick={() => onSelectScenario?.(scenario)}
                aria-label={`Fill form with ${scenario.label} scenario`}
              >
                Fill form
              </Button>
              {onInstantGenerate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-[11px] text-muted-foreground hover:text-foreground h-7 px-1 cursor-pointer"
                  onClick={() => onInstantGenerate(scenario)}
                  aria-label={`Generate instantly (cached): ${scenario.label}`}
                >
                  <Zap className="mr-1 h-3 w-3 text-amber-500" aria-hidden="true" />
                  Generate instantly (cached)
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
