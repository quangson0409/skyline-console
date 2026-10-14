import React, { useEffect, useState } from 'react';
import { Badge, Card, Col, Empty, Form, InputNumber, List, Row, Spin, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { quotaApi } from '@/api/quota';
import { hasEndpoint, loadEndpoints } from '@/api/endpoints';
import { t } from '@/core/i18n';
import { hasAdminOnlyRole } from '../common';
import { updateQuotaData } from '@/components/Quota/utils';
import { QuotaItem as OverviewQuotaItem, useQuotaColors } from '@/pages/Overview/components';

/* Port of legacy stores/keystone/project.js quota logic + QuotaOverview card definitions */

export const enabledServices = () => ({
  cinder: hasEndpoint('cinder'),
  share: hasEndpoint('manilav2'),
  zun: hasEndpoint('zun'),
  magnum: hasEndpoint('magnum'),
  trove: hasEndpoint('trove') && hasAdminOnlyRole(),
  firewall: Boolean(loadEndpoints().neutron_firewall),
});

const keyPairTitle = () => (
  <span>
    {t('Key Pairs')}
    <Tooltip title={t('The number of allowed key pairs for each user.')}>
      <QuestionCircleOutlined style={{ marginLeft: 4 }} />
    </Tooltip>
  </span>
);

/** legacy quotaCardList + share/zun/magnum/trove cards */
export const quotaCards = (svc = enabledServices()) => {
  const cards = [
    {
      text: t('Compute'),
      type: 'compute',
      value: [
        { text: t('Instances'), key: 'instances' },
        { text: t('vCPUs'), key: 'cores' },
        { text: t('Memory (GiB)'), key: 'ram' },
        { text: keyPairTitle(), key: 'key_pairs' },
        { text: t('Server Groups'), key: 'server_groups' },
      ],
    },
  ];
  if (svc.cinder) {
    cards.push({
      text: t('Storage'),
      type: 'storage',
      value: [
        { text: t('Volumes'), key: 'volumes' },
        { text: t('Volume Capacity (GiB)'), key: 'gigabytes' },
        { text: t('Volume Snapshots'), key: 'snapshots' },
        { text: t('Volume Backups'), key: 'backups' },
        { text: t('Volume Backup Capacity (GiB)'), key: 'backup_gigabytes' },
      ],
    });
  }
  cards.push({
    text: t('Network'),
    type: 'networks',
    value: [
      { text: t('Routers'), key: 'router' },
      { text: t('Networks'), key: 'network' },
      { text: t('Subnets'), key: 'subnet' },
      { text: t('Floating IPs'), key: 'floatingip' },
      { text: t('Ports'), key: 'port' },
      { text: t('Security Groups'), key: 'security_group' },
      { text: t('Security Group Rules'), key: 'security_group_rule' },
      ...(svc.firewall
        ? [
            { text: t('Firewalls'), key: 'firewall_group' },
            { text: t('Firewall Policies'), key: 'firewall_policy' },
            { text: t('Firewall Rules'), key: 'firewall_rule' },
          ]
        : []),
    ],
  });
  if (svc.share) {
    cards.push({
      text: t('Share'),
      type: 'share',
      value: [
        { text: t('Shares'), key: 'shares' },
        { text: t('Share Capacity (GiB)'), key: 'share_gigabytes' },
        { text: t('Share Networks'), key: 'share_networks' },
        { text: t('Share Groups'), key: 'share_groups' },
      ],
    });
  }
  if (svc.zun) {
    cards.push({
      text: t('Containers Management'),
      type: 'zun',
      value: [
        { text: t('Containers'), key: 'zun_containers' },
        { text: t('Containers CPU'), key: 'zun_cpu' },
        { text: t('Containers Memory (MiB)'), key: 'zun_memory' },
        { text: t('Containers Disk (GiB)'), key: 'zun_disk' },
      ],
    });
  }
  if (svc.magnum) {
    cards.push({ text: t('Clusters Management'), type: 'magnum', value: [{ text: t('Clusters'), key: 'magnum_cluster' }] });
  }
  if (svc.trove) {
    cards.push({
      text: t('Databases'),
      type: 'trove',
      value: [
        { text: t('Database Instances'), key: 'trove_instances' },
        { text: t('Database Disk (GiB)'), key: 'trove_volumes' },
      ],
    });
  }
  return cards;
};

/** legacy getVolumeTypeCards */
export const volumeTypeCard = (types = []) => ({
  text: t('Storage Types'),
  type: 'volumeTypes',
  value: types.flatMap((item) => [
    { text: t('{name} type', { name: item.name }), key: `volumes_${item.name}` },
    { text: t('{name} type capacity (GiB)', { name: item.name }), key: `gigabytes_${item.name}` },
    { text: t('{name} type snapshots', { name: item.name }), key: `snapshots_${item.name}` },
  ]),
});

const getGiBValue = (input) => {
  const n = Number(input);
  if (!input || Number.isNaN(n)) return 0;
  return parseFloat((n / 1024).toFixed(2));
};

/** legacy fetchProjectVolumeTypes: public types + private types this project can access */
export const fetchProjectVolumeTypes = async (projectId) => {
  const res = await quotaApi.listVolumeTypes().catch(() => ({}));
  const types = res?.volume_types || [];
  const privateTypes = types.filter((it) => !it.is_public);
  if (!privateTypes.length) return types;
  const projectTypes = types.filter((it) => it.is_public);
  const access = await Promise.all(privateTypes.map((it) => quotaApi.getVolumeTypeAccess(it.id).catch(() => ({}))));
  access.forEach((r) => {
    const item = (r?.volume_type_access || []).find((a) => a.project_id === projectId);
    if (item) {
      const type = types.find((tp) => tp.id === item.volume_type_id);
      if (type) projectTypes.push(type);
    }
  });
  return projectTypes;
};

/** legacy fetchProjectQuota */
export const fetchProjectQuota = async (projectId, svc = enabledServices()) => {
  const opt = (cond, fn) => (cond ? fn().catch(() => null) : Promise.resolve(null));
  const [nova, neutron, cinder, share, zun, magnum, magnumClusters, trove] = await Promise.all([
    quotaApi.getNovaQuota(projectId).catch(() => ({})),
    quotaApi.getNeutronQuota(projectId).catch(() => ({})),
    opt(svc.cinder, () => quotaApi.getCinderQuota(projectId)),
    opt(svc.share, () => quotaApi.getShareQuota(projectId)),
    opt(svc.zun, () => quotaApi.getZunQuota(projectId)),
    opt(svc.magnum, () => quotaApi.getMagnumQuota(projectId)),
    opt(svc.magnum, () => quotaApi.listMagnumClusters()),
    opt(svc.trove, () => quotaApi.getTroveQuota(projectId)),
  ]);
  const novaQuota = { ...(nova?.quota_set || {}) };
  if (novaQuota.ram && typeof novaQuota.ram === 'object') {
    const { limit = 0, in_use = 0, reserved = 0 } = novaQuota.ram;
    novaQuota.ram = { in_use: getGiBValue(in_use), limit: limit === -1 ? limit : getGiBValue(limit), reserved: getGiBValue(reserved) };
  }
  const shareQuota = share?.quota_set || {};
  const renameShare = Object.keys(shareQuota).reduce((acc, k) => {
    acc[!k.includes('share') ? `share_${k}` : k] = shareQuota[k];
    return acc;
  }, {});
  const zunQuota = zun || {};
  const renameZun = Object.keys(zunQuota).reduce((acc, k) => {
    acc[`zun_${k}`] = zunQuota[k];
    return acc;
  }, {});
  const magnumQuota = svc.magnum
    ? {
        magnum_cluster: { limit: magnum?.hard_limit, in_use: (magnumClusters?.clusters || []).length },
        magnum_cluster_id: magnum?.id,
      }
    : {};
  const renameTrove = (trove?.quotas || []).reduce((acc, cur) => {
    acc[`trove_${cur.resource}`] = cur;
    return acc;
  }, {});
  return updateQuotaData({
    ...novaQuota,
    ...(cinder?.quota_set || {}),
    ...(neutron?.quota || {}),
    ...renameShare,
    ...renameZun,
    ...magnumQuota,
    ...renameTrove,
  });
};

const omitNil = (obj) =>
  Object.keys(obj).reduce((acc, k) => {
    if (obj[k] !== undefined && obj[k] !== null) acc[k] = obj[k];
    return acc;
  }, {});

const isEmpty = (o) => !o || Object.keys(o).length === 0;

/** legacy updateQuota: split the form values into per-service bodies */
export const updateProjectQuota = async (projectId, data, currentQuota = {}, svc = enabledServices()) => {
  const { instances, cores, ram, server_groups, server_group_members, key_pairs } = data;
  const nova = omitNil({
    instances,
    cores,
    ram: ram && ram !== -1 ? ram * 1024 : ram,
    server_groups,
    server_group_members,
    key_pairs,
  });
  let cinder = {};
  if (svc.cinder) {
    const { backups, ...others } = data;
    const rest = {};
    Object.keys(others).forEach((key) => {
      if (
        (key.includes('volumes') || key.includes('gigabytes') || key.includes('snapshots')) &&
        !key.includes('share') &&
        !key.includes('trove')
      ) {
        rest[key] = others[key];
      }
    });
    cinder = omitNil({ backups, ...rest });
  }
  const neutron = omitNil({
    network: data.network,
    router: data.router,
    subnet: data.subnet,
    floatingip: data.floatingip,
    security_group: data.security_group,
    security_group_rule: data.security_group_rule,
    port: data.port,
    firewall_group: data.firewall_group,
    firewall_policy: data.firewall_policy,
    firewall_rule: data.firewall_rule,
  });
  const share = svc.share
    ? omitNil({
        shares: data.shares,
        gigabytes: data.share_gigabytes,
        share_networks: data.share_networks,
        share_groups: data.share_groups,
      })
    : {};
  const zun = svc.zun
    ? omitNil({ containers: data.zun_containers, cpu: data.zun_cpu, memory: data.zun_memory, disk: data.zun_disk })
    : {};
  const magnum = svc.magnum
    ? omitNil({ project_id: projectId, resource: 'Cluster', hard_limit: data.magnum_cluster })
    : {};
  const trove = svc.trove ? omitNil({ instances: data.trove_instances, volumes: data.trove_volumes }) : {};

  const reqs = [];
  if (!isEmpty(nova)) reqs.push(quotaApi.updateNovaQuota(projectId, { quota_set: nova }));
  if (!isEmpty(cinder)) reqs.push(quotaApi.updateCinderQuota(projectId, { quota_set: cinder }));
  if (!isEmpty(neutron)) reqs.push(quotaApi.updateNeutronQuota(projectId, { quota: neutron }));
  if (!isEmpty(share)) reqs.push(quotaApi.updateShareQuota(projectId, { quota_set: share }));
  if (!isEmpty(zun)) reqs.push(quotaApi.updateZunQuota(projectId, zun));
  if (svc.magnum && magnum.hard_limit !== undefined) {
    // magnum_cluster_id present means the quota has been initialized
    reqs.push(
      currentQuota.magnum_cluster_id
        ? quotaApi.updateMagnumQuota(projectId, magnum)
        : quotaApi.createMagnumQuota(magnum)
    );
  }
  if (!isEmpty(trove)) reqs.push(quotaApi.updateTroveQuota(projectId, { quotas: trove }));
  return Promise.all(reqs);
};

/* ------------------------------- UI ------------------------------- */

/** legacy QuotaOverview card (title + Normal/Danger/Full legend; >=80% danger, >=90% full) */
export function QuotaOverview({ projectId, refreshKey }) {
  const colors = useQuotaColors();
  const [state, setState] = useState({ loading: true, quota: {}, types: [] });
  useEffect(() => {
    let alive = true;
    const svc = enabledServices();
    setState((s) => ({ ...s, loading: true }));
    Promise.all([fetchProjectQuota(projectId, svc), svc.cinder ? fetchProjectVolumeTypes(projectId) : []])
      .then(([quota, types]) => alive && setState({ loading: false, quota, types }))
      .catch(() => alive && setState({ loading: false, quota: {}, types: [] }));
    return () => {
      alive = false;
    };
  }, [projectId, refreshKey]);

  const { loading, quota, types } = state;
  const cards = [...quotaCards()];
  const showTypes = enabledServices().cinder;
  const typeRows = volumeTypeCard(types).value.reduce((rows, item, idx) => {
    if (idx % 3 === 0) rows.push({ index: idx / 3, value: [] });
    rows[rows.length - 1].value.push(item);
    return rows;
  }, []);
  const legend = [
    { key: 'normal', color: colors.normal, text: t('Normal') },
    { key: 'danger', color: colors.danger, text: t('Danger') },
    { key: 'full', color: colors.full, text: t('Full') },
  ];

  return (
    <Card
      size="small"
      className="project-quota-overview"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span>{t('Quota Overview')}</span>
          {legend.map((l) => (
            <Badge key={l.key} color={l.color} text={<span style={{ fontWeight: 400, fontSize: 12 }}>{l.text}</span>} />
          ))}
        </div>
      }
    >
      <Spin spinning={loading}>
        {!loading && !Object.keys(quota).length ? (
          <Empty />
        ) : (
          <Row gutter={[16, 16]}>
            {cards.map((card) => (
              <Col key={card.type} xs={24} md={12} xl={8}>
                <Card size="small" title={card.text} style={{ height: '100%' }}>
                  {card.value.map((it) => (
                    <OverviewQuotaItem key={it.key} item={it} data={quota} t={t} compact />
                  ))}
                </Card>
              </Col>
            ))}
            {showTypes ? (
              <Col key="volumeTypes" span={24}>
                <Card size="small" title={t('Storage Types')}>
                  {typeRows.length ? (
                    <List
                      split
                      pagination={typeRows.length > 5 ? { pageSize: 5, size: 'small' } : false}
                      dataSource={typeRows}
                      renderItem={(row) => (
                        <List.Item key={row.index} style={{ display: 'block', padding: '8px 0' }}>
                          <Row gutter={[16, 4]}>
                            {row.value.map((i) => (
                              <Col key={i.key} xs={24} md={8}>
                                <OverviewQuotaItem data={quota} item={i} t={t} compact />
                              </Col>
                            ))}
                          </Row>
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Card>
              </Col>
            ) : null}
          </Row>
        )}
      </Spin>
    </Card>
  );
}

const quotaRule = (quota, key) => ({
  validator: (_, value) => {
    const used = quota?.[key]?.used ?? 0;
    // legacy ManageQuota checkMin: an empty value fails the integer test
    if (value === undefined || value === null || value === '') {
      if (!quota?.[key]) return Promise.resolve();
      return Promise.reject(
        new Error(t('Invalid: Quota value(s) cannot be less than the current usage value(s): { used } used.', { used }))
      );
    }
    if ((value < used && value !== -1) || !/^-?\d+$/.test(String(value))) {
      return Promise.reject(
        new Error(t('Invalid: Quota value(s) cannot be less than the current usage value(s): { used } used.', { used }))
      );
    }
    return Promise.resolve();
  },
});

/** One quota card rendered as a 2-column grid of nested Form.Items (ignores injected value/onChange) */
const QuotaCardFields = ({ card, quota }) => (
  <div>
    <div style={{ textAlign: 'center', fontWeight: 700, margin: '4px 0 12px', borderBottom: '1px solid #e2e8f0' }}>
      {card.text}
    </div>
    <Row gutter={16}>
      {card.value.map((it) => (
        <Col span={12} key={it.key}>
          <Form.Item
            name={it.key}
            label={it.text}
            rules={[quotaRule(quota, it.key)]}
            extra={it.tip}
            style={{ marginBottom: 12 }}
          >
            <InputNumber min={it.min ?? -1} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      ))}
    </Row>
  </div>
);

/** legacy Project/actions/ManageQuota */
export const manageQuotaAction = () => {
  const cache = {};
  const load = (item) => {
    if (!cache[item.id]) {
      const svc = enabledServices();
      cache[item.id] = Promise.all([
        fetchProjectQuota(item.id, svc),
        svc.cinder ? fetchProjectVolumeTypes(item.id) : [],
      ]).then(([quota, types]) => ({ quota, types, svc }));
    }
    return cache[item.id];
  };
  const cardsFor = (svc, types) => {
    const cards = quotaCards(svc).map((c) => ({ ...c, value: [...c.value] }));
    const compute = cards.find((c) => c.type === 'compute');
    compute.value.push({ text: t('Members of Each Server Group'), key: 'server_group_members' });
    const magnum = cards.find((c) => c.type === 'magnum');
    if (magnum) {
      magnum.value = magnum.value.map((v) => ({
        ...v,
        min: 1,
        tip: t('The limit of cluster instance greater than or equal to 1.'),
      }));
    }
    // legacy order: compute, networks, share, zun, magnum, trove, storage, advanced(volume types)
    const order = ['compute', 'networks', 'share', 'zun', 'magnum', 'trove', 'storage'];
    cards.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    return { cards, typeCard: svc.cinder ? volumeTypeCard(types) : null };
  };
  return {
    id: 'quota-management',
    type: 'modal',
    policy: ['os_compute_api:os-quota-sets:update', 'os_compute_api:os-quota-sets:defaults'],
    title: t('Edit Quota'),
    width: 860,
    description: t('Quota set to -1 means there is no quota limit on the current resource.'),
    getFormItems: async (item) => {
      delete cache[item.id]; // always reload when the modal opens
      const { quota, types, svc } = await load(item);
      const { cards, typeCard } = cardsFor(svc, types);
      const items = cards.map((card) => ({
        name: `_card_${card.type}`,
        render: () => <QuotaCardFields card={card} quota={quota} />,
      }));
      if (typeCard) {
        items.push({ name: 'more', label: t('Advanced Options'), type: 'switch' });
        if (typeCard.value.length) {
          items.push({
            name: `_card_${typeCard.type}`,
            visible: (values) => Boolean(values.more),
            render: () => <QuotaCardFields card={typeCard} quota={quota} />,
          });
        }
      }
      return items;
    },
    getDefaultValues: async (item) => {
      const { quota, types, svc } = await load(item);
      const { cards, typeCard } = cardsFor(svc, types);
      const keys = [...cards, ...(typeCard ? [typeCard] : [])].flatMap((c) => c.value.map((v) => v.key));
      const init = { more: false };
      keys.forEach((k) => {
        if (quota[k]) init[k] = quota[k].limit;
      });
      return init;
    },
    onSubmit: async (values, item) => {
      const { quota, svc } = await load(item);
      const data = Object.keys(values).reduce((acc, k) => {
        if (!k.startsWith('_') && k !== 'more') acc[k] = values[k];
        return acc;
      }, {});
      const res = await updateProjectQuota(item.id, data, quota, svc);
      delete cache[item.id];
      return res;
    },
  };
};
