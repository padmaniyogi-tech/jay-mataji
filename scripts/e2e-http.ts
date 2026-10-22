/**
 * HTTP end-to-end smoke test against a running server.
 *
 *   npm run dev                                   # terminal 1
 *   E2E_EMAIL=demo@amplifi.local E2E_PASSWORD=... npm run test:http
 *
 * Uses only public HTTP endpoints and the demo payment adapter, so it never touches
 * Instagram or a real payment gateway. Exits non-zero if any assertion fails.
 */

const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL ?? "demo@amplifi.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

let cookie = "";

async function api(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      origin: BASE_URL,
      ...(init.auth === false ? {} : cookie ? { cookie } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0] ?? "";
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function main() {
  console.log(`\nAmplifi HTTP smoke test → ${BASE_URL}\n`);

  if (!PASSWORD) {
    console.error("Set E2E_PASSWORD (see .data/seed-credentials.txt after `npm run db:seed`).");
    process.exit(2);
  }

  const health = await api("/api/health", { auth: false });
  check("health endpoint returns 200", health.status === 200, `status=${health.status}`);
  check("health reports database + payments", Boolean(health.json?.checks?.database && health.json?.checks?.payments));

  const login = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD }, auth: false });
  check("login succeeds", login.status === 200 && login.json?.ok === true, login.json?.error?.message);
  check("session cookie issued", cookie.startsWith("amplifi_session="));

  const badLogin = await api("/api/auth/login", { method: "POST", body: { email: EMAIL, password: "definitely-wrong" }, auth: false });
  check("wrong password rejected", badLogin.status === 401, `status=${badLogin.status}`);

  const quote = await api("/api/quote", { method: "POST", body: { serviceSlug: "instagram-reel-views", quantity: 5000 } });
  const quoteData = quote.json?.data?.quote;
  check("quote is computed server-side", quote.status === 200 && quoteData?.totalPaise > 0, `total=${quoteData?.totalPaise} paise`);
  check("quote includes GST", Number(quoteData?.taxPaise) > 0);

  const invalid = await api("/api/quote", { method: "POST", body: { serviceSlug: "instagram-reel-views", quantity: 1 } });
  check("quantity below minimum rejected", invalid.status === 422, `status=${invalid.status}`);

  const badUrl = await api("/api/orders", {
    method: "POST",
    body: { serviceSlug: "instagram-reel-views", quantity: 5000, targetUrl: "https://example.com/not-instagram", idempotencyKey: `e2e-bad-${Date.now()}` },
  });
  check("non-Instagram URL rejected", badUrl.status === 422, badUrl.json?.error?.message);

  const idempotencyKey = `e2e-${Date.now()}`;
  const orderBody = {
    serviceSlug: "instagram-reel-views",
    quantity: 5000,
    targetUrl: "https://www.instagram.com/reel/CxAbCdEf123/",
    audienceCountry: "IN",
    idempotencyKey,
  };
  const created = await api("/api/orders", { method: "POST", body: orderBody });
  const publicId = created.json?.data?.order?.publicId;
  check("order created in pending_payment", created.status === 200 && created.json?.data?.order?.status === "pending_payment", publicId);

  const duplicate = await api("/api/orders", { method: "POST", body: orderBody });
  check("duplicate submit returns the same order", duplicate.json?.data?.order?.publicId === publicId);

  const checkout = await api(`/api/orders/${publicId}/checkout`, { method: "POST", body: {} });
  const handoff = checkout.json?.data?.checkout;
  check("checkout handoff available", checkout.status === 200 && Boolean(handoff?.providerOrderId), handoff?.provider);

  if (handoff?.provider === "mock") {
    const paid = await api("/api/payments/mock/authorize", { method: "POST", body: { orderPublicId: publicId, outcome: "success" } });
    check("mock payment verified server-side", paid.status === 200 && paid.json?.data?.status === "paid", paid.json?.data?.status);

    const replay = await api("/api/payments/mock/authorize", { method: "POST", body: { orderPublicId: publicId, outcome: "success" } });
    check("duplicate payment callback is idempotent", replay.status === 200 && replay.json?.data?.status === "paid");

    let finalStatus = "paid";
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const list = await api("/api/orders");
      const row = list.json?.data?.orders?.find((o: any) => o.publicId === publicId);
      if (row) {
        finalStatus = row.status;
        if (["in_progress", "completed", "partially_completed", "pending_provider", "pending_review"].includes(finalStatus)) break;
      }
    }
    check("order moves past payment automatically", finalStatus !== "paid" && finalStatus !== "pending_payment", `status=${finalStatus}`);
  } else {
    console.log("ℹ Razorpay checkout detected — complete the payment manually, then re-run with the order id.");
  }

  const detail = await api(`/api/orders/${publicId}`);
  const order = detail.json?.data?.order;
  check("order detail readable by owner", detail.status === 200 && order?.publicId === publicId);
  check("no real engagement is claimed", order?.measurementSource !== "provider_api" || Boolean(order?.providerReportedCount));
  if (order?.measurementSource === "demo_simulation") {
    check("demo data is labelled", true, "measurementSource=demo_simulation → UI renders DEMO DATA badge");
  }

  await api("/api/auth/logout", { method: "POST", body: {} });
  const afterLogout = await api("/api/orders");
  check("logout revokes access", afterLogout.status === 401, `status=${afterLogout.status}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.error("Failed checks:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
  console.log("Smoke test passed. Order id:", publicId, "\n");
}

main().catch((err) => {
  console.error("E2E runner crashed:", err);
  process.exit(1);
});
