import type { Metadata } from "next";
import { PrintPageClient } from "@/components/PrintPageClient";

export const metadata: Metadata = {
  title: "Print view",
};

export default function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PrintPageClient params={params} />;
}
