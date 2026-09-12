import { describe, it, expect } from "vitest";
import { resolveEmbed, youTubeEmbed, loomEmbed, vimeoEmbed } from "./mediaEmbed";

const u = (s: string) => new URL(s);

describe("resolveEmbed — pending", () => {
  it("treats missing, empty and the dataset's '#' sentinel as pending", () => {
    for (const v of [undefined, "", "   ", "#"]) {
      expect(resolveEmbed(v).kind).toBe("pending");
    }
  });
});

describe("resolveEmbed — the allow-list is the security boundary", () => {
  it("NEVER frames an unrecognised host — it degrades to a link", () => {
    const r = resolveEmbed("https://evil.example/player");
    expect(r.kind).toBe("link");
    expect(r.kind).not.toBe("iframe");
  });

  it("refuses non-https schemes outright", () => {
    // A javascript: or data: URL must not survive as anything renderable.
    expect(resolveEmbed("javascript:alert(1)").kind).toBe("pending");
    expect(resolveEmbed("data:image/svg+xml,<svg onload=alert(1)>").kind).toBe("pending");
  });

  it("offers plain http as a link, never as a frame or an inline asset", () => {
    const r = resolveEmbed("http://example.com/case");
    expect(r.kind).toBe("link");
  });

  it("does not frame a file extension it cannot verify", () => {
    expect(resolveEmbed("https://cdn.example/clip.exe").kind).toBe("link");
  });
});

describe("youTubeEmbed", () => {
  it("accepts every share shape and normalises to the nocookie embed", () => {
    const want = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    for (const s of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    ]) {
      expect(youTubeEmbed(u(s)), s).toBe(want);
    }
  });

  it("rejects a malformed id rather than producing a broken frame", () => {
    expect(youTubeEmbed(u("https://www.youtube.com/watch?v=short"))).toBeNull();
    expect(youTubeEmbed(u("https://www.youtube.com/"))).toBeNull();
  });

  it("is not fooled by a lookalike host", () => {
    expect(youTubeEmbed(u("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"))).toBeNull();
  });
});

describe("loomEmbed / vimeoEmbed", () => {
  it("converts a Loom share link", () => {
    expect(loomEmbed(u("https://www.loom.com/share/0123456789abcdef0123456789abcdef"))).toBe(
      "https://www.loom.com/embed/0123456789abcdef0123456789abcdef",
    );
  });
  it("converts a Vimeo link", () => {
    expect(vimeoEmbed(u("https://vimeo.com/123456789"))).toBe("https://player.vimeo.com/video/123456789");
  });
  it("returns null off-host", () => {
    expect(loomEmbed(u("https://example.com/share/abc"))).toBeNull();
    expect(vimeoEmbed(u("https://example.com/123456789"))).toBeNull();
  });
});

describe("resolveEmbed — direct files", () => {
  it("plays a video file and shows an image file", () => {
    expect(resolveEmbed("https://cdn.example/a.mp4")).toMatchObject({ kind: "video" });
    expect(resolveEmbed("https://cdn.example/a.webp")).toMatchObject({ kind: "image" });
  });

  it("reads the URL alone, whatever the row was catalogued as", () => {
    // A row catalogued "video" pointing at a YouTube page still frames as
    // YouTube, and one catalogued "image" pointing at an mp4 still plays —
    // because the catalogued kind is not an input at all.
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({
      kind: "iframe",
      provider: "YouTube",
    });
    expect(resolveEmbed("https://cdn.example/a.mp4").kind).toBe("video");
  });

  it("names the host on a plain link, for the caption", () => {
    expect(resolveEmbed("https://www.acme.co/work").provider).toBe("acme.co");
  });
});

describe("resolveEmbed — extension-less URLs are links, not guesses", () => {
  it("does not guess at a URL with no recognisable extension", () => {
    // Supabase Storage and most asset pipelines DO keep the extension, so the
    // gate costs nothing real; guessing would have cost a data leak.
    expect(resolveEmbed("https://cdn.example/assets/9f2c1?sig=abc").kind).toBe("link");
  });

  it("never frames an extension-less URL", () => {
    expect(resolveEmbed("https://cdn.example/assets/9f2c1").kind).not.toBe("iframe");
  });
});
