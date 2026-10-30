import type { Metadata } from "next";
import { PlanPageClient } from "@/components/PlanPageClient";

export const metadata: Metadata = {
  title: "Your event plan",
};

export default function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PlanPageClient params={params} />;
}
