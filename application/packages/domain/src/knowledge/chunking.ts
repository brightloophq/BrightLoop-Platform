/* =============================================================================
 * Document parsing + chunking (Phase E · Sprint E2) — PURE.
 *
 * `parseDocument` normalizes raw text into typed blocks (heading / paragraph /
 * list / table / code / link), preserving structure + page hints, with parse
 * metadata kept separately. `chunkBlocks` cuts those into overlapping chunks by a
 * configurable strategy (fixed / paragraph-aware / heading-aware / semantic).
 * Deterministic; no io.
 * ========================================================================== */

import type { ChunkingStrategy } from "@brightloop/schema";
import { estimateTokens } from "../ai-foundation/accounting.js";
import { hashContent } from "../scan-engine/evidence/hash.js";

export type BlockType = "heading" | "paragraph" | "list" | "table" | "code" | "link";

export interface ParsedBlock {
  type: BlockType;
  text: string;
  /** Heading level (1..6) when `type === "heading"`. */
  level: number | null;
  /** 1-based page when derivable (form-feed / explicit marker), else null. */
  page: number | null;
}

export interface ParseResult {
  blocks: ParsedBlock[];
  metadata: { blockCount: number; headingCount: number; codeBlocks: number; tables: number; pages: number };
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_RE = /^\s*(?:[-*+]|\d+\.)\s+/;
const LINK_ONLY_RE = /^\s*<?https?:\/\/\S+>?\s*$/i;

/** Normalize raw text into typed blocks. Page increments on a form-feed (\f). Pure. */
export function parseDocument(raw: string): ParseResult {
  const blocks: ParsedBlock[] = [];
  let page = 1;
  let inCode = false;
  let codeBuf: string[] = [];
  let paraBuf: string[] = [];
  const flushPara = (): void => {
    if (paraBuf.length === 0) return;
    const text = paraBuf.join(" ").trim();
    if (text !== "") blocks.push({ type: LINK_ONLY_RE.test(text) ? "link" : "paragraph", text, level: null, page });
    paraBuf = [];
  };
  for (const rawLine of raw.split("\n")) {
    // Page breaks: a literal form-feed advances the page counter.
    if (rawLine.includes("\f")) { flushPara(); page += rawLine.split("\f").length - 1; }
    const line = rawLine.replace(/\f/g, "").replace(/\r$/, "");
    if (line.trim().startsWith("```")) {
      if (inCode) { blocks.push({ type: "code", text: codeBuf.join("\n"), level: null, page }); codeBuf = []; inCode = false; }
      else { flushPara(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    const heading = HEADING_RE.exec(line);
    if (heading) { flushPara(); blocks.push({ type: "heading", text: heading[2]!.trim(), level: heading[1]!.length, page }); continue; }
    if (LIST_RE.test(line)) { flushPara(); blocks.push({ type: "list", text: line.trim(), level: null, page }); continue; }
    if (line.includes("|") && line.trim().startsWith("|")) { flushPara(); blocks.push({ type: "table", text: line.trim(), level: null, page }); continue; }
    if (line.trim() === "") { flushPara(); continue; }
    paraBuf.push(line.trim());
  }
  if (inCode && codeBuf.length > 0) blocks.push({ type: "code", text: codeBuf.join("\n"), level: null, page });
  flushPara();
  return {
    blocks,
    metadata: {
      blockCount: blocks.length,
      headingCount: blocks.filter((b) => b.type === "heading").length,
      codeBlocks: blocks.filter((b) => b.type === "code").length,
      tables: blocks.filter((b) => b.type === "table").length,
      pages: page,
    },
  };
}

export interface ChunkDescriptor {
  index: number;
  content: string;
  page: number | null;
  heading: string | null;
  tokenCount: number;
  checksum: string;
}

export interface ChunkOptions {
  /** Target tokens per chunk. */
  maxTokens: number;
  /** Max token overlap carried between consecutive chunks. */
  overlapTokens: number;
}

const DEFAULT_OPTS: ChunkOptions = { maxTokens: 512, overlapTokens: 64 };

/** Approx token→char factor (mirrors the ~4 chars/token estimator). */
const CHARS_PER_TOKEN = 4;

function makeChunk(index: number, content: string, page: number | null, heading: string | null): ChunkDescriptor {
  const text = content.trim();
  return { index, content: text, page, heading, tokenCount: estimateTokens(text), checksum: hashContent(text) };
}

/**
 * Cut parsed blocks into chunks by strategy. `fixed` slices the concatenated text
 * into token windows with overlap; `paragraph_aware`/`semantic` pack whole blocks
 * up to the limit; `heading_aware` also starts a fresh chunk at each heading. Pure.
 */
export function chunkBlocks(blocks: readonly ParsedBlock[], strategy: ChunkingStrategy, opts: ChunkOptions = DEFAULT_OPTS): ChunkDescriptor[] {
  const maxChars = Math.max(1, opts.maxTokens * CHARS_PER_TOKEN);
  const overlapChars = Math.max(0, Math.min(opts.overlapTokens, opts.maxTokens - 1)) * CHARS_PER_TOKEN;

  if (strategy === "fixed") {
    const text = blocks.map((b) => b.text).join("\n\n");
    const firstPage = blocks[0]?.page ?? null;
    const out: ChunkDescriptor[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(text.length, start + maxChars);
      out.push(makeChunk(out.length, text.slice(start, end), firstPage, null));
      if (end >= text.length) break;
      start = end - overlapChars;
    }
    return out.length > 0 ? out : [makeChunk(0, text, firstPage, null)];
  }

  // block-packing strategies
  const out: ChunkDescriptor[] = [];
  let buf: string[] = [];
  let bufLen = 0;
  let curHeading: string | null = null;
  let curPage: number | null = blocks[0]?.page ?? null;
  const flush = (): void => {
    if (buf.length === 0) return;
    out.push(makeChunk(out.length, buf.join("\n\n"), curPage, curHeading));
    // carry overlap: keep the tail of the last block within the overlap budget
    if (overlapChars > 0) {
      const tail = buf.join("\n\n").slice(-overlapChars);
      buf = tail.trim() === "" ? [] : [tail];
      bufLen = tail.length;
    } else { buf = []; bufLen = 0; }
  };
  for (const block of blocks) {
    if (block.type === "heading") {
      curHeading = block.text;
      if (strategy === "heading_aware") { flush(); buf = []; bufLen = 0; }
    }
    curPage = block.page;
    const piece = block.type === "heading" ? `# ${block.text}` : block.text;
    if (bufLen + piece.length > maxChars && bufLen > 0) flush();
    buf.push(piece);
    bufLen += piece.length + 2;
  }
  if (buf.join("").trim() !== "") out.push(makeChunk(out.length, buf.join("\n\n"), curPage, curHeading));
  return out;
}
