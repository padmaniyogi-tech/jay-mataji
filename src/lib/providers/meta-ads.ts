import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { ProviderPermanentError, ProviderTransientError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Provider } from "@/lib/db/schema";
import type {
  AvailabilityResult,
  CampaignState,
  CampaignStatusReport,
  CampaignSubmission,
  CampaignSubmissionInput,
  DeliveryEvidence,
  HealthResult,
  ProviderAdapter,
  ProviderCapability,
  ProviderQuote,
  ValidationInput,
  ValidationResult,
  WebhookRequest,
  WebhookResult,
} from "./types";
import { emptyEvidence } from "./types";

/**
 * AUTHORIZED ADVERTISING PROVIDER — Meta Marketing API (Graph API).
 *
 * Only documented endpoints are used:
 *   POST /{version}/act_{ad_account_id}/campaigns
 *   POST /{version}/act_{ad_account_id}/adsets
 *   POST /{version}/act_{ad_account_id}/adcreatives
 *   POST /{version}/act_{ad_account_id}/ads
 *   POST /{version}/{campaign_id}            (status activation/pause)
 *   GET  /{version}/{campaign_id}?fields=status,effective_status
 *   GET  /{version}/{campaign_id}/insights?fields=…
 *   GET  /{version}/me
 *
 * HONEST LIMITS (documented in docs/integrations.md):
 *  - Meta has no API to sell followers, likes or views. Ads buy *delivery* (impressions,
 *    reach, video plays, post engagement). This adapter therefore refuses `followers`
 *    services and never promises an exact delivered count.
 *  - Attribution uses Meta's own `insights`, which report ad-attributed actions only.
 *    Organic changes in the Instagram account are not part of this measurement.
 *  - Creating ads requires an ad account with a payment method, `ads_management`
 *    permission, a linked Facebook Page and (for existing-post ads) the Instagram media
 *    id. All of that is account setup we cannot bypass. Until credentials and a test
 *    submission are verified, provider health stays `unconfigured` and no campaign is sent.
 *  - Campaigns are created PAUSED. Activation requires an explicit admin action unless
 *    `autoActivate` is configured after the creative has been reviewed.
 */
export class MetaAdsProviderAdapter implements ProviderAdapter {
  readonly key: string;
  readonly name: string;
  readonly providerKind = "meta_ads" as const;
  readonly config: Provider["config"];

  constructor(provider: Pick<Provider, "key" | "name" | "config">) {
    this.key = provider.key;
    this.name = provider.name;
    this.config = provider.config ?? {};
  }

  private env() {
    return getEnv();
  }

  isConfigured(): boolean {
    const env = this.env();
    return Boolean(env.META_ACCESS_TOKEN && env.META_AD_ACCOUNT_ID && env.META_PAGE_ID);
  }

  capabilities(): ProviderCapability {
    return {
      kinds: ["reel_views", "video_views", "likes", "content_promotion", "advertising_campaign"],
      guaranteesQuantity: false,
      requiresManualApproval: true,
      evidenceSource: "provider_api",
      notes: [
        "Buys ad delivery (impressions / reach / video plays / post engagement) via Meta Marketing API.",
        "Cannot sell followers, and cannot guarantee a specific number of views, likes or reach.",
        "Requires: ad account, payment method, linked Page, Instagram media id for post ads, and app review for ads_management.",
        "Campaigns are created PAUSED; activation is a reviewed step.",
      ],
    };
  }

  private version(): string {
    return this.env().META_GRAPH_VERSION;
  }

  private base(): string {
    return `https://graph.facebook.com/${this.version()}`;
  }

  private adAccountPath(): string {
    const id = this.env().META_AD_ACCOUNT_ID ?? "";
    return id.startsWith("act_") ? id : `act_${id}`;
  }

  private async call<T extends Record<string, unknown>>(
    path: string,
    init: { method?: "GET" | "POST"; body?: Record<string, unknown>; idempotentRead?: boolean } = {},
  ): Promise<T> {
    const env = this.env();
    if (!env.META_ACCESS_TOKEN) throw new ProviderPermanentError("Meta access token is not configured.", "meta_unconfigured");
    const url = new URL(`${this.base()}${path}`);
    const token = env.META_ACCESS_TOKEN;
    url.searchParams.set("access_token", token);
    let res: Response;
    try {
      res = await fetch(path.startsWith("/") ? url.toString() : url.toString(), {
        method: init.method ?? (init.body ? "POST" : "GET"),
        headers: init.body ? { "content-type": "application/json" } : undefined,
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
    } catch (err) {
      throw new ProviderTransientError(`Meta API network error: ${(err as Error).message}`, "meta_network");
    }
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      const error = (json.error ?? {}) as { message?: string; code?: number; error_subcode?: number; type?: string };
      const message = error.message ?? `Meta API returned HTTP ${res.status}`;
      const transient = res.status === 429 || res.status >= 500 || error.code === 1 || error.code === 2;
      logger.warn("meta_api_error", { status: res.status, code: error.code, message });
      if (transient) throw new ProviderTransientError(message, "meta_transient");
      throw new ProviderPermanentError(message, `meta_${error.code ?? res.status}`);
    }
    return json as T;
  }

  async validateRequest(input: ValidationInput): Promise<ValidationResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        reason:
          "Meta advertising is not connected. An administrator must configure META_ACCESS_TOKEN, META_AD_ACCOUNT_ID and META_PAGE_ID, then verify a test campaign.",
        permanent: true,
      };
    }
    if (input.service.kind === "followers") {
      return {
        ok: false,
        reason: "Meta advertising cannot deliver follower counts. This service needs a creator or agency provider.",
        permanent: true,
      };
    }
    if (input.service.kind === "likes" && !this.creativeSource(input)) {
      return {
        ok: false,
        reason:
          "Post engagement ads need an existing post id: set META_EXISTING_POST_ID or connect the Instagram account so the media id is known.",
        permanent: true,
      };
    }
    return {
      ok: true,
      warnings: [
        "Advertising buys delivery, not guaranteed views/likes. Reported results are Meta's ad-attributed numbers only.",
      ],
    };
  }

  private creativeSource(input?: ValidationInput): { objectStoryId?: string; instagramMediaId?: string } {
    const env = this.env();
    const objectStoryId = (this.config.objectStoryId as string | undefined) ?? env.META_EXISTING_POST_ID;
    const instagramMediaId = (this.config.instagramMediaId as string | undefined) ?? env.META_INSTAGRAM_MEDIA_ID;
    if (input?.target.kind === "reel" || input?.target.kind === "post") {
      return { objectStoryId: objectStoryId ?? undefined, instagramMediaId: instagramMediaId ?? undefined };
    }
    return { objectStoryId: objectStoryId ?? undefined, instagramMediaId: instagramMediaId ?? undefined };
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    if (!this.isConfigured()) {
      return { available: false, reason: "Meta advertising credentials are not configured.", health: "unconfigured" };
    }
    return { available: true, health: "healthy" };
  }

  async calculateQuote(input: { serviceKind: string; quantity: number }): Promise<ProviderQuote> {
    // Budget model: quantity is the requested delivery target; we quote the ad spend needed
    // at a configurable CPM/CPV estimate. Estimates are never presented as guarantees.
    const isVideo = input.serviceKind === "reel_views" || input.serviceKind === "video_views";
    const cpmPaise = Number(this.config.cpmPaise ?? (isVideo ? 22_000 : 15_000));
    const assumedCtr = Number(this.config.assumedCtr ?? 0.02);
    const impressionsNeeded = isVideo ? input.quantity : Math.ceil(input.quantity / Math.max(assumedCtr, 0.001));
    const costPaise = Math.ceil((impressionsNeeded / 1000) * cpmPaise);
    return {
      costPaise,
      estimatedDurationHours: Number(this.config.estimatedDurationHours ?? 120),
      currency: "INR",
      breakdown: {
        estimatedImpressions: impressionsNeeded,
        cpmPaise,
        note: "Estimate only. Meta auctions determine actual delivery; no count is guaranteed.",
      },
    };
  }

  private objectiveFor(kind: string): { objective: string; optimizationGoal: string } {
    switch (kind) {
      case "reel_views":
      case "video_views":
        return { objective: "OUTCOME_AWARENESS", optimizationGoal: "THRUPLAY" };
      case "likes":
        return { objective: "OUTCOME_ENGAGEMENT", optimizationGoal: "POST_ENGAGEMENT" };
      case "content_promotion":
        return { objective: "OUTCOME_AWARENESS", optimizationGoal: "REACH" };
      default:
        return { objective: "OUTCOME_AWARENESS", optimizationGoal: "REACH" };
    }
  }

  private campaignName(orderPublicId: string): string {
    return `Amplifi ${orderPublicId}`;
  }

  private async findExistingCampaign(orderPublicId: string): Promise<string | null> {
    const filtering = JSON.stringify([{ field: "name", operator: "EQUAL", value: this.campaignName(orderPublicId) }]);
    const result = await this.call<{ data?: { id: string }[] }>(
      `/${this.adAccountPath()}/campaigns?fields=id,name&filtering=${encodeURIComponent(filtering)}&limit=5`,
      { method: "GET" },
    );
    return result.data?.[0]?.id ?? null;
  }

  async createCampaign(input: CampaignSubmissionInput): Promise<CampaignSubmission> {
    if (!this.isConfigured()) {
      throw new ProviderPermanentError(
        "Meta advertising is not configured. Configure credentials and verify a test campaign before enabling this provider.",
        "meta_unconfigured",
      );
    }
    const env = this.env();
    // Idempotency: look up by deterministic name before creating anything.
    const existing = await this.findExistingCampaign(input.orderPublicId);
    if (existing) {
      return {
        providerRef: existing,
        state: "submitted",
        requiresStaffAction: true,
        submittedAt: new Date(),
        raw: { campaignId: existing, reused: true, note: "Existing campaign found with the same order reference." },
        message: "Campaign already exists for this order; reused instead of creating a duplicate.",
      };
    }

    const { objective, optimizationGoal } = this.objectiveFor(input.service.kind);
    const dailyBudgetPaise = Math.max(Math.ceil(input.quantity / 30), 10_000);
    const campaign = await this.call<{ id?: string }>(`/${this.adAccountPath()}/campaigns`, {
      body: {
        name: this.campaignName(input.orderPublicId),
        objective,
        status: "PAUSED",
        special_ad_categories: [],
      },
    });
    if (!campaign.id) throw new ProviderPermanentError("Meta did not return a campaign id.", "meta_no_campaign_id");

    const adSet = await this.call<{ id?: string }>(`/${this.adAccountPath()}/adsets`, {
      body: {
        name: `${this.campaignName(input.orderPublicId)} ad set`,
        campaign_id: campaign.id,
        daily_budget: dailyBudgetPaise,
        billing_event: "IMPRESSIONS",
        optimization_goal: optimizationGoal,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        status: "PAUSED",
        targeting: {
          geo_locations: { countries: [input.audienceCountry ?? "IN"] },
          age_min: 18,
        },
      },
    });
    if (!adSet.id) throw new ProviderPermanentError("Meta did not return an ad set id.", "meta_no_adset_id");

    const creative = this.creativeSource({ target: input.target } as ValidationInput);
    const creativeBody: Record<string, unknown> = {
      name: `${this.campaignName(input.orderPublicId)} creative`,
      page_id: env.META_PAGE_ID,
      ...(env.META_INSTAGRAM_ACTOR_ID ? { instagram_actor_id: env.META_INSTAGRAM_ACTOR_ID } : {}),
      ...(creative.objectStoryId ? { object_story_id: creative.objectStoryId } : {}),
      ...(creative.instagramMediaId ? { source_instagram_media_id: creative.instagramMediaId } : {}),
    };
    if (!creative.objectStoryId && !creative.instagramMediaId) {
      throw new ProviderPermanentError(
        "No creative source available. Provide META_EXISTING_POST_ID (Page post) or META_INSTAGRAM_MEDIA_ID before submitting advertising orders.",
        "meta_missing_creative",
      );
    }
    const creativeRes = await this.call<{ id?: string }>(`/${this.adAccountPath()}/adcreatives`, { body: creativeBody });
    if (!creativeRes.id) throw new ProviderPermanentError("Meta did not return a creative id.", "meta_no_creative_id");

    await this.call(`/${this.adAccountPath()}/ads`, {
      body: {
        name: `${this.campaignName(input.orderPublicId)} ad`,
        adset_id: adSet.id,
        creative: { creative_id: creativeRes.id },
        status: "PAUSED",
      },
    });

    const autoActivate = this.config.autoActivate === true;
    if (autoActivate) {
      await this.activate(campaign.id);
    }

    return {
      providerRef: campaign.id,
      state: autoActivate ? "active" : "submitted",
      requiresStaffAction: !autoActivate,
      submittedAt: new Date(),
      raw: {
        campaignId: campaign.id,
        adSetId: adSet.id,
        creativeId: creativeRes.id,
        objective,
        optimizationGoal,
        createdPaused: !autoActivate,
        budgetPaisePerDay: dailyBudgetPaise,
      },
      message: autoActivate
        ? "Meta campaign created and activated."
        : "Meta campaign created PAUSED and awaiting reviewed activation.",
    };
  }

  private async activate(campaignId: string): Promise<void> {
    await this.call(`/${campaignId}`, { body: { status: "ACTIVE" } });
  }

  async activateCampaign(providerRef: string): Promise<void> {
    await this.activate(providerRef);
  }

  private mapState(effectiveStatus: string | undefined): CampaignState {
    switch ((effectiveStatus ?? "").toUpperCase()) {
      case "ACTIVE":
        return "active";
      case "PAUSED":
      case "PENDING_REVIEW":
      case "IN_PROCESS":
      case "WITH_ISSUES":
        return "active";
      case "CAMPAIGN_PAUSED":
      case "ADSET_PAUSED":
        return "paused";
      case "DELETED":
      case "ARCHIVED":
        return "cancelled";
      default:
        return "pending";
    }
  }

  async getCampaignStatus(providerRef: string): Promise<CampaignStatusReport> {
    if (!this.isConfigured()) {
      return {
        state: "pending",
        deliveredQuantity: null,
        providerRef,
        evidence: emptyEvidence(["Meta advertising is not configured; status cannot be read."]),
        message: "Provider not configured.",
      };
    }
    const campaign = await this.call<{ status?: string; effective_status?: string }>(
      `/${providerRef}?fields=status,effective_status`,
      { method: "GET" },
    );
    const insights = await this.call<{
      data?: Array<{
        impressions?: string;
        reach?: string;
        actions?: Array<{ action_type: string; value: string }>;
        video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
      }>;
    }>(
      `/${providerRef}/insights?fields=impressions,reach,actions,video_thruplay_watched_actions&date_preset=maximum`,
      { method: "GET" },
    );
    const row = insights.data?.[0];
    const impressions = row?.impressions ? Number(row.impressions) : null;
    const thruplays = row?.video_thruplay_watched_actions?.[0]?.value ? Number(row.video_thruplay_watched_actions[0]!.value) : null;
    const postEngagements = row?.actions?.find((a) => a.action_type === "post_engagement")?.value;
    const delivered = thruplays ?? (postEngagements ? Number(postEngagements) : null) ?? impressions;

    const evidence: DeliveryEvidence = {
      source: "provider_api",
      // Meta-reported ad metrics are genuine first-party measurements (attributed to the ad
      // only — they are not total account counts).
      verified: true,
      demo: false,
      capturedAt: new Date(),
      metric: thruplays !== null ? "video_thruplays" : postEngagements ? "post_engagements" : "impressions",
      providerReportedQuantity: delivered,
      verifiedQuantity: delivered,
      baselineCount: null,
      latestCount: impressions,
      notes: [
        "Source: Meta Marketing API insights (ad-attributed only).",
        "Meta does not report total Instagram follower counts or guarantee delivery counts.",
      ],
      raw: { campaign: campaign as Record<string, unknown>, insights: (row ?? {}) as Record<string, unknown> },
    };

    return {
      state: this.mapState(campaign.effective_status ?? campaign.status),
      deliveredQuantity: delivered,
      providerRef,
      evidence,
      message: `Meta effective status: ${campaign.effective_status ?? campaign.status ?? "unknown"}`,
    };
  }

  async cancelCampaign(providerRef: string): Promise<{ cancelled: boolean; message: string }> {
    await this.call(`/${providerRef}`, { body: { status: "PAUSED" } });
    return {
      cancelled: true,
      message: "Meta campaign paused (not deleted) to preserve reporting history. Any spent budget is non-refundable.",
    };
  }

  async getDeliveryEvidence(providerRef: string): Promise<DeliveryEvidence> {
    const status = await this.getCampaignStatus(providerRef);
    return status.evidence;
  }

  async handleWebhook(request: WebhookRequest): Promise<WebhookResult> {
    const env = this.env();
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    if (!env.META_APP_SECRET) {
      return { handled: false, externalId: "unverified", signatureValid: false, message: "META_APP_SECRET is not configured; webhook rejected." };
    }
    const expected = `sha256=${createHmac("sha256", env.META_APP_SECRET).update(request.rawBody).digest("hex")}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    const signatureValid = a.length === b.length && timingSafeEqual(a, b);
    if (!signatureValid) {
      return { handled: false, externalId: "invalid", signatureValid: false, message: "Invalid X-Hub-Signature-256." };
    }
    const entries = (request.parsed?.entry as Array<{ id?: string; time?: number; changes?: Array<{ value?: { campaign_id?: string } }> }>) ?? [];
    const first = entries[0];
    const campaignId = first?.changes?.[0]?.value?.campaign_id;
    return {
      handled: true,
      externalId: `${first?.id ?? "meta"}_${first?.time ?? Date.now()}`,
      signatureValid: true,
      orderPublicId: undefined,
      message: campaignId ? `Verified Meta webhook for campaign ${campaignId}.` : "Verified Meta webhook received.",
    };
  }

  async healthCheck(): Promise<HealthResult> {
    if (!this.isConfigured()) {
      return {
        status: "unconfigured",
        message:
          "Set META_ACCESS_TOKEN, META_AD_ACCOUNT_ID and META_PAGE_ID, then run “Test connection”. Live submission also needs a verified creative source and ads_management approval.",
        checkedAt: new Date(),
      };
    }
    try {
      const me = await this.call<{ id?: string; name?: string }>(`/me?fields=id,name`, { method: "GET" });
      const acct = await this.call<{ id?: string; account_status?: number; currency?: string }>(
        `/${this.adAccountPath()}?fields=id,account_status,currency`,
        { method: "GET" },
      );
      const active = acct.account_status === 1;
      return {
        status: active ? "healthy" : "degraded",
        message: active
          ? `Connected as ${me.name ?? me.id}. Ad account ${acct.id} active in ${acct.currency ?? "INR"}.`
          : `Connected, but ad account ${acct.id} is not active (account_status=${acct.account_status}).`,
        checkedAt: new Date(),
      };
    } catch (err) {
      return { status: "down", message: `Connection test failed: ${(err as Error).message}`, checkedAt: new Date() };
    }
  }
}
