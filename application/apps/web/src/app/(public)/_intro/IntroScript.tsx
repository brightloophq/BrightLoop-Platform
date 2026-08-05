import { INTRO_SCRIPT } from "./introConfig";

/**
 * IntroScript — renders the pre-paint intro IIFE. Server component; emits a
 * blocking inline <script> so `data-intro-pending` is set before the browser
 * paints (identical strategy to the theme runtime's ThemeScript). Place it high
 * in the public layout, before the cover and the hero.
 */
export function IntroScript() {
  return <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />;
}
