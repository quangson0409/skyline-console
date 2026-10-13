# Porting legacy skyline-console modules

Legacy source: `D:\sonbq\skyline-console\src` (React + MobX + antd 4, webpack).
Target: this project (Vite 5, React 18, antd 5, Zustand).

**Rule: features are only added, never removed.** Every column, filter, action, detail tab
and form field of a legacy container must exist in the ported page (labels may be improved).

## Where things live

| Legacy | New |
|---|---|
| `src/client/<service>/index.js` | `src/api/<service>.js` (plain axios calls via `apiClient`) |
| `src/stores/<service>/<res>.js` | inline `fetch` functions next to the page (no global store) |
| `src/resources/<service>/<res>.jsx` (status maps, tips, helpers) | exported helpers in the page module |
| `pages/<group>/containers/<Res>/index.jsx` (List) | `src/pages/<Group>/<Res>/<Res>List.jsx` using `ResourcePage` |
| `pages/<group>/containers/<Res>/Detail/*` (TabDetail) | `src/pages/<Group>/<Res>/<Res>Detail.jsx` using `ResourceDetail` |
| `pages/<group>/containers/<Res>/actions/*` | action objects exported from the page module (or `actions.jsx` next to it) |
| `pages/<group>/routes/index.js` | `src/routes/modules/<group>.jsx` (auto-registered) |

## Building blocks

- `src/api/endpoints.js` - `serviceBase('octavia')`, `serviceEndpoint('swift')`, `versionHeaders('nova')`, `currentProjectId()`, `hasEndpoint('manilav2')`.
  New API files must use `serviceBase(...)` (resolved per call, never at import time).
- `src/components/ResourcePage` - list page. Props: `title, breadcrumb, description, fetch(ctx), columns(ctx), primaryActions(ctx), batchActions(ctx), rowActions(ctx), filterParams, initialFilters, getCheckboxProps, interval (ms or (list) => ms), header, embedded`. `ResourceDetail` syncs the active tab with `?tab=`.
  `ctx = { isAdmin, projectId, hasAdminRole, t, data, refetch }`. `isAdmin` is true on `*-admin` routes (legacy `isAdminPage`).
  Helpers: `nameColumn({ linkTo })`, `statusColumn({ textMap })`, `timeColumn()`, `textColumn()`, `boolColumn()`, `tagsColumn()`, `projectColumn(projectMap)`, `deleteAction({ name, onDelete, allowed })`, `formatSize`, `formatTime`, `parseKeyValues`, `stringifyKeyValues`, `CopyText`.
- `src/components/ResourceDetail` - detail page. Props: `breadcrumb, backPath, fetch(id, ctx), info(detail, ctx), tabs(detail, ctx), actions(ctx)`.
  For a tab listing child resources use `<ResourcePage embedded fetch=... columns=... />`.
- `src/hooks/useProjectMap` - `{ projectId: name }` for admin "Project" columns.
- Actions (`useActionRunner` schema):
  - confirm: `{ id, type: 'confirm', title, actionName, isDanger, allowed(item), onSubmit(itemOrItems) }`
  - modal: `{ id, type: 'modal', title, buttonText, description, width, allowed(item), getDefaultValues(item) (may be async), getFormItems(item) (may be async) | formItems, onSubmit(values, item) }`
  - custom: `{ id, type: 'custom', title, onExecute(item) }` (navigate, open console, download...)
  - Row actions: `{ firstAction, moreActions: [{ action }, { title: 'Group', actions: [...] }] }`.
  - Batch actions receive an array of records (already filtered by `allowed`).
- Form field types (`ActionModal`): `input, textarea, number, select (mode), tags, radio, checkbox, switch, slider, password, label, alert`,
  plus `visible: (values) => bool` for conditional fields and `render: ({ form, item, field }) => node` for anything custom
  (e.g. a select-table, rule editor). Keep payloads identical to the legacy `onSubmit`.
- i18n: `import { t } from '@/core/i18n'` (or `useTranslation`). Every user-visible string goes through `t('English key')` (same keys as legacy).
  Do not edit `src/locales/{vi,en,zh}.json`; ship the module's strings in `src/locales/modules/<module>.vi.json` / `.en.json` / `.zh.json`
  (keys = English source strings; vi must be complete — the default UI language is Vietnamese; zh from legacy zh-hans.json when available).
- Permissions: administrator routes (`*-admin`) are only reachable with a system admin/reader role (`useAuthStore().hasAdminPageRole`);
  hide admin-only actions with `adminOnly: true` / `allowed`.
- Service availability: add the module's paths to `MENU_ENDPOINTS` in `src/layouts/menuConfig.jsx` if legacy menu had `endpoints`
  (menu entry hidden and route shows "Service unavailable" when the endpoint is missing).
- Auto refresh: `ResourcePage` / `ResourceDetail` already poll (10s in transition, 30s auto). Pass `isTransition(item)` when the
  resource's busy states are not plain `*ing` / `PENDING_*` statuses.

## Route module example (`src/routes/modules/storage.jsx`)

```jsx
import { lazy } from 'react';
const BackupList = lazy(() => import('@/pages/Storage/Backups/BackupList'));
export default [
  { path: 'storage/backup', component: BackupList },
  { path: 'storage/backup-admin', component: BackupList },
];
```

Use the legacy URLs (see legacy `pages/<group>/routes/index.js`) so the sidebar (`src/layouts/menuConfig.jsx`) keeps working.

Reference implementation: `src/pages/Storage/Backups/`.

## Verifying

- Build into a private dir so parallel work does not clash: `npx vite build --outDir .build-<name> --emptyOutDir`
- Smoke test: `npx vite preview --outDir .build-<name> --port <port> --strictPort` then
  `MSYS_NO_PATHCONV=1 SMOKE_PORT=<port> node scripts/smoke.mjs /path/one /path/two` (mocks every `/api` call; prints OK/FAIL per page).
- Remove your `.build-<name>` dir when done.
