"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()} type="button">
      {label}
    </Button>
  );
}
