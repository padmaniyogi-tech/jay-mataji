"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { callApi } from "@/components/app/action-button";

export function UserActions({
  userId,
  role,
  suspended,
  isSelf,
}: {
  userId: string;
  role: string;
  suspended: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [nextRole, setNextRole] = useState(role);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    try {
      const result = await callApi("/api/admin/users/action", { userId, ...body });
      if (!result.ok) {
        setError(result.error?.message ?? "Update failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (isSelf) {
    return <span className="text-[11px] text-ink-faint">Your account</span>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Select
          aria-label="User role"
          value={nextRole}
          onChange={(e) => setNextRole(e.target.value)}
          className="h-8 w-28 text-xs"
        >
          <option value="customer">customer</option>
          <option value="support">support</option>
          <option value="finance">finance</option>
          <option value="admin">admin</option>
        </Select>
        <Button size="sm" variant="secondary" disabled={nextRole === role} loading={busy === "role"} onClick={() => run({ role: nextRole }, "role")}>
          Save
        </Button>
      </div>
      <Button
        size="sm"
        variant={suspended ? "secondary" : "danger"}
        loading={busy === "suspend"}
        onClick={() => run({ suspended: !suspended }, "suspend")}
      >
        {suspended ? "Reactivate" : "Suspend"}
      </Button>
      {error && <p className="text-[11px] font-medium text-danger">{error}</p>}
    </div>
  );
}
