/**
 * Shared primitives.
 *
 * Everything re-exported here reads its geometry and colour from the tokens
 * in `app/tokens.css` - no component below contains a raw hex or an off-grid
 * pixel value, and none of them import from `lib/api` or `lib/types`. A
 * primitive that knows what an Enrollment is has stopped being a primitive.
 *
 * This barrel exists so `@/components/ui` keeps resolving after the single
 * 423-line file it replaced was split one component per file.
 */
export { cx } from './cx';
export { Button, ButtonLink, IconButton } from './button';
export { Chip, type ChipTone } from './tag';
export { Panel, Separator } from './card';
export { Avatar } from './avatar';
export { Metric, Meter } from './metric';
export { Skeleton, RowsSkeleton, EmptyState, ErrorState } from './states';
export { Field, Input, Textarea, Select, FormError } from './form';
export { Tabs, type TabItem } from './tabs';
