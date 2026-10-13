/**
 * Shared helpers for the VPNaaS pages (port of legacy resources/neutron/vpn.js,
 * stores/neutron/vpn-*.js and the select-table / LocalSubnet form components).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Col, Empty, Form, Input, Row, Spin, Table, Tag } from 'antd';
import { neutronApi } from '@/api/neutron';
import Status from '@/components/Status';
import { CopyText, formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { listAll, isCidr } from '../common';

/* ---------------- status / option maps (resources/neutron/vpn.js) ---------------- */
export const vpnStatus = () => ({
  ACTIVE: t('Active'),
  DOWN: t('Down'),
  BUILD: t('Build'),
  ERROR: t('Error'),
  PENDING_CREATE: t('Pending Create'),
  PENDING_UPDATE: t('Pending Update'),
  PENDING_DELETE: t('Pending Delete'),
});

export const vpnStatusOptions = () => Object.entries(vpnStatus()).map(([key, label]) => ({ key, value: key, label }));

const plainOptions = (list, upper = false) =>
  list.map((i) => ({ key: i, value: i, label: upper ? i.toUpperCase() : i }));

export const authAlgorithmOptions = (upper) => plainOptions(['sha1', 'sha256', 'sha384', 'sha512'], upper);
export const encryptionAlgorithmOptions = (upper) => plainOptions(['3des', 'aes-128', 'aes-192', 'aes-256'], upper);
export const pfsOptions = () => plainOptions(['group2', 'group5', 'group14']);
export const ikePolicyIKEVersionOptions = () => plainOptions(['v1', 'v2']);
export const ipsecPolicyEncapsulationModeOptions = () => plainOptions(['tunnel', 'transport']);
export const ipsecPolicyTransformProtocolOptions = () => plainOptions(['esp', 'ah', 'ah-esp']);

/* ---------------- render helpers ---------------- */
export const renderLifetime = (lifeTime) =>
  lifeTime && typeof lifeTime === 'object' ? (
    <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
      {Object.keys(lifeTime).map((i, index) => (
        <li key={`${index}_${lifeTime[i]}_lifeTime`}>{`${i}: ${lifeTime[i]}`}</li>
      ))}
    </ul>
  ) : (
    '-'
  );

export const dash = (v) => (v === undefined || v === null || v === '' ? '-' : v);

/* ---------------- validation ---------------- */
const nameRegexWithoutChinese = /^[a-zA-Z][\w"'[\]^.:()_-]{0,127}$/;
export const nameRule = () => ({
  validator: (_, value) =>
    !value || nameRegexWithoutChinese.test(value)
      ? Promise.resolve()
      : Promise.reject(
          new Error(
            t(
              'The name should start with upper letter or lower letter, and be a string of 1 to 128, characters can only contain "0-9, a-z, A-Z, "-\'_()[].:^".'
            )
          )
        ),
});

export const nameField = () => ({ name: 'name', label: t('Name'), type: 'input', required: true, rules: [nameRule()] });
export const descriptionField = () => ({ name: 'description', label: t('Description'), type: 'textarea', rows: 3 });

export const isPeerCidr = (v) => isCidr(v);

const instancePasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d\\[\]`~!@#$%^&*()_\-+=?:"{}|,.\\/;']{8,16}$/;
export const pskRule = () => ({
  validator: (_, value) =>
    !value || instancePasswordRegex.test(value)
      ? Promise.resolve()
      : Promise.reject(
          new Error(
            `${t('Invalid: ')}${t('8 to 16 characters, at least one uppercase letter, one lowercase letter, one number.')}`
          )
        ),
});
export const confirmPskRule = () => ({ getFieldValue }) => ({
  validator: (_, value) => {
    const password = getFieldValue('password');
    if (password && value !== password) {
      return Promise.reject(new Error(t('Pre-Shared Key must be the same with Confirm Shared Key.')));
    }
    return Promise.resolve();
  },
});

/* ---------------- data helpers ---------------- */
const safeList = async (promise, key) => {
  try {
    const res = await promise;
    return Array.isArray(res?.[key]) ? res[key] : [];
  } catch {
    return [];
  }
};

/** Legacy fetchDataByCurrentProject: tenant pages filter by project_id, admin pages list everything */
export const listParams = ({ isAdmin, projectId }) => (!isAdmin && projectId ? { project_id: projectId } : {});

export const vpnLists = {
  services: (params) => safeList(neutronApi.listVpnServices(params), 'vpnservices'),
  ikePolicies: (params) => safeList(neutronApi.listIkePolicies(params), 'ikepolicies'),
  ipsecPolicies: (params) => safeList(neutronApi.listIpsecPolicies(params), 'ipsecpolicies'),
  connections: (params) => safeList(neutronApi.listIpsecSiteConnections(params), 'ipsec_site_connections'),
  endpointGroups: (params) => safeList(neutronApi.listEndpointGroups(params), 'endpoint_groups'),
};

/** Legacy "Used by tunnel(s)" error used by delete / edit actions when a resource is referenced */
export const inUseMessage = ({ action, name, reason, connections }) =>
  `${t('Unable to {action}, because : {reason}, instance: {name}.', { action, name, reason })}\n${t(
    'Used by tunnel(s): {names}. ID(s): {ids}',
    {
      names: connections.map((i) => i.name).join(', '),
      ids: connections.map((i) => i.id).join(', '),
    }
  )}`;

/** Legacy delete allowedCheckFunc: system admin or resource of the current project */
export const isCurrentProjectOrAdmin = (item, { hasAdminRole, projectId }) =>
  !item || hasAdminRole || !item.project_id || item.project_id === projectId;

/**
 * Confirm-delete action that first checks the IPsec site connections referencing the item
 * (legacy Delete actions of VPN service / IKE policy / IPsec policy / endpoint group).
 */
// eslint-disable-next-line no-unused-vars
export const deleteWithCheck = ({ id, title, actionName, reason, connectionParams, onDelete, allowed }) => ({
  id: 'delete',
  type: 'confirm',
  title,
  actionName,
  buttonText: t('Delete'),
  isDanger: true,
  allowed,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const item of list) {
      const params = connectionParams ? connectionParams(item) : null;
      if (params) {
        // eslint-disable-next-line no-await-in-loop
        const connections = await vpnLists.connections(params);
        if (connections.length > 0) {
          throw new Error(inUseMessage({ action: actionName || title, name: item.name, reason, connections }));
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await onDelete(item);
    }
  },
});

/* ---------------- select-table form components ---------------- */
const yesNoTag = (v) => (v ? <Tag color="green">{t('Yes')}</Tag> : <Tag>{t('No')}</Tag>);

/**
 * Router select table (legacy getRouterSelectTablePropsBackend): single selection,
 * value = router id. `disabledFunc(router)` disables rows. `onPicked(router)` fires on change.
 */
export function RouterSelectTable({ value, onChange, projectId, isAdmin, disabledFunc, onPicked }) {
  const [routers, setRouters] = useState(null);
  const [networks, setNetworks] = useState({});
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      listAll.routers(projectId ? { project_id: projectId } : {}),
      listAll.networks({ 'router:external': true }),
    ]).then(([rs, ns]) => {
      if (!alive) return;
      setRouters(rs);
      setNetworks(Object.fromEntries(ns.map((n) => [n.id, n.name])));
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const data = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return (routers || [])
      .filter((r) => !q || String(r.name || '').toLowerCase().includes(q) || String(r.id).includes(q))
      .sort((a, b) => String(b.status || '').localeCompare(String(a.status || '')));
  }, [routers, keyword]);

  const columns = [
    {
      title: t('ID/Name'),
      dataIndex: 'name',
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v || '-'}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.id}</div>
        </div>
      ),
    },
    isAdmin && { title: t('Project ID/Name'), dataIndex: 'project_id', render: dash },
    {
      title: t('Status'),
      dataIndex: 'status',
      render: (v) => (v ? <Status status={v} text={{ ACTIVE: t('Active'), ERROR: t('Error') }[v]} /> : '-'),
    },
    {
      title: t('External Gateway'),
      dataIndex: 'external_gateway_info',
      render: (v) => yesNoTag(Boolean(v)),
    },
    {
      title: t('External Network ID/Name'),
      dataIndex: 'external_gateway_info',
      key: 'ext_net',
      render: (v) =>
        v?.network_id ? (
          <div>
            <div>{networks[v.network_id] || '-'}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{v.network_id}</div>
          </div>
        ) : (
          '-'
        ),
    },
    {
      title: t('External IP'),
      dataIndex: 'external_gateway_info',
      key: 'ext_ip',
      render: (v) =>
        v?.external_fixed_ips?.length ? v.external_fixed_ips.map((it) => <div key={it.ip_address}>{it.ip_address}</div>) : '-',
    },
    { title: t('Created At'), dataIndex: 'created_at', render: (v) => formatTime(v) },
  ].filter(Boolean);

  return (
    <div>
      <Input.Search
        allowClear
        placeholder={t('Name')}
        style={{ marginBottom: 8, maxWidth: 280 }}
        onSearch={setKeyword}
        onChange={(e) => !e.target.value && setKeyword('')}
      />
      <Table
        size="small"
        rowKey="id"
        loading={routers === null}
        dataSource={data}
        columns={columns}
        pagination={{ pageSize: 5, size: 'small' }}
        scroll={{ x: true }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: value ? [value] : [],
          getCheckboxProps: (r) => ({ disabled: disabledFunc ? disabledFunc(r) : false }),
          onChange: (keys, rows) => {
            onChange?.(keys[0]);
            onPicked?.(rows[0]);
          },
        }}
      />
    </div>
  );
}

/** Multi-select subnet table (value = array of subnet ids) */
export function SubnetSelectTable({ value, onChange, subnets, loading }) {
  return (
    <Table
      size="small"
      rowKey="id"
      loading={loading}
      dataSource={subnets || []}
      pagination={{ pageSize: 5, size: 'small' }}
      columns={[
        {
          title: t('Name'),
          dataIndex: 'name',
          render: (v, r) => (
            <div>
              <div style={{ fontWeight: 600 }}>{v || '-'}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.id}</div>
            </div>
          ),
        },
        { title: t('CIDR'), dataIndex: 'cidr', render: dash },
      ]}
      rowSelection={{
        type: 'checkbox',
        selectedRowKeys: value || [],
        onChange: (keys) => onChange?.(keys),
      }}
    />
  );
}

/** Subnet details cache for endpoint popovers / LocalSubnet */
export const fetchSubnetsByIds = (ids = []) =>
  Promise.all(
    (ids || []).map((id) =>
      neutronApi
        .getSubnet(id)
        .then((res) => res?.subnet || { id })
        .catch(() => ({ id }))
    )
  );

/** Legacy components/LocalSubnet: CIDRs of the subnets of the selected local endpoint group */
export function LocalSubnet({ form, groups }) {
  const groupId = Form.useWatch('local_ep_group_id', form);
  const [subnets, setSubnets] = useState([]);
  const [loading, setLoading] = useState(false);
  const endpoints = useMemo(() => (groups || []).find((g) => g.id === groupId)?.endpoints || [], [groups, groupId]);

  useEffect(() => {
    if (!groupId) return undefined;
    let alive = true;
    setLoading(true);
    fetchSubnetsByIds(endpoints).then((ret) => {
      if (!alive) return;
      setSubnets(ret);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [groupId, endpoints]);

  if (!groupId) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  if (loading) return <Spin />;
  return (
    <Row>
      {endpoints.map((item, idx) => (
        <Col span={24} key={`cep_${item}`}>
          {subnets[idx]?.cidr || '-'}
        </Col>
      ))}
    </Row>
  );
}

/** Peer CIDRs of the selected peer endpoint group */
export function PeerCidrs({ form, groups }) {
  const groupId = Form.useWatch('peer_ep_group_id', form);
  if (!groupId) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const endpoints = (groups || []).find((g) => g.id === groupId)?.endpoints || [];
  return (
    <Row>
      {endpoints.map((item) => (
        <Col span={24} key={item}>
          {item}
        </Col>
      ))}
    </Row>
  );
}

/** Static display used for read-only form rows (ignores Form.Item value/onChange) */
export function StaticText({ children }) {
  return <div style={{ padding: '4px 0', fontWeight: 600 }}>{children}</div>;
}

/** Endpoint popover content (legacy PopUpSubnet) */
export function PopUpSubnet({ record }) {
  const { type, endpoints = [] } = record || {};
  const [subnets, setSubnets] = useState(null);
  useEffect(() => {
    if (type !== 'cidr') {
      fetchSubnetsByIds(endpoints).then(setSubnets);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  if (type === 'cidr') {
    return (
      <Row>
        {endpoints.map((item) => (
          <Col span={24} key={`${item}_${record.id}`}>
            {item}
          </Col>
        ))}
      </Row>
    );
  }
  if (subnets === null) return <Spin />;
  return (
    <div style={{ maxWidth: 550 }}>
      {subnets.map((item) => (
        <Row gutter={24} key={`${item.id}_${record.id}`}>
          <Col span={6}>{item.name || '-'}</Col>
          <Col span={6}>{item.cidr || '-'}</Col>
          <Col span={12}>
            <CopyText value={item.id} />
          </Col>
        </Row>
      ))}
    </div>
  );
}
