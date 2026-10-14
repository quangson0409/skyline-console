# Port audit: legacy Skyline vs new console (round 2)

Audit date: 2026-10-14. Replaces the round-1 audit of 2026-10-13.

Baseline:
- **Legacy:** `D:\sonbq\skyline-console\src` (React, MobX, antd 4)
- **New:** `D:\sonbq\skyline-console-new` at HEAD `025e8def` ("legacy server-side paging, sorting and filtering for large lists"). The working tree was clean apart from an untracked `scripts/.real.mjs` that is not part of the audit.

Method:
- **Static comparison:** every legacy container in `src/pages/*/containers/*` against its new route and page. For each one I compared list columns, filters, primary/batch/row actions with their `allowed` rules and `policy`, detail tabs, form fields with their validations and payloads, and the admin vs project variants.
- **Routes:** legacy `pages/*/routes/index.js` was expanded and diffed against the new `src/routes/modules/*.jsx` (evaluated) plus `src/App.jsx`. Legacy `layouts/menu.jsx` / `admin-menu.jsx` was diffed against `src/layouts/menuConfig.jsx`.
- **i18n:** every `t('…')` key used in `src` was checked against `src/locales/{vi,en,zh}.json` merged with `src/locales/modules/*`.
- **Live check, read-only:** Playwright against the Vite dev server `http://127.0.0.1:3002`, which proxies a real backend. I logged in as `mkst-domain / robin`, who has the project roles reader, manager and member and no system role.
  - A request guard aborted every non-GET/HEAD request except the login POST. It recorded **0 attempts**.
  - Nothing was mocked, submitted, confirmed or changed.
  - The scripts were deleted afterwards.

**How to read the counts.** Feature counts add up list columns, filters, action files, detail tabs and form groups. They are approximate. "complete" means that no legacy column, filter, action, tab or field is missing; it may still list small behavioural differences.

---

## 1. Summary

**Headline:** every legacy route exists. Every legacy container has a ported page (76 network and barbican paths, 22 share, 20 storage, compute 34, and all of heat, trove, magnum, zun, masakari and zaqar). No module is still a placeholder.

What is left falls into four groups:
- page/tab-level policy checks
- one policy hole on the instance detail page
- the SSO return path
- a long tail of downgraded pickers, name validators and small form details

| Module / container | Status | Legacy → ported (approx.) | Main remaining gap |
|---|---|---|---|
| **Compute** Instance (list, detail, actions, StepCreate, CreateIronic) | near-complete | ~66 → ~65 (+extras) | Detail-page `can()` ignores `policy`; Image column switched off |
| Compute: Flavor | complete (limited) | ~30 → ~30 | Detail "Instances" tab is read-only and unpaged |
| Compute: Host Aggregate | complete | 13 → 15 | — |
| Compute: Hypervisors | partial (minor) | ~14 → ~14 | Embedded instance list is read-only |
| Compute: Image | complete | ~30 → ~30 | — |
| Compute: Instance Snapshot | complete | ~13 → ~14 | — |
| Compute: Keypair | complete | 9 → 12 | — |
| Compute: Server Group | complete (limited) | ~11 → ~11 | Members tab is read-only and unpaged |
| Compute: Bare Metal Node | complete | ~35 → ~37 | — |
| **Storage** Volume | complete (limited) | ~37 → ~36 | Admin Project ID filter; Create pickers; Attach unpaged |
| Storage: Snapshot | complete | ~15 → ~15 | The new-only "Create Snapshot" action has no `policy` and no quota |
| Storage: Backup | partial (minor) | ~15 → ~13.5 | **Restore pre-checks missing**; Volume Info card |
| Storage: Backends, Volume Type/QoS, Container (Swift) | complete (minor) | 7 / 31 / ~23 → same | `existingNames` on VolumeTypeDetail; Swift folder rows selectable |
| **Network** Network / Subnet | partial (minor) / complete | ~48 / ~30 → ~52 / ~33 | Quick Create hidden on admin and has no policy; detail Ports tab not read-only |
| Network: Port | partial | ~50 → ~48 | "Filter Instance Ports" quick filter; plain-select pickers; admin Project ID filter |
| Network: Floating IP / Router / Security Group | complete–partial (minor) | ~38 / ~40 / ~38 → ~45 / ~46 / ~37 | Specific-IP field not policy-gated; name validators |
| Network: QoS Policy | partial | ~50 → ~47 | Detail FIP tab lacks Associate and Create Port Forwarding (still open from round 1) |
| Network: RBAC / VPN / DNS | complete | ~23 / ~175 / ~60 → same or more | — |
| Network: Firewall | partial (minor) | ~130 → ~127 | Default firewalls not hidden; admin Project ID filter; Shared checkbox gated by role, not policy |
| Network: Load Balancers (Octavia) | complete | ~114 → ~134 | Plain-select FIP picker; simpler member allocator |
| Network: Topology | partial | ~10 → ~10 | Create Network / Create Instance navigate away |
| Network: Certificate / Key Manager Secret | partial | ~26 / ~35 → ~26 / ~41 | Weaker name rule; decrypt-policy link gating; Download Payload has no policy |
| **Share (Manila)**, 8 containers | complete (7) / partial (ShareNetwork) | ~125 → ~128 | ShareNetwork network picker; `canSetPublic` uses role, not policy |
| **Heat** Stack | complete | ~34 → ~46 | The 4 new actions have no `policy`; YAML tab is read-only `<pre>` |
| **Trove**: Instances / Backups / Configurations | complete | ~67 → ~82 | Attach/Detach configuration have no `policy` |
| **Magnum**: Cluster Templates / Clusters | complete | ~108 → ~120 | — |
| **Zun**: Containers / Capsules / Hosts / Services | complete | ~128 → ~138 | Logs tab ignores `container:logs` |
| **Masakari**: Segments / Hosts / Notifications | complete | ~65 → ~72 | UUID column folded into name |
| **Zaqar**: Queue | complete | ~30 → ~32 | — |
| **Identity**: Domain / Role / UserGroup | complete | 18 / 13 / 18 → same | UserGroup Manage User is a multi-select |
| Identity: Project | partial | 35 → 33 | Create name `maxLength 30`; quota-tab legend, "Members of Each Group", 80/90 thresholds |
| Identity: User | partial | 31 → 29 | Phone country-code widget; Disable warning. (AdminTOTP tab now present.) |
| User Center: Center / Credentials / TOTP | complete / partial / complete | 5 / 11 / 6 → 5 / 10 / 6 | Credentials name validation |
| **Auth**: Login | mostly complete | ~12 → ~10 | **SSO return likely broken**; `receipt_expired` / `invalid_totp` handling |
| Auth: Change password (expired) | complete (minor) | 6 → 5 (+self-service) | Without the hand-off data the user is stuck |
| **Base**: Overview / Admin Overview / 404 | complete | 5 / 5 / 1 → 5 / 5 / 1 | — (all real data) |
| **Configuration**: SystemInfo + Neutron agent / Setting / Metadata | complete | 75 / 10 / 15 → 75 / 10 / 17 | Agent add/remove reports success on partial failure |
| **Management**: Recycle Bin | complete | 15 → 15 | — |
| **Monitor Center** (5 pages) | complete | ~65 → ~65 | — (same 58 PromQL metrics, no mocks) |

---

## 2. Per module

### 2.1 Compute

Files:
- Instance: `src/pages/Instances/**`, `src/hooks/useInstances.js`, `src/hooks/useServerPaging.js`
- Other compute pages: `src/pages/Compute/**`
- Routes: `src/routes/modules/compute.jsx` and `src/App.jsx:96-128`

Every legacy compute route is mapped, including `compute/instance/create` and `compute/ironic-instance/create`. Every action carries the legacy `policy` string. Rescue/Unrescue have none, as in legacy; Keypair "Download Public Key" is a new action and has none.

**Fixed since round 1:**
- **Instance actions:**
  - AssociateFip, DisassociateFip, port-level ManageSecurityGroup, DeleteIronic and the ironic-aware batch sets (`actions/index.jsx:51-89`) are ported.
  - Console uses `os-remote-consoles` (`actions/common.jsx:62`) and has a Console tab.
  - Resize has a flavor select-table, Forced Shutdown and quota.
  - Migrate / LiveMigrate have a host select-table and Block Migrate.
  - AttachInterface takes network, subnet and fixed IP.
  - Detach Interface and Detach Volume are multi-select; AttachVolume is a select-table.
  - CreateSnapshot handles boot-from-volume.
  - ChangePassword has a confirm field and the password rule.
  - ModifyTags uses a tags input with the legacy rules.
  - Reset offers the legacy state list; Rebuild has the snapshot source.
- **Admin list:** `all_projects`, Project and Host columns and filters.
- **Fake data is gone:** no `10.0.0.1`, no 2/4/40 defaults, no 64/256 quota. The KPI cards use the real nova quota.
- **List:** Tags and Locked columns are back.
- **Backend paging, filtering and sorting** through skyline `/extension/servers`, including the `ip` filter. The status filter matches legacy (`BUILD`, 7 options).
- **Polling:** 10 s while rows are in transition, otherwise 30 s, plus the VERIFY_RESIZE toast.
- **Detail:** Snapshots and Floating IPs tabs.
- **Create wizard:** snapshot source, data disks, multiple networks and ports, server group with `scheduler_hints` (and the `?servergroup=` preset), host / physical node, login type with a confirm password, the Confirm step and a QuotaPanel.

**Missing / limited vs legacy**
- **Policy hole (P0).** `InstanceDetail.jsx:420-428` `can()` checks only `adminOnly` and `allowed`, never `policy`. It drives:
  - the "More Actions" menu (`:759-765`)
  - the tab buttons for Attach Volume, Attach Interface, Associate FIP and Manage SG (`:1478-1563`)
  - the inline security-group attach/detach and rule create/delete (`:518, 619, 681, 698`), which have no policy check at all

  The list page does filter by policy.
- **Image column switched off:** `InstanceList.jsx:28` `SHOW_IMAGE_COLUMN = false`. Legacy showed the OS icon and image name. This was a deliberate style decision (commit `104cf9fd`), but it is still a removed legacy column. If it stays hidden, make it hideable instead.
- **Embedded instance lists are read-only:**
  - Flavor detail "Instances" tab: `Flavors/FlavorDetail.jsx:138-198`.
  - Hypervisor detail and Server Group members: `Compute/_shared/InstanceTable.jsx`. `fetchServersByIds` (`:94-99`) loads a single page.

  They have no row or batch actions, no marker paging and client-side filters. Legacy embedded the full instance list with its actions and backend `flavor_id` / host filters.
- **Smaller items:**
  - ResetState is `adminOnly: true` (`statusActions.jsx:283`). Legacy gated it only by policy and `!locked`.
  - Flavor is not `defaultHidden` on the admin list.
  - On the admin page the KPI cards show the current project's quota next to all-tenant counts.
- **Tabs not synced with `?tab=`:** `Aggregates/AggregateList.jsx:449`, `Images/ImageList.jsx:121`, and the Flavor list (confirmed live: `/compute/flavor?tab=custom` opened the x86 tab).
- **Dead code:**
  - `src/pages/Instances/CreateInstanceModal.jsx` (935 lines) and `src/pages/Instances/InstanceDetailDrawer.jsx` are imported nowhere.
  - Both contain hardcoded Vietnamese. They are the only source files left with hardcoded Vietnamese UI text.

**Upgraded vs legacy**
- Real quota KPI cards and a Flavor filter on the instance list.
- Edit adds Description; Rebuild adds admin password and keypair.
- Inline security-group rule editing on the detail page, and a Console tab.
- Quota chart on Resize and on CreateSnapshot.
- Migrate / LiveMigrate are also offered to admins on the project list.
- Flavor: All tab, Edit (commented out in legacy), Metadata on every tab.
- Aggregates: Hosts Count column and AZ filter.
- Keypair: Key Type column, extra filters, Download Public Key.
- Bare metal: Resource Class column.

### 2.2 Storage

Files: `src/pages/Storage/**`, `src/routes/modules/storage.jsx`. All 20 legacy routes are mapped, and menu endpoint gating is in place (`menuConfig.jsx:641-661`).

**Fixed since round 1:**
- **Quota now blocks submit.** `ActionModal` takes a `quota` prop, shows the chart and disables OK. It includes the per-volume-type lines (`volumes_<type>`, `gigabytes_<type>`, `snapshots_<type>`).
- It is wired into Volume Create, CreateSnapshot, CreateBackup, Clone, Extend, Snapshot→CreateVolume, Backup Create and Backup→CreateVolume.
- **Server-side paging, filtering and sorting** with marker paging for Volume (`/extension/volumes`), Snapshot and Backup.
- **CSV export** on every list.

**Missing / limited vs legacy**
- **Backup Restore pre-checks (P0).** `restoreBackupAction` (`Backups/BackupList.jsx`) lacks:
  - the legacy `checkVolume` (volume must be available or in-use)
  - `checkInstance` (every attached instance must be SHUTOFF)
  - the Instance label row
  - blocking submit when the checks fail

  Without them, a user can restore onto a running in-use volume.
- **New-only "Create Snapshot" primary action** (`Snapshots/SnapshotList.jsx`): no `policy` (readers see it), no quota, and an unfiltered volume select with `force: true`.
- **Admin "Project ID" filter is missing** on Volume, Snapshot and Backup (legacy `adminPageHasProjectFilter`).
- **Volume:**
  - Create: no `canImageCreateInstance` image filter and no OS tabs; snapshot picker unpaged; no preview of the multi-count names.
  - Attach: unpaged `listServers()`.
  - UpdateStatus: the "in-use" alert is always visible.
  - Bootable: no "Unbootable" title or switch text.
  - Detail Backups tab: no Create Backup primary action (`createBackupAction({ volumeId })` already exists).
- **Backup:**
  - Detail: no "Volume Info" card (volume name, Project ID).
  - Create: volume picker is a plain unpaged select.
- **Volume Type:** `VolumeTypeDetail.jsx` still calls `volumeTypeRowActions()` without `existingNames`, so Edit from the detail page skips the duplicate-name check. There is no `input-name` validation on volume type or QoS create.
- **Swift container detail:** no `getCheckboxProps`, so folder rows can be ticked and Copy/Cut accept folders. It also auto-refreshes, while legacy had `ableAutoFresh = false` (unverified).
- **Name validation:** no Storage name field has the legacy `input-name` rule. `src/components/form/rules.js` has no shared `nameRule`.

**Upgraded vs legacy**
- Server-side KPI cards.
- Volume detail shows ID, AZ, Host, Disk Tag and Bootable. Backup detail shows Dependent Backups, Fail Reason and Data Timestamp.
- Snapshot list has a Volume Name filter; Backup list has a Status filter.
- Storage backend capacity is shown as a progress bar.
- Swift: Object Count column, upload progress, name-exists checks, friendly 409 message.

### 2.3 Share (Manila)

Files: `src/pages/Share/**`, `src/routes/modules/share.jsx`. All 22 legacy routes are mapped. The menu has 3 project and 8 admin entries behind `manilav2`. About 35 actions carry their legacy `policy`. Share Create quota (`shares`, `gigabytes`) is ported, and Extend gains a quota chart.

| Container | Status | Notes |
|---|---|---|
| Share (+ admin, create) | complete | 12 columns, server-side paging, 7 actions, all 11 Create fields, tabs Base / Metadata / Access Rules. **Limited:** `canSetPublic` (`Share/shareActions.jsx:150`) uses `hasAdminRole` instead of `share:create_public_share` / `share:set_public_share`; the embedded `ShareTable` filters in the browser; no name rule. |
| ShareGroup / ShareGroupType / ShareInstance / ShareServer / Storage | complete | Extra filters and columns added |
| ShareType | complete (minor) | `ShareTypeDetail.jsx` builds Edit without `existingNames` |
| ShareNetwork (+ admin) | **partial** | The Create network picker is a flat `listNetworks()` table (`ShareNetwork/shareNetworkShared.jsx:165`). Legacy had project/shared/all tabs, backend paging and excluded external networks. |

**Not verified live:** manila is not in robin's catalog. Every share page correctly showed "Service unavailable".

### 2.4 Network, Octavia, Designate, Barbican

Files:
- Pages: `src/pages/Network/**`, `src/pages/Networks/**`, `src/pages/KeyManager/**`
- Routes: `src/routes/modules/{network,octavia,dns,barbican}.jsx`

All 74 network and 2 barbican legacy routes exist. The round-1 placeholders for LB, DNS and Certificate are fully ported. About 120 `policy:` fields are spread across the network pages.

**Fixed since round 1:**
- Load Balancer (5-step wizard, listener / pool / member / health monitor), DNS (zones, record sets, reverse) and Certificate are ported, with every sub-route.
- Endpoint gating: `MENU_ENDPOINTS` plus a "Service unavailable" page. VPN and Firewall no longer render blank (confirmed live).

**Missing / limited vs legacy**
- **QoS Policy detail, Floating IPs tab** (still open): no **Associate** and no **Create Port Forwarding** (`QosPolicyDetail.jsx:160-165, 254-261`). Both actions exist in `Networks/FloatingIps/actions.jsx:401, 810`. The Associated Resource column also lost the resource name and the port-forwarding popover.
- **Port:**
  - The "Filter Instance Ports" quick checkbox is missing; `ResourcePage` has no `isQuick` support.
  - No admin Project ID filter (`PortList.jsx:99-121`).
  - These select-tables became plain selects: Create network and SGs, Attach Instance (unpaged), Manage SG, Associate/Disassociate FIP, Modify QoS.
  - No `input-name` validation on Create or Edit.
  - Likely bug: on the detail page `manageSecurityGroupAction.allowed` reads `item.origin_data.allowed_address_pairs` (`Port/actions.jsx:430-433`), which the detail object does not have.
- **Network:**
  - Quick Create is hidden on the admin page (`VpcNetworks.jsx:208`); legacy allowed it there.
  - `quickCreateNetworkAction` (`NetworkParts/actions.jsx:385`) has **no `policy`**. Legacy required `create_network`, `create_subnet` and `create_router`.
  - The Network and Subnet detail Ports tabs show full actions; legacy used `noActions` (`NetworkDetail.jsx:123`, `SubnetDetail.jsx:123`).
  - The detail QoS row is not gated on `neutron_qos`.
- **Floating IP:**
  - The specific-IP field in Allocate is not gated by `create_floatingip:floating_ip_address` (`FloatingIps/actions.jsx:193-198`).
  - The detail breadcrumb is not admin-aware.
- **Router:**
  - No name validator.
  - AZ and external-network pickers are plain multi-selects.
  - The "clear external gateway first" delete message is gone.
  - `RouterPortDetail.jsx:121` breadcrumb always points to the project route.
- **Security Group:** no admin Project ID filter.
- **Firewall:**
  - Default firewalls are not hidden on first load (legacy `initFilter {notDefault: true}`; `FirewallPage.jsx:441-446`).
  - No admin Project ID filter.
  - The Shared checkbox is gated by `hasAdminRole` instead of the `update_firewall_*:shared` policy (`FirewallPolicyForm.jsx:151`, `FirewallRuleForm.jsx:281`).
  - The "in use" delete messages are gone.
- **Topology** (still open): Create Network navigates to `/network/networks` (`Topology.jsx:422`) instead of opening the modal. Create Instance goes to `/compute/instance` (`:425`) instead of `/compute/instance/create`.
- **Certificate / Secret:**
  - The name rule is only `noChineseRule`.
  - Certificate list links to the detail page even without `barbican:secret:decrypt` (`CertificateList.jsx:50`).
  - The new Download Payload action has no `policy` or `allowed`.
  - `/network/certificate-container/*` and `/network/certificate-secret/*` are not barbican-gated: their prefix is not under `/network/certificate/`.
- **Load Balancer:**
  - Associate FIP uses plain selects.
  - The member allocator has one free-text search; legacy had ID / Name / Instance / IP filters.
- **VPN:** the router select loads every router and searches in the browser.

**Upgraded vs legacy**
- Network: Subnet CIDR column and popover, type and keyword filters, quota chart.
- Router: Associate/Disassociate FIP, Connect/Disconnect Subnet on the Ports tab.
- Security Group: Rules Count column, Manage Rules drawer.
- Floating IP: Fixed IP (Mapped) column and filter.
- DNS: masters validation fixed (legacy accepted most invalid strings and rejected IPv6); actions on the zone detail page.
- Load Balancer: fixes the legacy SNI-field bug; `vip_address` sent only in manual mode; bounded inputs.
- VPN: admin Project ID filter.
- Secret: Download Payload.

### 2.5 Heat, Trove, Magnum, Zun, Masakari, Zaqar

Files:
- Pages: `src/pages/{Heat,Database,ContainerInfra,ContainerService,HA,Messaging}/**`
- Routes: `src/routes/modules/{heat,database,container,admin-extra,messaging}.jsx`

Every legacy route is mapped: heat 4 (plus the `stack-admin/*` routes, commented out in legacy), database 9/9, container-infra 11/11, container-service 10/10, ha 7/7, zaqar 4/4. I found no missing column, filter, action, tab or wizard field.

**Missing / limited vs legacy**
- **Zun:**
  - The container Logs tab only checks the status. Legacy also required `container:logs`.
  - The exposed-port validator is simplified (to verify).
- **Heat:**
  - The YAML tab is a read-only `<pre>` block.
  - The template is sent as raw text; legacy parsed it to an object. Heat accepts both; not tested.
- **Trove:** Resize Volume uses a number box instead of the legacy slider.
- **Masakari:**
  - The hideable UUID column is folded into the name cell.
  - The "Project Name" filter never matches anything (same flaw in legacy).
- **Zaqar:** Create/Release Claim have no policy, as in legacy.
- **Actions added by the port without `policy`:**
  - Heat: Suspend, Resume, Check, Cancel Update (`Heat/Stack/actions.jsx`)
  - Trove: Attach/Detach Configuration (`Database/Instances/actions.jsx`)

**Upgraded vs legacy**
- **Heat:**
  - template from URL
  - Edit preloads the template and parameters
  - Suspend, Resume, Check and Cancel Update
  - Abandon downloads the abandon data as JSON
  - server-side paging
  - resource and event filters
- **Trove:** Attach/Detach Configuration and Create Backup on instances; Backups list grows from 2 to 7 columns.
- **Magnum:** Upgrade Cluster is wired (legacy had the file but never wired it); node → server links.
- **Zun:** Execute Command shows the exit code; Disabled Reason column on Services.
- **Masakari:** extra filters; notification payload JSON.
- **Zaqar:** batch delete; sortable columns.

**Live:** robin's catalog has heat and magnum, but not trove, zun, zaqar or masakari. The Heat stack list, create page, Magnum cluster-template list and detail, clusters list and both Magnum wizards rendered. Trove, Zun and Zaqar showed "Service unavailable", which is correct.

### 2.6 Identity, User Center, Auth, Base

Files:
- Pages: `src/pages/{Identity,UserCenter,Auth,Overview,Base}/**`
- Store and hook: `src/store/authStore.js`, `src/hooks/useOverview.js`

**Fixed since round 1:**
- **Login:**
  - TOTP step: `totp_required`, receipt, then `login/totp` with the legacy payload (authStore.js:257).
  - SSO login types from `/sso`, with IdP labels.
  - Default domain from skyline `/config`.
  - `user@domain` parsing, including e-mail usernames.
  - Friendly locked / disabled / no-project errors.
  - Expired-password redirect.
  - No `admin` prefill.
- **User detail:** AdminTOTP tab.
- **Overview:** all real data. Nova, neutron, cinder, manila, zun, magnum and trove quota; quick links; QuotaOverview with the Normal/Danger/Full legend; ProjectInfo. The admin `os-hypervisors` call is gone.
- **Admin Overview:** real PlatformInfo, hypervisor CPU and memory from placement, instance and volume counts, nova services and neutron agents.
- **404:** a real page (confirmed live).

**Missing / limited vs legacy**
- **SSO return is likely broken (P0, not testable here; SSO is disabled on this backend).**
  - Legacy loaded the profile from the cookie session at boot (`core/index.jsx:65-70`).
  - New `MainLayout.jsx:76` redirects to login unless a localStorage `keystone_token` exists, and nothing calls `fetchProfile()` without a token (`MainLayout.jsx:45`).
  - So after the IdP round-trip the user most likely lands back on the login page.
- **TOTP errors:**
  - `receipt_expired` stays on the passcode step with the raw error. Legacy went back to the password step with "Session expired. Please log in again."
  - `invalid_totp` has no friendly text.
  - `authStore.login` / `loginTotp` show a toast and the page also shows an inline Alert (duplicate).
- **Login text:**
  - The domain tip hardcodes 'Default' (confirmed live: "…tên miền mặc định 'Default'"). Legacy interpolated the configured domain.
  - Unknown failures show the raw message; legacy said "Username or password is incorrect".
  - Product name is hardcoded instead of read from `product_name`.
- **Expired-password page** (`UserCenter/ChangePassword.jsx`): opened without the hand-off data, it shows a form whose button stays disabled. Legacy redirected to `/auth/login`.
- **Project:**
  - Create has no `maxLength: 30`.
  - The quota tab (`Identity/Projects/quota.jsx`) has no legend, no "Quota Overview" title, no "Members of Each Group" and uses 80/100 thresholds instead of 80/90. (Overview's own quota card does have these.)
- **User:**
  - Phone is a plain input with a regex (`Identity/common.jsx:202`). Legacy had a country-code widget with libphonenumber validation and formatting.
  - Disable has no `confirmText` warning (`UserList.jsx` `disableUserAction`).
- **Credentials:** no `input-name` validation.
- **Transfer lists:** Project Manage User / Group, User Create and UserGroup Manage User now use a multi-select plus a role table (`MemberRoleSelector`). Same behaviour, different UI.
- **Non-admin `/identity/project` and `/identity/user`** (confirmed live): 403 on `keystone/v3/projects` / `v3/users`, an error toast and an empty table. Legacy showed a "not allowed" page through `identity:list_projects` / `identity:list_users`. No menu links to these routes.
- **Deep-link routes not registered:** `/identity/project[-admin]/create`, `/identity/project[-admin]/edit/:id`, `/identity/user-admin/edit/:id`, `/identity/user-group-admin/create` and `/identity/user-group-admin/edit/:id`. Legacy mounted the modal forms as pages; the new console opens them from the list. These URLs now show the 404 page.
- **Leftover:** `backendUrl: 'http://10.0.29.10:9999'` in `authStore.js:119` (appears unused).

**Upgraded vs legacy**
- Region select on login when there is more than one region.
- `?expired=1` notice and `?redirect=` handling.
- Self-service change-password page.
- User Center quick links.
- Copyable IDs, and domain / default project shown as links.
- Overview: in-use counts on the quick links, Remaining per quota, a Refresh button.
- Admin Overview: local-disk circle, network / router / SG / FIP tiles, AZ and Status columns.
- User menu: Get Token, Download OpenRC and Download clouds.yaml (confirmed live).

### 2.7 Configuration, Management, Monitor

Files:
- Pages: `src/pages/{Configuration,Management,Monitor}/**`
- Routes: `src/routes/modules/admin-extra.jsx`
- API: `src/api/monitor.js`

- **SystemInfo:**
  - Services, Compute, Neutron Agents, Cinder and Heat tabs, with the endpoint conditions.
  - Enable/Disable with policies and the 64/200 reason length limits.
  - Neutron agent detail with Routers and Networks tabs (Add / Remove / batch Remove).
  - All match legacy.
- **Setting:** View, Edit, Reset, batch Reset, with the same policy objects. The value is edited in a textarea instead of the JSON CodeEditor.
- **Metadata:** Import, Edit, Manage Resource Types, Delete (blocked when protected), plus extra filters.
- **Recycle Bin:** 8 columns, Recover/Delete (row and batch), server-side paging, detail page. Legacy had these routes commented out, so this is an upgrade. The project menu shows it under "Bảo trì" (Maintenance).
- **Monitor Center:**
  - Uses the same skyline `/query` and `/query_range` endpoints.
  - All 58 metric keys and PromQL strings are identical.
  - No mock data.
  - Time presets, custom range, interval, node select and chart expand are present.
- **Limited:** `NeutronAgentDetail.jsx` Add Network / Add Router use `Promise.allSettled`, so a failure still shows a success toast.

**Not verified live:** all admin pages (robin has no system role).

---

## 3. Live check results

Setup: dev server `:3002`, user `mkst-domain/robin` (project roles reader, manager, member; no system role).
- **Request guard:** 0 non-GET requests attempted, 0 blocked.
- **Coverage:** 59 project routes visited, plus 7 detail pages with every tab clicked.
- **Admin routes:** 11 tried.
- **Create/primary modals:** 31 primary buttons tried. 14 opened a modal or page, and each was then cancelled.

**Catalog seen by the console:** heat, cinder, octavia, barbican, magnum, nova, placement, keystone, neutron, glance, neutron_qos. There is no swift, manila, trove, zun, zaqar, designate, masakari, ironic, VPNaaS or FWaaS.

**Overall result**
- **Uncaught page errors:** 0 on every route and tab.
- **Blank renders:** none. Every page rendered a table (with data or an empty state), a form, or an explicit "Service unavailable" result.
- **Unknown URL:** shows the new 404 page.

### Project routes

| Route(s) | Result | Failed API / notes |
|---|---|---|
| `/base/overview` | OK. Real quota: instances 0/10, vCPU 0/20, …; ProjectInfo; quick links | — |
| `/compute/instance` | OK (empty) | — |
| `/compute/instance/create`, `?image=<id>` | Wizard OK. 4 steps; flavor table 10 rows; image preset | Console warning: "There may be circular references" (antd Form) |
| `/compute/ironic-instance/create` | "Ironic service is not deployed in the current region" with a Back button | Correct (no ironic) |
| `/compute/flavor` | OK. x86 and Heterogeneous tabs empty; Custom and All 10 rows (16 total) | `?tab=custom` ignored (tab not synced) |
| `/compute/flavor/detail/:id` (amphora.medium) | OK. Tabs Detail and Instances | — |
| `/compute/image`, `/compute/image/detail/:id`, `/compute/image/create` | OK | — |
| `/compute/instance-snapshot`, `/compute/keypair`, `/compute/server-group` | OK (empty). Keypair and Server Group create modals open with quota | — |
| `/storage/volume`, `/storage/volume/create`, `/storage/snapshot`, `/storage/backup` | OK (empty). Volume and Backup create modals show quota; Snapshot create modal shows **no quota** (see 2.2) | — |
| `/storage/container` | "Service unavailable" (no swift) | Correct |
| `/network/networks`, detail (public1), subnet detail | OK. Tabs Detail/Subnets/Ports and Detail/Ports | — |
| `/network/port`, `/network/router`, `/network/floatingip`, `/network/security-group` (+ detail, 4 rules) | OK. Create modals open with quota | — |
| `/network/qos-policy`, `/network/load-balancers` | OK (empty). **No Create button**, which is correct: robin's `/policies` returns `neutron:create_policy=false` and `octavia:…:loadbalancer:post=false`. The policy layer works. | — |
| `/network/load-balancers/create` | Wizard renders when opened by URL despite `loadbalancer:post=false` | No page-level policy guard (see 4) |
| `/network/topo` | OK. Graph with public1 | — |
| `/network/vpn`, `/network/firewall`, `/network/firewall/create`, `/network/dns/zones`, `/network/dns/reverse` | "Service unavailable" | Correct (round 1: VPN was blank, FW showed 404s) |
| `/network/firewall-policy/add`, `/network/firewall-rule/create` | **Form renders although FWaaS is not deployed** | Not endpoint-gated: these paths don't match the `/network/firewall` prefix (see 4) |
| `/network/certificate` | Empty table plus an error toast | **403** `barbican/v1/containers`. The backend denies it even though `/policies` says `secret:get=true`; a console-side "not allowed" page is missing |
| `/key-manager/secret` | Empty table plus an error toast | **403** `barbican/v1/secrets` (same) |
| `/heat/stack`, `/heat/stack/create` | OK | — |
| `/container-infra/cluster-template` (1 row), detail, `/create`; `/container-infra/clusters`, `/create` | OK | Detail: **404** `neutron/networks/public1`, `nova/flavors/k8s.worker`, `glance/images/<name>`, `neutron/networks/network-1`. The template stores names, and the page looks them up as ids. It still renders; the lookups fall back. |
| `/container-service/*`, `/database/*`, `/messaging/queues`, `/share/*` | "Service unavailable" | Correct |
| `/identity/project`, `/identity/user` | Empty table plus an error toast | **403** `keystone/v3/projects` / `v3/users` (still open from round 1) |
| `/management/recycle-bin` | OK (empty) | — |
| `/user/center`, `/user/application-credentials` (create modal OK), `/user/totp` ("TOTP authenticator not configured"), `/user/change-password` | OK | — |
| `/some/unknown/route` | 404 page | — |

### Admin routes (robin has no system role)

Tried: `/base/overview-admin`, `/compute/instance-admin`, `/compute/hypervisors-admin`, `/identity/domain-admin`, `/configuration-admin/setting`, `/monitor-center/overview-admin`, `/management/recycle-bin-admin`, `/heat/stack-admin`, `/network/networks-admin`, `/storage/volume-type-admin`, `/share/share-type-admin`.

All redirected to `/base/overview`. The admin guard is committed and works.

### Login, header and menu

- **Login:** Domain, Username and Password fields. No login-type select (SSO is disabled on this backend) and no region select (one region). The domain tip hardcodes 'Default'.
- **Header:**
  - project switcher "mkst-project (mkst-domain)"
  - region "RegionOne", shown even with one region; legacy hid it then
  - language VI
  - theme Light/Tech/Dark
  - avatar "RO"
- **User menu:** user, domain and roles; User Center, Application Credentials, Two-factor Auth, Change Password, Get Token, Download OpenRC, Download clouds.yaml, Logout.
- **Menu shown to robin:**
  - Overview
  - Compute: 6 entries
  - Storage: Volume, Backup, Snapshot (no Container, because there is no swift)
  - Network: Networks, Ports, QoS, Routers, Floating IPs, Topology, Load Balancer, SSL Certificates, Security Groups (no VPN, Firewall or DNS)
  - Key Manager, Orchestration, Container & K8s, Maintenance

  Endpoint gating works.

### Recurring noise

- **Admin-role probe:** `GET keystone/v3/system/users/{id}/roles` returns **403** on every full page load, up to 3 times right after login. A 403 is expected for a non-system user. Cache the result per token in `src/store/authStore.js` (`refreshSystemRoles`), or skip it when the token has no system scope.
- **Static `message`:** antd warns "Static function can not consume context". Errors use static `message.error` outside `<App>`.
- **Deprecations:** antd `Spin tip` (`App.jsx` PageLoader) and `Card bordered`.

---

## 4. Cross-cutting

| Area | Legacy | New (HEAD `025e8def`) | Status / gap |
|---|---|---|---|
| Admin page guard | System admin/reader role | `hasAdminPageRole` from system roles; redirect in `MainLayout.jsx:83` | **Fixed** (confirmed live) |
| Action policies | `policy` on 365 action files, `checkItemPolicy` | `src/core/policy.js` (`/policies`), `checkActionPolicy` in `BaseTable` and `ItemActionButtons`; about 406 `policy:` fields | **Fixed** (confirmed live: QoS/LB create hidden). Holes: `InstanceDetail.jsx` `can()`; new-only actions with no policy (Snapshot Create, Quick Create Network, Download Payload, 4 Heat, 2 Trove); role checks where legacy used policy (`canSetPublic`, Firewall Shared, FIP specific IP, Certificate link). |
| **Page/tab-level policy** | Each list, detail page and tab had `get policy()` and showed "not allowed" when denied | `ResourcePage` / `ResourceDetail` have no `policy` prop. Standalone create pages (LB, Firewall*, Heat, Magnum, Zun, Trove wizards) are reachable by URL. | **Open (P1).** Live: `/identity/project`, `/identity/user`, `/key-manager/secret` and `/network/certificate` show an empty table plus a toast; `/network/load-balancers/create` renders without permission. |
| Project / region switch | `switch_project` / `switch_region` with a new token | `authStore.switchProject` / `switchRegion` → skyline, then `applyProfile` | **Fixed** (not exercised live; robin has one project and one region) |
| Login TOTP / SSO / default domain | Yes | TOTP, SSO list and default domain fixed | **SSO return path open (P0)**; TOTP error mapping (P1) |
| Endpoint gating | `endpoints` on 43 menu entries | `MENU_ENDPOINTS` plus a "Service unavailable" page | **Fixed.** Gaps: `/network/firewall-policy/*`, `/network/firewall-rule/*`, `/network/certificate-container/*`, `/network/certificate-secret/*` and `/network/ipsec-site-connection/*` are not covered by a prefix (FWaaS forms rendered live). |
| Server-side paging, filter, sort | About 20 lists | `useServerPaging` for instances, volumes, snapshots, backups, networks, heat, recycle bin and others; cinder `*_links` followed | **Mostly fixed.** Still client-side: embedded instance lists, Volume Attach, Port Attach, VPN router select, the embedded ShareTable. |
| Admin "Project ID" filter | Automatic on admin lists (`adminPageHasProjectFilter`) | Added per page; missing on Volume, Snapshot, Backup, Port, Security Group, Firewall (×3), Share | P1. Better: add it automatically in `ResourcePage` when `isAdmin`. |
| Quick filters (`isQuick` / `checkLabel`) | Port "Filter Instance Ports" | Not supported | P1 |
| CSV download, column hide/show | Yes | `src/components/Tables/tableTools.jsx`, `exportRender`, `defaultHidden` | **Fixed.** Some JSX columns have no `exportRender` (ShareNetwork net/subnet, Share Types); unverified. |
| Quota in create forms | `QuotaChart` / `checkQuotaDisable` in 31 forms | `quota` prop on `ActionModal`, `QuotaPanel` in wizards, per-volume-type lines | **Fixed.** Exception: the new-only Snapshot Create (confirmed live: no quota). |
| Auto refresh | 30 s / 10 s in transition / 10 min idle stop / toggle | `useAutoRefresh` (`AUTO_TOTAL = 10 min`), toggle, transition speed-up | **Fixed** |
| Name validation (`input-name`) | Shared validator on most create/edit forms | No shared `nameRule`. Only Swift, LB (`LoadBalancers/helpers.jsx:163`), Firewall and Instance have one. Others are plain or `noChineseRule`. | P1 |
| Select-table pickers | `SelectTable` with tabs and backend paging | Restored in Instance, Volume Attach (instance side), VPN, Magnum and others. Still plain selects: Port forms, Router AZ/ext-net, Backup Create volume, ShareNetwork network, LB FIP, admin Project pickers. | P2 |
| Error notifications | `notification` with expandable detail | One-line `message.error(getErrorMessage(err))` (handles Neutron, itemNotFound and other bodies); detail view only in the Instance create wizard | P2 |
| i18n | en / zh / de / ko / ru / tr | Dictionaries (base + modules): vi 3,405, en 4,133, zh 3,901 keys. Of **3,209 keys used** in code, **0 are missing in vi and en** (6 apparent misses are escape artefacts of the scan), and **199 are missing in zh**. Hardcoded Vietnamese only in the two dead files. | vi **fixed**; zh P2 |
| 404 page | Yes | `pages/Base/NotFound.jsx` for `base/404` and `*` | **Fixed** (confirmed live) |
| Global menu search | Yes (GlobalNav) | None | P2 |
| Region selector | Shown only when there is more than one region | Always shown | P2 (cosmetic) |
| Settings-driven features | `flavor_families`, `gpu_models`, `usb_models`, base domains | `FlavorSelectTable.jsx:81`, `Flavors/FlavorCreate.jsx:206-207`, `skyline_base_domains` | Ported |
| Theme / error boundary / 401 handling | Build-time theme | Runtime Light/Tech/Dark, `ErrorBoundary`, token heartbeat | Upgrade |
| Menu | `menu.jsx` / `admin-menu.jsx` | Every legacy leaf is present. Hidden breadcrumb children (create/detail) are handled by routes. Extras: `/network/dns` groups, Recycle Bin (project and admin), Monitor Center, `heat/stack-admin` (all commented out in legacy). | OK |

---

## 5. Prioritized fix list

### P0: security, lock-out, data safety

1. **Instance detail policy hole.**
   - In `src/pages/Instances/InstanceDetail.jsx:420`, make `can()` call `checkActionPolicy(action, …)` (subscribe to `usePolicyStore` rules).
   - Gate the inline SG attach/detach and rule create/delete (`:518, 619, 681, 698`) with `os_compute_api:os-security-groups:add` / `:remove` and `create_security_group_rule` / `delete_security_group_rule`.
2. **SSO return bootstrap.** When there is no localStorage token and the path is not `/auth/*`, try `skylineApi.getProfile()` and `applyProfile` (cookie session) before redirecting. Do it in `src/layouts/MainLayout.jsx:45-80` or `src/main.jsx`, following legacy `core/index.jsx:65`.
3. **Backup Restore pre-checks** in `src/pages/Storage/Backups/BackupList.jsx` (`restoreBackupAction`):
   - load the volume and its attached servers
   - show the Instance row
   - block submit unless the volume is available, or in-use with every attached instance SHUTOFF
4. **Write actions without a policy:**
   - `src/pages/Storage/Snapshots/SnapshotList.jsx` `createSnapshotAction`: add `volume:create_snapshot` and the `snapshots` / `snapshots_<type>` quota, or drop the action.
   - `src/pages/Networks/NetworkParts/actions.jsx:385` `quickCreateNetworkAction`: add `['create_network','create_subnet','create_router']`.
   - `src/pages/KeyManager/Secret/actions.jsx` Download Payload: add `barbican:secret:decrypt` (or `:get`).

### P1: legacy behaviour still missing

1. **Page- and tab-level policy.**
   - Add a `policy` prop to `src/components/ResourcePage/index.jsx` and `src/components/ResourceDetail/index.jsx` (page and per-tab) that renders a "not allowed" result.
   - Set the legacy `get policy()` values: `identity:list_projects`, `identity:list_users`, `barbican:secret:get`, `stacks:index`, `container:logs` (Zun Logs tab), Trove tabs, and the network `get_*` rules.
   - Guard the standalone create routes: `Network/LoadBalancers/LoadBalancerCreate.jsx`, `Network/Firewall/FirewallCreate.jsx`, `FirewallPolicyForm.jsx`, `FirewallRuleForm.jsx`, `Heat/Stack/StackForm.jsx`, and the Magnum / Zun / Trove wizards.
2. **Endpoint gating holes** in `src/layouts/menuConfig.jsx` `MENU_ENDPOINTS`. Add:
   - `/network/firewall-policy` and `/network/firewall-rule` → `neutron_firewall`
   - `/network/certificate-container` and `/network/certificate-secret` → `barbican`
   - `/network/ipsec-site-connection` → `neutron_vpn`
3. **Use policy instead of role checks:**
   - `Share/Share/shareActions.jsx:150` (`canSetPublic`)
   - `Network/Firewall/FirewallPolicyForm.jsx:151`, `FirewallRuleForm.jsx:281`
   - `Networks/FloatingIps/actions.jsx:193` (specific IP)
   - `Network/Certificate/CertificateList.jsx:50` (decrypt link)
   - `Instances/actions/statusActions.jsx:283` (drop `adminOnly` from ResetState)
4. **Embedded instance lists with actions and backend paging.** Make `src/pages/Instances/InstanceList.jsx` accept `embedded` + `extraParams`, and use it in `src/pages/Compute/_shared/InstanceTable.jsx` (Hypervisor, Server Group) and `src/pages/Compute/Flavors/FlavorDetail.jsx:138`.
5. **QoS detail Floating IPs tab** (`src/pages/Network/QoSPolicy/QosPolicyDetail.jsx:160-165, 254-261`): add `associateAction` and `createPortForwardingAction` from `Networks/FloatingIps/actions.jsx`, plus the resource name and the port-forwarding popover.
6. **Admin Project ID filter.** Add it automatically in `ResourcePage` when `isAdmin`, or per page in:
   - `Storage/Volumes/volumeShared.jsx` (`volumeFilters`), `Storage/Snapshots/SnapshotList.jsx`, `Storage/Backups/BackupList.jsx`
   - `Network/Port/PortList.jsx:99`, `Networks/SecurityGroups/SecurityGroupList.jsx:126`, `Network/Firewall/FirewallPage.jsx:441/484/519`
7. **Shared `nameRule`.**
   - Move the rule from `Network/LoadBalancers/helpers.jsx:163` into `src/components/form/rules.js`.
   - Apply it to the Router, QoS, Port, Certificate, Secret, Credentials, Storage, Share, Volume Type and QoS-spec name fields.
   - Add `maxLength: 30` to Project Create (`Identity/Projects/ProjectList.jsx`).
8. **Port:**
   - Add `isQuick` quick-filter support to `ResourcePage`, then the "Filter Instance Ports" checkbox (`Network/Port/helpers.jsx:42`).
   - Fix `manageSecurityGroupAction.allowed` to read `item.allowed_address_pairs` when there is no `origin_data` (`Network/Port/actions.jsx:430`).
9. **Network detail pages:**
   - Pass `readOnly` to the Ports tab on project pages (`Networks/NetworkDetail.jsx:123`, `SubnetDetail.jsx:123`).
   - Show Quick Create on admin (`VpcNetworks.jsx:208`).
   - Firewall: hide default firewalls through `initialFilters` (`FirewallPage.jsx:441`).
   - Topology: open `createNetworkAction` in place and send Create Instance to `/compute/instance/create` (`Topology.jsx:422,425`).
10. **Login:**
    - On `receipt_expired`, return to the password step; give `invalid_totp` a friendly message; drop the duplicate toasts.
    - Interpolate the configured default domain in the tip.
    - Files: `src/pages/Auth/Login/index.jsx`, `src/store/authStore.js`.
    - Expired-password page without hand-off data → `/auth/login` (`src/pages/UserCenter/ChangePassword.jsx`).
11. **Identity:**
    - Project quota tab: legend, title, "Members of Each Group", 80/90 thresholds (`src/pages/Identity/Projects/quota.jsx`).
    - User Disable `confirmText` (`Identity/Users/UserList.jsx`).
    - Phone country-code widget with libphonenumber (`Identity/common.jsx:202`, `UserCreate.jsx`).
12. **Storage and Share:**
    - Volume detail Backups tab: Create Backup primary action (`Storage/Volumes/VolumeDetail.jsx`).
    - Server-paged instance picker for Volume Attach (`volumeShared.jsx`).
    - Volume Create image filter and OS tabs, plus a paged snapshot picker.
    - ShareNetwork Create: `NetworkSelectTable` (`Share/ShareNetwork/shareNetworkShared.jsx:165`).
13. **Instance list Image column.** Bring it back (OS icon + `image_name`), at least as a hideable column (`src/pages/Instances/InstanceList.jsx:28`).
14. **Policies on the new extension actions:** Heat Suspend / Resume / Check / Cancel Update (`Heat/Stack/actions.jsx`) and Trove Attach/Detach Configuration (`Database/Instances/actions.jsx`). Check the rule names against the deployment's policy files.

### P2: polish and parity

1. **Select-table pickers** where legacy had them:
   - Port forms, Router AZ / external network, Backup Create volume
   - LB Associate FIP, LB member allocator filters
   - admin Project pickers, VPN router (paged)
2. **Volume type and share type:** pass `existingNames` in `Storage/VolumeTypes/VolumeTypeDetail.jsx` and `Share/ShareType/ShareTypeDetail.jsx`.
3. **Small Storage fixes:**
   - UpdateStatus "in-use" alert only when the status is in-use.
   - Bootable/Unbootable title and switch text.
   - Backup detail "Volume Info" card.
   - Swift `getCheckboxProps` for folders, and no auto-refresh (`Storage/Containers/ContainerDetail.jsx`).
4. **Sync tabs with `?tab=`** in `Compute/Aggregates/AggregateList.jsx:449`, `Compute/Images/ImageList.jsx:121` and the Flavor list.
5. **Magnum template detail:** resolve the network / flavor / image references by name (list with a `name` filter) instead of GET-by-id, which gives 4× 404 live (`src/pages/ContainerInfra/ClusterTemplates/*Detail*`).
6. **Admin-role probe:** cache `system/users/{id}/roles` per token, or skip it for project-scoped users (`src/store/authStore.js` `refreshSystemRoles`). Use antd `App.useApp()` message instead of static `message`. Remove the `Spin tip` and `Card bordered` deprecations.
7. **Error notifications** with expandable detail (legacy Notify) in `src/components/Action/useActionRunner.jsx` / `ActionModal.jsx`. `NeutronAgentDetail.jsx`: report partial failures instead of `Promise.allSettled` plus a success toast.
8. **Legacy deep links:** redirect `/identity/project[-admin]/create|edit/:id`, `/identity/user-admin/edit/:id` and `/identity/user-group-admin/create|edit/:id` to the list with the modal open (`src/routes/modules/identity.jsx`).
9. **Dead code:** delete `src/pages/Instances/CreateInstanceModal.jsx`, `src/pages/Instances/InstanceDetailDrawer.jsx` and the unused `backendUrl` in `authStore.js:119`.
10. **zh:** fill the 199 used keys missing in zh (`src/locales/modules/*.zh.json`).
11. **Smaller extras:**
    - Global menu search.
    - Hide the region selector with a single region.
    - Login product name from skyline config.
    - Setting JSON code editor.
    - Heat YAML viewer.
    - Masakari hideable UUID column.
    - `exportRender` on JSX columns (ShareNetwork, Share Types).

---

## 6. What could not be verified

- **Admin pages, live.** robin has no system role and all admin routes redirect. So none of these were seen running: Admin Overview, hypervisors, aggregates, bare metal, volume types, storage backends, share admin, identity admin, SystemInfo, Setting, Metadata, Monitor Center, admin Recycle Bin, and the `all_projects` / admin Project columns.
- **Services absent from robin's catalog:** swift, manila, trove, zun, zaqar, designate, masakari, ironic, VPNaaS, FWaaS. Only the "Service unavailable" state was confirmed for them.
- **Pages that need data in robin's project.** It has 0 instances, volumes, ports, routers and FIPs, so row-action menus, instance and volume detail pages, and row modals were not exercised.
- **Project and region switching.** robin has one project and one region.
- **SSO and TOTP login.** SSO is disabled, and robin has no TOTP.
- **Runtime behaviour** of backend sorting keys, CSV content of JSX columns, console types other than noVNC, Heat raw-template submission, and the Zun exposed-port validator.
- **Feature counts** come from static reading and are approximate.
