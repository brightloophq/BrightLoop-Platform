import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveEmbed } from "@brightloop/ui";
import {
  ACCEPTED_UPLOAD_TYPES,
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

/**
 * The bucket is the only thing that still sees the bytes — a portfolio image
 * goes browser → Supabase directly, so no application code can enforce size or
 * type. These assertions guard the coupling between this module's copy of the
 * rules and the migration that actually enforces them; drift between the two
 * means a file the form promises to accept gets rejected by the bucket, or
 * worse, the reverse.
 */
describe("the media bucket limits agree with this module", () => {
  /**
   * Resolved, never hardcoded. `supabase db push` records a migration by its
   * numeric VERSION, so a file can be superseded by a later one re-issuing the
   * same statement under a version the database has not already claimed — which
   * is exactly what happened to the original 20260812000100. What binds the
   * bucket is the LAST migration to touch it, so that is what this reads.
   */
  const migrationsDir = fileURLToPath(new URL("../../../../supabase/migrations", import.meta.url));
  const mediaBucketMigrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => {
      const sql = readFileSync(`${migrationsDir}/${name}`, "utf8");
      return /update\s+storage\.buckets/i.test(sql) && /id\s*=\s*'media'/i.test(sql);
    });

  it("has a migration that binds the media bucket at all", () => {
    expect(mediaBucketMigrations.length).toBeGreaterThan(0);
  });

  const migration = readFileSync(
    `${migrationsDir}/${mediaBucketMigrations[mediaBucketMigrations.length - 1]}`,
    "utf8",
  );

  it("sets file_size_limit to exactly MAX_UPLOAD_BYTES", () => {
    const match = /file_size_limit\s*=\s*(\d+)/.exec(migration);
    expect(match?.[1]).toBeDefined();
    expect(Number(match![1])).toBe(MAX_UPLOAD_BYTES);
  });

  /** The array literal itself, so a comment mentioning a type proves nothing. */
  const allowed = /allowed_mime_types\s*=\s*array\[([^\]]*)\]/.exec(migration)?.[1] ?? "";

  it("allows exactly the MIME types the form offers", () => {
    expect(allowed).not.toBe("");
    for (const mime of ACCEPTED_UPLOAD_TYPES.split(",")) {
      // image/jpg is an alias the form tolerates; the bucket speaks image/jpeg.
      if (mime === "image/jpg") continue;
      expect(allowed).toContain(`'${mime}'`);
    }
  });

  it("does NOT allow svg into a public-read bucket", () => {
    expect(allowed).not.toContain("svg");
  });
});
