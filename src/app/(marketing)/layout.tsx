import { getSessionUser } from "@/lib/auth/session";
import { ensureDatabaseReady } from "@/lib/db/bootstrap";
import { DemoBanner } from "@/components/layout/demo-banner";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  await ensureDatabaseReady();
  const user = await getSessionUser();
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <SiteHeader user={user} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
