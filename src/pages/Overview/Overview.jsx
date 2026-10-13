import React from 'react';
import { Card, Row, Col, Statistic, Tag, Table, Space, Button } from 'antd';
import {
  ArrowUpOutlined,
  CloudServerOutlined,
  HddOutlined,
  ClusterOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import QuotaChart from '@/components/QuotaChart';
import Status from '@/components/Status';
import { useTranslation } from '@/core/i18n';
import { useOverview } from '@/hooks/useOverview';
import { useThemeStore, THEMES } from '@/store/themeStore';

export default function Overview() {
  const { t } = useTranslation();
  const { services, stats, loading, isLiveApi, refetch } = useOverview();
  const { currentTheme } = useThemeStore();
  const isDark = currentTheme === THEMES.DARK_OPS;

  const columns = [
    {
      title: t('Cluster Services'),
      dataIndex: 'service',
      key: 'service',
      render: (text) => <b style={{ color: isDark ? '#60a5fa' : '#0068ff' }}>{text}</b>,
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Status status={s} text="Up & Active" />,
    },
    { title: 'Version', dataIndex: 'version', key: 'version' },
    {
      title: t('Response Latency'),
      dataIndex: 'latency',
      key: 'latency',
      render: (l) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{l}</span>,
    },
  ];

  return (
    <div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: isDark ? '#ffffff' : '#0f172a' }}>
              {t('Cloud Cluster Overview')}
            </h2>
            <Tag
              color={isLiveApi ? 'success' : 'blue'}
              style={{ borderRadius: 12, fontSize: 11, padding: '2px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <ApiOutlined />
              {isLiveApi ? 'Live OpenStack (10.0.29.10:9999)' : 'Proxy Ready (10.0.29.10:9999)'}
            </Tag>
          </div>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            Tình trạng sức khỏe hạ tầng OpenStack, phân bổ hạn mức tài nguyên và các dịch vụ cốt lõi.
          </p>
        </div>

        <Button icon={<ReloadOutlined />} onClick={refetch} loading={loading}>
          {t('Refresh')}
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              border: isDark ? '1px solid #1f293d' : '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <Statistic
              title={`${t('Total')} ${t('Instances')}`}
              value={stats.instances.current}
              prefix={<CloudServerOutlined style={{ color: '#0068ff' }} />}
              suffix={`/ ${stats.instances.max}`}
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ fontSize: 12, color: '#10b981', marginTop: 8 }}>
              <ArrowUpOutlined /> {stats.instances.trend} máy ảo tuần này
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              border: isDark ? '1px solid #1f293d' : '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <Statistic
              title={`${t('Storage')} (TB)`}
              value={stats.storage.current}
              precision={1}
              prefix={<HddOutlined style={{ color: '#f59e0b' }} />}
              suffix={`/ ${stats.storage.max}`}
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
              Ceph RBD Storage Pool
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              border: isDark ? '1px solid #1f293d' : '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <Statistic
              title={`${t('Networks')} & Router`}
              value={8}
              prefix={<ClusterOutlined style={{ color: '#10b981' }} />}
              suffix="Networks"
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ fontSize: 12, color: '#0068ff', marginTop: 8 }}>
              12 Floating IPs gán ngoài
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            variant="borderless"
            style={{
              borderRadius: 12,
              border: isDark ? '1px solid #1f293d' : '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <Statistic
              title="SLA Availability"
              value={99.98}
              precision={2}
              prefix={<SafetyCertificateOutlined style={{ color: '#8b5cf6' }} />}
              suffix="%"
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ fontSize: 12, color: '#10b981', marginTop: 8 }}>
              Toàn bộ Compute Nodes ổn định
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <QuotaChart
            title={`${t('Quota')}`}
            quotas={[
              { name: 'vCPUs', used: stats.vcpus.current, limit: stats.vcpus.max, unit: 'Cores' },
              { name: 'RAM (Memory)', used: stats.ram.current, limit: stats.ram.max, unit: 'GB' },
              { name: 'Storage (Cinder Pool)', used: 3.4, limit: 10, unit: 'TB' },
              { name: 'Floating IPs (Public)', used: 12, limit: 20, unit: 'IPs' },
            ]}
          />
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={t('Core Services Status')}
            variant="borderless"
            style={{
              borderRadius: 12,
              border: isDark ? '1px solid #1f293d' : '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <Table
              columns={columns}
              dataSource={services}
              pagination={false}
              size="small"
              loading={loading}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
