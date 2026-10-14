# Administrator-side audit: new console vs legacy

Scope: every admin route (`*-admin`, `configuration-admin`, `monitor-center`, `ha`, identity admin, `overview-admin`) of `D:\sonbq\skyline-console-new\src` (N) against `D:\sonbq\skyline-console\src` (L).
Method: route and menu diff, per-resource static comparison (columns, filters, actions, policies, tabs, forms, payloads, admin API params), guard review, and a mock-based Playwright run (every `/api/*` URL mocked, no real backend, no source modified).

Caveat: the per-resource comparisons were produced by read-only review passes. The three highest-impact claims (A1, A2, A3 below) were re-checked in the source. The rest are static findings and were not re-verified. Line numbers are approximate.

## 1. Result summary

- No P0 blocker such as a broken page or wrong all-projects query. Four defects are worth fixing first (A1 to A4).
- Route parity is complete. Every legacy admin route exists in the new console.
- The mock run visited 132 admin routes (including detail, create and edit routes) with zero page errors, zero uncaught console errors, zero blank renders and zero unexpected redirects. A sample of toolbar and row buttons opened and cancelled cleanly (about 4 per page).
- The mock run was repeated several times because another session was editing `routes/modules/storage.jsx` (Backup Schedules) at the same time. The first runs showed false "blank" results from a broken Vite build; the last run was clean.
- Console noise only (P2): antd deprecation warnings (`Card bordered`, `Modal destroyOnClose`, `Spin tip`) on most detail pages. A React "unique key" warning in `Body` on most list pages (HA, Zun, Magnum and others).

## 2. Route and menu parity

- All routes from L `pages/*/routes/index.js` that contain `-admin`, plus `configuration-admin/*`, `monitor-center/*` and `ha/*`, exist in N (`routes/modules/*.jsx`, `App.jsx`, `network.jsx` `both()` helper).
- Extra routes in N (not in legacy):
  - `/heat/stack-admin/detail/:id`, `/heat/stack-admin/*`. Legacy commented stack-admin out. N serves the routes but has no menu entry, same as legacy.
  - `/management/recycle-bin-admin*`. Legacy routes are commented out.
  - `/storage/backup-schedule-admin*`. New feature, in development in another session.
  - `/network/rbac-policies-admin*`, `topo` and others match legacy.
- Menu (`N layouts/menuConfig.jsx getAdminMenu` vs `L layouts/admin-menu.jsx`):
  - Extra in N: **Monitor Center** (5 entries) and **Maintenance > Recycle Bin**. Both are commented out in L (`admin-menu.jsx` ~860-907 and ~765-795). Confirm this is intended.
  - All other active legacy entries are present, including Overview, Compute (8), Storage (5), Network (11 incl. DNS), Share (8), Identity (5), Database, Configuration (3), Messaging, Container (5) and HA (3).
- `isAdminPath = url.includes('admin')` (menuConfig.jsx:26) is a loose substring match. It would also match a non-admin path that contains "admin" (for example a resource id).
- `MENU_ENDPOINTS` covers the admin endpoint gating (ironic, cinder, neutron_qos, octavia, vpn, firewall, designate, masakari). `/network/firewall-policy-admin` and `/network/ipsec-site-connection-admin` are included.

## 3. Admin guards (system admin vs reader)

- Route guard: `N layouts/MainLayout.jsx:108` redirects admin paths to `/base/overview` when `hasAdminPageRole` is false. `authStore.refreshSystemRoles` (authStore.js ~156-183) decides the role from keystone system-scope roles (`admin` or `reader`). Matches L `Base` init.
- `isSystemReaderOnly` plus `enableSystemReader` is applied to row actions (`ItemActionButtons.jsx:33`), and to primary and batch actions (`BaseTable.jsx:62-65, 216`). Equivalent to L `components/Tables/Base/Action/index.jsx`. Legacy sets the flag only on Setting > View, and N mirrors that (`SettingList.jsx:36`).
- Admin API usage: `all_projects` or `all_tenants` is sent as a query parameter where legacy did. The `x-auth-all-projects` header is used only in `api/designate.js`. N never sends it elsewhere, as in legacy.
- Error handling: `api/client.js:76-92` handles only 401 (global logout toast). It has no 403 handling and no retry, same as legacy.

Guard findings:

- G1 (P2) Different "reader" definition. N derives the flag from keystone system roles (`/system/users/{id}/roles`). L `systemRoleIsReader()` (resources/skyline/policy.js:157) uses the project token roles. The two disagree for users who are system admin but project reader, and for the reverse case. N is arguably more correct but this is a behaviour change.
- G2 (P2) `checkPolicyRule` (core/policy.js:97-99) allows everything when `/policies` fails to load. L returns false when the list is empty. A failed policy load therefore exposes every action to everyone, readers included (except `enableSystemReader` filtering).
- G3 (P2) Page-level policy (`ResourcePage/index.jsx:75`, `ResourceDetail/index.jsx:62`) calls `checkActionPolicy` without admin and reader context. Only actions get the reader filter.
- G4 (P2) `refreshSystemRoles` writes `skyline_admin_page_role=0` on any fetch error. MainLayout then redirects admin pages away. A transient failure on app load locks an admin out until reload. L does the same on error but refreshes less often.
- G5 (P2) A single 401 from any service triggers a global logout (`client.js`).
- G6 (P2) `/identity/project` and `/identity/user` are routed but are in no menu. Their rows link to `-admin` detail paths (`Identity/common.jsx:30-36`), so a non-admin who follows them is redirected.

## 4. Findings by priority

### P0 / fix first

- A1 **Host Aggregates, host tag removal with no confirmation.**
  N `pages/Compute/Aggregates/AggregateList.jsx` ~340-360 renders each host as a closable `Tag`. Clicking "x" immediately sends `remove_host` with no confirm, no policy check (`os-aggregates:remove_host`) and no reader gating. L has no such control. Remove it and keep the Manage Host modal (L `actions/ManageHost`).
- A2 **Instance admin detail, Security Groups tab is editable.**
  N `pages/Instances/InstanceDetail.jsx` ~1578-1590 (Attach Security Group), ~1707-1717 (Detach from instance), ~1749-1760 (Add Rule) and ~1831-1845 (rule Edit/Delete). Only port Detach (:1696) and Manage Security Group (:1591) are gated by `!isAdminPage`. L `Instance/Detail/SecurityGroup/index.jsx:68-70` sets `showActions = !isAdminPage`, so the tab is read-only for admin. The nova calls in `api/nova.js:71-74` are unversioned and pass the SG by name, which is ambiguous across tenants. Wrap the controls in `!isAdminPage`.
- A3 **Batch actions run on an empty selection when no row is `allowed`.**
  `components/ResourcePage/index.jsx` ~166-180 silently filters out disallowed rows, and `components/Tables/BaseTable.jsx` ~283-293 never disables the batch button. `components/Action/useActionRunner.jsx:57` then runs with `items: []`. `deleteAction` (`ResourcePage/helpers.jsx:238`) can throw on `it.id`, or show a "completed successfully" toast without doing anything (volume batch delete on in-use volumes, snapshots with children, server groups with members, domains that are enabled). A mixed selection quietly skips rows. L disables the button. Fix: disable the button, or abort on an empty filtered list.
- A4 **BareMetal Manage State from `active`.**
  N `pages/Compute/BareMetalNodes/actions.jsx` ~68-82 maps target `manageable` to `manage` only from `available` or `enroll`, otherwise sends `target: 'delete'`. L `BareMetalNode/actions/ManageState.jsx:80-87` has the same mapping. This is probably an invalid provision verb for Ironic on an `active` node (expect `undeploy`/`deleted`). Verify against a real Ironic. Inherited from legacy.

### P1 / missing or inconsistent

- B1 **Image admin list has no Project ID (`owner`) filter.** N `Compute/Images/ImageList.jsx` `filterParams` (Name, Status, Visibility, extra Disk Format). L adds it through `adminPageHasProjectFilter`. Admin lists in general have no automatic Project ID filter (`ResourcePage` has no equivalent). Volume, Snapshot and Backup add their own.
- B2 **Instance Snapshot admin detail links to the non-admin instance route.** N `Compute/InstanceSnapshots/SnapshotDetail.jsx:52` always builds `/compute/instance/detail/${id}?tab=snapshots`; the breadcrumb at :66 is non-admin only. L `getLinkRender('instanceDetail')` is admin-aware.
- B3 **No soft-deleted redirect.** Opening a `soft_deleted` instance does not redirect to the recycle-bin detail (L `Instance/Detail/index.jsx:68-73`). N `InstanceDetail.jsx` has none. Also `RecycleBinDetail.jsx:184` runs actions on a stub item `{id, name:id}`, so the confirm dialog shows the id and the policy check runs on the stub.
- B4 **QoS Policy and Firewall pages lack the endpoint check.** `Network/QoSPolicy/QosPolicyList.jsx` and `Network/Firewall/FirewallPage.jsx` never call `hasEndpoint('neutron_qos')` or `hasEndpoint('neutron_firewall')`. L shows a "service not available" notice (`checkEndpoint`). Only `VPN/VpnPage.jsx:30` does. The menu is already filtered (`MENU_ENDPOINTS`), so this affects direct links.
- B5 **Floating IP admin Allocate, batch drops the chosen project.** N `Networks/FloatingIps/actions.jsx:216-227` removes `project_id` and re-adds it only in the single-IP branch. Batch FIPs are created in the admin's token project while the quota check ran against the chosen project. L `Allocate.jsx:222-244` has the same bug. Fix: spread `project_id` into `data` in the batch branch.
- B6 **Swallowed errors that show wrong data.**
  - `safeList` (`Identity/common.jsx:140-147`) turns any fetch error into `[]`, so member and user lists are empty and Manage forms look empty.
  - Monitor (`Monitor/lib.js:242-244`, `charts.jsx:529-552`): when Prometheus is down, Overview (`Overview.jsx:277-283`) and Storage Cluster (`StorageCluster.jsx:139-146`) show "Healthy" and 0.
  - Flavors, Images and Aggregates loaders return empty data on 403: `Flavors/helpers.jsx` (`fetchSkylineSettings`, `fetchProjectsWithDomain`, `fetchFlavorMetadefs`), `Images/helpers.jsx` (`fetchProjectOptions`), `Aggregates/AggregateList.jsx` (`fetchZoneNames`).
  - `VPN/helpers.jsx:101-114` `vpnLists.connections()` returns `[]` on error, so a delete can skip the "in use" guard.
  - `SecurityGroupList.jsx:25-31` fetches projects on each load; if that fails every project name is `-` and the default SG passes the Delete check.
- B7 **Firewall delete guard briefly open.** `Firewall/actions.jsx` `deleteFirewallAction` computes `hasNoProject` from `item.project_name`, which is never set. Until `useProjectMap` resolves, every row passes, so default or ACTIVE firewalls can briefly be selected for delete. Gate on the map having loaded.

### P2 / minor

Compute and storage
- Instance list: Image column hidden (`InstanceList.jsx:32`, noted as a user decision). Extra sort keys Host and Locked (:199, :251) need backend confirmation. Rescue image list ignores `all_projects` (`actions/statusActions.jsx:234`). Hardcoded fallbacks in `InstanceDetail.jsx` (`/dev/vda` and `isBootable: true` at 292-297, AZ `'nova'` at 1021, remote `0.0.0.0/0` at 376). Dead code `handleDetachSingleVolume` and `handleDetachSinglePort` (:451, :471). The admin page loads the project nova quota for the KPI cards (`useInstances.js`).
- Instance Snapshots: Disk Format shown by default (`SnapshotList.jsx:210`), sorting and paging are client-side.
- Server Group admin: one unpaged `os-server-groups?all_projects=true` call, client-side Project ID filter, breadcrumb hardcoded to the tenant route (`ServerGroupDetail.jsx:16`).
- Flavor: Manage Metadata is offered on every architecture tab (`Flavors/helpers.jsx` ~478). L offers it only on Custom, and editing `:architecture` or `:category` keys can corrupt classification. Extra Edit Flavor action (needs nova 2.55 or later). `fetchFlavorMetadefs` has no `limit` (only the first 25 namespaces).
- Image: project selector is a plain `Select` with no domain column. Server-side sort is missing. `hw_cpu_policy` and `hw_cpu_thread_policy` are `required: true` in Edit even with Advanced off (check that submit is not blocked).
- Hypervisors: Disable/Enable service actions also on the Hypervisors tab and detail (L only on Compute Hosts). Extra columns and filters.
- Host Aggregates: Manage Metadata rejects empty-string values; metadefs failure shows system keys as custom.
- BareMetal: `ipmi_port: null` on clear (`NodeCreate.jsx` ~118). `ipRule` accepts any string with `:` as IPv6. Kernel and ramdisk dropdowns capped at 1000. Port and Port Group edit can send `replace` with `undefined`. Detail tabs are policy-filtered (L shows all). Same as L: no reboot, inspect or clean actions.
- Volume: Disk Tag, Bootable, Type and Size columns always visible (L hides Disk Tag, others hideable). Migrate pool table shows plain text instead of a progress bar. Detail breadcrumbs hardcode non-admin paths (`VolumeDetail.jsx`, `SnapshotDetail.jsx`, `BackupDetail.jsx`).
- Volume Snapshot: extra Volume Name filter resolves to the first matching volume only (limit 100), which can return wrong snapshots when names repeat across projects.
- Volume Type: project picker shows Domain ID, not name (`volumeTypeShared.jsx`).

Network, share, other services
- Floating IP Release always shows the Force release checkbox and omits the IP name (`actions.jsx:459-505`).
- Security Group: rule filter default `0.0.0.0/0` hides `::/0` rules (same as L).
- Port: fallback `fetchPortsFromNeutron` (`Port/helpers.jsx:115-132`) drops `all_projects`. Subnet ports tab is unpaged (`SubnetTab.jsx:22-24`).
- VPN: breadcrumb hardcoded to the tenant route (`IpsecSiteConnectionDetail.jsx:56-58`). Delete is a first action where L has it under "more".
- Load Balancer: `deleteLoadBalancerAction` (`actions.jsx:70`) uses `hasAdminRole` where L uses `checkSystemAdmin()`. `attachFips` lists floating IPs without `all_projects` (`helpers.jsx` ~217).
- DNS: write calls send no `x-auth-all-projects` (same as L). Breadcrumb hardcoded to `/network/dns/zones`.
- Share: embedded Shares tab is unpaged (`shareActions.jsx` ~477). Project column shows `project_id` plus a name from `useProjectMap`. Extra filters on Share Server and Share Instance lists.
- Trove, Zun and Magnum detail breadcrumbs hardcoded to non-admin lists (`database/InstanceDetail.jsx:313`, `ContainerDetail.jsx`, `ClusterDetail.jsx`, `TemplateDetail.jsx`).
- Zun Services row-id fallback `${host}-${binary}-${idx}` is unstable on refresh.
- Masakari: `project_name` filter targets a field masakari does not return (same as L). `SegmentCreate.jsx` creates hosts with `Promise.all`, so one failure leaves a partial segment. `fetchAvailableComputeHosts` swallows errors and then offers every compute host. `HostDetail.jsx` calls the list endpoint if `?uuid=` is missing.
- Zaqar: batch delete and detail row actions are additions (L lacks them). `queues-admin` shows the same data as tenant, same as L.
- Heat stack-admin: reachable only by URL (consistent with L, whose menu entry was removed because of a Heat scope problem).

Identity and configuration
- Identity pages are at parity (Domain, Project incl. quota, User, User Group, Role). Minor: role list shows ID/Name in one column; quota form swallows nova and neutron quota fetch errors (`quota.jsx:171-177`); extra firewall quota card; project-name validation fetches the full list on each check (`ProjectList.jsx:196`).
- SystemInfo: `aliasPolicy keystone:identity:get_auth_catalog` (`SystemInfo.jsx:80`) probably never matches (L used the bare `identity:get_auth_catalog`). Falls back to the nova call on any skyline-extension error including 403 (:119-125). `MetadataDetail.jsx:20` double-decodes the route param, so a namespace containing `%` breaks. Setting editor is a textarea instead of the code editor.
- Monitor: stale step sent first after a time-range change (`charts.jsx:420-443`), single-point series draw nothing, `disabledTime` not implemented, hardcoded `ext4|xfs`, `nova-compute`, `libvirtd`, threshold 0.8 (copied from legacy). Physical Node Disk Usage groups by `hostname`, which node_exporter does not emit (same as L).
- Admin Overview: parity. Extra Floating IPs tile and local-disk circle (the disk circle disappears on microversion 2.88 or later); failed calls show `-` with no error state.
- Batch actions everywhere (`ResourcePage/helpers.jsx:235-247` and per-resource loops) run sequentially and stop at the first failure, leaving earlier items already deleted. L handled failures per item.
- `ConfirmAction.jsx` prefixes every description with "Vendor action description (OpenStack)". Several modal texts and colours are hardcoded.
- Project column title is "Project" in routers, floating IPs and security groups (L: "Project ID/Name").
- Policy rules for `firewall_group`, `firewall_policy`, `firewall_rule`, `endpoint_group`, `ikepolicy`, `ipsecpolicy` match no prefix in `core/policy.js` and are always allowed. L is identical.

## 5. Resources at parity (no gaps in columns, filters, actions, tabs or payloads)

Storage backends and pools, Backups, Volume Types and QoS specs, Networks and Subnets, Port, Router, RBAC, VPN, Firewall, Load Balancers, DNS, all eight Share pages, Trove, Zaqar, Zun (containers, hosts, services), Magnum (clusters, templates), Masakari (segments, hosts, notifications), Domain, Project, User, User Group, Role, SystemInfo, Setting, Metadata, Monitor Center (all five pages), Recycle Bin, Overview admin.

## 6. Mock verification details

- Script: Playwright script inside `scripts/` (deleted afterwards; a copy is in the session scratchpad). It set `keystone_token`, `keystone_token_expires_at` and `skyline_admin_page_role='1'`, mocked only URLs whose pathname starts with `/api/` (non-GET answered 202), and returned the system-admin role from `/system/users/*`.
- It ran on a private Vite server on port 3011 (stopped afterwards). The real backend and the dev server on port 3002 were not used.
- 132 routes visited, 0 page errors, 0 blank renders, 0 unexpected redirects. Cancelled sample modals: Edit, Delete, Manage Access, Force Delete, Post Message, Update and others.
- Some lists show zero rows only because the generic mock lacks the specific shape (`flavor-admin`, `instance-snapshot-admin`, `snapshot-admin`, `recycle-bin-admin`). Do not read those as defects.
- The mock cannot verify real API semantics, so everything under "payload" and "params" in this report is from static review.

## 7. Suggested fix order

1. A1, A2, A3 (small local edits, user-visible risk).
2. B1, B2, B3, B4, B5, B7.
3. B6 (surface fetch errors instead of empty data).
4. Verify A4 against Ironic.
5. Confirm whether Monitor Center and Recycle Bin should stay in the admin menu.
6. P2 cleanups (breadcrumbs, batch partial failure, antd deprecations).
