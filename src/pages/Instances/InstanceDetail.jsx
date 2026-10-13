import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Card,
  Tabs,
  Tag,
  Space,
  Button,
  Row,
  Col,
  Descriptions,
  Table,
  Spin,
  Alert,
  Tooltip,
  Dropdown,
  Modal,
  Select,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  DesktopOutlined,
  CodeOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  LockOutlined,
  UnlockOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  HddOutlined,
  ApartmentOutlined,
  SafetyOutlined,
  KeyOutlined,
  TagOutlined,
  GlobalOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { novaApi } from '@/api/nova';
import { cinderApi } from '@/api/cinder';
import { neutronApi } from '@/api/neutron';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/core/i18n';
import Status from '@/components/Status';

// Quick-copy helper with visual feedback
function CopyableText({ text, display, style }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopied(true);
    message.success('Đã sao chép vào clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!text) return <span style={{ color: '#94a3b8' }}>-</span>;

  return (
    <Space size={4} style={style}>
      <code
        style={{
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: 12,
          color: '#0f172a',
          backgroundColor: '#f1f5f9',
          padding: '2px 6px',
          borderRadius: 4,
          border: '1px solid #e2e8f0',
        }}
      >
        {display || text}
      </code>
      <Tooltip title={copied ? 'Đã sao chép!' : 'Sao chép'}>
        <Button
          type="text"
          size="small"
          icon={
            copied ? (
              <CheckOutlined style={{ fontSize: 12, color: '#10b981' }} />
            ) : (
              <CopyOutlined style={{ fontSize: 12, color: '#94a3b8' }} />
            )
          }
          onClick={handleCopy}
          style={{ width: 22, height: 22, minWidth: 22, padding: 0 }}
        />
      </Tooltip>
    </Space>
  );
}

export default function InstanceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { hasAdminRole, user } = useAuthStore();
  const isAdmin = Boolean(hasAdminRole || (user?.roles || []).includes('admin'));

  const [instance, setInstance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');

  // Enriched sub-resources
  const [volumes, setVolumes] = useState([]);
  const [ports, setPorts] = useState([]);
  const [actionLogs, setActionLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [consoleLog, setConsoleLog] = useState('');
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [consoleTail, setConsoleTail] = useState(100);

  // Fetch instance details and resolve all related entities
  const fetchServerDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await novaApi.getServer(id);
      const srv = res?.server || res;
      if (!srv) {
        setInstance(null);
        return;
      }

      // Concurrently query flavor list, neutron ports
      const [flavorsRes, portsRes] = await Promise.allSettled([
        novaApi.listFlavors(),
        neutronApi.listPorts({ device_id: id }),
      ]);

      // Enrich flavor information
      let enrichedFlavor = srv.flavor || {};
      if (flavorsRes.status === 'fulfilled' && flavorsRes.value?.flavors) {
        const match = flavorsRes.value.flavors.find((f) => String(f.id) === String(srv.flavor?.id));
        if (match) {
          enrichedFlavor = {
            ...enrichedFlavor,
            ...match,
            original_name: match.name,
          };
        }
      }

      // Resolve attached volumes via Cinder
      const attached = srv['os-extended-volumes:volumes_attached'] || [];
      let enrichedVolumes = [];
      if (attached.length > 0 && srv.tenant_id) {
        const volPromises = attached.map((v) =>
          cinderApi.getVolume(srv.tenant_id, v.id).catch(() => null)
        );
        const volResults = await Promise.allSettled(volPromises);
        enrichedVolumes = volResults.map((r, i) => {
          if (r.status === 'fulfilled' && r.value?.volume) {
            const vData = r.value.volume;
            const att = (vData.attachments || []).find((a) => a.server_id === id);
            return {
              ...attached[i],
              ...vData,
              device: att?.device || '/dev/vda',
              isBootable: vData.bootable === 'true' || vData.bootable === true,
            };
          }
          return {
            ...attached[i],
            id: attached[i]?.id,
            device: '/dev/vda',
            isBootable: true,
          };
        });
      }

      // Resolve image from root volume if server.image is empty (boot-from-volume)
      let enrichedImage = srv.image;
      const rootVol = enrichedVolumes.find((v) => v.isBootable || v.device === '/dev/vda');
      if (!enrichedImage || typeof enrichedImage === 'string') {
        if (rootVol?.volume_image_metadata?.image_name) {
          enrichedImage = {
            id: rootVol.volume_image_metadata.image_id,
            name: rootVol.volume_image_metadata.image_name,
            os_distro: rootVol.volume_image_metadata.os_distro || 'linux',
            disk_format: rootVol.volume_image_metadata.disk_format,
          };
        } else if (typeof srv.image === 'string' && srv.image.length > 0) {
          enrichedImage = { id: srv.image, name: srv.image };
        } else {
          enrichedImage = { name: 'Boot from Volume', isVolumeBacked: true };
        }
      }

      // Ports
      let enrichedPorts = [];
      if (portsRes.status === 'fulfilled' && portsRes.value?.ports) {
        enrichedPorts = portsRes.value.ports;
      }

      setInstance({
        ...srv,
        flavor: enrichedFlavor,
        image: enrichedImage,
      });
      setVolumes(enrichedVolumes);
      setPorts(enrichedPorts);
    } catch (err) {
      message.error(t('Failed to load instance details: ') + err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchServerDetail();
  }, [fetchServerDetail]);

  // Fetch action logs
  const fetchActionLogs = useCallback(async () => {
    if (!id) return;
    setLogsLoading(true);
    try {
      const res = await novaApi.getServerActionRecords(id);
      if (res && res.instanceActions) {
        setActionLogs(res.instanceActions);
      }
    } catch {
      setActionLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [id]);

  // Fetch serial console log
  const fetchConsoleLog = useCallback(async (tail = consoleTail) => {
    if (!id) return;
    setConsoleLoading(true);
    try {
      const res = await novaApi.serverAction(id, {
        'os-getConsoleOutput': { length: tail },
      });
      setConsoleLog(res?.output || 'No console log output available.');
    } catch {
      setConsoleLog('Console log output is not available for this instance state.');
    } finally {
      setConsoleLoading(false);
    }
  }, [id, consoleTail]);

  useEffect(() => {
    if (activeTab === 'action-logs') {
      fetchActionLogs();
    } else if (activeTab === 'console-log') {
      fetchConsoleLog();
    }
  }, [activeTab, fetchActionLogs, fetchConsoleLog]);

  // Actions
  const handleOpenConsole = async () => {
    try {
      const res = await novaApi.getVncConsole(id);
      const url = res?.console?.url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        message.success(t('Opened VNC Console in new tab'));
      } else {
        message.warning('Console URL not returned by OpenStack');
      }
    } catch (err) {
      message.error('Không thể mở VNC Console: ' + err.message);
    }
  };

  const handleStart = async () => {
    try {
      await novaApi.startServer(id);
      message.success(t('Start command sent successfully'));
      fetchServerDetail();
    } catch (err) {
      message.error('Lỗi khởi động máy ảo: ' + err.message);
    }
  };

  const handleStop = async () => {
    try {
      await novaApi.stopServer(id);
      message.success(t('Stop command sent successfully'));
      fetchServerDetail();
    } catch (err) {
      message.error('Lỗi tắt máy ảo: ' + err.message);
    }
  };

  const handleReboot = async (type = 'SOFT') => {
    try {
      await novaApi.rebootServer(id, type);
      message.success(`Đã gửi lệnh khởi động lại (${type})`);
      fetchServerDetail();
    } catch (err) {
      message.error('Lỗi khởi động lại: ' + err.message);
    }
  };

  const handleLockToggle = async () => {
    try {
      if (instance?.locked) {
        await novaApi.unlockServer(id);
        message.success('Đã mở khóa máy ảo');
      } else {
        await novaApi.lockServer(id);
        message.success('Đã khóa máy ảo');
      }
      fetchServerDetail();
    } catch (err) {
      message.error('Lỗi thao tác: ' + err.message);
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: `${t('Delete')} ${instance?.name}?`,
      content: t('Are you sure you want to delete this instance? This cannot be undone.'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      destroyOnHidden: true,
      onOk: async () => {
        try {
          await novaApi.deleteServer(id);
          message.success(t('Instance deleted successfully'));
          navigate('/compute/instance');
        } catch (err) {
          message.error('Lỗi xóa máy ảo: ' + err.message);
        }
      },
    });
  };

  // Structured network list from addresses and neutron ports
  const networkList = useMemo(() => {
    if (!instance) return [];
    const addresses = instance.addresses || {};
    const list = [];
    Object.entries(addresses).forEach(([netName, addrs]) => {
      if (Array.isArray(addrs)) {
        addrs.forEach((a) => {
          // match port by MAC
          const matchedPort = ports.find(
            (p) => p.mac_address?.toLowerCase() === a['OS-EXT-IPS-MAC:mac_addr']?.toLowerCase()
          );
          list.push({
            networkName: netName,
            ip: a.addr,
            type: a['OS-EXT-IPS:type'] || 'fixed',
            mac: a['OS-EXT-IPS-MAC:mac_addr'] || '-',
            portId: matchedPort?.id || '-',
            portStatus: matchedPort?.status || 'ACTIVE',
          });
        });
      }
    });
    return list;
  }, [instance, ports]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#64748b', fontSize: 13 }}>
          {t('Đang nạp thông tin máy ảo OpenStack...')}
        </div>
      </div>
    );
  }

  if (!instance) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message="Không tìm thấy máy ảo"
          description="Máy ảo không tồn tại hoặc đã bị xóa khỏi cụm hạ tầng OpenStack."
        />
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/compute/instance')}>
          Quay lại danh sách Máy ảo
        </Button>
      </div>
    );
  }

  const isRunning = instance.status === 'ACTIVE';
  const isShutoff = instance.status === 'SHUTOFF';
  const securityGroups = instance.security_groups || [];
  const tags = instance.tags || [];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 40 }}>
      {/* Top Breadcrumb Navigation */}
      <div style={{ marginBottom: 16 }}>
        <Space size={8} style={{ marginBottom: 10 }}>
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/compute/instance')}
            style={{ padding: 0, fontWeight: 600, color: '#0068ff' }}
          >
            {t('Instances')}
          </Button>
          <span style={{ color: '#cbd5e1' }}>/</span>
          <span style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>{instance.name}</span>
        </Space>

        {/* Skyline Signature Header Banner */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            background: '#ffffff',
            padding: '18px 24px',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          {/* Instance Identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #0068ff, #004ecc)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0, 104, 255, 0.28)',
              }}
            >
              <DesktopOutlined style={{ color: '#ffffff', fontSize: 24 }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  {instance.name}
                </h1>
                <Status status={instance.status} />
                {instance.locked && (
                  <Tag color="warning" icon={<LockOutlined />}>
                    {t('Locked')}
                  </Tag>
                )}
              </div>
              <Space style={{ fontSize: 12, color: '#64748b', marginTop: 6 }} size={16} wrap>
                <span>
                  ID: <CopyableText text={instance.id} display={`${instance.id.substring(0, 8)}...`} />
                </span>
                <span>
                  Host: <b>{instance['OS-EXT-SRV-ATTR:host'] || '-'}</b>
                </span>
                <span>
                  Zone: <b>{instance['OS-EXT-AZ:availability_zone'] || 'nova'}</b>
                </span>
                <span>
                  Tạo lúc: {instance.created ? instance.created.replace('T', ' ').substring(0, 19) : '-'}
                </span>
              </Space>
            </div>
          </div>

          {/* Action Toolbar matching legacy Skyline */}
          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<CodeOutlined />}
              onClick={handleOpenConsole}
              style={{ backgroundColor: '#0068ff', fontWeight: 600 }}
            >
              {t('Console')}
            </Button>

            {isShutoff ? (
              <Button icon={<PlayCircleOutlined />} onClick={handleStart}>
                {t('Start')}
              </Button>
            ) : (
              <Button icon={<PauseCircleOutlined />} disabled={!isRunning} onClick={handleStop}>
                {t('Stop')}
              </Button>
            )}

            <Dropdown
              menu={{
                items: [
                  { key: 'soft', label: t('Soft Reboot'), onClick: () => handleReboot('SOFT') },
                  { key: 'hard', label: t('Hard Reboot'), onClick: () => handleReboot('HARD') },
                ],
              }}
            >
              <Button icon={<ReloadOutlined />}>{t('Reboot')}</Button>
            </Dropdown>

            <Button
              icon={instance.locked ? <UnlockOutlined /> : <LockOutlined />}
              onClick={handleLockToggle}
            >
              {instance.locked ? t('Unlock') : t('Lock')}
            </Button>

            {/* Admin Actions */}
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'cold-migrate',
                    label: 'Cold Migrate',
                    disabled: !isAdmin,
                    onClick: () =>
                      novaApi.migrateServer(id).then(() => message.success('Sent Migrate command')),
                  },
                  {
                    key: 'live-migrate',
                    label: 'Live Migrate',
                    disabled: !isAdmin,
                    onClick: () =>
                      novaApi.liveMigrateServer(id).then(() => message.success('Sent Live Migrate command')),
                  },
                  {
                    key: 'reset-state',
                    label: 'Reset State (Active)',
                    disabled: !isAdmin,
                    onClick: () =>
                      novaApi.resetServerState(id, 'active').then(() => {
                        message.success('Đã reset trạng thái về Active');
                        fetchServerDetail();
                      }),
                  },
                ],
              }}
            >
              <Tooltip title={!isAdmin ? 'Chức năng yêu cầu quyền Quản trị viên' : ''}>
                <Button style={{ color: isAdmin ? '#0068ff' : '#94a3b8' }}>
                  Admin Actions
                </Button>
              </Tooltip>
            </Dropdown>

            <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
              {t('Delete')}
            </Button>
          </Space>
        </div>
      </div>

      {/* Main Tabs Container */}
      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'details',
              label: t('Details'),
              children: (
                <Row gutter={[20, 20]}>
                  {/* Left Column: Specs, Network, Image, Security Cards */}
                  <Col xs={24} lg={14}>
                    {/* Network Info Card */}
                    <Card
                      size="small"
                      title={
                        <Space>
                          <ApartmentOutlined style={{ color: '#0068ff' }} />
                          <span>{t('Network Info')}</span>
                        </Space>
                      }
                      style={{ marginBottom: 16, borderRadius: 8 }}
                    >
                      {networkList.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {networkList.map((item, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#f8fafc',
                                padding: '10px 14px',
                                borderRadius: 6,
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <Space size={12}>
                                <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>
                                  {item.networkName}
                                </Tag>
                                <div>
                                  <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                    IP: <CopyableText text={item.ip} />
                                  </div>
                                  <div style={{ fontSize: 11, color: '#64748b' }}>
                                    MAC: <code>{item.mac}</code>
                                  </div>
                                </div>
                              </Space>
                              <Tag color={item.type === 'floating' ? 'cyan' : 'geekblue'}>
                                {item.type}
                              </Tag>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Chưa có cổng mạng</span>
                      )}
                    </Card>

                    {/* Flavor & Compute Specs Card */}
                    <Card
                      size="small"
                      title={
                        <Space>
                          <DesktopOutlined style={{ color: '#0068ff' }} />
                          <span>{t('Flavor Info')}</span>
                        </Space>
                      }
                      style={{ marginBottom: 16, borderRadius: 8 }}
                    >
                      <Descriptions column={2} size="small" bordered>
                        <Descriptions.Item label={t('Name')}>
                          <b>{instance.flavor?.name || instance.flavor?.original_name || instance.flavor?.id || '-'}</b>
                        </Descriptions.Item>
                        <Descriptions.Item label="vCPU">
                          <b>{instance.flavor?.vcpus ?? '-'} Cores</b>
                        </Descriptions.Item>
                        <Descriptions.Item label="RAM">
                          <b>
                            {instance.flavor?.ram ? `${instance.flavor.ram / 1024} GiB` : '-'}
                          </b>
                        </Descriptions.Item>
                        <Descriptions.Item label="Root Disk">
                          <b>{volumes[0]?.size ? `${volumes[0].size} GiB` : instance.flavor?.disk ? `${instance.flavor.disk} GiB` : '-'}</b>
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>

                    {/* Image Info Card */}
                    <Card
                      size="small"
                      title={
                        <Space>
                          <GlobalOutlined style={{ color: '#0068ff' }} />
                          <span>{t('Image Info')}</span>
                        </Space>
                      }
                      style={{ marginBottom: 16, borderRadius: 8 }}
                    >
                      <Descriptions column={2} size="small" bordered>
                        <Descriptions.Item label={t('Name')}>
                          {instance.image?.name || (volumes[0]?.volume_image_metadata?.image_name) || 'Boot from Volume'}
                        </Descriptions.Item>
                        <Descriptions.Item label="OS Distro">
                          <Tag color="cyan">
                            {instance.image?.os_distro || volumes[0]?.volume_image_metadata?.os_distro || 'Linux'}
                          </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="Image ID" span={2}>
                          {instance.image?.id ? (
                            <CopyableText text={instance.image.id} />
                          ) : (
                            <span style={{ color: '#94a3b8' }}>Volume Bootable</span>
                          )}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>

                    {/* Security & Access Card */}
                    <Card
                      size="small"
                      title={
                        <Space>
                          <SafetyOutlined style={{ color: '#0068ff' }} />
                          <span>{t('Security & Access')}</span>
                        </Space>
                      }
                      style={{ marginBottom: 16, borderRadius: 8 }}
                    >
                      <Descriptions column={2} size="small" bordered>
                        <Descriptions.Item label={t('Security Groups')}>
                          {securityGroups.length > 0 ? (
                            <Space wrap>
                              {securityGroups.map((sg, i) => (
                                <Tag key={i} color="blue" onClick={() => setActiveTab('security-groups')} style={{ cursor: 'pointer' }}>
                                  {sg.name}
                                </Tag>
                              ))}
                            </Space>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>default</span>
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label="SSH Keypair">
                          {instance.key_name || <span style={{ color: '#94a3b8' }}>None</span>}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('Project ID')} span={2}>
                          <CopyableText text={instance.tenant_id} />
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>

                    {/* Tags Card */}
                    <Card
                      size="small"
                      title={
                        <Space>
                          <TagOutlined style={{ color: '#0068ff' }} />
                          <span>{t('Tags Info')}</span>
                        </Space>
                      }
                      style={{ borderRadius: 8 }}
                    >
                      {tags.length > 0 ? (
                        <Space wrap>
                          {tags.map((tag, idx) => (
                            <Tag key={idx} color="geekblue">{tag}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Không có nhãn (Tags)</span>
                      )}
                    </Card>
                  </Col>

                  {/* Right Column: Skyline Signature Resource Topology */}
                  <Col xs={24} lg={10}>
                    <Card
                      size="small"
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Space>
                            <ApartmentOutlined style={{ color: '#0068ff' }} />
                            <span>{t('Resource Topology')}</span>
                          </Space>
                          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={fetchServerDetail} />
                        </div>
                      }
                      style={{ borderRadius: 8, borderColor: '#cbd5e1', background: '#fafbfc' }}
                    >
                      <div style={{ textAlign: 'center', padding: '16px 12px' }}>
                        {/* 1. Connected Network Ports Node */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ApartmentOutlined style={{ color: '#10b981' }} />
                            <span>Cổng mạng Network Ports ({networkList.length})</span>
                          </div>
                          {networkList.map((net, idx) => (
                            <div
                              key={idx}
                              style={{
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: '8px 12px',
                                textAlign: 'left',
                                marginBottom: 6,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: '#0f172a' }}>{net.networkName}</span>
                                <Tag color="green" style={{ margin: 0, fontSize: 10 }}>{net.portStatus}</Tag>
                              </div>
                              <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>
                                IP: <code>{net.ip}</code>
                              </div>
                              {net.portId !== '-' && (
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                  Port: <CopyableText text={net.portId} display={`${net.portId.substring(0, 10)}...`} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Connection Line */}
                        <div
                          style={{
                            width: 2,
                            height: 20,
                            backgroundColor: '#cbd5e1',
                            margin: '0 auto',
                          }}
                        />

                        {/* 2. Central VM Box */}
                        <div
                          style={{
                            background: 'linear-gradient(135deg, #0068ff 0%, #004ecc 100%)',
                            color: '#ffffff',
                            borderRadius: 12,
                            padding: '16px 20px',
                            display: 'inline-block',
                            minWidth: 260,
                            boxShadow: '0 8px 20px rgba(0, 104, 255, 0.25)',
                            margin: '4px 0',
                          }}
                        >
                          <DesktopOutlined style={{ fontSize: 28, marginBottom: 6 }} />
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{instance.name}</div>
                          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 4 }}>
                            Trạng thái: <b>{instance.status}</b> | Host: <b>{instance['OS-EXT-SRV-ATTR:host'] || 'nova'}</b>
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                            {instance.flavor?.name || instance.flavor?.original_name || 'm1.small'} ({instance.flavor?.vcpus || 2} vCPU / {instance.flavor?.ram ? instance.flavor.ram / 1024 : 2} GiB)
                          </div>
                        </div>

                        {/* Connection Line */}
                        <div
                          style={{
                            width: 2,
                            height: 20,
                            backgroundColor: '#cbd5e1',
                            margin: '0 auto',
                          }}
                        />

                        {/* 3. Connected Attached Volumes Node */}
                        <div style={{ textAlign: 'left', marginTop: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <HddOutlined style={{ color: '#0068ff' }} />
                            <span>Ổ đĩa Volumes ({volumes.length})</span>
                          </div>
                          {volumes.length > 0 ? (
                            volumes.map((vol, idx) => (
                              <div
                                key={idx}
                                style={{
                                  background: '#ffffff',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 8,
                                  padding: '10px 12px',
                                  fontSize: 12,
                                  marginBottom: 8,
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Space size={6}>
                                    <Tag color={vol.isBootable ? 'geekblue' : 'default'} style={{ margin: 0, fontWeight: 600 }}>
                                      {vol.isBootable ? 'Root Disk' : 'Data Disk'}
                                    </Tag>
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                      {vol.name || vol.volume_image_metadata?.image_name || 'volume-disk'}
                                    </span>
                                  </Space>
                                  <Tag color="cyan" style={{ margin: 0 }}>
                                    {vol.size ? `${vol.size} GiB` : '-'}
                                  </Tag>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#64748b' }}>
                                  <span>Type: <b>{vol.volume_type || 'ssd'}</b></span>
                                  <span>Device: <code>{vol.device || '/dev/vda'}</code></span>
                                </div>
                                <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
                                  ID: <CopyableText text={vol.id} display={`${vol.id?.substring(0, 12)}...`} />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, fontSize: 12, color: '#64748b' }}>
                              Root disk (Ephemeral Storage)
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'volumes',
              label: t('Volumes'),
              children: (
                <div>
                  <Table
                    dataSource={volumes}
                    pagination={false}
                    rowKey="id"
                    columns={[
                      {
                        title: t('Name'),
                        dataIndex: 'name',
                        key: 'name',
                        render: (name, record) => (
                          <div>
                            <div style={{ fontWeight: 600 }}>{name || record.volume_image_metadata?.image_name || '-'}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              <CopyableText text={record.id} display={`${record.id?.substring(0, 12)}...`} />
                            </div>
                          </div>
                        ),
                      },
                      {
                        title: t('Size'),
                        dataIndex: 'size',
                        key: 'size',
                        render: (sz) => <b>{sz ? `${sz} GiB` : '-'}</b>,
                      },
                      {
                        title: t('Volume Type'),
                        dataIndex: 'volume_type',
                        key: 'volume_type',
                        render: (vt) => <Tag color="blue">{vt || 'ssd'}</Tag>,
                      },
                      {
                        title: 'Device',
                        dataIndex: 'device',
                        key: 'device',
                        render: (dev) => <code>{dev || '/dev/vda'}</code>,
                      },
                      {
                        title: 'Bootable',
                        dataIndex: 'isBootable',
                        key: 'bootable',
                        render: (b) => (b ? <Tag color="success">Yes (Root)</Tag> : <Tag>No</Tag>),
                      },
                      {
                        title: t('Status'),
                        dataIndex: 'status',
                        key: 'status',
                        render: (st) => <Status status={st || 'in-use'} />,
                      },
                      {
                        title: t('Delete on Termination'),
                        dataIndex: 'delete_on_termination',
                        key: 'del',
                        render: (del) => (del ? <Tag color="orange">Yes</Tag> : <Tag>No</Tag>),
                      },
                    ]}
                    locale={{ emptyText: 'Chưa có ổ đĩa Volume nào được gắn vào máy ảo này' }}
                  />
                </div>
              ),
            },
            {
              key: 'interfaces',
              label: t('Interfaces'),
              children: (
                <Table
                  dataSource={networkList}
                  pagination={false}
                  rowKey="ip"
                  columns={[
                    {
                      title: t('Network'),
                      dataIndex: 'networkName',
                      key: 'net',
                      render: (net) => <Tag color="blue">{net}</Tag>,
                    },
                    {
                      title: 'Port ID',
                      dataIndex: 'portId',
                      key: 'portId',
                      render: (pid) => (pid !== '-' ? <CopyableText text={pid} /> : '-'),
                    },
                    {
                      title: 'IP Address',
                      dataIndex: 'ip',
                      key: 'ip',
                      render: (ip) => <CopyableText text={ip} />,
                    },
                    {
                      title: t('Type'),
                      dataIndex: 'type',
                      key: 'type',
                      render: (tp) => <Tag color={tp === 'floating' ? 'cyan' : 'geekblue'}>{tp}</Tag>,
                    },
                    {
                      title: 'MAC Address',
                      dataIndex: 'mac',
                      key: 'mac',
                      render: (mac) => <code>{mac}</code>,
                    },
                    {
                      title: t('Status'),
                      dataIndex: 'portStatus',
                      key: 'status',
                      render: (st) => <Status status={st} />,
                    },
                  ]}
                />
              ),
            },
            {
              key: 'security-groups',
              label: t('Security Groups'),
              children: (
                <div>
                  {securityGroups.length > 0 ? (
                    securityGroups.map((sg, idx) => (
                      <Card
                        key={idx}
                        size="small"
                        title={
                          <Space>
                            <SafetyOutlined style={{ color: '#0068ff' }} />
                            <span style={{ fontWeight: 600 }}>{sg.name}</span>
                          </Space>
                        }
                        variant="borderless"
                        style={{ marginBottom: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      >
                        <div style={{ color: '#64748b', fontSize: 13 }}>
                          Nhóm bảo mật kiểm soát lưu lượng Ingress và Egress gắn trực tiếp vào card mạng máy ảo.
                        </div>
                      </Card>
                    ))
                  ) : (
                    <Alert message="Chưa có Security Group nào được cấu hình" type="info" showIcon />
                  )}
                </div>
              ),
            },
            {
              key: 'action-logs',
              label: t('Action Logs'),
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <Button size="small" icon={<ReloadOutlined />} onClick={fetchActionLogs} loading={logsLoading}>
                      {t('Refresh')}
                    </Button>
                  </div>
                  <Table
                    dataSource={actionLogs}
                    loading={logsLoading}
                    rowKey="request_id"
                    columns={[
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
                        render: (req) => <CopyableText text={req} display={`${req.substring(0, 16)}...`} />,
                      },
                      {
                        title: t('User ID'),
                        dataIndex: 'user_id',
                        key: 'user_id',
                        render: (uid) => <code style={{ fontSize: 11 }}>{uid || '-'}</code>,
                      },
                      {
                        title: t('Start Time'),
                        dataIndex: 'start_time',
                        key: 'start_time',
                        render: (tm) => <span>{tm ? tm.replace('T', ' ').substring(0, 19) : '-'}</span>,
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
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'console-log',
              label: t('Logs'),
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Space>
                      <span>Số dòng log cuối:</span>
                      <Select
                        value={consoleTail}
                        onChange={(val) => {
                          setConsoleTail(val);
                          fetchConsoleLog(val);
                        }}
                        style={{ width: 100 }}
                        options={[
                          { value: 50, label: '50' },
                          { value: 100, label: '100' },
                          { value: 200, label: '200' },
                          { value: 500, label: '500' },
                        ]}
                      />
                    </Space>
                    <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchConsoleLog(consoleTail)} loading={consoleLoading}>
                      {t('Refresh')}
                    </Button>
                  </div>
                  <pre
                    style={{
                      background: '#0f172a',
                      color: '#38bdf8',
                      padding: 16,
                      borderRadius: 8,
                      fontFamily: 'Consolas, Monaco, monospace',
                      fontSize: 12,
                      lineHeight: 1.5,
                      maxHeight: 520,
                      overflowY: 'auto',
                    }}
                  >
                    {consoleLog}
                  </pre>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
