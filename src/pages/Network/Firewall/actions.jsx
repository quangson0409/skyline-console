/**
 * Firewall / Policy / Rule actions - port of legacy
 * pages/network/containers/Firewall/{Firewall,Policy,Rule}/actions/*.
 * Payloads are identical to the legacy onSubmit / store calls.
 */
import React from 'react';
import { neutronApi } from '@/api/neutron';
import { t } from '@/core/i18n';
import {
  isDefaultFirewall,
  isDefaultPolicy,
  isMine,
  getProjectId,
  fetchPolicies,
  fetchRules,
  fetchRouterPorts,
  fetchInstancePorts,
  policyTableColumns,
  ruleTableColumns,
  routerPortTableColumns,
  instancePortTableColumns,
  SelectTable,
  TabSelectTable,
  CheckGroup,
  selectRequiredRule,
} from './helpers';

const runAll = async (target, fn) => {
  const list = Array.isArray(target) ? target : [target];
  for (const it of list) {
    // eslint-disable-next-line no-await-in-loop
    await fn(it);
  }
};

const policyField = (name, label, policies) => ({
  name,
  label,
  render: () => <SelectTable data={policies} columns={policyTableColumns()} isMulti={false} />,
});

export const portTabs = (instancePorts, routerPorts) => [
  { title: t('Instance Port'), key: 'instance', data: instancePorts, columns: instancePortTableColumns() },
  { title: t('Router Port'), key: 'router', data: routerPorts, columns: routerPortTableColumns() },
];

/* ============================== Firewall ============================== */
export const createFirewallAction = (navigate) => ({
  id: 'firewall-create',
  type: 'custom',
  title: t('Create Firewall'),
  onExecute: () => navigate('/network/firewall/create'),
});

export const editFirewallAction = ({ projectId }) => ({
  id: 'edit',
  type: 'modal',
  title: t('Edit'),
  width: 1000,
  allowed: (item) => !isDefaultFirewall(item) && isMine(item, projectId),
  getFormItems: async (item) => {
    const all = await fetchPolicies({ isAdmin: false, projectId });
    const policies = all
      .filter((it) => (it.firewalls || []).length < 2 || (it.firewalls || []).some((fw) => fw.id === item.id))
      .map((it) => ({ ...it, key: it.id }));
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true },
      policyField('ingressPolicy', t('Ingress Policy'), policies),
      policyField('egressPolicy', t('Egress Policy'), policies),
      {
        name: 'options',
        label: t('Options'),
        render: () => <CheckGroup options={[{ label: t('Admin State'), value: 'admin_state_up' }]} />,
      },
      { name: 'description', label: t('Description'), type: 'textarea' },
    ];
  },
  getDefaultValues: (item) => ({
    name: item.name,
    ingressPolicy: {
      selectedRowKeys: item.ingress_firewall_policy_id ? [item.ingress_firewall_policy_id] : [],
    },
    egressPolicy: {
      selectedRowKeys: item.egress_firewall_policy_id ? [item.egress_firewall_policy_id] : [],
    },
    options: { admin_state_up: item.admin_state_up },
    description: item.description,
  }),
  onSubmit: (values, item) => {
    const { ingressPolicy, egressPolicy, options: { admin_state_up = true } = {}, ...rest } = values;
    const body = {
      admin_state_up,
      ingress_firewall_policy_id: ingressPolicy?.selectedRowKeys?.[0] || null,
      egress_firewall_policy_id: egressPolicy?.selectedRowKeys?.[0] || null,
      ...rest,
    };
    return neutronApi.updateFirewall(item.id, body);
  },
});

export const managePortAction = ({ projectId }) => ({
  id: 'manage-port',
  type: 'modal',
  title: t('Manage Ports'),
  width: 1000,
  allowed: (item) => isMine(item, projectId),
  getFormItems: async () => {
    const [instancePorts, routerPorts] = await Promise.all([fetchInstancePorts(projectId), fetchRouterPorts()]);
    return [
      { name: 'name', label: t('Name'), type: 'label' },
      {
        name: 'ports',
        label: t('Ports'),
        render: () => <TabSelectTable tabs={portTabs(instancePorts, routerPorts)} />,
      },
    ];
  },
  getDefaultValues: (item) => {
    const ports = item.ports || [];
    return {
      name: item.name,
      ports: { selectedRows: ports.map((it) => ({ id: it, name: it })), selectedRowKeys: ports },
    };
  },
  onSubmit: (values, item) => {
    const { ports } = values;
    return neutronApi.updateFirewall(item.id, { ports: ports?.selectedRowKeys || null });
  },
});

export const deleteFirewallAction = ({ isAdmin, projectId, projectMap = {} }) => ({
  id: 'delete',
  type: 'confirm',
  title: t('Delete Firewall'),
  buttonText: t('Delete'),
  actionName: t('delete firewall'),
  isDanger: true,
  allowed: (item) => {
    if (!item) return true;
    const pid = getProjectId(item);
    const hasNoProject = !pid || !(item.project_name || projectMap[pid]);
    if (isAdmin && hasNoProject) return true;
    return !isDefaultFirewall(item) && item.status !== 'ACTIVE' && (isMine(item, projectId) || isAdmin);
  },
  onSubmit: (target) => runAll(target, (it) => neutronApi.deleteFirewall(it.id)),
});

export const firewallActions = (ctx) => {
  const del = deleteFirewallAction(ctx);
  if (ctx.isAdmin) {
    return { rowActions: { firstAction: del, moreActions: [] }, batchActions: [del], primaryActions: [] };
  }
  return {
    rowActions: {
      firstAction: editFirewallAction(ctx),
      moreActions: [{ action: managePortAction(ctx) }, { action: del }],
    },
    batchActions: [del],
    primaryActions: [createFirewallAction(ctx.navigate)],
  };
};

/* =============================== Policy =============================== */
export const createPolicyAction = (navigate) => ({
  id: 'create-simple',
  type: 'custom',
  title: t('Create Policy'),
  onExecute: () => navigate('/network/firewall-policy/add'),
});

export const editPolicyAction = ({ projectId, navigate }) => ({
  id: 'edit',
  type: 'custom',
  title: t('Edit'),
  allowed: (item) => !isDefaultPolicy(item) && isMine(item, projectId),
  onExecute: (item) => navigate(`/network/firewall-policy/edit/${item.id}`),
});

const ruleInsertTips = (item) => {
  const tip = t(
    'A rule specified before insertion or after insertion a rule. If both are not specified, the new rule is inserted as the first rule of the policy.'
  );
  return item?.shared ? tip + t('Shared policy only can insert shared rules.') : tip;
};

export const insertRuleAction = ({ projectId }) => ({
  id: 'insert-rule',
  type: 'modal',
  title: t('Insert Rule'),
  width: 1100,
  allowed: (item) => isMine(item, projectId),
  getFormItems: async (item) => {
    const currentRules = item.rules || [];
    const all = await fetchRules({ isAdmin: false, projectId });
    const rules = all
      .filter((it) => currentRules.every((rule) => rule.id !== it.id))
      .filter((it) => (item.shared ? it.shared : true))
      .map((it) => ({ ...it, key: it.id }));
    return [
      { name: 'tips', type: 'alert', message: ruleInsertTips(item) },
      { name: 'name', label: t('Name'), type: 'label' },
      {
        name: 'rule',
        label: t('Rule'),
        rules: [selectRequiredRule(t('Rule'))],
        render: () => <SelectTable data={rules} columns={ruleTableColumns()} isMulti={false} />,
      },
      {
        name: 'insert',
        label: t('Insert'),
        type: 'radio',
        required: true,
        options: [
          { label: t('Insert Before'), value: 'before' },
          { label: t('Insert After'), value: 'after' },
        ],
      },
      {
        name: 'current',
        label: t('Current Rules'),
        render: () => <SelectTable data={currentRules} columns={ruleTableColumns()} isMulti={false} />,
      },
    ];
  },
  getDefaultValues: (item) => ({ name: item.name, insert: 'before' }),
  onSubmit: (values, item) => {
    const { id } = item;
    const { rule, insert, current: { selectedRowKeys = [] } = {} } = values;
    const firewall_rule_id = rule.selectedRowKeys[0];
    let insertAfter = '';
    let insertBefore = '';
    if (selectedRowKeys.length > 0) {
      if (insert === 'before') insertBefore = selectedRowKeys[0];
      else insertAfter = selectedRowKeys[0];
    }
    const body = {
      firewall_policy_id: id,
      firewall_rule_id,
      insert_before: insertBefore,
      insert_after: insertAfter,
    };
    return neutronApi.insertFirewallRule(id, body);
  },
});

export const removeRuleAction = ({ projectId }) => ({
  id: 'remove-rule',
  type: 'modal',
  title: t('Remove Rule'),
  width: 1100,
  allowed: (item) => isMine(item, projectId),
  getFormItems: async (item) => [
    { name: 'name', label: t('Name'), type: 'label' },
    {
      name: 'rule',
      label: t('Rules'),
      rules: [selectRequiredRule(t('Rules'))],
      render: () => <SelectTable data={item.rules || []} columns={ruleTableColumns()} isMulti={false} />,
    },
  ],
  getDefaultValues: (item) => ({ name: item.name }),
  onSubmit: (values, item) =>
    neutronApi.removeFirewallRule(item.id, { firewall_rule_id: values.rule.selectedRowKeys[0] }),
});

export const deletePolicyAction = ({ isAdmin, projectId }) => ({
  id: 'delete',
  type: 'confirm',
  title: t('Delete Policy'),
  buttonText: t('Delete'),
  actionName: t('delete policy'),
  isDanger: true,
  allowed: (item) => {
    if (!item) return true;
    return (item.firewalls || []).length === 0 && (isMine(item, projectId) || isAdmin);
  },
  onSubmit: (target) => runAll(target, (it) => neutronApi.deleteFirewallPolicy(it.id)),
});

export const policyActions = (ctx) => {
  const del = deletePolicyAction(ctx);
  if (ctx.isAdmin) {
    return { rowActions: { firstAction: del, moreActions: [] }, batchActions: [del], primaryActions: [] };
  }
  return {
    rowActions: {
      firstAction: editPolicyAction(ctx),
      moreActions: [{ action: insertRuleAction(ctx) }, { action: removeRuleAction(ctx) }, { action: del }],
    },
    batchActions: [del],
    primaryActions: [createPolicyAction(ctx.navigate)],
  };
};

/* ================================ Rule ================================ */
export const createRuleAction = (navigate) => ({
  id: 'rule-create',
  type: 'custom',
  title: t('Create Rule'),
  onExecute: () => navigate('/network/firewall-rule/create'),
});

export const editRuleAction = ({ projectId, navigate }) => ({
  id: 'rule-edit',
  type: 'custom',
  title: t('Edit Rule'),
  buttonText: t('Edit'),
  allowed: (item) => isMine(item, projectId),
  onExecute: (item) => navigate(`/network/firewall-rule/edit/${item.id}`),
});

export const deleteRuleAction = ({ isAdmin, projectId }) => ({
  id: 'delete',
  type: 'confirm',
  title: t('Delete Rule'),
  buttonText: t('Delete'),
  actionName: t('delete rule'),
  isDanger: true,
  allowed: (item) => {
    if (!item) return true;
    return (item.policies || []).length === 0 && (isMine(item, projectId) || isAdmin);
  },
  onSubmit: (target) => runAll(target, (it) => neutronApi.deleteFirewallRule(it.id)),
});

/** inDetail: rule list embedded in the policy detail (legacy actionConfigsInDetail / emptyActionConfig) */
export const ruleActions = (ctx, inDetail = false) => {
  const del = deleteRuleAction(ctx);
  if (ctx.isAdmin) {
    if (inDetail) return { rowActions: undefined, batchActions: [], primaryActions: [] };
    return { rowActions: { firstAction: del, moreActions: [] }, batchActions: [del], primaryActions: [] };
  }
  if (inDetail) {
    return { rowActions: { firstAction: editRuleAction(ctx), moreActions: [] }, batchActions: [], primaryActions: [] };
  }
  return {
    rowActions: { firstAction: editRuleAction(ctx), moreActions: [{ action: del }] },
    batchActions: [del],
    primaryActions: [createRuleAction(ctx.navigate)],
  };
};
