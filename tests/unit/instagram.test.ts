import { describe, expect, it } from "vitest";
import { allowedTargetKinds, InstagramUrlError, parseInstagramUrl, validateTargetForService } from "@/lib/instagram";

describe("instagram URL parsing", () => {
  it("accepts public profile URLs", () => {
    const target = parseInstagramUrl("https://www.instagram.com/nike/?hl=en");
    expect(target.kind).toBe("profile");
    expect(target.handle).toBe("nike");
    expect(target.normalizedUrl).toBe("https://www.instagram.com/nike/");
  });

  it("accepts post, reel and IGTV links", () => {
    expect(parseInstagramUrl("https://instagram.com/p/CxAbCdEf123/").kind).toBe("post");
    expect(parseInstagramUrl("https://instagram.com/reel/CxAbCdEf123/").kind).toBe("reel");
    expect(parseInstagramUrl("https://instagram.com/tv/CxAbCdEf123/").kind).toBe("video");
  });

  it("rejects non-Instagram hosts and credential-bearing links", () => {
    expect(() => parseInstagramUrl("https://example.com/nike")).toThrow(InstagramUrlError);
    expect(() => parseInstagramUrl("https://instagram.com.evil.test/nike")).toThrow(InstagramUrlError);
    expect(() => parseInstagramUrl("javascript:alert(1)")).toThrow(InstagramUrlError);
    expect(() => parseInstagramUrl("https://instagram.com/explore")).toThrow(InstagramUrlError);
  });

  it("rejects malformed handles and shortcodes", () => {
    expect(() => parseInstagramUrl("https://instagram.com/a_b-c")).toThrow(InstagramUrlError);
    expect(() => parseInstagramUrl("https://instagram.com/p/abc")).toThrow(InstagramUrlError);
    expect(() => parseInstagramUrl("https://instagram.com/in valid")).toThrow(InstagramUrlError);
    expect(() => parseInstagramUrl(`https://instagram.com/${"a".repeat(31)}`)).toThrow(InstagramUrlError);
  });

  it("only allows target kinds a service can deliver", () => {
    expect(allowedTargetKinds("followers")).toEqual(["profile"]);
    expect(allowedTargetKinds("reel_views")).toEqual(["reel", "video"]);
    expect(() => validateTargetForService("https://instagram.com/amplifi.demo", "likes")).toThrow(InstagramUrlError);
    expect(validateTargetForService("https://instagram.com/p/CxAbCdEf123/", "likes").kind).toBe("post");
  });
});
