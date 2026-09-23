import { monogram, seedOf, type TeamMember } from "@/lib/team";
import styles from "./about.module.css";

/**
 * A stand-in portrait, drawn rather than photographed.
 *
 * DELIBERATELY NOT A FACE. A generated headshot of someone who does not exist,
 * on the About page of a real business, is a lie told in the most convincing
 * medium available — and this page promises the opposite. A plate of concentric
 * arcs in the house gold is honestly a placeholder, reads as considered, and
 * swaps out for a real photograph without the layout moving.
 *
 * Everything varies from a hash of the seat's id: the arc count, their spacing
 * and the sweep. Same seat, same plate, on the server and in the browser — so
 * nothing shifts on hydration.
 */
export function TeamPortrait({ member }: { member: TeamMember }) {
  const seed = seedOf(member.id);
  const rings = 4 + (seed % 3); // 4–6
  const rotation = seed % 360;
  const sweep = 150 + (seed % 120); // 150–269 degrees of arc

  return (
    <div className={styles.portrait} aria-hidden="true">
      <svg viewBox="0 0 160 160" className={styles.portraitArt} role="presentation" focusable="false">
        <defs>
          <linearGradient id={`plate-${member.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        <rect width="160" height="160" fill={`url(#plate-${member.id})`} />

        <g
          transform={`rotate(${rotation} 80 80)`}
          fill="none"
          stroke="var(--signal)"
          strokeLinecap="round"
        >
          {Array.from({ length: rings }, (_, i) => {
            const r = 24 + i * 13;
            // Arc length shrinks outward, so the plate reads as light hitting a curve.
            const degrees = sweep - i * 18;
            const circumference = 2 * Math.PI * r;
            const on = (circumference * degrees) / 360;
            return (
              <circle
                key={r}
                cx="80"
                cy="80"
                r={r}
                strokeWidth={i === 0 ? 2 : 1}
                strokeOpacity={0.55 - i * 0.07}
                strokeDasharray={`${on} ${circumference}`}
                transform={`rotate(${i * 26} 80 80)`}
              />
            );
          })}
        </g>
      </svg>

      <span className={styles.portraitMonogram}>{monogram(member)}</span>
    </div>
  );
}
