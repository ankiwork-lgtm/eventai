"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function UiTestPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <Card>
        <CardHeader>
          <CardTitle>UI test</CardTitle>
          <CardDescription>shadcn/ui Button, Card and toast.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => toast.success("Toast works")}>Show toast</Button>
        </CardContent>
      </Card>
    </main>
  );
}
