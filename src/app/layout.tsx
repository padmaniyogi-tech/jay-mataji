import type { Metadata, Viewport } from "next";
import "./globals.css";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Amplifi — compliant Instagram campaign platform",
    template: "%s · Amplifi",
  },
  description:
    "Order Instagram growth campaigns delivered through authorized advertising, approved promotional partners and vetted creators. Transparent pricing, verified reporting, no bots.",
  keywords: ["Instagram promotion", "influencer marketing", "Meta ads", "campaign management", "India"],
  openGraph: {
    title: "Amplifi — compliant Instagram campaign platform",
    description:
      "Transparent campaign ordering with verified reporting. No fake followers, no bots, no guaranteed-count promises.",
    type: "website",
    url: appUrl,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f7f4ef",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
