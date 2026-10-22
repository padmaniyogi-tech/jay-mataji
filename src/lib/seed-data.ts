import type { ServiceMetadata } from "@/lib/db/schema";

/** Catalog definitions used by `npm run db:seed`. Prices are integer paise (INR). */

export type SeedService = {
  slug: string;
  name: string;
  kind:
    | "followers"
    | "reel_views"
    | "video_views"
    | "likes"
    | "content_promotion"
    | "influencer_promotion"
    | "advertising_campaign";
  tagline: string;
  description: string;
  eligibility: string;
  limitations: string;
  unitLabel: string;
  unitPricePaise: number;
  fixedFeePaise: number;
  minQuantity: number;
  maxQuantity: number;
  quantityStep: number;
  estimatedDurationHours: number;
  requiresContentUrl: boolean;
  requiresAudience: boolean;
  requiresBrief: boolean;
  requiresManualReview: boolean;
  sortOrder: number;
  metadata: ServiceMetadata;
  packages: Array<{ name: string; description: string; quantity: number; pricePaise: number }>;
};

export const SEED_SERVICES: SeedService[] = [
  {
    slug: "instagram-followers",
    name: "Instagram follower growth campaign",
    kind: "followers",
    tagline: "Reach new audiences through approved promotion partners and creator collaborations.",
    description:
      "A managed audience-growth campaign for a public Instagram profile. Delivery happens through an approved promotion partner or a vetted creator collaboration — never through automated follows or fake accounts. We target real, interested audiences and report what the partner actually delivered.",
    eligibility:
      "Public Instagram profile in good standing. Account must not be private. Some partners require a minimum account age or 500+ existing followers.",
    limitations:
      "Follower counts are never guaranteed. Growth depends on creative quality, audience fit and platform algorithms. We do not use bots, automation, or purchased accounts. Organic growth is never counted as campaign delivery.",
    unitLabel: "followers",
    unitPricePaise: 60,
    fixedFeePaise: 0,
    minQuantity: 100,
    maxQuantity: 50_000,
    quantityStep: 100,
    estimatedDurationHours: 168,
    requiresContentUrl: false,
    requiresAudience: true,
    requiresBrief: true,
    requiresManualReview: true,
    sortOrder: 10,
    metadata: {
      metric: "followers",
      outcome: "Audience discovery via approved promotional placements",
      notes: ["Measured baseline and partner-reported attribution are shown separately.", "No guaranteed count."],
    },
    packages: [
      { name: "Starter", description: "Test the channel with a small campaign", quantity: 500, pricePaise: 24_900 },
      { name: "Growth", description: "Best for new creator accounts", quantity: 1_000, pricePaise: 44_900 },
      { name: "Scale", description: "For established brand accounts", quantity: 2_500, pricePaise: 99_900 },
    ],
  },
  {
    slug: "instagram-reel-views",
    name: "Reel views campaign",
    kind: "reel_views",
    tagline: "Promote a published Reel to relevant audiences through authorized ad delivery.",
    description:
      "Promote an existing public Reel using authorized advertising placements. Delivery is bought as ad impressions/plays from the platform or an approved partner, and reported from first-party ad insights — not from view-count guessing.",
    eligibility:
      "A published, public Reel URL. For Meta advertising you also need a linked ad account, a Facebook Page and the Instagram media id on file (created automatically once your account is connected).",
    limitations:
      "Views are estimated, not guaranteed. Meta reports ad-attributed plays only; it does not count the total on the post. Buffering, skips and organic views are excluded from campaign reporting.",
    unitLabel: "views",
    unitPricePaise: 8,
    fixedFeePaise: 0,
    minQuantity: 500,
    maxQuantity: 500_000,
    quantityStep: 500,
    estimatedDurationHours: 96,
    requiresContentUrl: true,
    requiresAudience: true,
    requiresBrief: false,
    requiresManualReview: false,
    sortOrder: 20,
    metadata: {
      metric: "views",
      outcome: "Ad-attributed video plays",
      notes: ["Meta ads can't guarantee view counts; auctions decide delivery.", "Provider insights are the source of truth."],
    },
    packages: [
      { name: "Boost", description: "Quick test of a new Reel", quantity: 2_000, pricePaise: 15_900 },
      { name: "Momentum", description: "Support a strong-performing Reel", quantity: 10_000, pricePaise: 74_900 },
      { name: "Moment", description: "Peak-season push", quantity: 50_000, pricePaise: 359_900 },
    ],
  },
  {
    slug: "instagram-video-views",
    name: "Video views campaign",
    kind: "video_views",
    tagline: "Drive video plays on Reels and IGTV content with authorized ad delivery.",
    description:
      "A video-view campaign using advertising delivery from an authorized provider. Plays are reported by the platform's ad insights, with the exact metric documented per provider.",
    eligibility: "Public video or Reel URL. Advertising providers require a configured ad account and creative.",
    limitations: "No guaranteed volume. Ad-auction economics and creative quality determine actual delivery.",
    unitLabel: "views",
    unitPricePaise: 6,
    fixedFeePaise: 0,
    minQuantity: 1_000,
    maxQuantity: 1_000_000,
    quantityStep: 1_000,
    estimatedDurationHours: 120,
    requiresContentUrl: true,
    requiresAudience: true,
    requiresBrief: false,
    requiresManualReview: false,
    sortOrder: 30,
    metadata: { metric: "views", outcome: "Ad-attributed video plays" },
    packages: [
      { name: "Discovery", description: "Entry-level video promotion", quantity: 10_000, pricePaise: 59_900 },
      { name: "Amplify", description: "Multi-day delivery", quantity: 100_000, pricePaise: 499_900 },
    ],
  },
  {
    slug: "instagram-likes",
    name: "Post likes campaign",
    kind: "likes",
    tagline: "Promote a specific post or Reel to an engaged audience.",
    description:
      "Post engagement advertising that puts a published post in front of relevant people. Engagement is reported from the provider's ad insights; we never claim that the post's total like count equals campaign delivery.",
    eligibility: "Public post or Reel URL. Advertising providers need an existing post id on file.",
    limitations:
      "Likes cannot be guaranteed. Platforms prohibit artificial engagement, so this service only uses genuine ad delivery. Reported likes are ad-attributed actions.",
    unitLabel: "likes",
    unitPricePaise: 120,
    fixedFeePaise: 0,
    minQuantity: 50,
    maxQuantity: 100_000,
    quantityStep: 50,
    estimatedDurationHours: 72,
    requiresContentUrl: true,
    requiresAudience: true,
    requiresBrief: false,
    requiresManualReview: false,
    sortOrder: 40,
    metadata: { metric: "likes", outcome: "Ad-attributed post engagement" },
    packages: [
      { name: "Test", description: "Small engagement test", quantity: 100, pricePaise: 9_900 },
      { name: "Traction", description: "Push a promising post", quantity: 500, pricePaise: 39_900 },
      { name: "Hero", description: "Sustain a hero post", quantity: 1_000, pricePaise: 69_900 },
    ],
  },
  {
    slug: "instagram-content-promotion",
    name: "Content promotion campaign",
    kind: "content_promotion",
    tagline: "A managed multi-day promotion plan for a profile, post or Reel.",
    description:
      "Our campaign team builds a promotion plan across authorized ad placements and approved partners, then optimises against your brief. You get a report of impressions, reach and engagement sourced from provider insights.",
    eligibility: "Public profile or content URL. A campaign brief and target market are required.",
    limitations:
      "Reach and engagement are estimates, never guarantees. Creative must comply with platform ad policies. Some categories need additional review.",
    unitLabel: "impressions",
    unitPricePaise: 3,
    fixedFeePaise: 99_900,
    minQuantity: 5_000,
    maxQuantity: 1_000_000,
    quantityStep: 1_000,
    estimatedDurationHours: 168,
    requiresContentUrl: false,
    requiresAudience: true,
    requiresBrief: true,
    requiresManualReview: true,
    sortOrder: 50,
    metadata: { metric: "impressions", outcome: "Ad-attributed impressions and reach" },
    packages: [],
  },
  {
    slug: "influencer-promotion",
    name: "Influencer promotion",
    kind: "influencer_promotion",
    tagline: "Brief-vetted creators publish authentic content for your brand.",
    description:
      "Tell us your objective and we assign an approved creator who fits your audience. Creators disclose sponsorships, publish on their own handles, and report deliverables with screenshots and links. This is a human, contractual collaboration — not scripted engagement.",
    eligibility:
      "A campaign brief, target market and budget. Brand-safe products only. Some categories (alcohol, gambling, health claims) are not accepted.",
    limitations:
      "Creator deliverables are tracked; sales, follower growth or virality are never guaranteed. Timelines depend on creator availability and creative approvals.",
    unitLabel: "creator deliverables",
    unitPricePaise: 250_000,
    fixedFeePaise: 0,
    minQuantity: 1,
    maxQuantity: 20,
    quantityStep: 1,
    estimatedDurationHours: 336,
    requiresContentUrl: false,
    requiresAudience: true,
    requiresBrief: true,
    requiresManualReview: true,
    sortOrder: 60,
    metadata: {
      metric: "none",
      outcome: "Contractual creator deliverables (posts, stories, Reels)",
      notes: ["A human campaign manager assigns and verifies each deliverable.", "No engagement counts are promised."],
      providerKinds: ["manual", "agency"],
    },
    packages: [
      { name: "Single creator post", description: "One feed post or Reel", quantity: 1, pricePaise: 249_900 },
      { name: "Creator bundle", description: "Three deliverables across two creators", quantity: 3, pricePaise: 649_900 },
    ],
  },
  {
    slug: "instagram-advertising-campaign",
    name: "Instagram advertising campaign",
    kind: "advertising_campaign",
    tagline: "Managed ad campaigns through authorized Meta advertising.",
    description:
      "We set up and manage an Instagram ad campaign through the official Meta Marketing API using your ad account. Budget is spent in the auction; delivery is reported from Meta insights. Campaign structure, targeting and creative are reviewed before activation.",
    eligibility:
      "A Meta ad account with a valid payment method, a linked Facebook Page, `ads_management` permission and (for post ads) an Instagram media id. Campaigns start PAUSED until creative review passes.",
    limitations:
      "We cannot guarantee reach, views or conversions. Spend is subject to Meta's auction and policy review. Spent budget is non-refundable even if results disappoint. Followers cannot be purchased through ads.",
    unitLabel: "estimated impressions",
    unitPricePaise: 2,
    fixedFeePaise: 49_900,
    minQuantity: 5_000,
    maxQuantity: 2_000_000,
    quantityStep: 1_000,
    estimatedDurationHours: 168,
    requiresContentUrl: false,
    requiresAudience: true,
    requiresBrief: true,
    requiresManualReview: true,
    sortOrder: 70,
    metadata: {
      metric: "impressions",
      outcome: "Meta-reported ad impressions, reach and engagement",
      notes: ["Meta ads buy delivery, not followers.", "Requires a verified ad account connection."],
    },
    packages: [],
  },
];

export const SEED_PROVIDERS = [
  {
    key: "demo-simulator",
    name: "Demo simulator (no real delivery)",
    kind: "mock" as const,
    description:
      "Local simulation used to exercise the full ordering workflow. Never contacts Instagram and never generates engagement. Every measurement is labelled DEMO DATA.",
    enabled: true,
    supportedKinds: ["followers", "reel_views", "video_views", "likes", "content_promotion", "advertising_campaign"],
    minQuantity: 1,
    maxQuantity: 10_000_000,
    costPerUnitPaise: 0,
    fixedCostPaise: 0,
    estimatedDurationHours: 1,
    reliabilityScore: 50,
    priority: 5,
    health: "healthy" as const,
    config: { simulationSeconds: 90, pollSeconds: 5 },
  },
  {
    key: "campaign-team",
    name: "Campaign team (creator assignment)",
    kind: "manual" as const,
    description:
      "Staffed campaign operations: creators are assigned and deliverables verified by hand. Routes influencer and managed campaigns to a human review queue.",
    enabled: true,
    supportedKinds: ["followers", "likes", "reel_views", "video_views", "content_promotion", "influencer_promotion", "advertising_campaign"],
    minQuantity: 1,
    maxQuantity: 1_000_000,
    costPerUnitPaise: 0,
    fixedCostPaise: 0,
    estimatedDurationHours: 168,
    reliabilityScore: 90,
    priority: 50,
    health: "healthy" as const,
    config: { maxConcurrentBriefs: 25, estimatedDurationHours: 168, teamEmail: "campaigns@amplifi.local" },
  },
  {
    key: "meta-ads",
    name: "Meta Ads (Marketing API)",
    kind: "meta_ads" as const,
    description:
      "Authorized Instagram advertising through the Meta Marketing API. Requires credentials, a linked Page, a media source and a verified test campaign before it can be enabled.",
    enabled: false,
    supportedKinds: ["reel_views", "video_views", "likes", "content_promotion", "advertising_campaign"],
    minQuantity: 500,
    maxQuantity: 5_000_000,
    costPerUnitPaise: 0,
    fixedCostPaise: 0,
    estimatedDurationHours: 120,
    reliabilityScore: 85,
    priority: 20,
    health: "unconfigured" as const,
    config: { cpmPaise: 22_000, assumedCtr: 0.02, autoActivate: false, pollSeconds: 300, estimatedDurationHours: 120 },
  },
  {
    key: "approved-agency",
    name: "Approved promotional agency",
    kind: "agency" as const,
    description:
      "An external, contracted promotional partner speaking our documented partner API. Disabled until onboarding, sandbox verification and a signed test campaign are complete.",
    enabled: false,
    supportedKinds: ["followers", "likes", "reel_views", "video_views", "content_promotion", "influencer_promotion", "advertising_campaign"],
    minQuantity: 100,
    maxQuantity: 2_000_000,
    costPerUnitPaise: 0,
    fixedCostPaise: 0,
    estimatedDurationHours: 120,
    reliabilityScore: 75,
    priority: 30,
    health: "unconfigured" as const,
    config: { estimatedDurationHours: 120, pollSeconds: 300 },
  },
];

export const SEED_COUPONS = [
  {
    code: "WELCOME10",
    type: "percent" as const,
    value: 1000, // 10% in basis points
    description: "10% off your first campaign (max ₹500)",
    minOrderPaise: 49_900,
    maxDiscountPaise: 50_000,
    maxRedemptions: 1000,
  },
  {
    code: "DEMO100",
    type: "fixed" as const,
    value: 10_000,
    description: "₹100 off demo orders over ₹299",
    minOrderPaise: 29_900,
    maxDiscountPaise: null,
    maxRedemptions: null,
  },
];
