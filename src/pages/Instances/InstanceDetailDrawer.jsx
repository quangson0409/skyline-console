import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
  Tabs,
  Descriptions,
  Tag,
  Space,
  Button,
  Table,
  Badge,
  Dropdown,
  Modal,
  Spin,
  Alert,
  Tooltip,
} from 'antd';
import {
  DesktopOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  LockOutlined,
  UnlockOutlined,
  DeleteOutlined,
  CodeOutlined,
  MoreOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { novaApi } from '@/api/nova';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/core/i18n';
import Status from '@/components/Status';

export default function InstanceDetailDrawer({
  instance,
  open,
  onClose,
  onRefresh,
  onStart,
  onStop,
  onReboot,
  onLock,
  onUnlock,
  onConsole,
  onMigrate,
  onLiveMigrate,
  onResetState,
  onDelete,
}) {
  const { t } = useTranslation();
  const { hasAdminRole, user } = useAuthStore();
  const isAdmin = Boolean(hasAdminRole || (user?.roles || []).includes('admin'));

  const [activeTab, setActiveTab] = useState('overview');
  const [actionLogs, setActionLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Fetch action logs when action-log tab is active
  const fetchActionLogs = useCallback(async () => {
    if (!instance?.id) return;
    setLogsLoading(true);
    try {
      const res = await novaApi.getServerActionRecords(instance.id);
      if (res && res.instanceActions) {
        setActionLogs(res.instanceActions);
      }
    } catch {
      setActionLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [instance?.id]);

  useEffect(() => {
    if (open && activeTab === 'actions') {
      fetchActionLogs();
    }
  }, [open, activeTab, fetchActionLogs]);

  if (!instance) return null;

  const isRunning = instance.status === 'ACTIVE';
  const isShutoff = instance.status === 'SHUTOFF';

  const logColumns = [
    {
      title: t('Action'),
      dataIndex: 'action',
      key: 'action',
      render: (act) => <Tag color="blue">{act}</Tag>,
    },
    {
      title: t('Request ID'),
      dataIndex: 'request_id',
      key: 'request_id',
      render: (req) => (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>
          {req?.substring(0, 16)}...
        </span>
      ),
    },
    {
      title: t('Start Time'),
      dataIndex: 'start_time',
      key: 'start_time',
      render: (time) => <span style={{ fontSize: 12 }}>{time ? time.replace('T', ' ').substring(0, 19) : '-'}</span>,
    },
    {
      title: t('Result'),
      dataIndex: 'message',
      key: 'message',
      render: (msg) =>
        msg ? (
          <Tag color="error">{msg}</Tag>
        ) : (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Success
          </Tag>
        ),
    },
  ];

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 24 }}>
          <Space size={8}>
            <DesktopOutlined style={{ color: '#0068ff', fontSize: 18 }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{instance.name}</span>
            <Status status={instance.status} />
          </Space>
        </div>
      }
      open={open}
      onClose={onClose}
      width={780}
      destroyOnHidden
    >
      {/* Top Action Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Space size={6} wrap>
          {/* VNC Console */}
          <Button
            type="primary"
            size="small"
            icon={<CodeOutlined />}
            style={{ backgroundColor: '#0068ff' }}
            onClick={() => onConsole(instance.id)}
          >
            {t('Console')}
          </Button>

          {/* Start / Stop */}
          {isShutoff ? (
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => onStart(instance.id)}
            >
              {t('Start')}
            </Button>
          ) : (
            <Button
              size="small"
              icon={<PauseCircleOutlined />}
              disabled={!isRunning}
              onClick={() => onStop(instance.id)}
            >
              {t('Stop')}
            </Button>
          )}

          {/* Reboot */}
          <Dropdown
            menu={{
              items: [
                { key: 'soft', label: t('Soft Reboot'), onClick: () => onReboot(instance.id, 'SOFT') },
                { key: 'hard', label: t('Hard Reboot'), onClick: () => onReboot(instance.id, 'HARD') },
              ],
            }}
          >
            <Button size="small" icon={<ReloadOutlined />}>
              {t('Reboot')}
            </Button>
          </Dropdown>

          {/* Lock / Unlock */}
          {instance.locked ? (
            <Button size="small" icon={<UnlockOutlined />} onClick={() => onUnlock(instance.id)}>
              {t('Unlock')}
            </Button>
          ) : (
            <Button size="small" icon={<LockOutlined />} onClick={() => onLock(instance.id)}>
              {t('Lock')}
            </Button>
          )}

          {/* Admin Actions Dropdown (Role Controlled) */}
          <Dropdown
            menu={{
              items: [
                {
                  key: 'migrate',
                  label: 'Cold Migrate',
                  disabled: !isAdmin,
                  onClick: () => onMigrate(instance.id),
                },
                {
                  key: 'live-migrate',
                  label: 'Live Migrate',
                  disabled: !isAdmin,
                  onClick: () => onLiveMigrate(instance.id),
                },
                {
                  key: 'reset-state',
                  label: 'Reset State (Active)',
                  disabled: !isAdmin,
                  onClick: () => onResetState(instance.id, 'active'),
                },
              ],
            }}
          >
            <Tooltip title={!isAdmin ? 'Chức năng yêu cầu quyền Administrator' : ''}>
              <Button size="small" style={{ borderColor: isAdmin ? '#0068ff' : '#cbd5e1', color: isAdmin ? '#0068ff' : '#94a3b8' }}>
                Admin Actions {isAdmin ? '' : '(Khóa)'}
              </Button>
            </Tooltip>
          </Dropdown>
        </Space>

        <Button
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => onDelete(instance.id, instance.name)}
        >
          {t('Delete')}
        </Button>
      </div>

      {/* Tabs Content */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'overview',
            label: t('Overview'),
            children: (
              <div>
                <Descriptions title={t('Compute Specs')} bordered size="small" column={2} style={{ marginBottom: 20 }}>
                  <Descriptions.Item label="ID">
                    <Space size={4}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{instance.id}</span>
                      <Tooltip title={t('Copy')}>
                        <CopyOutlined
                          style={{ cursor: 'pointer', color: '#64748b' }}
                          onClick={() => navigator.clipboard.writeText(instance.id)}
                        />
                      </Tooltip>
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label={t('Flavors')}>{instance.flavor}</Descriptions.Item>
                  <Descriptions.Item label="vCPU">{instance.vcpus} Cores</Descriptions.Item>
                  <Descriptions.Item label="RAM">{instance.ram} GiB</Descriptions.Item>
                  <Descriptions.Item label="Disk">{instance.disk} GiB</Descriptions.Item>
                  <Descriptions.Item label={t('Images')}>{instance.image}</Descriptions.Item>
                </Descriptions>

                <Descriptions title={t('Lifecycle & State')} bordered size="small" column={2} style={{ marginBottom: 20 }}>
                  <Descriptions.Item label={t('Status')}><Status status={instance.status} /></Descriptions.Item>
                  <Descriptions.Item label={t('Power State')}>
                    <Tag color={instance.powerState === 'Running' ? 'green' : 'default'}>
                      {instance.powerState}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Task State">{instance.taskState}</Descriptions.Item>
                  <Descriptions.Item label="VM State">{instance.vmState}</Descriptions.Item>
                  <Descriptions.Item label={t('Availability Zone')}>{instance.zone}</Descriptions.Item>
                  <Descriptions.Item label="Compute Host (Node)">
                    <Tag color="cyan">{instance.host}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Hypervisor">{instance.hypervisor}</Descriptions.Item>
                  <Descriptions.Item label="SSH Keypair">{instance.keyName}</Descriptions.Item>
                  <Descriptions.Item label={t('Created At')}>{instance.created}</Descriptions.Item>
                  <Descriptions.Item label={t('Updated At')}>{instance.updated || '-'}</Descriptions.Item>
                </Descriptions>
              </div>
            ),
          },
          {
            key: 'networks',
            label: t('Networks'),
            children: (
              <div>
                <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="Private IP (Fixed)">
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{instance.ip}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="Floating IP (Public)">
                    {instance.floatingIp ? (
                      <Tag color="cyan" style={{ fontFamily: 'monospace' }}>
                        {instance.floatingIp}
                      </Tag>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Chưa gắn Floating IP</span>
                    )}
                  </Descriptions.Item>
                </Descriptions>

                {instance.raw?.addresses && (
                  <div>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                      Chi tiết Cổng Mạng & IP Addresses
                    </h4>
                    {Object.entries(instance.raw.addresses).map(([netName, addrs]) => (
                      <div
                        key={netName}
                        style={{
                          background: '#f8fafc',
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#0068ff', marginBottom: 4 }}>
                          Network: {netName}
                        </div>
                        {Array.isArray(addrs) &&
                          addrs.map((a, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#475569' }}>
                              - IP: <code>{a.addr}</code> (Type: {a['OS-EXT-IPS:type'] || 'fixed'}, MAC: {a['OS-EXT-IPS-MAC:mac_addr'] || '-'})
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'security',
            label: t('Security Groups'),
            children: (
              <div>
                {instance.securityGroups && instance.securityGroups.length > 0 ? (
                  instance.securityGroups.map((sg, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 14px',
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        marginBottom: 8,
                      }}
                    >
                      <Tag color="blue">{sg.name || sg}</Tag>
                    </div>
                  ))
                ) : (
                  <Alert message="Chưa có Nhóm bảo mật nào được gắn" type="info" showIcon />
                )}
              </div>
            ),
          },
          {
            key: 'volumes',
            label: t('Volumes'),
            children: (
              <div>
                {instance.volumesAttached && instance.volumesAttached.length > 0 ? (
                  instance.volumesAttached.map((vol, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 14px',
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        marginBottom: 8,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>Volume ID:</span> <code>{vol.id}</code>
                    </div>
                  ))
                ) : (
                  <Alert message="Máy ảo khởi động trực tiếp từ ảnh đĩa (Ephemeral / Image Root Disk)" type="info" showIcon />
                )}
              </div>
            ),
          },
          {
            key: 'actions',
            label: t('Action Log'),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button size="small" icon={<ReloadOutlined />} onClick={fetchActionLogs} loading={logsLoading}>
                    {t('Refresh')}
                  </Button>
                </div>
                <Table
                  columns={logColumns}
                  dataSource={actionLogs}
                  loading={logsLoading}
                  pagination={{ pageSize: 8 }}
                  rowKey="request_id"
                  size="small"
                />
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
