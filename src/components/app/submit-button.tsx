"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonVariant } from "@/components/ui/button";

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  pendingLabel,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} loading={pending}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </Button>
  );
}
