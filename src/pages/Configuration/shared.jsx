import { sinceTime as baseSinceTime } from '@/components/ResourcePage/helpers';

/**
 * Helpers shared by the administrator extra modules
 * (Configuration, Instance-HA, Monitor Center, Recycle Bin).
 */

/** Legacy valueRender 'sinceTime' (moved to src/components/ResourcePage/helpers) */
export const sinceTime = (value) => baseSinceTime(value);

/* Shared building blocks moved to src/components (re-exported for existing imports) */
export { JsonBlock } from '@/components/CodeBlock';
export { SearchSelectTable as SelectTable, selectTableRequired } from '@/components/SelectTable';
export { jsonRule } from '@/components/form/rules';
