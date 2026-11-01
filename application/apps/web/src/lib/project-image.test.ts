import { describe, expect, it } from "vitest";
import type { MediaItem } from "@brightloop/schema";
import { firstUsableImage } from "./project-image";

const item = (over: Partial<MediaItem>): MediaItem => ({
  kind: "image",
  label: "Shot",
  url: "https://cdn.example.com/a.png",
  slot: "",
  ...over,
});

describe("firstUsableImage", () => {
  it("returns the first row that is genuinely an image", () => {
    expect(firstUsableImage([item({ url: "https://cdn.example.com/one.jpg", label: "One" })]))
      .toEqual({ src: "https://cdn.example.com/one.jpg", label: "One" });
  });

  it("keeps the CMS's own order, so the editor chooses the lead image", () => {
    const found = firstUsableImage([
      item({ url: "https://cdn.example.com/first.png", label: "First" }),
      item({ url: "https://cdn.example.com/second.png", label: "Second" }),
    ]);
    expect(found?.label).toBe("First");
  });

  it("skips rows that are not images and finds the one that is", () => {
    const found = firstUsableImage([
      item({ url: "https://www.youtube.com/watch?v=abc", label: "Video" }),
      item({ url: "https://acme.com", label: "Website" }),
      item({ url: "https://cdn.example.com/real.webp", label: "Real" }),
    ]);
    expect(found?.label).toBe("Real");
  });

  it("returns null when there is no image at all", () => {
    expect(firstUsableImage([])).toBeNull();
    expect(firstUsableImage([item({ url: "https://acme.com", label: "Site" })])).toBeNull();
  });

  it("never accepts a non-https URL into an <img>", () => {
    expect(firstUsableImage([item({ url: "http://insecure.example.com/x.png" })])).toBeNull();
    expect(firstUsableImage([item({ url: "javascript:alert(1)" })])).toBeNull();
  });

  it("ignores an empty URL rather than rendering a broken image", () => {
    expect(firstUsableImage([item({ url: "" })])).toBeNull();
  });
});
