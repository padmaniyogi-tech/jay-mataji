import { z } from "zod";

/**
 * Instagram URL validation.
 *
 * We only accept public profile / post / Reel / IGTV URLs. We never ask for or store
 * passwords, session cookies or access tokens, and nothing here calls Instagram.
 */

export const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
  "www.instagr.am",
]);

/** Path segments that look like usernames but are Instagram product routes. */
const RESERVED_SEGMENTS = new Set([
  "about",
  "accounts",
  "api",
  "ar",
  "challenge",
  "developer",
  "direct",
  "directory",
  "emails",
  "explore",
  "graphql",
  "help",
  "legal",
  "locations",
  "oauth",
  "p",
  "press",
  "privacy",
  "reel",
  "reels",
  "session",
  "stories",
  "tags",
  "terms",
  "tv",
  "web",
]);

const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;
const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,60}$/;

export type InstagramTargetKind = "profile" | "post" | "reel" | "video";

export type InstagramTarget = {
  kind: InstagramTargetKind;
  /** Present for profile URLs. */
  handle?: string;
  /** Present for post/reel/video URLs. */
  shortcode?: string;
  normalizedUrl: string;
  host: string;
};

export class InstagramUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramUrlError";
  }
}

export function parseInstagramUrl(input: string): InstagramTarget {
  const trimmed = input.trim();
  if (!trimmed) throw new InstagramUrlError("Enter an Instagram profile or post URL.");

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new InstagramUrlError("That doesn't look like a valid URL. Example: https://www.instagram.com/yourbrand/");
  }

  if (url.username || url.password) {
    throw new InstagramUrlError("URLs containing credentials are not accepted.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new InstagramUrlError("Only http(s) Instagram URLs are supported.");
  }
  const host = url.hostname.toLowerCase();
  if (!INSTAGRAM_HOSTS.has(host)) {
    throw new InstagramUrlError("Only instagram.com links are supported for Instagram services.");
  }

  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    throw new InstagramUrlError("Link to a specific profile or post, not the Instagram homepage.");
  }

  const [first, second] = segments;
  const lowerFirst = (first ?? "").toLowerCase();

  if (lowerFirst === "p" || lowerFirst === "reel" || lowerFirst === "reels" || lowerFirst === "tv") {
    if (!second || !SHORTCODE_RE.test(second)) {
      throw new InstagramUrlError("This post URL is missing a valid shortcode.");
    }
    const kind: InstagramTargetKind = lowerFirst === "p" ? "post" : lowerFirst === "tv" ? "video" : "reel";
    const prefix = kind === "post" ? "p" : kind === "video" ? "tv" : "reel";
    return {
      kind,
      shortcode: second,
      host,
      normalizedUrl: `https://www.instagram.com/${prefix}/${second}/`,
    };
  }

  if (RESERVED_SEGMENTS.has(lowerFirst)) {
    throw new InstagramUrlError(
      "That Instagram page isn't a public profile or post. Use a profile URL (/username/) or a post URL (/p/…, /reel/…).",
    );
  }

  if (segments.length > 1) {
    throw new InstagramUrlError("Use the base profile URL only (for example https://www.instagram.com/yourbrand/).");
  }

  const handle = first ?? "";
  if (!USERNAME_RE.test(handle)) {
    throw new InstagramUrlError("Instagram usernames can contain letters, numbers, periods and underscores (max 30).");
  }

  return {
    kind: "profile",
    handle,
    host,
    normalizedUrl: `https://www.instagram.com/${handle}/`,
  };
}

/** Which URL shapes each service kind can target. */
export function allowedTargetKinds(serviceKind: string): InstagramTargetKind[] {
  switch (serviceKind) {
    case "followers":
    case "influencer_promotion":
      return ["profile"];
    case "likes":
      return ["post", "reel", "video"];
    case "reel_views":
      return ["reel", "video"];
    case "video_views":
      return ["reel", "video", "post"];
    case "content_promotion":
      return ["profile", "post", "reel", "video"];
    case "advertising_campaign":
      return ["profile", "post", "reel", "video"];
    default:
      return ["profile", "post", "reel", "video"];
  }
}

export const instagramUrlSchema = z
  .string()
  .trim()
  .min(8, "Enter an Instagram URL")
  .max(300, "URL is too long")
  .superRefine((value, ctx) => {
    try {
      parseInstagramUrl(value);
    } catch (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (err as Error).message });
    }
  });

export function validateTargetForService(url: string, serviceKind: string): InstagramTarget {
  const target = parseInstagramUrl(url);
  const allowed = allowedTargetKinds(serviceKind);
  if (!allowed.includes(target.kind)) {
    const labels: Record<InstagramTargetKind, string> = {
      profile: "a profile URL",
      post: "a post URL (/p/…)",
      reel: "a Reel URL (/reel/…)",
      video: "an IGTV/video URL (/tv/…)",
    };
    throw new InstagramUrlError(
      `This service needs ${allowed.map((a) => labels[a]).join(" or ")}. You provided ${labels[target.kind]}.`,
    );
  }
  return target;
}
