import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, TERMINAL_STATUSES } from "@/lib/orders/state-machine";
import { ORDER_STATUSES } from "@/lib/orders/status";

const system = { kind: "system" as const, userId: null, label: "system" };
const customer = (id = "u1") => ({ kind: "customer" as const, userId: id, label: "customer@example.com" });
const admin = { kind: "admin" as const, userId: "admin-1", label: "admin@example.com" };

describe("order state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("pending_payment", "paid", system).ok).toBe(true);
    expect(canTransition("paid", "queued", system).ok).toBe(true);
    expect(canTransition("queued", "in_progress", system).ok).toBe(true);
    expect(canTransition("in_progress", "completed", system).ok).toBe(true);
  });

  it("rejects skipping payment", () => {
    expect(canTransition("pending_payment", "in_progress", system).ok).toBe(false);
    expect(() => assertTransition("pending_payment", "completed", system)).toThrow();
  });

  it("keeps terminal states terminal", () => {
    for (const status of ORDER_STATUSES) {
      if (TERMINAL_STATUSES.has(status)) {
        expect(canTransition(status, "in_progress", system).ok).toBe(false);
      }
    }
    expect(canTransition("refunded", "paid", admin).ok).toBe(false);
  });

  it("limits what a customer can do", () => {
    expect(canTransition("pending_payment", "cancelled", customer()).ok).toBe(true);
    expect(canTransition("in_progress", "cancellation_requested", customer()).ok).toBe(true);
    // Customers can never mark an order completed or refunded themselves.
    expect(canTransition("in_progress", "completed", customer()).ok).toBe(false);
    expect(canTransition("completed", "refunded", customer()).ok).toBe(false);
    expect(canTransition("cancelled", "queued", customer()).ok).toBe(false);
  });

  it("blocks impossible staff transitions", () => {
    expect(() => assertTransition("refunded", "completed", admin)).toThrow();
    expect(() => assertTransition("pending_payment", "in_progress", admin)).toThrow();
    expect(() => assertTransition("in_progress", "completed", admin)).not.toThrow();
  });
});
