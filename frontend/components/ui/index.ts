/**
 * The design system's primitives, as implemented for this repo.
 *
 * Reimplemented — not imported — from the Claude Design handoff (project
 * 59f824fd). Its `.jsx` files are inline-styled reference prototypes and say so:
 * *"Read them for exact structure, states and measurements; reimplement in the
 * target stack."* Measurements, radii, control heights and interaction states
 * are matched exactly; the delivery is Tailwind v4 over the tokens in
 * `app/tokens/`.
 *
 * Three rules govern everything in here, and each has already cost a real build:
 *
 *  1. **Never `text-[var(--x)]`.** Tailwind cannot tell a colour from a size,
 *     the size wins, and the colour is silently dropped — it typechecks, lints
 *     and builds. Use the named utilities (`text-fg`, `text-accent`,
 *     `text-status-amber-text`), which exist for exactly this reason.
 *  2. **One utility per property.** Two `rounded-*` in one class string are
 *     resolved by stylesheet source order, not the order you wrote them.
 *  3. **No card inside a card.** `Panel` is the application's one container.
 *
 * Nothing here imports from `lib/api` or `lib/types`. A primitive that knows
 * what an Enrollment is has stopped being a primitive.
 *
 * `docs/redesign-mapping.md` is the plan this implements.
 */

export { cx } from './cx';

/* Icons — 115 Tabler glyphs, stroke 1.6. */
export { Icon, type IconName } from './icon';

/* Actions */
export {
  Button,
  ButtonLink,
  ButtonGroup,
  IconButton,
  LightIconButton,
} from './button';

/* Containers and page structure */
export { Panel, SectionTitle, Divider } from './panel';
export { PageHeader, Breadcrumb, type Crumb } from './page-header';
export { TabList, type TabItem } from './tabs';
export { NavItem, NavSection } from './nav';

/* Data display */
export { Tag, type TagTone } from './tag';
export { Avatar, AvatarGroup } from './avatar';
export { StatNumber } from './stat-number';
export { Table, TableToolbar, type Column } from './table';
/**
 * `Score` and `Meter` come from one module on purpose — they are the two halves
 * of the rule that progress and performance never merge (CLAUDE.md §5.1, and
 * the design system's second non-negotiable). Completion gets the bar;
 * achievement gets the number over its denominator. Never the same column,
 * never averaged together.
 */
export { Score, Meter, type ScoreTone, type MeterTone } from './score';

/* Feedback and state */
export {
  Banner,
  InlineBanner,
  Callout,
  Loader,
  NotificationCounter,
  EmptyState,
  SyncStatus,
  type SyncState,
} from './feedback';

/* Inputs */
export {
  TextInput,
  TextArea,
  Select,
  SearchInput,
  Checkbox,
  Toggle,
  type SelectOption,
} from './form';
