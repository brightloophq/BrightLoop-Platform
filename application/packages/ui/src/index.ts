/* =============================================================================
 * @brightloop/ui — the Auxion design system.
 *
 * Tokens are the canonical source (ported verbatim from the handoff reference)
 * and are imported once by the app: `import "@brightloop/ui/tokens.css";`
 *
 * Sprint 1 adds the public shell + the content components those pages need.
 * The remaining components from the 43-component inventory (handoff §04.6)
 * land with the surfaces that need them.
 *
 * NOTE: relative imports are extensionless — this package is consumed as SOURCE
 * (Next `transpilePackages`), and webpack does not apply TypeScript's
 * ".js" → ".ts" mapping. The tsc-built packages keep explicit ".js".
 * ========================================================================== */

/* ---- Brand ---- */
export { Logo } from "./components/Logo";
export type { LogoProps, LogoVariant } from "./components/Logo";
export { Icon, isIconName } from "./components/Icon";
export type { IconProps, IconName } from "./components/Icon";
export { Eyebrow } from "./components/Eyebrow";
export type { EyebrowProps } from "./components/Eyebrow";

/* ---- Layout ---- */
export { Container, Section } from "./components/Container";
export type {
  ContainerProps,
  ContainerWidth,
  SectionProps,
  SectionRhythm,
} from "./components/Container";

/* ---- Forms ---- */
export { Button } from "./components/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./components/Button";
export { Input, Textarea } from "./components/Field";
export type { InputProps, TextareaProps } from "./components/Field";

/* ---- Content ---- */
export { Card } from "./components/Card";
export type { CardProps } from "./components/Card";
export { Badge } from "./components/Badge";
export type { BadgeProps } from "./components/Badge";
export { Tag } from "./components/Tag";
export type { TagProps } from "./components/Tag";
export { Stat, StatChip } from "./components/Stat";
export type { StatProps, StatChipProps } from "./components/Stat";
export { Stars } from "./components/Stars";
export type { StarsProps } from "./components/Stars";
export { ServiceCard } from "./components/ServiceCard";
export type { ServiceCardProps } from "./components/ServiceCard";
export { PricingCard } from "./components/PricingCard";
export type { PricingCardProps } from "./components/PricingCard";
export { Testimonial } from "./components/Testimonial";
export type { TestimonialProps } from "./components/Testimonial";
export { CaseStudyCard } from "./components/CaseStudyCard";
export type { CaseStudyCardProps, CaseStudyFact } from "./components/CaseStudyCard";
export { ProjectCard } from "./components/ProjectCard";
export type { ProjectCardProps } from "./components/ProjectCard";
export { MediaTile } from "./components/MediaTile";
export type { MediaTileProps } from "./components/MediaTile";
export { CategoryRatings } from "./components/CategoryRatings";
export type { CategoryRatingsProps } from "./components/CategoryRatings";
export { Accordion } from "./components/Accordion";
export type { AccordionProps, AccordionItem } from "./components/Accordion";

/* ---- Feedback ---- */
export { Alert } from "./components/Alert";
export type { AlertProps, AlertTone } from "./components/Alert";
export { Progress } from "./components/Progress";
export type { ProgressProps } from "./components/Progress";
export { EmptyState } from "./components/EmptyState";
export type { EmptyStateProps } from "./components/EmptyState";
export { PlaceholderNotice } from "./components/PlaceholderNotice";
export type { PlaceholderNoticeProps } from "./components/PlaceholderNotice";

/* ---- Overlay ---- */
export { Drawer } from "./components/Drawer";
export type { DrawerProps } from "./components/Drawer";

/* ---- Navigation ---- */
export { Navbar } from "./components/Navbar";
export type { NavbarProps, NavLink, MegaMenuItem } from "./components/Navbar";
export { Footer } from "./components/Footer";
export type { FooterProps, FooterColumn } from "./components/Footer";
export { Pagination, pageWindow } from "./components/Pagination";
export type { PaginationProps } from "./components/Pagination";

/* ---- Marketing ---- */
export { CTASection } from "./components/CTASection";
export type { CTASectionProps } from "./components/CTASection";

/* ---- Operational (dashboard) primitives — reused by every command-center module ---- */
export { SectionHeader } from "./components/SectionHeader";
export type { SectionHeaderProps } from "./components/SectionHeader";
export { OperationalPanel } from "./components/OperationalPanel";
export type { OperationalPanelProps } from "./components/OperationalPanel";
export { MetricCard } from "./components/MetricCard";
export type { MetricCardProps } from "./components/MetricCard";
export { PipelineNode } from "./components/PipelineNode";
export type { PipelineNodeProps } from "./components/PipelineNode";
export { AttentionRow } from "./components/AttentionRow";
export type { AttentionRowProps, AttentionTone } from "./components/AttentionRow";
export { SkeletonBlock } from "./components/SkeletonBlock";
export type { SkeletonBlockProps } from "./components/SkeletonBlock";
