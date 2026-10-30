"use client";

/**
 * PlanTabs (task 5.2): tab routing and content for the dashboard.
 * The active tab is owned by PlanShell (mirrored to `?tab=`); this renders
 * the tab list and each tab's skeleton-or-content.
 */

import type { ComponentProps } from "react";
import type { DeepPartial } from "ai";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { PlanView } from "@/components/PlanContext";
import { StreamingBadge } from "@/components/StreamingBadge";
import {
  BudgetSkeleton,
  IdeasSkeleton,
  TimelineSkeleton,
  VendorsSkeleton,
} from "@/components/TabSkeletons";
import { BudgetChart } from "@/components/BudgetChart";
import { Timeline } from "@/components/Timeline";
import { VendorChecklist } from "@/components/VendorChecklist";
import { IdeasGrid } from "@/components/IdeasGrid";
import type { EventInput, Plan } from "@/lib/schema";
import type { StoredPlan, ProgressState } from "@/lib/types";
import { isSectionEmpty, isSectionStreaming, TAB_SECTIONS, type TabSection } from "@/lib/streaming";

const TAB_LABELS: Record<TabSection, string> = {
  budget: "Budget",
  timeline: "Timeline",
  vendors: "Vendors",
  ideas: "Ideas",
};

/** Section data keyed by tab id, so each tab gets exactly its own section type. */
type TabItems = {
  budget: ComponentProps<typeof BudgetChart>["items"];
  timeline: ComponentProps<typeof Timeline>["items"];
  vendors: ComponentProps<typeof VendorChecklist>["vendors"];
  ideas: ComponentProps<typeof IdeasGrid>["ideas"];
};

function selectTabItems(plan: PlanView): TabItems {
  return {
    budget: plan?.budget,
    timeline: plan?.timeline,
    vendors: plan?.vendors,
    ideas: plan?.ideas,
  };
}
export function PlanTabs({
  activeTab,
  onTabChange,
  plan,
  object,
  record,
  input,
  isStreaming,
  budgetWarnings,
  toggle,
  isReadOnly,
  onDraftEmail,
}: {
  activeTab: TabSection;
  onTabChange: (value: TabSection) => void;
  plan: PlanView;
  object: DeepPartial<Plan> | undefined;
  record: StoredPlan;
  input: EventInput;
  isStreaming: boolean;
  budgetWarnings: string[];
  toggle: (kind: keyof ProgressState, key: string) => void;
  isReadOnly: boolean;
  onDraftEmail: (type: string) => void;
}) {
  const tabItems = selectTabItems(plan);

  return (
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as TabSection)}>
      <TabsList className="w-full overflow-x-auto">
        {TAB_SECTIONS.map((section) => (
          <TabsTrigger key={section} value={section} className="gap-1.5">
            {TAB_LABELS[section]}
            {isSectionStreaming(section, object, isStreaming) && (
              <StreamingBadge />
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="budget" className="pt-4">
        {isSectionEmpty("budget", object) && !record.plan ? (
          <BudgetSkeleton />
        ) : (
          <BudgetChart
            items={tabItems.budget}
            currency={input.currency}
            total={input.totalBudget}
            isStreaming={isStreaming}
            warnings={budgetWarnings}
          />
        )}
      </TabsContent>

      <TabsContent value="timeline" className="pt-4">
        {isSectionEmpty("timeline", object) && !record.plan ? (
          <TimelineSkeleton />
        ) : (
          <Timeline
            items={tabItems.timeline}
            eventDate={input.date}
            progress={record.progress}
            onToggle={toggle}
            isStreaming={isStreaming}
          />
        )}
      </TabsContent>

      <TabsContent value="vendors" className="pt-4">
        {isSectionEmpty("vendors", object) && !record.plan ? (
          <VendorsSkeleton />
        ) : (
          <VendorChecklist
            vendors={tabItems.vendors}
            progress={record.progress}
            onToggle={toggle}
            isStreaming={isStreaming}
            onDraftEmail={isReadOnly ? undefined : onDraftEmail}
          />
        )}
      </TabsContent>

      <TabsContent value="ideas" className="pt-4">
        {isSectionEmpty("ideas", object) && !record.plan ? (
          <IdeasSkeleton />
        ) : (
          <IdeasGrid
            ideas={tabItems.ideas}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
