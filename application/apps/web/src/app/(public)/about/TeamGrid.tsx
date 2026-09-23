import { SEAT_OPEN_NOTE, TEAM } from "@/lib/team";
import { TeamPortrait } from "./TeamPortrait";
import styles from "./about.module.css";

/**
 * The team, as seats rather than headshots.
 *
 * Each card leads with the person once there is one, and with the ROLE until
 * then — because the roles are decided and the appointments are not, and saying
 * so is cheaper than being caught having invented a colleague. The numbering
 * and hairline rules are the same devices the disciplines list above uses, so
 * this reads as part of the page rather than a component dropped into it.
 */
export function TeamGrid() {
  return (
    <ul className={styles.team}>
      {TEAM.map((member, i) => (
        <li key={member.id} className={styles.member} id={member.id}>
          <TeamPortrait member={member} />

          <div className={styles.memberBody}>
            <span className={styles.memberMeta}>
              <span className={styles.memberN}>{String(i + 1).padStart(2, "0")}</span>
              <span className={styles.memberDiscipline}>{member.discipline}</span>
            </span>

            {member.name ? (
              <>
                <h3 className={styles.memberName}>{member.name}</h3>
                <p className={styles.memberRole}>{member.role}</p>
              </>
            ) : (
              <>
                <h3 className={styles.memberName}>{member.role}</h3>
                <p className={styles.memberPending}>{SEAT_OPEN_NOTE}</p>
              </>
            )}

            <p className={styles.memberRemit}>{member.remit}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
