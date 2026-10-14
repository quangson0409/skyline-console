/**
 * Security group + rule actions/columns - port of legacy
 * pages/network/containers/SecurityGroup/actions/*, Detail/Rule/** and
 * resources/neutron/security-group-rule.jsx.
 */
import React from 'react';
import { AutoComplete, Form, Input } from 'antd';
import { IdNameCell } from '@/components/ResourcePage/helpers';
import { neutronApi, neutronResources } from '@/api/neutron';
import { quotaApi } from '@/api/quota';
import { currentProjectId } from '@/api/endpoints';
import ResourcePage from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { withQuota } from '@/components/Quota/utils';
import { fetchNeutronQuota as fetchNeutronQuotaData, neutronQuotaItems } from '@/components/Quota/services';
import { detailPath } from '@/pages/Network/common';
import { isCidr } from '@/components/network/ip';

/* ---------------- resources/neutron/security-group-rule ---------------- */
export const ipProtocols = () => [
  { value: 'ah', label: t('AH') },
  { value: 'dccp', label: t('DCCP') },
  { value: 'egp', label: t('EGP') },
  { value: 'esp', label: t('ESP') },
  { value: 'gre', label: t('GRE') },
  { value: 'igmp', label: t('IGMP') },
  { value: 'ipv6-encap', label: t('IPv6-Encap') },
  { value: 'ipv6-frag', label: t('IPv6-Frag') },
  { value: 'ipv6-icmp', label: t('IPv6-ICMP') },
  { value: 'ipv6-nonxt', label: t('IPv6-NoNxt') },
  { value: 'ipv6-opts', label: t('IPv6-Opts') },
  { value: 'ipv6-route', label: t('IPv6-Route') },
  { value: 'ospf', label: t('OSPF') },
  { value: 'pgm', label: t('PGM') },
  { value: 'rsvp', label: t('RSVP') },
  { value: 'sctp', label: t('SCTP') },
  { value: 'udplite', label: t('UDPLite') },
  { value: 'vrrp', label: t('VRRP') },
];

export const directions = () => ({ ingress: t('Ingress'), egress: t('Egress') });

export const protocolText = (protocol) => {
  if (typeof protocol === 'number') return protocol;
  if (!protocol || protocol === 'any') return t('Any');
  return String(protocol).toUpperCase();
};

/** legacy mapperRule */
export const mapperRule = (data = {}) => {
  let icmpTypeCode = '';
  let port_range = t('Any');
  const { protocol, port_range_min, port_range_max } = data;
  const prMinNum = parseInt(port_range_min, 10);
  const prMaxNum = parseInt(port_range_max, 10);
  if (prMinNum && prMaxNum) {
    port_range = prMinNum !== prMaxNum ? `${prMinNum} : ${prMaxNum}` : prMinNum;
  }
  if (protocol === 'icmp' && prMaxNum) {
    icmpTypeCode = `${prMinNum} / ${prMaxNum}`;
    port_range = '-';
  }
  return { ...data, protocol: protocol || 'any', port_range, icmpTypeCode };
};

/** legacy Rule Delete getItemName */
export const ruleName = (item = {}) => {
  const { ethertype, port_range_min, port_range_max, protocol, remote_group_id, remote_ip_prefix } = item;
  let protoPort = '';
  const prMinNum = parseInt(port_range_min, 10);
  const prMaxNum = parseInt(port_range_max, 10);
  const prProtocol = String(protocol || '').toLowerCase();
  if (prMinNum) {
    protoPort = prMinNum === prMaxNum ? `${prMinNum} / ${prProtocol}` : `${prMinNum} - ${prMaxNum} / ${prProtocol}`;
  }
  const direction = item.direction === 'egress' ? 'to' : 'from';
  const remote = remote_group_id || remote_ip_prefix || t('ANY');
  return `ALLOW ${ethertype} ${protoPort} ${direction} ${remote}`;
};

const defaultRemote = (r) => r.remote_ip_prefix || (r.ethertype === 'IPv4' ? '0.0.0.0/0' : '::/0');

export const ruleColumns = ({ isAdmin } = {}) => [
  {
    title: t('Direction'),
    dataIndex: 'direction',
    key: 'direction',
    render: (v) => directions()[v] || v || '-',
  },
  { title: t('Ether Type'), dataIndex: 'ethertype', key: 'ethertype', render: (v) => v || '-' },
  { title: t('IP Protocol'), dataIndex: 'protocol', key: 'protocol', render: (v) => protocolText(v) },
  { title: t('Port Range'), dataIndex: 'port_range', key: 'port_range', render: (v) => (v === undefined ? '-' : v) },
  { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
  {
    title: t('Remote IP Prefix'),
    dataIndex: 'remote_ip_prefix',
    key: 'remote_ip_prefix',
    render: (_, r) => (r.remote_group_id ? '-' : defaultRemote(r)),
  },
  {
    title: t('Remote Group ID'),
    dataIndex: 'remote_group_id',
    key: 'remote_group_id',
    render: (v) => (v ? <IdNameCell id={v} href={detailPath('security-group', v, isAdmin)} bold={false} /> : '-'),
  },
  {
    title: t('ICMP Type/ICMP Code'),
    dataIndex: 'icmpTypeCode',
    key: 'icmpTypeCode',
    render: (v) => v || '-',
  },
];

export const ruleFilters = () => [
  { name: 'remote_ip_text', label: t('Remote IP Prefix') },
  {
    name: 'direction',
    label: t('Direction'),
    options: Object.entries(directions()).map(([key, label]) => ({ key, label })),
  },
  {
    name: 'ethertype',
    label: t('Ether Type'),
    options: [
      { key: 'IPv4', label: t('IPv4') },
      { key: 'IPv6', label: t('IPv6') },
    ],
  },
];

export const fetchRules = async (securityGroupId) => {
  if (!securityGroupId) return [];
  const res = await neutronApi.listSecurityGroupRules({ security_group_id: securityGroupId });
  return (res?.security_group_rules || []).map((r) => {
    const mapped = mapperRule(r);
    return { ...mapped, name: ruleName(r), remote_ip_text: r.remote_ip_prefix || '0.0.0.0/0' };
  });
};

/* ---------------- quota helper ---------------- */
const quotaLeft = (q) => {
  if (!q || q.limit === undefined || q.limit === null) return undefined;
  if (q.limit === -1) return Infinity;
  return Math.max(0, q.limit - (q.used || 0) - (q.reserved || 0));
};


const fetchQuota = async () => {
  try {
    return (await quotaApi.getNeutronQuota(currentProjectId()))?.quota || {};
  } catch {
    return {};
  }
};

/* ---------------- Security group actions ---------------- */
const sgNameRules = () => [
  {
    validator: (_, v) =>
      !v || /^[a-zA-Z][\w"'[\]^.:()_-]{0,127}$/.test(v)
        ? Promise.resolve()
        : Promise.reject(
            new Error(
              t(
                'The name should start with upper letter or lower letter, characters can only contain "0-9, a-z, A-Z, "-\'_()[].:^".'
              )
            )
          ),
  },
];

const DEFAULT_RULE_COUNT = 2;

export const createSecurityGroupAction = () => ({
  id: 'create',
  type: 'modal',
  policy: 'create_security_group',
  title: t('Create Security Group'),
  buttonText: t('Create Security Group'),
  description: t(
    'This operation creates a security group with default security group rules for the IPv4 and IPv6 ether types.'
  ),
  // legacy SecurityGroup/actions/Create showQuota: 1 group + its 2 default rules
  quota: withQuota(
    () => fetchNeutronQuotaData(),
    (quota) => neutronQuotaItems(quota, ['security_group', 'security_group_rule'], [1, DEFAULT_RULE_COUNT])
  ),
  formItems: [
    {
      name: 'name',
      label: t('Name'),
      type: 'input',
      placeholder: t('Please input name'),
      required: true,
      rules: sgNameRules(),
    },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: async ({ name, description }) => {
    const quota = await fetchQuota();
    const groupLeft = quotaLeft(quota.security_group);
    const ruleLeft = quotaLeft(quota.security_group_rule);
    if (groupLeft === 0 || (ruleLeft !== undefined && ruleLeft < DEFAULT_RULE_COUNT)) {
      throw new Error(t('Quota exceeded'));
    }
    const body = { name };
    if (description !== undefined) body.description = description;
    return neutronResources.securityGroups.create(body);
  },
});

export const editSecurityGroupAction = () => ({
  id: 'edit',
  type: 'modal',
  policy: 'update_security_group',
  title: t('Edit'),
  buttonText: t('Edit'),
  allowed: (item) => item.name !== 'default',
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    {
      name: 'name',
      label: t('Name'),
      type: 'input',
      placeholder: t('Please input name'),
      required: true,
      rules: sgNameRules(),
    },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => neutronApi.updateSecurityGroup(item.id, values),
});

export const deleteSecurityGroupAction = ({ isAdmin } = {}) => ({
  id: 'delete',
  type: 'confirm',
  policy: 'delete_security_group',
  title: t('Delete Security Group'),
  buttonText: t('Delete'),
  actionName: t('Delete Security Group'),
  isDanger: true,
  allowed: (item) =>
    (isAdmin && (!item.project_name || item.project_name === '-')) || item.name !== 'default',
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await neutronApi.deleteSecurityGroup(it.id);
    }
  },
});

/* ---------------- Rule actions ---------------- */
const defaultRules = () => ({
  custom_tcp: { name: t('Custom TCP Rule'), ip_protocol: 'tcp' },
  custom_udp: { name: t('Custom UDP Rule'), ip_protocol: 'udp' },
  custom_icmp: { name: t('Custom ICMP Rule'), ip_protocol: 'icmp' },
  all_proto: { name: t('All Proto'), ip_protocol: null },
  all_tcp: { name: t('All TCP'), ip_protocol: 'tcp', from_port: '1', to_port: '65535' },
  all_udp: { name: t('All UDP'), ip_protocol: 'udp', from_port: '1', to_port: '65535' },
  all_icmp: { name: t('All ICMP'), ip_protocol: 'icmp' },
  custom_protocol: { name: t('Other Protocol') },
});

const isValidPort = (s) => /^\d+$/.test(s) && (s === '0' || s[0] !== '0') && Number(s) <= 65535;
const portRangeRule = () => ({
  validator: (_, value) => {
    if (!value) return Promise.resolve();
    const parts = String(value).split(':');
    if (parts.length > 2 || !parts.every(isValidPort)) {
      return Promise.reject(new Error(`${t('Invalid: ')}${t('Enter an integer value between 1 and 65535.')}`));
    }
    if (parts.length === 2 && Number(parts[0]) > Number(parts[1])) {
      return Promise.reject(new Error(`${t('Invalid: ')}${t('The starting number must be less than the ending number')}`));
    }
    return Promise.resolve();
  },
});

const cidrAllRule = () => ({
  validator: (_, v) =>
    !v || isCidr(v)
      ? Promise.resolve()
      : Promise.reject(new Error(t('CIDR Format Error (e.g. 192.168.0.0/24, 2001:DB8::/48)'))),
});

/** legacy select-input: choose from list or type a protocol number */
const IpProtocolInput = ({ value, onChange }) => (
  <AutoComplete
    value={value}
    onChange={onChange}
    options={ipProtocols()}
    filterOption={(input, opt) => String(opt?.value || '').toLowerCase().includes(String(input).toLowerCase())}
    placeholder={t('Please select')}
    allowClear
  />
);

const showPortType = (v) => ['custom_udp', 'custom_tcp'].includes(v.protocol);
const showRemoteType = (v) => ['custom_udp', 'custom_tcp', 'custom_icmp'].includes(v.protocol);

export const createRuleAction = ({ securityGroupId } = {}) => ({
  id: 'create-rule',
  type: 'modal',
  policy: 'create_security_group_rule',
  title: t('Create Rule'),
  buttonText: t('Create Rule'),
  width: 720,
  // legacy SecurityGroup/Detail/Rule/actions/Create showQuota: 1 security group rule
  quota: withQuota(
    () => fetchNeutronQuotaData(),
    (quota) => neutronQuotaItems(quota, ['security_group_rule'], [1])
  ),
  getFormItems: async () => {
    const groups = await neutronApi
      .listSecurityGroups()
      .then((r) => r?.security_groups || [])
      .catch(() => []);
    const rules = defaultRules();
    return [
      {
        name: 'protocol',
        label: t('Protocol'),
        type: 'select',
        required: true,
        options: Object.entries(rules).map(([value, r]) => ({ value, label: r.name })),
      },
      {
        name: 'direction',
        label: t('Direction'),
        type: 'select',
        required: true,
        options: [
          { value: 'ingress', label: t('Ingress') },
          { value: 'egress', label: t('Egress') },
        ],
      },
      {
        name: 'ethertype',
        label: t('Ether Type'),
        type: 'select',
        required: true,
        options: [
          { value: 'IPv4', label: t('IPv4') },
          { value: 'IPv6', label: t('IPv6') },
        ],
      },
      {
        name: 'portOrRange',
        label: t('Port Type'),
        type: 'select',
        required: true,
        visible: showPortType,
        options: [
          { value: 'all', label: t('All Port') },
          { value: 'range', label: t('Custom') },
        ],
      },
      {
        name: 'sourcePort',
        label: t('Port or Port Range'),
        type: 'input',
        required: true,
        visible: (v) => showPortType(v) && v.portOrRange === 'range',
        rules: [portRangeRule()],
        render: ({ form }) => <SourcePortInput form={form} />,
      },
      {
        name: 'ipProtocol',
        label: t('IP Protocol'),
        required: true,
        visible: (v) => v.protocol === 'custom_protocol',
        tip: t('Please input protocol number if it absent in select list.'),
        render: () => <IpProtocolInput />,
      },
      {
        name: 'icmpType',
        label: t('ICMP Type'),
        type: 'number',
        min: 0,
        max: 255,
        visible: (v) => v.protocol === 'custom_icmp',
        tip: t('Please input ICMP type (0-255)'),
      },
      {
        name: 'icmpCode',
        label: t('ICMP Code'),
        type: 'number',
        min: 0,
        max: 255,
        visible: (v) => v.protocol === 'custom_icmp',
        tip: t('Please input ICMP code (0-255)'),
      },
      {
        name: 'description',
        label: t('Description'),
        type: 'textarea',
        rows: 2,
        placeholder: t('Description for this rule'),
      },
      {
        name: 'remoteType',
        label: t('Remote Type'),
        type: 'select',
        required: true,
        visible: showRemoteType,
        options: [
          { value: 'cidr', label: t('CIDR') },
          { value: 'sg', label: t('Security Group') },
        ],
      },
      {
        name: 'remote_ip_prefix',
        label: t('Remote IP Prefix'),
        type: 'input',
        required: true,
        visible: (v) => showRemoteType(v) && v.remoteType === 'cidr',
        rules: [cidrAllRule()],
        placeholder: t('Please input IPv4 or IPv6 CIDR'),
        tip: t('Please input IPv4 or IPv6 CIDR, (e.g. 192.168.0.0/24, 2001:DB8::/48)'),
      },
      {
        name: 'remote_group_id',
        label: t('Remote Security Group'),
        type: 'select',
        required: true,
        visible: (v) => showRemoteType(v) && v.remoteType === 'sg',
        options: groups.map((g) => ({ value: g.id, label: g.name || g.id })),
      },
    ];
  },
  getDefaultValues: () => ({
    protocol: 'custom_tcp',
    portOrRange: 'range',
    remoteType: 'cidr',
    direction: 'ingress',
    ethertype: 'IPv4',
    ipProtocol: 'ah',
    sourcePort: '',
  }),
  onSubmit: async (values, item) => {
    const quota = await fetchQuota();
    if (quotaLeft(quota.security_group_rule) === 0) throw new Error(t('Quota exceeded'));
    const { _quota, sourcePort = '', protocol, ipProtocol, icmpType, icmpCode, portOrRange, remoteType, ...rawRest } =
      values;
    const rest = Object.fromEntries(Object.entries(rawRest).filter(([, v]) => v !== undefined));
    const range = ['custom_udp', 'custom_tcp'].includes(protocol) && portOrRange === 'range';
    const ports = String(sourcePort || '').split(':');
    const rules = defaultRules();
    const newProtocol = protocol !== 'custom_protocol' ? rules[protocol].ip_protocol : ipProtocol;
    const body = {
      security_group_id: securityGroupId || item?.id,
      port_range_min: protocol === 'custom_icmp' ? icmpType : range ? parseInt(ports[0], 10) : null,
      port_range_max: protocol === 'custom_icmp' ? icmpCode : range ? parseInt(ports[1] || ports[0], 10) : null,
      protocol: newProtocol,
      ...rest,
    };
    if (protocol.includes('all')) {
      delete body.remote_ip_prefix;
      delete body.remote_group_id;
    }
    return neutronApi.createSecurityGroupRule(body);
  },
});

/** Port input whose hint depends on the selected direction (legacy extra) */
function SourcePortInput({ form, value, onChange }) {
  const direction = Form.useWatch('direction', form);
  return (
    <div>
      <Input value={value} onChange={onChange} placeholder="80 / 80:160" />
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
        {direction === 'egress'
          ? t('Input destination port or port range (example: 80 or 80:160)')
          : t('Input source port or port range (example: 80 or 80:160)')}
      </div>
    </div>
  );
}

export const deleteRuleAction = () => ({
  id: 'delete-rule',
  type: 'confirm',
  policy: 'delete_security_group_rule',
  title: t('Delete Rule'),
  buttonText: t('Delete'),
  actionName: t('Delete Rule'),
  isDanger: true,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await neutronResources.securityGroupRules.delete(it.id);
    }
  },
});

/** Rules list (legacy Detail/Rule) - used by the detail tab and the list "Manage Rules" drawer */
export function RulesTable({ securityGroupId, isAdmin, refreshKey }) {
  return (
    <ResourcePage
      embedded
      deps={[securityGroupId, refreshKey]}
      fetch={() => fetchRules(securityGroupId)}
      columns={ruleColumns({ isAdmin })}
      filterParams={ruleFilters()}
      primaryActions={isAdmin ? [] : [createRuleAction({ securityGroupId })]}
      batchActions={[deleteRuleAction()]}
      rowActions={{ firstAction: deleteRuleAction(), moreActions: [] }}
    />
  );
}
