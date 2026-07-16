# 10 · Behaviors — Upload, Search/Filter/Sort/Pagination, Publishing/Moderation, SEO

> Covers required topics **17 (file-upload)**, **18 (search/filter/sorting/pagination)**,
> **19 (admin publishing & moderation)**, **20 (SEO & structured data)**.

---

## 1. File-upload behavior (`fileUpload` machine)
- **Trigger:** drag-and-drop onto a dropzone or click-to-browse. Multiple files allowed where relevant.
- **Per-file lifecycle:** `queued → uploading → success | failed`. Each file shows its own row with name,
  size, determinate `Progress`, and status.
- **Validation before upload:** allowed MIME types by context (images: png/jpg/webp/svg; docs: pdf;
  media refs: mp4/mov or external URL). Max size per file (default 25MB — confirm, see open decisions);
  reject with reason (size/type).
- **Failure:** `uploading→failed` shows the reason (size/type/network); **per-file retry** (`failed→queued`)
  without affecting sibling uploads. Keep successful ones.
- **Storage:** Supabase Storage; store `FileUpload` row (owner, deliverableId, name, size, mime, status, url).
- **Images for portfolio/reviews:** the prototype uses drag-and-drop **image slots** (`website/image-slot.js`)
  keyed by id (`heroSlot`, `gallerySlots`, `avatarSlot`, media `slot`). In production these map to Media
  Library uploads referenced by the project/testimonial. **Alt text required** on every image (a11y).

## 2. Search, filter, sort, pagination (canonical: `reference/reputation-data.js` → `query()`, `paginate()`)
Applies to the public portfolio and, with the same semantics, to admin tables.

- **Search:** case-insensitive substring across a composed haystack. Portfolio haystack = name, client,
  industry, summary, services, tags, tech. Debounce input ~200ms. Empty query = no search filter.
- **Filter (facets):** multi-select per facet; **within a facet = OR**, **across facets = AND**. Portfolio
  facets: industry, service (matches any of project.services), size, country, year (numeric), budget, tech
  (matches any). Active filters show as removable chips; "Clear all" resets. Selecting a filter resets to page 1.
- **Sort:** `featured` (publish rank featured>public>draft>private, then recent), `recent` (completedDate desc),
  `az` (name). Default public = featured.
- **Pagination:** page size 9 (portfolio grid). `paginate(list, page, perPage)` returns `{page, pages, total, items}`.
  Clamp page to range. **Future scale:** the architecture supports thousands of records — implement
  server-side pagination + indexed filters when the dataset grows; the pure-function contract stays the same.
  Infinite scroll and AI-powered search are **deferred V2** (see `14`).
- **Empty results:** show EmptyState with "Clear filters".

## 3. Admin publishing & moderation rules
- **Publish states:** `featured` > `public` (both public) · `draft`, `private` (both hidden). `PUBLISH` map in
  reputation-data.js defines label/tone/`public` flag.
- **Public gate (enforce in query + RLS):** public site and its API return only `publish ∈ {public, featured}`.
  `draft`/`private` are never served publicly, regardless of UI.
- **Scheduling:** a scheduled publish sets a future date; a job flips `draft→public` at that time (server-side).
- **Featured-on-home:** `featuredOnHome` flags surface items on the homepage automatically (projects + reviews);
  no separate homepage content. Featured project also implies homepage eligibility.
- **Testimonial moderation:** pin (ordering priority), feature-on-home, and set publish status. Only
  public|featured reviews count toward the **aggregate rating** and appear publicly.
- **Result-metric disclosure:** metrics render only when `metrics.disclosed === true` and a real value exists.
  Admins must not be able to publish a fabricated metric — the field is inert unless disclosed + supplied.
- **Reorder:** manual drag/›‹ order persists (`order`/array index).

## 4. SEO & structured data (canonical: `reputation-data.js` → `schemaFor()`, `canonicalUrl()`)
- **SEO-friendly URLs:** `/portfolio/:slug`, `/case-studies/:slug`, `/testimonials` (kebab-case slugs, unique).
- **Per-page meta:** title + description (project `seo.title`/`seo.description`), canonical URL, Open Graph
  (`og:title`, `og:description`, `og:image` from `seo.ogImage`, `og:type`), Twitter card. The detail page's
  SEO panel documents exactly what to emit.
- **Structured data (JSON-LD):** portfolio project → `CreativeWork` + nested `Review` (rating, author, body)
  when a testimonial exists (`schemaFor(project)`). Testimonials page → aggregate `AggregateRating` /
  `Organization` review data. **Only published items** appear in structured data. Never emit schema for
  unpublished or fabricated content.
- **Rendering:** for indexable public pages prefer SSR/SSG so meta + JSON-LD are in the initial HTML. If the
  public site stays a client SPA, pre-render/prerender these routes or use a meta-injection layer. Sitemap.xml
  generated from published slugs; `robots.txt` allows public, disallows `/app` and `/admin`.
- **Integrity:** structured-data ratings/reviews must reflect only real, approved, published testimonials.
