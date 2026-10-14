/**
 * QoS policy helpers - port of legacy resources/neutron/qos-policy.jsx,
 * stores/neutron/qos-policy.js and pages/network/containers/QoSPolicy/actions/*.
 * Exported for reuse (e.g. QoS policy pickers on Network / Port / Floating IP forms).
 */
import React from 'react';
import { InputNumber, Slider, Space } from 'antd';
import { Link } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import { keystoneApi } from '@/api/keystone';
import { nameColumn, projectColumn, timeColumn, yesNo, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { detailPath } from '../common';

/* ---------------- rules helpers ---------------- */
const rulesOf = (item) => (Array.isArray(item?.rules) ? item.rules : []);

export const findEgressRule = (item) =>
  rulesOf(item).find((r) => r.type === 'bandwidth_limit' && r.direction === 'egress');
export const findIngressRule = (item) =>
  rulesOf(item).find((r) => r.type === 'bandwidth_limit' && r.direction === 'ingress');
export const findDscpRule = (item) => rulesOf(item).find((r) => r.type === 'dscp_marking');

export const getRuleValue = (rule = {}) => {
  if (rule.direction === 'egress') {
    return `${t('Egress')}: ${t('Max Bandwidth')}: ${rule.max_kbps / 1024} Mbps; ${t('Max Burst')}: ${
      rule.max_burst_kbps / 1024
    } Mbps`;
  }
  return rule.direction === 'ingress'
    ? `${t('Ingress')}: ${t('Max Bandwidth')}: ${rule.max_kbps / 1024} Mbps; ${t('Max Burst')}: ${
        rule.max_burst_kbps / 1024
      } Mbps`
    : `${t('DSCP Marking')}: ${rule.dscp_mark}`;
};

export const dscpMarkingItems = '0,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,46,48,56'
  .split(',')
  .map((item) => ({ label: item, value: item }));

/* ---------------- columns / filters / fetch ---------------- */
export const qosPolicyLink = (id, name, isAdmin) =>
  id ? <Link to={detailPath('qos-policy', id, isAdmin)}>{name || id}</Link> : '-';

/**
 * @param {object} o
 * @param {boolean} o.isAdmin  admin route (links to -admin detail)
 * @param {boolean} o.showProject  show the Project column (admin page / "All QoS Policies" tab)
 * @param {object} o.projectMap
 */
export const qosPolicyColumns = ({ isAdmin, showProject, projectMap } = {}) =>
  [
    nameColumn({ linkTo: (r) => detailPath('qos-policy', r.id, isAdmin) }),
    {
      title: t('Description'),
      dataIndex: 'description',
      key: 'description',
      render: (v) => v || '-',
    },
    (showProject ?? isAdmin) && { ...projectColumn(projectMap), title: t('Project ID/Name') },
    {
      title: t('Rules Number'),
      dataIndex: 'rulesNumber',
      key: 'rulesNumber',
      render: (_, r) => rulesOf(r).length,
    },
    {
      title: t('Rules'),
      dataIndex: 'rules',
      key: 'rules',
      render: (rules) =>
        Array.isArray(rules) && rules.length ? (
          <div>
            {rules.map((rule) => (
              <div key={rule.id || `${rule.type}-${rule.direction}`}>{getRuleValue(rule)}</div>
            ))}
          </div>
        ) : (
          '-'
        ),
    },
    { title: t('Shared Policy'), dataIndex: 'shared', key: 'shared', width: 90, render: (v) => yesNo(v) },
    { title: t('Default Policy'), dataIndex: 'is_default', key: 'is_default', width: 110, render: (v) => yesNo(v) },
    timeColumn(),
  ].filter(Boolean);

export const qosPolicyFilters = ({ shared = false, hasAdminRole = false } = {}) => {
  const ret = [
    { name: 'name', label: t('Name') },
    { name: 'description', label: t('Description') },
  ];
  if (!shared) {
    ret.push({
      name: 'shared',
      label: t('Shared Policy'),
      options: [
        { key: 'true', label: t('Yes') },
        { key: 'false', label: t('No') },
      ],
    });
  }
  if (hasAdminRole) {
    ret.push({ name: 'tenant_id', label: t('Project ID') });
  }
  return ret;
};

/**
 * Legacy QoSPolicyStore list: `tab` = 'project' (project_id = current project),
 * 'shared' (shared = true), anything else / admin = all policies visible to the token.
 */
export const fetchQosPolicies = async ({ tab, projectId, params = {} } = {}) => {
  const query = { ...params };
  if (tab === 'project' && projectId) query.project_id = projectId;
  if (tab === 'shared') query.shared = true;
  const res = await neutronApi.listQosPolicies(query);
  return (res?.policies || []).map((p) => ({
    ...p,
    rules: Array.isArray(p.rules) ? p.rules : [],
    project_id: p.project_id || p.tenant_id,
    standard_attr_id: p.created_at,
  }));
};

export const fetchQosPolicyDetail = async (id, { isAdmin } = {}) => {
  const policy = (await neutronApi.getQosPolicy(id))?.policy;
  if (!policy) return policy;
  const item = { ...policy, rules: Array.isArray(policy.rules) ? policy.rules : [] };
  if (isAdmin && item.project_id) {
    try {
      item.project_name = (await keystoneApi.getProject(item.project_id))?.project?.name || '-';
    } catch {
      item.project_name = '-';
    }
  }
  return item;
};

/* ---------------- slider + input (legacy 'slider-input') ---------------- */
export function SliderInput({ value, onChange, min = 1, max = 10000, description }) {
  return (
    <div>
      <Space style={{ width: '100%' }} align="center">
        <Slider style={{ width: 260 }} min={min} max={max} value={value} onChange={onChange} />
        <InputNumber min={min} max={max} value={value} onChange={(v) => onChange?.(v ?? min)} />
      </Space>
      {description ? <div style={{ color: '#94a3b8', fontSize: 12 }}>{description}</div> : null}
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
const StaticText = ({ text, value, onChange, id }) => <div style={{ lineHeight: '32px' }}>{text}</div>;

const typeLabel = (text) => ({
  name: '__type',
  label: t('Type'),
  render: () => <StaticText text={text} />,
});

const bandwidthFields = () => [
  {
    name: 'max_kbps',
    label: t('Bandwidth limit'),
    required: true,
    render: () => <SliderInput min={1} max={10000} description="1Mbps-10000Mbps" />,
  },
  {
    name: 'max_burst_kbps',
    label: t('Burst limit'),
    required: true,
    render: () => <SliderInput min={1} max={10000} description="1Mbps-10000Mbps" />,
  },
];

/* ---------------- policy actions ---------------- */
export const createQosPolicyAction = ({ isAdmin, projectId } = {}) => ({
  id: 'create_qos_policy',
  type: 'modal',
  policy: 'create_policy',
  aliasPolicy: 'neutron:create_policy',
  title: t('Create QoS Policy'),
  buttonText: t('Create QoS Policy'),
  width: isAdmin ? 720 : 520,
  getDefaultValues: () => (isAdmin ? { project_id: projectId, shared: false, is_default: false } : {}),
  getFormItems: async () => {
    let projects = [];
    if (isAdmin) {
      try {
        projects = (await keystoneApi.listProjects())?.projects || [];
      } catch {
        projects = [];
      }
    }
    return [
      { name: 'name', label: t('Policy Name'), type: 'input', required: true },
      {
        name: 'project_id',
        label: t('Project'),
        type: 'select',
        required: isAdmin,
        hidden: !isAdmin,
        options: projects.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` })),
      },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
      { name: 'shared', label: t('Shared Policy'), type: 'switch', hidden: !isAdmin },
      { name: 'is_default', label: t('Default Policy'), type: 'switch', hidden: !isAdmin },
    ];
  },
  onSubmit: (values) => {
    const { name, description, shared, is_default, project_id } = values;
    return neutronApi.createQosPolicy({
      name,
      description,
      shared,
      is_default,
      project_id: project_id || projectId,
    });
  },
});

export const editQosPolicyAction = ({ isAdmin } = {}) => ({
  id: 'edit_qos_policy',
  type: 'modal',
  policy: 'update_policy',
  aliasPolicy: 'neutron:update_policy',
  title: t('Edit QoS Policy'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({
    name: item.name,
    description: item.description,
    shared: item.shared,
    is_default: item.is_default,
  }),
  getFormItems: () => [
    { name: 'name', label: t('Policy Name'), type: 'input', required: true },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
    { name: 'shared', label: t('Shared Policy'), type: 'switch', hidden: !isAdmin },
    { name: 'is_default', label: t('Default Policy'), type: 'switch', hidden: !isAdmin },
  ],
  // legacy form keeps hidden fields in the submitted values (defaults come from the item)
  onSubmit: (values, item) =>
    neutronApi.updateQosPolicy(item.id, {
      name: values.name,
      description: values.description,
      shared: values.shared ?? item.shared,
      is_default: values.is_default ?? item.is_default,
    }),
});

export const deleteQosPolicyAction = () => ({
  ...deleteAction({
    name: t('QoS Policy'),
    title: t('Delete QoS Policy'),
    onDelete: (it) => neutronApi.deleteQosPolicy(it.id),
  }),
  policy: 'delete_policy',
  aliasPolicy: 'neutron:delete_policy',
});

/* ---------------- rule actions ---------------- */
export const createBandwidthLimitRuleAction = () => ({
  id: 'create_bandwidth_limit_rule',
  type: 'modal',
  policy: 'create_policy_bandwidth_limit_rule',
  title: t('Create Bandwidth Limit Rule'),
  allowed: (item) => {
    const rules = rulesOf(item);
    const hasIngress = rules.some((i) => i.direction === 'ingress');
    const hasEgress = rules.some((i) => i.direction === 'egress');
    return !(hasIngress && hasEgress);
  },
  getDefaultValues: () => ({ max_kbps: 1, max_burst_kbps: 1, direction: 'egress' }),
  getFormItems: () => [
    typeLabel(t('QoS Bandwidth Limit')),
    ...bandwidthFields(),
    {
      name: 'direction',
      label: t('Direction'),
      type: 'select',
      options: [
        { label: t('egress'), value: 'egress' },
        { label: t('ingress'), value: 'ingress' },
      ],
    },
  ],
  onSubmit: (values, item) => {
    // eslint-disable-next-line no-unused-vars
    const { max_kbps, max_burst_kbps, __type, ...rest } = values;
    const data = {
      ...rest,
      max_kbps: max_kbps * 1024,
      max_burst_kbps: max_burst_kbps * 1024,
    };
    return neutronApi.createBandwidthLimitRule(item.id, { bandwidth_limit_rule: data });
  },
});

const editBandwidthRuleAction = ({ direction }) => {
  const isEgress = direction === 'egress';
  const find = isEgress ? findEgressRule : findIngressRule;
  return {
    id: isEgress ? 'edit_bandwidth_egress_limit_rule' : 'edit_bandwidth_ingress_limit_rule',
    type: 'modal',
    policy: 'update_policy_bandwidth_limit_rule',
    title: isEgress ? t('Edit Bandwidth Egress Limit Rule') : t('Edit Bandwidth Ingress Limit Rule'),
    allowed: (item) => rulesOf(item).some((i) => i.direction === direction),
    getDefaultValues: (item) => {
      const { max_kbps, max_burst_kbps } = find(item) || {};
      return { max_kbps: max_kbps / 1024, max_burst_kbps: max_burst_kbps / 1024 };
    },
    getFormItems: () => [
      typeLabel(isEgress ? t('QoS Bandwidth Egress Limit') : t('QoS Bandwidth Ingress Limit')),
      ...bandwidthFields(),
    ],
    onSubmit: (values, item) =>
      neutronApi.updateBandwidthLimitRule(item.id, (find(item) || {}).id, {
        bandwidth_limit_rule: {
          max_kbps: values.max_kbps * 1024,
          max_burst_kbps: values.max_burst_kbps * 1024,
        },
      }),
  };
};

export const editBandwidthEgressRuleAction = () => editBandwidthRuleAction({ direction: 'egress' });
export const editBandwidthIngressRuleAction = () => editBandwidthRuleAction({ direction: 'ingress' });

const deleteBandwidthRuleAction = ({ direction }) => {
  const isEgress = direction === 'egress';
  const find = isEgress ? findEgressRule : findIngressRule;
  return {
    id: isEgress ? 'delete-egress' : 'delete-ingress',
    type: 'confirm',
    policy: 'delete_policy_bandwidth_limit_rule',
    title: isEgress ? t('Delete Bandwidth Egress Rules') : t('Delete Bandwidth Ingress Rules'),
    actionName: isEgress ? t('delete bandwidth egress rules') : t('delete bandwidth ingress rules'),
    isDanger: true,
    allowed: (item) => rulesOf(item).some((i) => i.direction === direction),
    onSubmit: (item) => neutronApi.deleteBandwidthLimitRule(item.id, (find(item) || {}).id),
  };
};

export const deleteBandwidthEgressRuleAction = () => deleteBandwidthRuleAction({ direction: 'egress' });
export const deleteBandwidthIngressRuleAction = () => deleteBandwidthRuleAction({ direction: 'ingress' });

const dscpField = () => ({
  name: 'dscp_mark',
  label: t('Value'),
  type: 'select',
  options: dscpMarkingItems,
});

export const createDscpMarkingRuleAction = () => ({
  id: 'create_DSCP_marking_rule',
  type: 'modal',
  policy: 'create_policy_dscp_marking_rule',
  title: t('Create DSCP Marking Rule'),
  allowed: (item) => !rulesOf(item).some((i) => i.type === 'dscp_marking'),
  getDefaultValues: () => ({ dscp_mark: 0 }),
  getFormItems: () => [typeLabel(t('DSCP Marking')), dscpField()],
  onSubmit: (values, item) =>
    neutronApi.createDscpMarkingRule(item.id, { dscp_marking_rule: { dscp_mark: values.dscp_mark } }),
});

export const editDscpMarkingRuleAction = () => ({
  id: 'edit_DSCP_marking_rule',
  type: 'modal',
  policy: 'update_policy_dscp_marking_rule',
  title: t('Edit DSCP Marking Rule'),
  allowed: (item) => rulesOf(item).some((i) => i.type === 'dscp_marking'),
  getDefaultValues: (item) => ({ dscp_mark: (findDscpRule(item) || {}).dscp_mark || 0 }),
  getFormItems: () => [typeLabel(t('DSCP Marking')), dscpField()],
  onSubmit: (values, item) =>
    neutronApi.updateDscpMarkingRule(item.id, (findDscpRule(item) || {}).id, {
      dscp_marking_rule: { dscp_mark: values.dscp_mark },
    }),
});

export const deleteDscpMarkingRuleAction = () => ({
  id: 'delete-dscp',
  type: 'confirm',
  policy: 'delete_policy_dscp_marking_rule',
  title: t('Delete DSCP Marking Rules'),
  actionName: t('delete DSCP marking rules'),
  isDanger: true,
  allowed: (item) => rulesOf(item).some((i) => i.type === 'dscp_marking'),
  onSubmit: (item) => neutronApi.deleteDscpMarkingRule(item.id, (findDscpRule(item) || {}).id),
});

/** Legacy actions/index.jsx: `actionConfigs` (admin) includes DSCP rule actions, `consoleActions` does not. */
export const qosRowActions = ({ isAdmin } = {}) => ({
  firstAction: editQosPolicyAction({ isAdmin }),
  moreActions: [
    { action: createBandwidthLimitRuleAction() },
    { action: editBandwidthEgressRuleAction() },
    { action: editBandwidthIngressRuleAction() },
    { action: deleteBandwidthEgressRuleAction() },
    { action: deleteBandwidthIngressRuleAction() },
    ...(isAdmin
      ? [
          { action: createDscpMarkingRuleAction() },
          { action: editDscpMarkingRuleAction() },
          { action: deleteDscpMarkingRuleAction() },
        ]
      : []),
    { action: deleteQosPolicyAction() },
  ],
});
