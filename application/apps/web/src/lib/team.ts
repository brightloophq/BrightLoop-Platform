/* =============================================================================
 * The people behind Auxion.
 *
 * ONE FILE, ONE EDIT. The roster is typed data rather than markup so a name, a
 * role or a line of biography changes here and nowhere else — no hunting
 * through JSX, and the page cannot show a role the type does not allow.
 *
 * `name` IS OPTIONAL, AND THAT IS THE POINT. The About page states that where
 * something has not been verified this site says so rather than filling the
 * gap, and that the rule applies to our own pages first. Inventing four
 * colleagues would break that promise on the very page that makes it. So a seat
 * whose holder has not been confirmed renders as the ROLE — which is real and
 * decided — with an honest line underneath, and reads as deliberate rather than
 * unfinished. Fill a name in and the card leads with the person instead.
 * ========================================================================== */

export interface TeamMember {
  /** Stable key for React and for anchor links. */
  id: string;
  /** The person, once confirmed. Omitted while the seat is being filled. */
  name?: string;
  /** What they are accountable for. Always present — the seat is real. */
  role: string;
  /** One sentence on what that means in practice. */
  remit: string;
  /** Which of the four disciplines this seat serves, for the card's label. */
  discipline: string;
}

/**
 * The roster.
 *
 * Founder first; the rest in the order the loop runs — brand, then search, then
 * the paid and organic social that feeds it.
 */
export const TEAM: readonly TeamMember[] = [
  {
    id: "founder",
    role: "Founder & Chief Executive",
    remit:
      "Sets what Auxion takes on and what it turns down, and stays on every engagement from the first scan to the handover.",
    discipline: "Strategy",
  },
  {
    id: "brand-designer",
    role: "Brand Designer",
    remit:
      "Owns identity, typography and the way the work looks in the wild — so a logo, a site and an ad read as one business rather than three.",
    discipline: "Brand",
  },
  {
    id: "seo-lead",
    role: "SEO & Search Lead",
    remit:
      "Makes the site legible to search: structure, speed, content that answers what people actually type, and the measurement that proves it moved.",
    discipline: "Web",
  },
  {
    id: "social-strategist",
    role: "Social Media & Paid Ads Strategist",
    remit:
      "Runs the owned channels and the paid spend behind them, and routes what they produce into the CRM instead of leaving it in an inbox.",
    discipline: "Growth",
  },
];

/**
 * The letters for a portrait placeholder.
 *
 * Initials of the person where there is one, and of the ROLE where there is not
 * — so an unfilled seat still gets a plate with something considered in it
 * rather than an empty square or a stranger's face.
 */
export function monogram(member: TeamMember): string {
  const source = member.name ?? member.role;
  const words = source
    .split(/[\s&]+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter((w) => w.length > 0);

  if (words.length === 0) return "A";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/**
 * A small stable number from a string, for varying the placeholder art.
 *
 * Deterministic on purpose: the same seat draws the same plate on the server and
 * in the browser, so nothing shifts on hydration and a screenshot stays true.
 */
export function seedOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100000;
  }
  return hash;
}

/** What the card says under the heading when nobody is named yet. */
export const SEAT_OPEN_NOTE = "Appointment to be announced";
