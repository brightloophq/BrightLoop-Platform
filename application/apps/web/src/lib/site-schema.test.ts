import { describe, expect, it } from "vitest";
import { SITE_ORIGIN } from "@brightloop/domain";
import { siteSchema } from "./site-schema";
import { CONTACT_EMAIL, SOCIAL_PROFILES, absoluteUrl, siteOrigin } from "./site";

const graph = () => siteSchema()["@graph"];
const organization = () => graph().find((n) => n["@type"] === "Organization")!;
const website = () => graph().find((n) => n["@type"] === "WebSite")!;

describe("site identity", () => {
  it("names the domain the site actually answers on", () => {
    // The canonical origin was another brand's domain for the whole of the
    // site's life, which told crawlers every page was a copy of one elsewhere.
    expect(SITE_ORIGIN).toBe("https://auxion.xyz");
    expect(siteOrigin()).toBe("https://auxion.xyz");
  });

  it("builds absolute URLs against that origin", () => {
    expect(absoluteUrl("/contact")).toBe("https://auxion.xyz/contact");
    expect(absoluteUrl("/brand/mark.png")).toBe("https://auxion.xyz/brand/mark.png");
  });
});

describe("siteSchema", () => {
  it("declares the organization a crawler finds nothing else about", () => {
    const org = organization();
    expect(org["name"]).toBe("Auxion");
    expect(org["url"]).toBe("https://auxion.xyz/");
    expect(org["email"]).toBe(CONTACT_EMAIL);
  });

  it("links the WebSite to the Organization by id rather than repeating it", () => {
    expect(website()["publisher"]).toEqual({ "@id": organization()["@id"] });
  });

  it("publishes a contact route a machine can follow", () => {
    const points = organization()["contactPoint"] as Record<string, unknown>[];
    expect(points[0]!["email"]).toBe(CONTACT_EMAIL);
    expect(points[0]!["url"]).toBe("https://auxion.xyz/contact");
  });

  it("publishes the declared profiles as sameAs", () => {
    expect(SOCIAL_PROFILES.length).toBeGreaterThan(0);
    expect(organization()["sameAs"]).toEqual(SOCIAL_PROFILES.map((p) => p.href));
  });

  it("links only to profiles over https, with no placeholder left in", () => {
    for (const profile of SOCIAL_PROFILES) {
      const url = new URL(profile.href);
      expect(url.protocol).toBe("https:");
      // A handle segment, not a bare host — a link to instagram.com is not a
      // profile, and would be a `sameAs` identifying nobody.
      expect(url.pathname.replace(/\/+$/, "").length).toBeGreaterThan(1);
      expect(profile.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not list the same account twice", () => {
    const hrefs = SOCIAL_PROFILES.map((p) => p.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("asserts nothing it cannot source", () => {
    const org = organization();
    for (const invented of ["address", "telephone", "foundingDate", "numberOfEmployees", "aggregateRating"]) {
      expect(invented in org).toBe(false);
    }
  });

  it("is serialisable as one JSON-LD document", () => {
    expect(() => JSON.stringify(siteSchema())).not.toThrow();
    expect(siteSchema()["@context"]).toBe("https://schema.org");
  });
});
