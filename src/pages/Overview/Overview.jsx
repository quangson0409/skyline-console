import React, { useMemo } from 'react';
import { Row, Col, Button, Descriptions, Tag, Badge, List, Skeleton, Empty, theme } from 'antd';
import {
  ReloadOutlined,
  CloudServerOutlined,
  HddOutlined,
  ClusterOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/core/i18n';
import { useProjectOverview } from '@/hooks/useOverview';
import { useAuthStore } from '@/store/authStore';
import { OverviewCard, QuotaItem, LabelWithTip, useQuotaColors, NO_VALUE, isNum } from './components';

/** Legacy Overview quota card definitions (QuotaOverview.quotaCardList & friends) */
const buildQuotaCards = (t, services) => {
  const firewallQuota = services.firewall
    ? [
        { text: t('Firewalls'), key: 'firewall_group' },
        { text: t('Firewall Policies'), key: 'firewall_policy' },
        { text: t('Firewall Rules'), key: 'firewall_rule' },
      ]
    : [];
  const cards = [
    {
      text: t('Compute'),
      type: 'compute',
      value: [
        { text: t('Instances'), key: 'instances' },
        { text: t('vCPUs'), key: 'cores' },
        {
          text: t('Memory (GiB)'),
          key: 'ram',
          hint: (q) =>
            q && isNum(q.limit_mb)
              ? `${q.in_use_mb ?? 0} / ${q.limit_mb === -1 ? t('Unlimit') : q.limit_mb} MiB`
              : null,
        },
        {
          text: <LabelWithTip label={t('Key Pairs')} tip={t('The number of allowed key pairs for each user.')} />,
          key: 'key_pairs',
        },
        { text: t('Server Groups'), key: 'server_groups' },
      ],
    },
  ];
  if (services.cinder) {
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
      ...firewallQuota,
    ],
  });
  if (services.share) {
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
  if (services.zun) {
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
  if (services.magnum) {
    cards.push({
      text: t('Clusters Management'),
      type: 'magnum',
      value: [{ text: t('Clusters'), key: 'magnum_cluster' }],
    });
  }
  if (services.trove) {
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

/** Legacy getVolumeTypeCards */
const buildVolumeTypeRows = (t, volumeTypes) =>
  volumeTypes.map((item, index) => ({
    index,
    name: item.name,
    value: [
      { text: t('{name} type', { name: item.name }), key: `volumes_${item.name}` },
      { text: t('{name} type capacity (GiB)', { name: item.name }), key: `gigabytes_${item.name}` },
      { text: t('{name} type snapshots', { name: item.name }), key: `snapshots_${item.name}` },
    ],
  }));

function SectionTitle({ children }) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: token.colorTextSecondary,
        margin: '4px 0 8px',
      }}
    >
      {children}
    </div>
  );
}

export default function Overview() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { quota, volumeTypes, services, loading, refetch } = useProjectOverview();
  const user = useAuthStore((s) => s.user);
  const currentProject = useAuthStore((s) => s.currentProject);
  const quotaColors = useQuotaColors();

  const cards = useMemo(() => buildQuotaCards(t, services), [t, services]);
  const volumeTypeRows = useMemo(() => buildVolumeTypeRows(t, volumeTypes), [t, volumeTypes]);

  // Legacy Overview action buttons (Volumes hidden without cinder), with the in-use count from quota usage
  const actions = [
    { key: 'instance', label: t('Instances'), icon: <CloudServerOutlined />, to: '/compute/instance', quotaKey: 'instances' },
    services.cinder
      ? { key: 'volume', label: t('Volumes'), icon: <HddOutlined />, to: '/storage/volume', quotaKey: 'volumes' }
      : null,
    { key: 'network', label: t('Networks'), icon: <ClusterOutlined />, to: '/network/networks', quotaKey: 'network' },
    { key: 'router', label: t('Routers'), icon: <ApartmentOutlined />, to: '/network/router', quotaKey: 'router' },
  ].filter(Boolean);
  const actionSpan = 24 / actions.length;

  // legacy rootStore.roles = project roles of the token
  const roleNames = (user?.roles || []).map((r) => (typeof r === 'string' ? r : r?.name)).filter(Boolean);

  const legend = [
    { key: 'normal', color: quotaColors.normal, text: t('Normal') },
    { key: 'danger', color: quotaColors.danger, text: t('Danger') },
    { key: 'full', color: quotaColors.full, text: t('Full') },
  ];

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0, color: token.colorText }}>
            {t('Overview')}
          </h1>
          <p style={{ color: token.colorTextSecondary, fontSize: 13, margin: '4px 0 0' }}>
            {t('Project')}: {currentProject?.displayName || currentProject?.name || NO_VALUE}
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={refetch} loading={loading}>
          {t('Refresh')}
        </Button>
      </div>

      {/* Quick links (legacy action buttons) + current usage from the quota API */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {actions.map((a) => {
          const q = quota[a.quotaKey];
          return (
            <Col key={a.key} xs={12} md={actionSpan}>
              <Link to={a.to} className="ov-action" data-action={a.key}>
                <OverviewCard hoverable styles={{ body: { padding: 16 } }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 22,
                        color: token.colorPrimary,
                        background: token.colorPrimaryBg,
                        flex: 'none',
                      }}
                    >
                      {a.icon}
                    </div>
                    <div>
                      <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>{a.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: token.colorText }}>
                        {!loading && isNum(q?.used) ? q.used : NO_VALUE}
                      </div>
                    </div>
                  </div>
                </OverviewCard>
              </Link>
            </Col>
          );
        })}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <OverviewCard
            className="ov-quota-overview"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span>{t('Quota Overview')}</span>
                {legend.map((l) => (
                  <Badge
                    key={l.key}
                    color={l.color}
                    text={<span style={{ fontWeight: 400, fontSize: 12 }}>{l.text}</span>}
                  />
                ))}
              </div>
            }
          >
            {loading ? (
              <Skeleton active paragraph={{ rows: 10 }} />
            ) : (
              <>
                {cards.map((card) => (
                  <div key={card.type} className={`ov-quota-card ov-quota-${card.type}`} style={{ marginBottom: 20 }}>
                    <SectionTitle>{card.text}</SectionTitle>
                    <Row gutter={[32, 4]}>
                      {card.value.map((item) => (
                        <Col key={item.key} xs={24} md={12}>
                          <QuotaItem data={quota} item={item} t={t} />
                        </Col>
                      ))}
                    </Row>
                  </div>
                ))}
                {services.cinder ? (
                  <div className="ov-quota-card ov-quota-volumeTypes">
                    <SectionTitle>{t('Storage Types')}</SectionTitle>
                    {volumeTypeRows.length ? (
                      <List
                        split
                        pagination={volumeTypeRows.length > 5 ? { pageSize: 5, size: 'small' } : false}
                        dataSource={volumeTypeRows}
                        renderItem={(row) => (
                          <List.Item key={row.index} style={{ display: 'block', padding: '8px 0' }}>
                            <Row gutter={[16, 4]}>
                              {row.value.map((i) => (
                                <Col key={i.key} xs={24} md={8}>
                                  <QuotaItem data={quota} item={i} t={t} compact />
                                </Col>
                              ))}
                            </Row>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </div>
                ) : null}
              </>
            )}
          </OverviewCard>
        </Col>

        <Col xs={24} xl={8}>
          <OverviewCard
            className="ov-project-info"
            title={user?.username ? t('Hello, {name}', { name: user.username }) : t('Project Info')}
            style={{ height: 'auto' }}
          >
            <Descriptions column={1} size="small" styles={{ label: { color: token.colorTextSecondary } }}>
              <Descriptions.Item label={t('User Account')}>{user?.username || NO_VALUE}</Descriptions.Item>
              <Descriptions.Item label={t('My Role')}>
                {roleNames.length ? (
                  <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                    {roleNames.map((r) => (
                      <Tag key={r} style={{ marginInlineEnd: 0 }}>
                        {r}
                      </Tag>
                    ))}
                  </span>
                ) : (
                  NO_VALUE
                )}
              </Descriptions.Item>
              <Descriptions.Item label={t('Domain')}>{user?.domain || NO_VALUE}</Descriptions.Item>
              <Descriptions.Item label={t('Project Name')}>{currentProject?.name || NO_VALUE}</Descriptions.Item>
              <Descriptions.Item label={t('Project ID')}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                  {currentProject?.id || NO_VALUE}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label={t('Project Domain')}>
                {currentProject?.domainName || NO_VALUE}
              </Descriptions.Item>
            </Descriptions>
          </OverviewCard>
        </Col>
      </Row>
    </div>
  );
}
