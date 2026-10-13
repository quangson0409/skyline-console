import React from 'react';
import { Row, Col, Button, Badge, Table, Skeleton, Empty, theme } from 'antd';
import {
  ReloadOutlined,
  AppstoreAddOutlined,
  UserOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  HddOutlined,
  ClusterOutlined,
  ApartmentOutlined,
  SafetyOutlined,
  GlobalOutlined,
  CheckCircleTwoTone,
  CloseCircleTwoTone,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/core/i18n';
import { hasEndpoint } from '@/api/endpoints';
import { useAdminOverview } from '@/hooks/useOverview';
import { OverviewCard, UsageCircle, NO_VALUE, isNum } from './components';

const show = (v) => (isNum(v) ? v : NO_VALUE);

/** legacy resources/nova/service serviceState */
const serviceStateText = (t, state) => ({ up: t('Up'), down: t('Down') }[state] || state || NO_VALUE);

function StateCell({ up, text }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {up ? <CheckCircleTwoTone twoToneColor="#52c41a" /> : <CloseCircleTwoTone twoToneColor="#ff4d4f" />}
      <span style={{ marginLeft: 8 }}>{text}</span>
    </span>
  );
}

/** Legacy AdminOverview/components/PlatformInfo */
function PlatformInfo({ t, platform }) {
  const { token } = theme.useToken();
  const items = [
    { key: 'projectNum', label: t('Projects'), icon: <AppstoreAddOutlined />, to: '/identity/project-admin' },
    { key: 'userNum', label: t('Users'), icon: <UserOutlined />, to: '/identity/user-admin' },
    { key: 'nodeNum', label: t('Nodes'), icon: <DatabaseOutlined />, to: '/compute/hypervisors-admin?tab=ComputeHost' },
  ];
  return (
    <OverviewCard title={t('Platform Info')} className="ov-platform-info">
      {platform.loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <Row gutter={[16, 16]}>
          {items.map((it) => (
            <Col key={it.key} xs={24} sm={8}>
              <Link to={it.to} data-platform={it.key} style={{ display: 'block', textAlign: 'center', color: token.colorText }}>
                <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.2 }}>{show(platform.data?.[it.key])}</div>
                <div style={{ fontSize: 14, color: token.colorTextSecondary }}>
                  {it.icon} {it.label}
                </div>
              </Link>
            </Col>
          ))}
        </Row>
      )}
    </OverviewCard>
  );
}

/** Legacy AdminOverview/components/VirtualResource (ResourceCircle) */
function VirtualResourcesUsed({ t, usage }) {
  const d = usage.data;
  const circles = [
    { key: 'cpu', label: t('CPU Usage (Core)'), used: d?.vcpus_used, total: d?.vcpus },
    { key: 'mem', label: t('Memory Usage (GiB)'), used: d?.memory_mb_used, total: d?.memory_mb },
  ];
  if (d?.hasDisk) {
    circles.push({ key: 'disk', label: t('Local Disk Usage (GiB)'), used: d.local_gb_used, total: d.local_gb });
  }
  const span = 24 / circles.length;
  return (
    <OverviewCard title={t('Virtual Resources Used')} className="ov-virtual-used">
      {usage.loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : !d ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={NO_VALUE} />
      ) : (
        <Row gutter={[16, 24]}>
          {circles.map((c) => (
            <Col key={c.key} xs={24} md={span}>
              <UsageCircle label={c.label} used={c.used} total={c.total} t={t} />
            </Col>
          ))}
        </Row>
      )}
    </OverviewCard>
  );
}

/** Legacy AdminOverview/components/ResourceOverview (virtualResourceInfo) */
function VirtualResourceOverview({ t, resources }) {
  const { token } = theme.useToken();
  const d = resources.data || {};
  const statusColors = {
    active: token.colorSuccess,
    error: token.colorError,
    idle: token.colorFillSecondary,
    other: token.colorWarning,
  };
  const instanceStatus = [
    { key: 'active', text: t('Active'), color: statusColors.active },
    { key: 'error', text: t('Error'), color: statusColors.error },
    { key: 'shutoff', text: t('Shutoff'), color: statusColors.idle },
    { key: 'other', text: t('Others'), color: statusColors.other },
  ];
  const volumeStatus = [
    { key: 'active', text: t('Attached'), color: statusColors.active },
    { key: 'error', text: t('Error'), color: statusColors.error },
    { key: 'available', text: t('Unattached'), color: statusColors.idle },
    { key: 'other', text: t('Others'), color: statusColors.other },
  ];
  const big = [
    { key: 'serviceNum', label: t('Instances'), icon: <CloudServerOutlined />, to: '/compute/instance-admin', status: instanceStatus },
    hasEndpoint('cinder')
      ? { key: 'volumeNum', label: t('Volumes'), icon: <HddOutlined />, to: '/storage/volume-admin', status: volumeStatus }
      : null,
  ].filter(Boolean);
  const small = hasEndpoint('neutron')
    ? [
        { key: 'networkNum', label: t('Network'), icon: <ClusterOutlined />, to: '/network/networks-admin' },
        { key: 'routerNum', label: t('Router'), icon: <ApartmentOutlined />, to: '/network/router-admin' },
        { key: 'securityGroupNum', label: t('Security Group'), icon: <SafetyOutlined />, to: '/network/security-group-admin' },
        { key: 'floatingIpNum', label: t('Floating IPs'), icon: <GlobalOutlined />, to: '/network/floatingip-admin' },
      ]
    : [];
  const iconBox = (icon) => (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        color: token.colorPrimary,
        background: token.colorPrimaryBg,
      }}
    >
      {icon}
    </div>
  );
  const tile = { border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10, padding: 16, height: '100%' };

  return (
    <OverviewCard title={t('Virtual Resource Overview')} className="ov-resource-overview">
      {resources.loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {big.map((b) => {
              const r = d[b.key];
              return (
                <Col key={b.key} xs={24} md={24 / big.length}>
                  <Link to={b.to} data-resource={b.key} style={{ color: token.colorText, display: 'block', height: '100%' }}>
                    <div style={{ ...tile, display: 'flex', gap: 16 }}>
                      {iconBox(b.icon)}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: token.colorTextSecondary }}>{b.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 700 }}>{show(r?.all)}</div>
                        <Row gutter={[8, 4]}>
                          {b.status.map((s) => (
                            <Col key={s.key} span={12}>
                              <Badge color={s.color} text={s.text} /> <b style={{ marginLeft: 4 }}>{show(r?.[s.key])}</b>
                            </Col>
                          ))}
                        </Row>
                      </div>
                    </div>
                  </Link>
                </Col>
              );
            })}
          </Row>
          {small.length ? (
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              {small.map((s) => (
                <Col key={s.key} xs={12} lg={6}>
                  <Link to={s.to} data-resource={s.key} style={{ color: token.colorText, display: 'block' }}>
                    <div style={{ ...tile, display: 'flex', alignItems: 'center', gap: 12 }}>
                      {iconBox(s.icon)}
                      <div>
                        <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{show(d[s.key])}</div>
                      </div>
                    </div>
                  </Link>
                </Col>
              ))}
            </Row>
          ) : null}
        </>
      )}
    </OverviewCard>
  );
}

export default function AdminOverview() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { platform, usage, resources, computeServices, networkAgents, loading, refetch } = useAdminOverview();

  const computeColumns = [
    { title: t('Service'), dataIndex: 'binary', key: 'binary', render: (v) => <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{v || NO_VALUE}</span> },
    { title: t('Host'), dataIndex: 'host', key: 'host', render: (v) => v || NO_VALUE },
    { title: t('Availability Zone'), dataIndex: 'zone', key: 'zone', render: (v) => v || NO_VALUE },
    { title: t('Service Status'), dataIndex: 'status', key: 'status', render: (v) => (v === 'enabled' ? t('Enabled') : v === 'disabled' ? t('Disabled') : v || NO_VALUE) },
    {
      title: t('Service State'),
      dataIndex: 'state',
      key: 'state',
      render: (v) => (v ? <StateCell up={v === 'up'} text={serviceStateText(t, v)} /> : NO_VALUE),
    },
  ];
  const networkColumns = [
    { title: t('Service'), dataIndex: 'binary', key: 'binary', render: (v) => <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{v || NO_VALUE}</span> },
    { title: t('Host'), dataIndex: 'host', key: 'host', render: (v) => v || NO_VALUE },
    { title: t('Availability Zone'), dataIndex: 'availability_zone', key: 'az', render: (v) => v || NO_VALUE },
    {
      title: t('Service State'),
      dataIndex: 'alive',
      key: 'alive',
      render: (v) => (typeof v === 'boolean' ? <StateCell up={v} text={v ? t('Up') : t('Down')} /> : NO_VALUE),
    },
  ];
  const rowKey = (r, i) => r.id || `${r.binary}-${r.host}-${i}`;

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
          <p style={{ color: token.colorTextSecondary, fontSize: 13, margin: '4px 0 0' }}>{t('Administrator')}</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={refetch} loading={loading}>
          {t('Refresh')}
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <PlatformInfo t={t} platform={platform} />
        </Col>
        <Col span={24}>
          <VirtualResourcesUsed t={t} usage={usage} />
        </Col>
        <Col span={24}>
          <VirtualResourceOverview t={t} resources={resources} />
        </Col>
        <Col xs={24} xl={hasEndpoint('neutron') ? 12 : 24}>
          <OverviewCard title={t('Compute Service')} className="ov-compute-service">
            <Table
              size="small"
              columns={computeColumns}
              dataSource={computeServices.data || []}
              loading={computeServices.loading}
              rowKey={rowKey}
              pagination={(computeServices.data || []).length > 10 ? { pageSize: 10, size: 'small' } : false}
              scroll={{ x: true }}
            />
          </OverviewCard>
        </Col>
        {hasEndpoint('neutron') ? (
          <Col xs={24} xl={12}>
            <OverviewCard title={t('Network Service')} className="ov-network-service">
              <Table
                size="small"
                columns={networkColumns}
                dataSource={networkAgents.data || []}
                loading={networkAgents.loading}
                rowKey={rowKey}
                pagination={(networkAgents.data || []).length > 10 ? { pageSize: 10, size: 'small' } : false}
                scroll={{ x: true }}
              />
            </OverviewCard>
          </Col>
        ) : null}
      </Row>
    </div>
  );
}
