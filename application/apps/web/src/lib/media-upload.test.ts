import { describe, expect, it } from "vitest";
import { resolveEmbed } from "@brightloop/ui";
import {
  MAX_UPLOAD_BYTES,
  mediaObjectPath,
  tooLargeMessage,
  uploadExtension,
} from "./media-upload";

describe("uploadExtension", () => {
  it("maps the accepted image types", () => {
    expect(uploadExtension("image/png", "a.png")).toBe("png");
    expect(uploadExtension("image/jpeg", "a.jpeg")).toBe("jpg");
    expect(uploadExtension("image/webp", "a.webp")).toBe("webp");
    expect(uploadExtension("image/avif", "a.avif")).toBe("avif");
    expect(uploadExtension("image/gif", "a.gif")).toBe("gif");
  });

  it("normalises jpeg and jpg to one stored extension", () => {
    expect(uploadExtension("image/jpeg", "a.jpg")).toBe("jpg");
    expect(uploadExtension("image/jpg", "a.jpeg")).toBe("jpg");
  });

  it("is case- and whitespace-insensitive about the MIME type", () => {
    expect(uploadExtension("  IMAGE/PNG  ", "a.png")).toBe("png");
  });

  it("falls back to the filename when the browser sends no type", () => {
    expect(uploadExtension("", "photo.WEBP")).toBe("webp");
    expect(uploadExtension("application/octet-stream", "photo.jpg")).toBe("jpg");
  });

  it("prefers the MIME type over the filename", () => {
    // A .jpg suffix on a PNG stores as .png, which is what the bytes are.
    expect(uploadExtension("image/png", "mislabelled.jpg")).toBe("png");
  });

  it("REFUSES svg — a raster-shaped format that is really a script container", () => {
    expect(uploadExtension("image/svg+xml", "logo.svg")).toBeNull();
    expect(uploadExtension("", "logo.svg")).toBeNull();
  });

  it("refuses documents, video and anything unrecognised", () => {
    expect(uploadExtension("application/pdf", "deck.pdf")).toBeNull();
    expect(uploadExtension("video/mp4", "film.mp4")).toBeNull();
    expect(uploadExtension("text/html", "page.html")).toBeNull();
    expect(uploadExtension("", "no-extension")).toBeNull();
    expect(uploadExtension("", "")).toBeNull();
  });
});

describe("mediaObjectPath", () => {
  it("keys by the opaque id and drops the original filename", () => {
    expect(mediaObjectPath("m_abc123", "png")).toBe("portfolio/m_abc123.png");
  });

  /**
   * The contract that makes an upload actually appear on the Work page: the
   * public URL has to survive resolveEmbed's image gate. If this breaks, uploads
   * succeed and tiles stay blank.
   */
  it("produces a public URL the public site will render as an image", () => {
    for (const ext of ["png", "jpg", "webp", "avif", "gif"]) {
      const path = mediaObjectPath("m_abc123", ext);
      const publicUrl = `https://proj.supabase.co/storage/v1/object/public/media/${path}`;
      expect(resolveEmbed(publicUrl)).toEqual({ kind: "image", src: publicUrl });
    }
  });
});

describe("tooLargeMessage", () => {
  it("speaks in megabytes and names the limit", () => {
    const message = tooLargeMessage(12.5 * 1024 * 1024);
    expect(message).toContain("12.5 MB");
    expect(message).toContain(`${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`);
  });
});
