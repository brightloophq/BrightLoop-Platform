/* =============================================================================
 * Icon — Lucide wrapper.
 *
 * Icons are imported INDIVIDUALLY and mapped by name, so only the icons this
 * map references are bundled (handoff §11.3: "tree-shake Lucide icons — import
 * per-icon, not the whole set"). A dynamic `lucide-react` barrel import would
 * defeat that and pull in the entire set.
 *
 * Icon names come from DATA (the catalog's `icon` fields), so the map is the
 * contract between the dataset and the bundle. Add an icon here when the data
 * starts referencing it.
 * ========================================================================== */

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  ExternalLink,
  Gauge,
  GitBranch,
  Heart,
  LayoutGrid,
  Lightbulb,
  LineChart,
  Lock,
  Mail,
  MapPin,
  Menu,
  MousePointerClick,
  Palette,
  PenTool,
  Plug,
  Rocket,
  Route,
  Search,
  Settings,
  Share2,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";

/** Kebab-case name → component. Names match the Lucide names used in the data. */
const ICONS = {
  activity: Activity,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  award: Award,
  bell: Bell,
  "book-open": BookOpen,
  check: Check,
  "check-circle": CheckCircle2,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  clock: Clock,
  "external-link": ExternalLink,
  gauge: Gauge,
  "git-branch": GitBranch,
  heart: Heart,
  "layout-grid": LayoutGrid,
  lightbulb: Lightbulb,
  "line-chart": LineChart,
  lock: Lock,
  mail: Mail,
  "map-pin": MapPin,
  menu: Menu,
  "mouse-pointer-click": MousePointerClick,
  palette: Palette,
  "pen-tool": PenTool,
  plug: Plug,
  "credit-card": CreditCard,
  rocket: Rocket,
  route: Route,
  search: Search,
  settings: Settings,
  "share-2": Share2,
  sparkles: Sparkles,
  star: Star,
  target: Target,
  "trending-up": TrendingUp,
  users: Users,
  workflow: Workflow,
  x: X,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: string;
  size?: number;
  className?: string;
  /** Icons are decorative by default; pass a label when the icon carries meaning. */
  label?: string;
  strokeWidth?: number;
}

export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

/**
 * Renders a Lucide icon by name. Unknown names render nothing rather than
 * throwing — a data-driven icon name should never crash a page.
 */
export function Icon({ name, size = 18, className, label, strokeWidth = 2 }: IconProps) {
  if (!isIconName(name)) return null;
  const Cmp = ICONS[name];
  return (
    <Cmp
      size={size}
      className={className}
      strokeWidth={strokeWidth}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
