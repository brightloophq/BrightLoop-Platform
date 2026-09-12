import { describe, expect, it } from "vitest";
import { MEDIA_LIMIT, isMediaKind, readProjectMedia } from "./project-media";

/** Build the three parallel arrays MediaFields submits. */
function form(rows: { kind?: string; label?: string; url?: string }[]): FormData {
  const fd = new FormData();
  for (const row of rows) {
    fd.append("mediaKind", row.kind ?? "image");
    fd.append("mediaLabel", row.label ?? "");
    fd.append("mediaUrl", row.url ?? "");
  }
  return fd;
}

function media(result: ReturnType<typeof readProjectMedia>) {
  if ("error" in result) throw new Error(`expected media, got error: ${result.error}`);
  return result.media;
}

function error(result: ReturnType<typeof readProjectMedia>) {
  if (!("error" in result)) throw new Error("expected an error");
  return result.error;
}

describe("isMediaKind", () => {
  it("accepts the catalogued kinds", () => {
    expect(isMediaKind("image")).toBe(true);
    expect(isMediaKind("youtube")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isMediaKind("iframe")).toBe(false);
    expect(isMediaKind("")).toBe(false);
    expect(isMediaKind("__proto__")).toBe(false);
  });
});

describe("readProjectMedia", () => {
  it("reads a row into a MediaItem, keeping the three arrays aligned", () => {
    const result = readProjectMedia(
      form([
        { kind: "image", label: "Homepage", url: "https://cdn.example.com/a.jpg" },
        { kind: "website", label: "Live site", url: "https://client.example.com" },
      ]),
    );

    expect(media(result)).toEqual([
      { kind: "image", label: "Homepage", url: "https://cdn.example.com/a.jpg" },
      { kind: "website", label: "Live site", url: "https://client.example.com/" },
    ]);
  });

  it("returns an empty list when there are no rows at all", () => {
    expect(media(readProjectMedia(new FormData()))).toEqual([]);
  });

  it("skips a row with no URL — that is how the form deletes an item", () => {
    const result = readProjectMedia(
      form([
        { url: "" },
        { kind: "image", label: "Kept", url: "https://cdn.example.com/b.png" },
        { kind: "pdf", label: "Dropped", url: "   " },
      ]),
    );

    expect(media(result)).toEqual([
      { kind: "image", label: "Kept", url: "https://cdn.example.com/b.png" },
    ]);
  });

  it("keeps kind and label attached to the right URL when an earlier row is empty", () => {
    const result = readProjectMedia(
      form([
        { kind: "image", label: "blank row", url: "" },
        { kind: "youtube", label: "The film", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      ]),
    );

    expect(media(result)).toEqual([
      {
        kind: "youtube",
        label: "The film",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    ]);
  });

  it("REFUSES a malformed URL rather than dropping it silently", () => {
    const result = readProjectMedia(form([{ url: "cdn.example.com/a.jpg" }]));
    expect(error(result)).toContain("not a valid web address");
    expect(error(result)).toContain("Media item 1");
  });

  it("refuses http, which the CSP would upgrade and the public side would refuse", () => {
    const result = readProjectMedia(form([{ url: "http://cdn.example.com/a.jpg" }]));
    expect(error(result)).toContain("https://");
  });

  it("refuses a javascript: URL", () => {
    // It parses as a URL, so only the scheme check stops it.
    const result = readProjectMedia(form([{ url: "javascript:alert(1)" }]));
    expect(error(result)).toContain("https://");
  });

  it("names the offending row, not just 'a row'", () => {
    const result = readProjectMedia(
      form([
        { url: "https://cdn.example.com/a.jpg" },
        { url: "https://cdn.example.com/b.jpg" },
        { url: "not-a-url" },
      ]),
    );
    expect(error(result)).toContain("Media item 3");
  });

  it("falls back to image for an unrecognised kind instead of storing it", () => {
    const result = readProjectMedia(
      form([{ kind: "iframe", label: "", url: "https://cdn.example.com/a.jpg" }]),
    );
    expect(media(result)[0]?.kind).toBe("image");
  });

  it("truncates an over-long caption", () => {
    const result = readProjectMedia(
      form([{ label: "x".repeat(500), url: "https://cdn.example.com/a.jpg" }]),
    );
    expect(media(result)[0]?.label).toHaveLength(120);
  });

  it("trims surrounding whitespace from the caption and the URL", () => {
    const result = readProjectMedia(
      form([{ label: "  Homepage  ", url: "  https://cdn.example.com/a.jpg  " }]),
    );
    expect(media(result)[0]).toEqual({
      kind: "image",
      label: "Homepage",
      url: "https://cdn.example.com/a.jpg",
    });
  });

  it(`refuses more than ${MEDIA_LIMIT} items rather than truncating the list`, () => {
    const rows = Array.from({ length: MEDIA_LIMIT + 1 }, (_, i) => ({
      url: `https://cdn.example.com/${i}.jpg`,
    }));
    expect(error(readProjectMedia(form(rows)))).toContain(String(MEDIA_LIMIT));
  });

  it(`accepts exactly ${MEDIA_LIMIT} items`, () => {
    const rows = Array.from({ length: MEDIA_LIMIT }, (_, i) => ({
      url: `https://cdn.example.com/${i}.jpg`,
    }));
    expect(media(readProjectMedia(form(rows)))).toHaveLength(MEDIA_LIMIT);
  });
});
