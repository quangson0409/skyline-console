# Port audit: legacy Skyline vs new console

Audit date: 2026-10-13.

Baseline:
- **Legacy:** `D:\sonbq\skyline-console\src`
- **New:** `D:\sonbq\skyline-console-new`, at HEAD `04a6e12c` plus the uncommitted working tree as of the audit.

Other people were editing the new app during the audit. Uncommitted changes existed in these files:
- `authStore.js`, `MainLayout.jsx`, `GlobalHeader.jsx`
- `ResourcePage`, `ResourceDetail`, `BaseTable`
- `useInstances`, `useOverview`, `useProjectMap`
- `InstanceList`, `ImageList`
- new files: `ProjectSwitcher.jsx`, `useAutoRefresh.js`

Where a finding depends on that in-progress work, it is marked **(WIP)**.

Method:
- **Static comparison:** every legacy container, action file, column, filter and detail tab against the new routes and pages.
- **Live read-only check:** Playwright against `http://127.0.0.1:3002`, logged in as `mkst-domain/robin` (project roles only). A request guard aborted any non-GET call; it recorded 0 attempts.

Feature counts use this tally: list columns + search filters + action files + detail tabs + form groups. They are approximate.

---

## 1. Summary

| Module | Status | Legacy features → ported | Notes |
|---|---|---|---|
| Compute: Instance (list, detail, actions) | **partial** | ~64 → ~50; actions 37 → 32 | Missing FIP associate/disassociate, port-level SG management, Ironic create/delete, Snapshots and Floating IPs tabs. The admin list is not cross-tenant. Fake defaults (see 2.1). Create wizard is being redone. |
| Compute: Flavor | complete | ~30 → ~30 | |
| Compute: Host Aggregate | complete | 13 → 13 | |
| Compute: Hypervisors | complete | ~14 → ~14 | Embedded instances tab is read-only |
| Compute: Image | complete | ~30 → ~30 | |
| Compute: Instance Snapshot | complete | ~13 → ~13 | |
| Compute: Keypair | complete | 9 → 9 | |
| Compute: Server Group | complete (minor) | ~11 → ~11 | Members tab is read-only; the create preset ignores the server group |
| Compute: Bare Metal Node | complete | ~35 → ~35 | |
| Storage: Volume | complete (limited) | 36 → 36 | Quota does not block submit; no per-type quota |
| Storage: Snapshot | complete | 14 → 14 | |
| Storage: Backup | partial (minor) | 14 → 13 | Restore pre-checks and the Volume Info card are missing |
| Storage: Backends | complete | 7 → 7 | |
| Storage: Volume Type / QoS | complete | 31 → 31 | |
| Storage: Container (Swift) | complete | 24 → 24 | |
| Network: Network / Subnet | complete | ~25 / ~14 → same | |
| Network: Port | complete | ~29 → ~29 | |
| Network: Floating IP | complete | ~22 → ~22 | |
| Network: Router | complete | ~27 → ~27 | |
| Network: Security Group | complete | ~22 → ~22 | |
| Network: QoS Policy | partial (minor) | ~28 → ~26 | The detail Floating IPs tab lacks Associate and Create Port Forwarding |
| Network: RBAC Policies | complete | ~16 → ~16 | |
| Network: Topology | complete (limited) | ~7 → ~6 | Create Network / Instance navigate away instead of opening in place |
| Network: VPN | complete | ~40 → ~40 | |
| Network: Firewall | complete | ~35 → ~35 | |
| Network: Load Balancer, DNS, Certificate | **not started** | → 0 | `ModulePlaceholder`; detail and create sub-routes do not exist |
| Identity: Domain / Role / User / UserGroup | complete | 16 / 10 / 26 / 14 → same | Some transfer lists became multi-selects |
| Identity: Project | complete (minor) | 27 → 27 | `maxLength: 30` on the name dropped; quota tab is simplified |
| User Center: Center / Credentials / TOTP | complete | 5 / 10 / 6 → same | |
| Auth: Login | **partial** | 8 → ~3 | **No TOTP step, no SSO**, no default-domain lookup |
| Auth: Change password (expired) | complete | 6 → 5 (+ new self-service page) | |
| Base: Overview (project) | **partial (mock)** | 5 → ~0 real | Only the instance count is live; everything else is hardcoded |
| Base: Admin Overview | **missing (mock)** | 5 → 0 real | Fully static mock |
| Heat, Octavia, Designate, Barbican, Manila (8 containers), Trove (3), Magnum (2), Zun (4), Masakari (3), Zaqar | **not started** | → 0 | 40 of 88 menu leaves open `ModulePlaceholder` |
| Monitor Center, Management recycle bin | not started | → 0 | Also commented out of the legacy menu |
| Configuration (SystemInfo, Setting, Metadata) | **not started** | → 0 | `configuration-admin/*` placeholder |

---

## 2. Per module

### 2.1 Compute

Files:
- Instance: `src/pages/Instances/{InstanceList,InstanceDetail,CreateInstanceModal}.jsx`, `src/pages/Instances/actions/index.jsx`, `src/hooks/useInstances.js`
- Other compute pages: `src/pages/Compute/*`
- Routes: `src/routes/modules/compute.jsx` and `src/App.jsx`

**Missing / limited vs legacy**

*Instance actions*
- These legacy actions are not ported:
  - `AssociateFip.jsx` and `DisassociateFip.jsx`. They exist only under Network/Port and Floating IP.
  - `ManageSecurityGroup.jsx`, which works per port. The new detail page only does server-level add/remove security group.
  - `CreateIronic` (primary action and wizard; the route `/compute/ironic-instance/create` does not exist) and `DeleteIronic.jsx`.
  - The Ironic-aware batch sets.
- Actions that lost depth:
  - **Console:** uses the deprecated `os-getVNCConsole` (noVNC only). Legacy used `os-remote-consoles`. The fallback opens `?tab=console`, which does not exist in `InstanceDetail`.
  - **Resize:** a plain select. Legacy had a flavor select-table and a "Forced Shutdown" option.
  - **Migrate / LiveMigrate:** confirm dialogs only. There is no target-host table, and `block_migration` is hard-wired to `auto`.
  - **AttachInterface:** network only. Legacy also offered subnet and fixed IP.
  - **DetachInterface / DetachVolume:** single select; legacy allowed multiple.
  - **AttachVolume:** a plain select.
  - **CreateSnapshot:** does not handle volume-backed instances.
  - **ChangePassword:** no confirm field and no complexity rule.
  - **ModifyTags:** comma-separated text.
  - **Reset:** a static list.
  - **Rebuild:** the instance-snapshot source is missing.
- Row actions are shown to everyone. Only Migrate, LiveMigrate and ResetState are marked `adminOnly`. Legacy limited admin rows to a smaller set and checked policies on every action.

*Instance admin list (`instance-admin`)*
- It renders the same `InstanceList`, with no Project or Host columns and no project filters.
- `useInstances` calls `listServers()` without `all_tenants`. The admin page probably shows only the current project (not verified live, because robin is redirected away from admin pages).

*Instance list data*
- **Fake data:**
  - `normalizeServer` defaults the IP to `10.0.0.1` and vcpu/ram/disk to 2/4/40.
  - Only one IP is shown.
  - The KPI quota is hardcoded (`maxVcpus: 64`, `maxRam: 256`). The live check showed "0 / 64".
- Missing columns: Project, Host, Tags, Locked. The image OS icon is gone.
- Filtering and paging are client-side; legacy did both on the backend.
- The status filter has 4 options, one of them `BUILDING`, while nova's status is `BUILD`.
- The legacy backend IP filter is missing.
- Auto-refresh had no polling at HEAD. An "Auto Refresh" toggle now exists **(WIP)**.
- There is no VERIFY_RESIZE toast on the list.

*Instance detail*
- Missing tabs: **Snapshots** and **Floating IPs**.

*Create wizard (being redone)*
- Compared with legacy StepCreate, it lacks:
  - instance-snapshot source
  - data disks
  - multiple networks or ports
  - server group (`scheduler_hints` is not sent even when `?servergroup=` is set)
  - host pinning
  - the login-type split with a confirm password
  - a confirm step

*Embedded instance lists*
- Server group members, hypervisor detail and flavor detail use `src/pages/Compute/_shared/InstanceTable.jsx`, which is read-only. Legacy embedded the full list with actions.

*Dead code*
- `InstanceDetailDrawer.jsx` is orphaned and contains hardcoded Vietnamese.

**Upgraded vs legacy**
- **Flavor:**
  - "All Flavors" tab.
  - Edit Flavor is enabled (commented out in legacy).
  - Manage Metadata is on every tab.
- **Aggregates:** Hosts Count column and an AZ filter.
- **Hypervisors:** more filters, and Version / Host IP on the detail page.
- **Keypair:**
  - Key Type column.
  - Fingerprint and type filters.
  - Download Public Key action.
  - Public key can be loaded from a file.
- **Bare metal:** 15-second auto-refresh and a Resource Class column.
- **Instance:**
  - EditInstance adds Description.
  - Rebuild adds admin password and keypair.
  - Rescue takes an image and a password.
  - Security group rules can be edited inline on the detail page.
  - Header action bar on the detail page.
  - Console-log length selector.
- KPI cards on most lists.

### 2.2 Storage

Files: `src/pages/Storage/*`, `src/routes/modules/storage.jsx`. All 20 legacy routes are mapped 1:1.

**Missing / limited vs legacy**

*Quota*
- Quota is shown only as text and **does not block submit**. Only Volume Create re-checks it inside `onSubmit`.
- Affected forms: CreateSnapshot, CreateBackup, CloneVolume, ExtendVolume, Snapshot CreateVolume, Backup CreateVolume.
- No per-volume-type quota (`gigabytes_<type>`, `volumes_<type>`) anywhere.
- No QuotaChart.

*Volume Create*
- No image filter (`canImageCreateInstance`) and no OS tabs.
- No capacity slider.
- No preview of the multi-count names.
- The snapshot and image pickers are not server-paged.

*Other Volume actions*
- Attach: the instance list is a single `listServers()` call, with no paging or filtering.
- UpdateStatus: the "in-use" warning is always shown.
- Bootable: the title no longer switches to "Unbootable".
- The detail Backups tab has no Create Backup primary action.

*Backup*
- `Restore.jsx` lost its pre-checks: volume must be available, or in-use with every attached instance shut off. The `restoreTip` is also gone.
- Create: the volume field is a plain select, the `disabledVolume` check is missing, and the tips are shortened.
- Detail: the "Volume Info" card is missing.

*Other*
- Volume Type: `VolumeTypeDetail.jsx` calls `volumeTypeRowActions()` without `existingNames`, so Edit from the detail page skips the duplicate-name check.
- Container: folder rows can still be ticked for batch actions (no `getCheckboxProps`).

**Upgraded vs legacy**
- Summary cards on every list.
- Snapshot list has a Create Snapshot primary action (legacy had none).
- Extra filters: Snapshot Volume Name, Backup Status.
- Richer detail pages: Volume shows ID, AZ, Host and Disk Tag. Backup shows Dependent Backups, Fail Reason and Data Timestamp.
- Volume Create's description field works (it was broken in legacy).
- Storage backend capacity is shown as a progress bar.
- Swift container:
  - Object Count column.
  - Size sort.
  - Upload progress.
  - Clipboard indicator for copy/cut.
  - Name-exists checks.
  - A friendly message on HTTP 409.

### 2.3 Network

Files:
- Pages: `src/pages/Network/*`, `src/pages/Networks/*`
- Routes: `src/routes/modules/network.jsx` (the `both()` helper adds a `-admin` copy of each route)

**Missing / limited vs legacy**
- **QoS Policy detail, Floating IPs tab:** the **Associate** and **Create Port Forwarding** row actions are missing. Legacy had them in `qosDetailConfigs`.
- **Load Balancers (Octavia), DNS (Designate) and Certificates (Barbican):** placeholders only.
  - These sub-routes do not exist and fall through to the `*` → `/base/overview` redirect:
    - `load-balancers/create`
    - `load-balancers(-admin)/detail/:id`
    - listener routes
    - `certificate-container/detail/:id`, `certificate-secret/detail/:id`
    - `dns(-admin)/zones/detail/:id`, recordsets
    - `dns/reverse/detail/:id`
- **Pickers:** many legacy select-tables became plain selects.
  - Examples: Create Port network and security groups; the IPsec Site Connection pickers (unverified).
- **Port:** whether the "Filter Instance Ports" quick checkbox exists is unverified.
- **Network list:** Quick Create is hidden on the admin page (whether legacy allowed it there is unverified).
- **Topology:** Create Network and Create Instance navigate to other pages instead of opening the form in place.
- **Behaviour change:** the Network and Subnet detail Ports tabs now show full port actions. Legacy used `noActions`.

**Upgraded vs legacy**
- **Network list:**
  - Subnet CIDR column.
  - Subnet popover.
  - Type and keyword filters.
  - Quota alerts in the create forms.
- **Router:**
  - Associate/Disassociate FIP turned on (commented out in legacy).
  - Connect/Disconnect Subnet on the detail Ports tab.
- **Security Group:**
  - Rules Count column.
  - "Manage Rules" drawer.
  - Stateful, Tags and Revision on the detail page.
- **Floating IP:** "Fixed IP (Mapped)" column and filter.
- **Port:** Host, Binding Profile and Admin State on the detail page.
- **Polling:** 15-second auto-refresh on Port, Router and Floating IP.
- **Topology:** dark-theme SVG with a resizable layout.

### 2.4 Identity, User Center, Auth, Overview

Files:
- Pages: `src/pages/Identity/*`, `src/pages/UserCenter/*`, `src/pages/Auth/Login/index.jsx`, `src/pages/Overview/*`
- Hook: `src/hooks/useOverview.js`

**Missing / limited vs legacy**

*Login*
- **No TOTP passcode step:**
  - Missing: `totp_required`, receipt, `loginTotp`, and the `receipt_expired` / `invalid_totp` errors.
  - `src/pages/UserCenter/TOTP.jsx` can turn on MFA for a user (`multi_factor_auth_rules`). **Once MFA is on, that user can no longer log in through the new console.**
- **No SSO/federation:** no `fetchSSO`, no login-type select, no IdP labels.
- **Domain:**
  - No default domain from skyline config. New hardcodes `'Default'`.
  - No `user@domain` parsing.
- **Error messages:** no friendly text for locked, disabled, or "no project" accounts. The raw error is shown.
- **Hardcoded values:**
  - The username is prefilled with `admin`.
  - The product name is hardcoded.
  - The expired-session alert is hardcoded Vietnamese.

*Overview*
- **Project Overview:** only the instance count is real.
  - vCPU, RAM and storage are mock (3.4/10 TB).
  - So are networks "8", floating IPs "12" and "SLA 99.98%".
  - The services table is `DEMO_SERVICES`.
  - Also missing:
    - legacy quick links
    - the real QuotaOverview (it could reuse `src/pages/Identity/Projects/quota.jsx`)
    - ProjectInfo (user, roles, domain, project)
- **Admin Overview:** fully static mock. Legacy had:
  - PlatformInfo
  - hypervisor CPU and memory
  - instance and volume state counts
  - nova services
  - neutron agents

*Identity forms*
- **User:**
  - Phone is a plain input; legacy had country-code formatting.
  - The Disable warning text is missing.
- **Project:**
  - Create dropped `maxLength: 30` on the name.
  - The quota tab lost "Members of Each Group" and the Normal/Danger/Full labels.
  - The tags filter matches substrings.
- **Transfer lists:** ManageUser, ManageUserGroup, Create User groups and UserGroup ManageUser now use multi-selects. Same behaviour, different UI.
- **Credentials:** the name field has no `input-name` validation.
- **Expired-password flow:** without the password info passed from login, the page shows the current-password form instead of sending the user back to `/auth/login`.

**Upgraded vs legacy**
- Self-service change-password page for logged-in users (`/user/change-password`).
- User Center has quick-link buttons.
- Copyable IDs on detail pages, and domain / default-project shown as links.
- Magnum quota is created when missing, and the project cache is cleared after changes.
- Role name is sortable.
- Role pickers flag members with no role.

---

## 3. Live check results (robin, project user, read-only)

Run against the dev server on `:3002`.

- **Mutating requests:** 0 attempted and 0 blocked.
- **Uncaught page errors:** 0 on every route checked.
- **Data in robin's project:** almost none, confirmed by direct GETs. The project has 0 servers, keypairs, routers, floating IPs and ports, 1 security group (`default`), and 1 visible (external) network. 16 flavors and 8 public images are visible.
- **What "Result" means:** "OK (empty)" means the page rendered its table and showed the empty state, which is correct for this project.

### Project-side routes

| Route | Result | Failed API / notes |
|---|---|---|
| `/base/overview` | Renders, with mock numbers | **403** `nova/os-hypervisors/detail` (×3). The project overview calls an admin-only API. |
| `/compute/instance` | OK (empty), KPI "0 / 64" (hardcoded quota) | Console: `useForm` instance not connected to a Form element; antd Spin `tip` warning |
| `/compute/instance/create` | Redirects to `/compute/instance?create=1` (modal) | — |
| `/compute/instance-snapshot` | OK (empty) | 403 `keystone/v3/projects` |
| `/compute/flavor` | OK. "x86 Architecture" and "Heterogeneous" tabs are empty; Custom and All show 10 rows (page 1 of 16) | Flavors have no arch extra spec, so they land under Custom (same rule as legacy) |
| `/compute/flavor/detail/:id` (amphora.medium) | OK, tabs Detail and Instances | — |
| `/compute/server-group` | OK (empty) | 403 `keystone/v3/projects` |
| `/compute/image` | OK. Current Project 0, Public 7 (8 minus 1 snapshot), Shared 0 | 403 `keystone/v3/projects` |
| `/compute/image/detail/:id` | OK, Detail tab | — |
| `/compute/image/create` | OK (form) | — |
| `/compute/keypair` | OK (empty). Create Keypair modal opened, showed real quota (0/100), then cancelled | — |
| `/storage/volume` | OK (empty) | 403 `keystone/v3/projects` |
| `/storage/volume/create` | Opens the create modal over the list | 403 `keystone/v3/projects` |
| `/storage/backup`, `/storage/snapshot` | OK (empty) | 403 `keystone/v3/projects` |
| `/storage/container` | OK (empty) | — |
| `/network/networks` | OK. Current 0, Shared 0, External 1 | 403 `keystone/v3/projects` |
| `/network/networks/detail/:id` (external) | OK, tabs Detail / Subnets (1 row) / Ports | — |
| `/network/port`, `/network/qos-policy`, `/network/router`, `/network/floatingip` | OK (empty) | 403 `keystone/v3/projects` |
| `/network/topo` | Renders | — |
| `/network/vpn` | **Renders blank, with no error or "service unavailable" state** | VPNaaS is not deployed: a direct GET of `vpn/vpnservices` returns **404**, but the page shows nothing about it. The menu entry still shows. |
| `/network/security-group` | OK, 1 row | 403 `keystone/v3/projects` |
| `/network/security-group/detail/:id` (default) | OK, Rules tab with 4 rows | — |
| `/network/firewall` | OK (empty) | **404** `neutron/v2.0/fwaas/firewall_groups` (×2). FWaaS is not deployed, but the menu entry still shows. Legacy hid it through endpoint/extension gating. Console: antd static `message` context warning. |
| `/network/firewall/create` | OK (form) | **404** `fwaas/firewall_policies` (×2) |
| `/identity/project` (project-side, no menu entry) | **Empty table and no error shown** | **403** `keystone/v3/projects`. A non-admin needs `/v3/users/{id}/projects` (what legacy fetched here is unverified). |
| `/identity/user` (project-side) | **Empty table and no error shown** | **403** `keystone/v3/users` |
| `/user/center`, `/user/application-credentials`, `/user/totp`, `/user/change-password` | OK | — |

### Admin routes and placeholders

| Route | Result |
|---|---|
| All 8 admin routes tried: `/base/overview-admin`, `/compute/instance-admin`, `/compute/hypervisors-admin`, `/storage/volume-admin`, `/identity/user-admin`, `/identity/domain-admin`, `/network/networks-admin`, `/storage/volume-type-admin` | **Redirected to `/base/overview`** **(WIP)**. The known "robin can reach -admin pages" issue appears fixed in the uncommitted working tree (`src/layouts/MainLayout.jsx:80`, `hasAdminPageRole` in `src/store/authStore.js`). It is **not fixed at HEAD** `04a6e12c`, where `hasAdminRole` defaulted to `true` and there was no guard. |
| `/heat/stack`, `/share/share`, `/database/instances`, `/messaging/queue`, `/network/load-balancers`, `/network/dns/zones` | `ModulePlaceholder` with a "Quay lại trang trước" (go back) button |

### Login, header and menu

- **Login form:** Domain (hint says it defaults to `Default`), username and password. No region, TOTP or SSO.
- **Header:** project selector "mkst-project (mkst-domain)", region RegionOne, language VI, theme Light/Tech/Dark.
- **Menu shown to robin:**
  - It lists Load Balancer, SSL Certificates, DNS, Share, Key Manager, Heat, Database, Queue and Containers. These are shown without any endpoint gating, and all of them are placeholders.
  - Firewall and VPN are shown even though neutron returns 404 for them.

### Recurring noise

- Every full page load calls `GET keystone/v3/system/users/{id}/roles` and gets **403**. This is the admin-role probe, and a 403 is expected for a non-system user. It could be cached, or treated as a quiet expected failure.
- `src/hooks/useProjectMap.js` calls `keystone/v3/projects` on every project-side list. It gets 403 and falls back to the session's projects. It should only be called on admin pages.
- Repeated antd deprecation warnings: `Spin tip`, `Card bordered`, and static `message` without `App` context.

### Not verifiable live

Admin pages (redirected), anything that needs data in the project (instance/volume detail and row-action menus), and per-row modals.

---

## 4. Cross-cutting gaps

| Area | Legacy | New | Gap |
|---|---|---|---|
| Admin page guard | System role admin/reader (`root.js:155-176`), redirect in `layouts/Base` | **(WIP)** `hasAdminPageRole` and a redirect in `MainLayout.jsx:80`. At HEAD there was no guard and `hasAdminRole` defaulted to `true`. | Commit and verify. The Administrator button visibility depends on it too. |
| Policy permissions | Fetches `/policies`; each action and menu item has a static `policy` (365 files); `checkItemPolicy` | **None.** Only `allowed(item)` and 4 `adminOnly` flags. | P0. Every user sees every action. |
| Project switch | `switch_project` gives a new token, then profile and policies reload | At HEAD: local state only (token not re-scoped, wrong project ids in service URLs). **(WIP)** `ProjectSwitcher.jsx` and `authStore.switchProject` call skyline `switch_project`. | Verify the WIP. Clear page caches after a switch (`invalidateProjectMap`, etc.). |
| Region switch | `switch_region` with a new token; selector shown only when there is more than one region | Local state; regions come from the profile **(WIP)**; endpoints are not re-resolved | Call `switch_region` |
| Login TOTP / SSO / default domain | Yes | No | P0 for TOTP (MFA lock-out) |
| Auto refresh | Every list: 30 s, or 10 s while rows are in transition; stops after 10 min idle; toggle | Fixed 15 s on 11 pages. **(WIP)** `useAutoRefresh.js` with a toggle on Instances, ResourcePage and ResourceDetail. | Add the transition-state speed-up and the idle stop |
| Server-side pagination, filter, sort | About 20 lists (`isFilterByBackend`, `isSortByBackend`), marker paging | All client-side. Only glance follows markers. Nova and cinder lists stop at the default page size (1000). | P1. Data is truncated on large clouds. |
| Column hide/show | `CustomColumns`, saved per table | None | P2 |
| CSV download | `Tables/Base/Download` on every list | None | P1 (legacy feature removed) |
| Quota in create forms | `QuotaChart` and `checkQuotaDisable` in 31 forms | Text alerts in some forms, no blocking. QuotaChart is only on Overview, with mock data. | P1 |
| Endpoint and extension menu gating | 21 project and 22 admin menu entries gated by endpoint; neutron extensions loaded | None. Firewall and VPN show although neutron returns 404; placeholders shown for every service. | P1 |
| Notifications | antd `notification` with expandable error detail; clear-all control | One-line `message` toasts. `useActionRunner` reads only `badRequest.message` / `err.message`, so Neutron, itemNotFound and conflict bodies are lost. `ConfirmAction` labels every danger button "Delete". | P1 |
| 401 handling | Redirect to login | **Better.** Interceptor, proactive expiry check, 20 s heartbeat, `?expired=1` | — |
| i18n | en / zh / de / ko / ru / tr | en 3,601 keys, zh 3,600, **vi 367** (3,234 en keys missing in vi). Of 1,755 keys used in code: 211 missing in en, **1,510 missing in vi**, 212 missing in zh. Default locale is `vi`, so most of the UI shows English. 23 files hardcode Vietnamese; about 41 hardcode English JSX. | P1 |
| 404 page | Yes | Unknown routes silently redirect to `/base/overview` (this also hides missing LB/DNS sub-routes) | P2 |
| Global menu search | Yes (GlobalNav) | None | P2 |
| Sidebar | — | `src/components/Layout/SidebarNav.jsx` references `onSelect` **(WIP: now guarded with `if (onSelect)`)**. Verify the prop is declared, otherwise it still throws a ReferenceError. | P1 |
| Theme | Build-time only | **Runtime Light / Tech / Dark** switcher | Upgrade |
| Error boundary | — | `ErrorBoundary` in `main.jsx` | Upgrade |

---

## 5. Prioritized fix list

### P0: security, lock-out, correctness

1. **Admin guard.** Commit and verify the WIP. `hasAdminPageRole` should come from system role assignments in both `login()` and `fetchProfile()`, default to `false`, and also hide the Administrator button. Re-test with robin.
2. **TOTP login step.** Add it to `src/pages/Auth/Login/index.jsx` and `src/store/authStore.js` (receipt plus passcode). Until then, warn in `UserCenter/TOTP.jsx`, or hide the enable switch.
3. **Policy layer.** Fetch skyline `/policies`, add a `policy` field to actions and menu items, and check it in `ItemActionButtons` and `menuConfig`.
4. **Project and region switch.** Finish the token re-scope (WIP), re-fetch endpoints, and clear the caches (`useProjectMap`, page data).
5. **Fake data.** Remove it from `useInstances` (`10.0.0.1`, 2/4/40 defaults, `maxVcpus: 64` / `maxRam: 256`), `useOverview` and `AdminOverview`, and replace it with the real quota, hypervisor and service APIs.
6. **Admin instance list.** Add `all_tenants=1`, plus the Project and Host columns and project filters.

### P1: legacy features lost

1. **Instance actions:**
   - Add AssociateFip, DisassociateFip and the port-level ManageSecurityGroup.
   - Fix the Console fallback (`?tab=console`) and switch to `os-remote-consoles`.
   - Add host selection to Migrate and LiveMigrate.
   - Bring Resize and the Attach/Detach dialogs back to legacy depth.
   - Fix the status filter (`BUILD`, full list).
   - Add the Snapshots and Floating IPs detail tabs.
2. **Ironic:** add the `/compute/ironic-instance/create` route and the DeleteIronic action.
3. **Server-side pagination and filtering.** Do this at least for Instance, Volume, Port, Network and Image (and follow markers in nova, cinder and neutron).
4. **CSV download** in `ResourcePage` / `BaseTable`.
5. **Quota in create forms.** Show a QuotaChart, block submit when quota is exceeded, and add per-volume-type quota.
6. **Endpoint and neutron-extension gating** for the menu and pages: firewall, VPN and the placeholders. Give pages an explicit "service unavailable" state; `/network/vpn` currently renders blank.
7. **`useProjectMap`:** call it on admin pages only, which removes the 403 noise. Fix `/identity/project` and `/identity/user` for non-admins: use `/v3/users/{id}/projects`, or hide the routes.
8. **Overview:** don't call `os-hypervisors` on the project overview. Restore the quick links, the real QuotaOverview and ProjectInfo.
9. **Smaller gaps:**
   - Backup Restore pre-checks.
   - QoS detail Floating IPs tab: Associate and Create Port Forwarding.
   - `VolumeTypeDetail.jsx`: pass `existingNames` to `volumeTypeRowActions()`.
10. **Error notifications.** Reuse `getErrorMessage` from `hooks/useResource.js` in `useActionRunner`, and show error detail. Fix the hardcoded "Delete" OK button text in `ConfirmAction`.
11. **i18n.** Fill the 1,510 used keys missing in vi and the 211 missing in en, and replace the hardcoded Vietnamese and English strings.
12. **SidebarNav `onSelect`.** Verify the fix, and that the mobile drawer closes.

### P2: polish and parity

1. Column hide/show, a 404 page, menu search.
2. Login extras:
   - `user@domain` parsing and the default domain from config
   - friendly error messages
   - remove the `admin` prefill
3. Restore select-table pickers where legacy had them (Create Port, AttachVolume, Backup Create).
4. Embedded instance lists with actions (server group, hypervisor, flavor detail).
5. Server-group `scheduler_hints` in the create wizard. Restore Project Create name `maxLength: 30`, the User phone widget and the Disable warnings.
6. Clean up the antd deprecation warnings and remove the orphan `InstanceDetailDrawer.jsx`.
7. Not-started modules, suggested order by usage:
   1. Octavia LB, Heat, Designate, Barbican
   2. Manila, Trove, Magnum, Zun
   3. Masakari, Zaqar
   4. Configuration (SystemInfo, Setting, Metadata)

---

## 6. What could not be verified

- Admin-page behaviour live (robin has no system role).
- Row-action menus and detail pages for instances, volumes, ports, routers and floating IPs (robin's project has none).
- Cinder volume counts through a direct GET (wrong URL in the probe; the UI showed an empty list with no error).
- Whether legacy offered Quick Create on the admin network page, the Port "Filter Instance Ports" quick filter, and legacy's fetch for the project-side `/identity/project`.
- Console types other than noVNC (spice / serial).
