import { create } from 'zustand';
import apiClient from '@/api/client';

/**
 * Policy layer - port of legacy resources/skyline/policy.js.
 * skyline-apiserver GET /policies returns [{ rule: 'nova:os_compute_api:servers:create', allowed }]
 * for the current token. Actions declare legacy rule names (`policy`, or `aliasPolicy` for a
 * full rule) and are hidden when the rule is not allowed.
 */
export const policyMap = {
  nova: ['os_compute_api'],
  ironic: ['baremetal:'],
  cinder: ['volume:', 'volume_extension', 'backup:get', 'backup:restore', 'scheduler_extension'],
  glance: [
    'get_image',
    'add_image',
    'delete_image',
    'modify_image',
    'get_members',
    'add_member',
    'delete_member',
    'metadef',
  ],
  neutron: [
    'get_network',
    'create_network',
    'update_network',
    'delete_network',
    'get_agent',
    'delete_agent',
    'update_agent',
    'get_dhcp-agents',
    'get_l3-agents',
    'create_subnet',
    'get_subnet',
    'update_subnet',
    'delete_subnet',
    'create_port',
    'get_port',
    'update_port',
    'delete_port',
    'router',
    'policy_bandwidth_limit_rule',
    'policy_dscp_marking_rule',
    'security_group',
    'floatingip',
    'vpnservice',
    'ipsec_site_connection',
    'rbac_policy',
  ],
  octavia: ['os_load-balancer_api'],
  heat: ['stacks:', 'resource:index'],
  magnum: ['cluster:', 'clustertemplate:'],
  barbican: ['secret:get', 'secret:decrypt', 'secret:delete', 'containers:post', 'secrets:post', 'orders:post'],
  zun: ['capsule:', 'container:', 'host:get'],
  manila: ['share:', 'share_', 'scheduler_stats:pools'],
  trove: [
    'instance:create',
    'instance:delete',
    'instance:update',
    'instance:backups',
    'instance:restart',
    'instance:resize',
    'instance:extension',
    'instance:guest_log_list',
    'configuration:',
    'backup:index',
    'backup:show',
  ],
  zaqar: ['queues:', 'messages:', 'claims:', 'subscription:'],
};

const prefixToService = Object.entries(policyMap).reduce((acc, [service, prefixes]) => {
  prefixes.forEach((p) => {
    acc[p] = service;
  });
  return acc;
}, {});

/** 'os_compute_api:servers:create' -> 'nova:os_compute_api:servers:create' (legacy changeToActualPolicy) */
export const toActualRule = (rule) => {
  if (prefixToService[rule]) return `${prefixToService[rule]}:${rule}`;
  const prefix = Object.keys(prefixToService).find((key) => rule.includes(key));
  return prefix ? `${prefixToService[prefix]}:${rule}` : rule;
};

export const usePolicyStore = create((set) => ({
  rules: null, // Map rule -> allowed; null until loaded
  loaded: false,
  load: async () => {
    try {
      const res = await apiClient.get('/openstack/skyline/api/v1/policies');
      const list = Array.isArray(res) ? res : res?.policies || [];
      set({ rules: new Map(list.map((p) => [p.rule, Boolean(p.allowed)])), loaded: true });
    } catch {
      // policy endpoint unavailable: behave like legacy when a rule is unknown (allow)
      set({ rules: new Map(), loaded: true });
    }
  },
  clear: () => set({ rules: null, loaded: false }),
}));

/** legacy checkPolicyRule: unknown rules are allowed */
export const checkPolicyRule = (rule, isAlias = false) => {
  if (!rule) return true;
  const { rules } = usePolicyStore.getState();
  if (!rules) return true;
  const actual = isAlias ? rule : toActualRule(rule);
  return rules.has(actual) ? rules.get(actual) : true;
};

/** Accepts a rule or a list of rules; `every` = all must pass, otherwise any */
export const checkPolicy = (policy, { every = false, isAlias = false } = {}) => {
  if (!policy) return true;
  const list = Array.isArray(policy) ? policy : [policy];
  if (!list.length) return true;
  return every ? list.every((r) => checkPolicyRule(r, isAlias)) : list.some((r) => checkPolicyRule(r, isAlias));
};

/**
 * Action-level check (legacy checkItemPolicy):
 * - `aliasPolicy` (full rule names) wins over `policy` (legacy short names);
 *   each may be a string, an array (all must pass), `{ rules, every }`, or `(item) => any of those`;
 * - on administrator pages a system *reader* (no system admin) only keeps actions
 *   flagged `enableSystemReader`.
 */
export const checkActionPolicy = (action, { item, isAdminPage = false, isSystemReaderOnly = false } = {}) => {
  if (!action) return false;
  if (isAdminPage && isSystemReaderOnly && !action.enableSystemReader) return false;
  const usePolicy = action.aliasPolicy || action.policy;
  if (!usePolicy) return true;
  const value = typeof usePolicy === 'function' ? usePolicy(item) : usePolicy;
  let rules = [];
  let every = true;
  if (Array.isArray(value)) rules = value;
  else if (value && typeof value === 'object') {
    rules = value.rules || [];
    if ('every' in value) every = value.every;
  } else if (typeof value === 'string') rules = [value];
  return checkPolicy(rules, { every, isAlias: Boolean(action.aliasPolicy) });
};
