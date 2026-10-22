import { cn } from "@/lib/cn";

const PATHS: Record<string, React.ReactNode> = {
  followers: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M16.5 7.5h4M18.5 5.5v4" />
    </>
  ),
  reel_views: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="4" />
      <path d="M10 9.2l4.6 2.8-4.6 2.8V9.2Z" />
    </>
  ),
  video_views: (
    <>
      <rect x="3" y="5.5" width="13" height="13" rx="3" />
      <path d="M16 10.5l4.5-2.6v8.2L16 13.5" />
    </>
  ),
  likes: <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z" />,
  content_promotion: (
    <>
      <path d="M4 10.5v3l11 5V5.5l-11 5Z" />
      <path d="M15 8.5c2 .6 3.4 1.9 3.4 3.5S17 14.9 15 15.5" />
    </>
  ),
  influencer_promotion: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5c.4-3.4 2.7-5.5 5.5-5.5 1.4 0 2.6.5 3.6 1.4" />
      <path d="m17 12 1.3 2.6 2.7.4-2 2 .5 2.8-2.5-1.4-2.5 1.4.5-2.8-2-2 2.7-.4L17 12Z" />
    </>
  ),
  advertising_campaign: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-6M22 19H2" />
    </>
  ),
};

export function ServiceIcon({ kind, className }: { kind: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-5 w-5", className)}
    >
      {PATHS[kind] ?? PATHS.advertising_campaign}
    </svg>
  );
}
