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
  Form,
  Input,
  InputNumber,
  Radio,
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
  CameraOutlined,
  MoreOutlined,
  DownOutlined,
  SettingOutlined,
  DisconnectOutlined,
  PlusOutlined,
  EditOutlined,
  PoweroffOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  UndoOutlined,
  ExportOutlined,
  SyncOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import { novaApi } from '@/api/nova';
import { cinderApi } from '@/api/cinder';
import { neutronApi } from '@/api/neutron';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/core/i18n';
import Status from '@/components/Status';
import { useActionRunner } from '@/components/Action/useActionRunner';
import {
  ConsoleAction,
  StartAction,
  StopAction,
  RebootAction,
  SoftRebootAction,
  LockAction,
  UnlockAction,
  PauseAction,
  UnpauseAction,
  SuspendAction,
  ResumeAction,
  ShelveAction,
  UnshelveAction,
  ResetStateAction,
  RebuildAction,
  RescueAction,
  UnrescueAction,
  EditInstanceAction,
  AttachVolumeAction,
  DetachVolumeAction,
  AttachInterfaceAction,
  DetachInterfaceAction,
  CreateSnapshotAction,
  ResizeAction,
  ConfirmResizeAction,
  RevertResizeAction,
  ChangePasswordAction,
  ModifyTagsAction,
  MigrateAction,
  LiveMigrateAction,
  DeleteAction,
} from '@/pages/Instances/actions';

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
  const { hasAdminRole, user, currentProject } = useAuthStore();
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

  // Security Group and Rule management state
  const [allProjectSgs, setAllProjectSgs] = useState([]);
  const [addRuleModalVisible, setAddRuleModalVisible] = useState(false);
  const [selectedSgForRule, setSelectedSgForRule] = useState(null);
  const [ruleSubmitting, setRuleSubmitting] = useState(false);
  const [attachSgModalVisible, setAttachSgModalVisible] = useState(false);
  const [selectedSgToAttach, setSelectedSgToAttach] = useState(null);
  const [attachSgSubmitting, setAttachSgSubmitting] = useState(false);
  const [addRuleForm] = Form.useForm();

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

      const instanceProjectId = srv.tenant_id || srv.project_id || currentProject?.id;

      // Concurrently query flavor list, neutron ports, security groups scoped to project
      const [flavorsRes, portsRes, secGroupsRes] = await Promise.allSettled([
        novaApi.listFlavors(),
        neutronApi.listPorts({ device_id: id }),
        neutronApi.listSecurityGroups(instanceProjectId ? { project_id: instanceProjectId } : {}),
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

      // Resolve Security Groups and their rules
      const attachedSgIds = new Set();
      enrichedPorts.forEach((p) => {
        (p.security_groups || []).forEach((sgId) => attachedSgIds.add(sgId));
      });

      let allSgs = [];
      if (secGroupsRes.status === 'fulfilled' && secGroupsRes.value?.security_groups) {
        allSgs = secGroupsRes.value.security_groups;
      }

      // For any attached security group ID not found in list, query individually
      const missingIds = [...attachedSgIds].filter((sgId) => !allSgs.some((s) => s.id === sgId));
      if (missingIds.length > 0) {
        const missingPromises = missingIds.map((sgId) => neutronApi.getSecurityGroup(sgId).catch(() => null));
        const missingResults = await Promise.allSettled(missingPromises);
        missingResults.forEach((r) => {
          if (r.status === 'fulfilled' && r.value?.security_group) {
            allSgs.push(r.value.security_group);
          }
        });
      }

      // Filter all security groups belonging to this project for the attach selector
      const tenantSgs = allSgs.filter(
        (sg) => !srv.tenant_id || sg.project_id === srv.tenant_id || sg.tenant_id === srv.tenant_id
      );
      setAllProjectSgs(tenantSgs);

      // Filter security groups that strictly belong to this instance
      const matchedSgs = allSgs.filter((sg) => {
        // 1. Primary ground truth: security group attached to the instance's active network ports
        if (attachedSgIds.size > 0 && attachedSgIds.has(sg.id)) {
          return true;
        }
        // 2. Attached via Nova server metadata (MUST belong to the same project to avoid cross-tenant name collisions)
        const isSameProject =
          !srv.tenant_id || sg.project_id === srv.tenant_id || sg.tenant_id === srv.tenant_id;
        const matchedByName = (srv.security_groups || []).some(
          (s) => s.name === sg.name || s.id === sg.id
        );
        return isSameProject && matchedByName;
      });

      const enrichedSgs = (matchedSgs.length > 0 ? matchedSgs : (srv.security_groups || []).map((s) => ({ name: s.name, security_group_rules: [] }))).map((sg) => ({
        id: sg.id || '',
        name: sg.name || sg.id || 'default',
        description: sg.description || '',
        rules: (sg.security_group_rules || []).map((r) => ({
          key: r.id,
          id: r.id,
          direction: (r.direction || 'ingress').toUpperCase(),
          ethertype: r.ethertype || 'IPv4',
          protocol: (r.protocol || 'ANY').toUpperCase(),
          portRange:
            r.port_range_min === r.port_range_max
              ? r.port_range_min !== null
                ? String(r.port_range_min)
                : t('All Ports')
              : r.port_range_min !== null && r.port_range_max !== null
              ? `${r.port_range_min} - ${r.port_range_max}`
              : t('All Ports'),
          remote: r.remote_ip_prefix
            ? r.remote_ip_prefix
            : r.remote_group_id
            ? `Group: ${r.remote_group_id.substring(0, 8)}...`
            : '0.0.0.0/0',
          description: r.description || '-',
        })),
      }));

      setInstance({
        ...srv,
        flavor: enrichedFlavor,
        image: enrichedImage,
        volumesAttached: enrichedVolumes.length > 0 ? enrichedVolumes : attached,
        security_groups: enrichedSgs,
      });
      setVolumes(enrichedVolumes);
      setPorts(enrichedPorts);
    } catch (err) {
      message.error(t('Failed to load instance details: ') + err.message);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  const { handleAction, actionModal } = useActionRunner({ onRefresh: fetchServerDetail });

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

  // Direct Detach single volume action with modal confirmation
  const handleDetachSingleVolume = (volume) => {
    Modal.confirm({
      title: `${t('Detach Volume')}?`,
      content: `${t('Are you sure you want to detach volume')} ${volume.name || volume.id} (${volume.device || ''})?`,
      okText: t('Detach'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await novaApi.detachVolume(id, volume.id);
          message.success(t('Detached volume successfully'));
          fetchServerDetail();
        } catch (err) {
          message.error(err.message || t('Failed to detach volume'));
        }
      },
    });
  };

  // Direct Detach single interface action with modal confirmation
  const handleDetachSinglePort = (record) => {
    const portId = record.portId;
    if (!portId || portId === '-') return;
    Modal.confirm({
      title: `${t('Detach Interface')}?`,
      content: `${t('Are you sure you want to detach port')} ${portId} (${record.ip})?`,
      okText: t('Detach'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await novaApi.detachInterface(id, portId);
          message.success(t('Detached interface successfully'));
          fetchServerDetail();
        } catch (err) {
          message.error(err.message || t('Failed to detach interface'));
        }
      },
    });
  };

  // Direct Delete Action with safety confirmation & redirection
  const handleDeleteInstance = () => {
    Modal.confirm({
      title: `${t('Delete')} ${instance?.name}?`,
      content: t('Are you sure you want to delete this instance? This cannot be undone.'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await novaApi.deleteServer(id);
          message.success(t('Instance deleted successfully'));
          navigate('/compute/instance');
        } catch (err) {
          message.error(err.message || 'Lỗi xóa máy ảo');
        }
      },
    });
  };

  // Delete a security group rule with confirmation
  const handleDeleteRule = (rule) => {
    Modal.confirm({
      title: t('Xóa luật tường lửa (Rule)?'),
      content: (
        <div>
          <p>{t('Bạn có chắc chắn muốn xóa rule này không? Luật tường lửa sẽ được cập nhật ngay lập tức.')}</p>
          <div
            style={{
              background: '#f8fafc',
              padding: '10px 12px',
              borderRadius: 6,
              fontSize: 12,
              border: '1px solid #e2e8f0',
              marginTop: 8,
            }}
          >
            <div><b>{t('Hướng')}:</b> {rule.direction}</div>
            <div><b>{t('Giao thức')}:</b> {rule.protocol}</div>
            <div><b>{t('Cổng')}:</b> {rule.portRange}</div>
            <div><b>{t('Nguồn/Đích')}:</b> {rule.remote}</div>
          </div>
        </div>
      ),
      okText: t('Xóa Rule'),
      okType: 'danger',
      cancelText: t('Hủy'),
      onOk: async () => {
        try {
          await neutronApi.deleteSecurityGroupRule(rule.id);
          message.success(t('Đã xóa luật tường lửa thành công'));
          fetchServerDetail();
        } catch (err) {
          message.error(err.response?.data?.NeutronError?.message || err.message || t('Lỗi khi xóa rule'));
        }
      },
    });
  };

  // Create a new rule for a security group
  const handleCreateRule = async (values) => {
    if (!selectedSgForRule?.id) return;
    setRuleSubmitting(true);
    try {
      let protocol = 'tcp';
      let port_range_min = null;
      let port_range_max = null;

      switch (values.ruleType) {
        case 'custom_tcp':
          protocol = 'tcp';
          port_range_min = values.port_min ? Number(values.port_min) : null;
          port_range_max = values.port_max ? Number(values.port_max) : port_range_min;
          break;
        case 'custom_udp':
          protocol = 'udp';
          port_range_min = values.port_min ? Number(values.port_min) : null;
          port_range_max = values.port_max ? Number(values.port_max) : port_range_min;
          break;
        case 'custom_icmp':
          protocol = 'icmp';
          break;
        case 'all_tcp':
          protocol = 'tcp';
          port_range_min = 1;
          port_range_max = 65535;
          break;
        case 'all_udp':
          protocol = 'udp';
          port_range_min = 1;
          port_range_max = 65535;
          break;
        case 'all_traffic':
          protocol = null;
          break;
        case 'ssh':
          protocol = 'tcp';
          port_range_min = 22;
          port_range_max = 22;
          break;
        case 'http':
          protocol = 'tcp';
          port_range_min = 80;
          port_range_max = 80;
          break;
        case 'https':
          protocol = 'tcp';
          port_range_min = 443;
          port_range_max = 443;
          break;
        case 'mysql':
          protocol = 'tcp';
          port_range_min = 3306;
          port_range_max = 3306;
          break;
        case 'postgres':
          protocol = 'tcp';
          port_range_min = 5432;
          port_range_max = 5432;
          break;
        case 'rdp':
          protocol = 'tcp';
          port_range_min = 3389;
          port_range_max = 3389;
          break;
        default:
          protocol = 'tcp';
      }

      const ruleData = {
        security_group_id: selectedSgForRule.id,
        direction: values.direction,
        ethertype: values.ethertype,
        description: values.description || undefined,
      };

      if (protocol !== null) {
        ruleData.protocol = protocol;
      }
      if (port_range_min !== null) {
        ruleData.port_range_min = port_range_min;
        ruleData.port_range_max = port_range_max;
      }

      if (values.remoteType === 'sg' && values.remote_group_id) {
        ruleData.remote_group_id = values.remote_group_id;
      } else {
        ruleData.remote_ip_prefix = values.remote_ip_prefix || (values.ethertype === 'IPv6' ? '::/0' : '0.0.0.0/0');
      }

      await neutronApi.createSecurityGroupRule(ruleData);
      message.success(t('Thêm luật tường lửa thành công và đã áp dụng ngay'));
      setAddRuleModalVisible(false);
      addRuleForm.resetFields();
      fetchServerDetail();
    } catch (err) {
      message.error(err.response?.data?.NeutronError?.message || err.message || t('Lỗi thêm rule'));
    } finally {
      setRuleSubmitting(false);
    }
  };

  // Prefill Add Rule Modal for editing/cloning a rule
  const handlePrefillRule = (sg, rule) => {
    setSelectedSgForRule(sg);
    let ruleType = 'custom_tcp';
    let port_min = 80;
    let port_max = 80;

    const proto = (rule.protocol || 'TCP').toLowerCase();
    const ports = (rule.portRange || '').split('-').map((s) => s.trim());
    if (ports.length === 2) {
      port_min = Number(ports[0]) || 1;
      port_max = Number(ports[1]) || 65535;
    } else if (ports.length === 1 && !isNaN(Number(ports[0]))) {
      port_min = Number(ports[0]);
      port_max = Number(ports[0]);
    }

    if (proto === 'tcp') {
      if (port_min === 22 && port_max === 22) ruleType = 'ssh';
      else if (port_min === 80 && port_max === 80) ruleType = 'http';
      else if (port_min === 443 && port_max === 443) ruleType = 'https';
      else if (port_min === 3306 && port_max === 3306) ruleType = 'mysql';
      else if (port_min === 5432 && port_max === 5432) ruleType = 'postgres';
      else if (port_min === 3389 && port_max === 3389) ruleType = 'rdp';
      else if (port_min === 1 && port_max === 65535) ruleType = 'all_tcp';
      else ruleType = 'custom_tcp';
    } else if (proto === 'udp') {
      if (port_min === 1 && port_max === 65535) ruleType = 'all_udp';
      else ruleType = 'custom_udp';
    } else if (proto === 'icmp') {
      ruleType = 'custom_icmp';
    } else if (proto === 'any') {
      ruleType = 'all_traffic';
    }

    const isGroup = (rule.remote || '').startsWith('Group:');
    addRuleForm.setFieldsValue({
      direction: (rule.direction || 'INGRESS').toLowerCase(),
      ethertype: rule.ethertype || 'IPv4',
      ruleType,
      port_min,
      port_max,
      remoteType: isGroup ? 'sg' : 'cidr',
      remote_ip_prefix: isGroup ? '0.0.0.0/0' : (rule.remote || '0.0.0.0/0'),
      description: rule.description !== '-' ? rule.description : '',
    });
    setAddRuleModalVisible(true);
  };

  // Attach a security group to instance
  const handleAttachSecurityGroup = async () => {
    if (!selectedSgToAttach) return;
    setAttachSgSubmitting(true);
    try {
      await novaApi.addSecurityGroup(instance.id, selectedSgToAttach);
      message.success(t('Đã gán Security Group vào máy ảo thành công'));
      setAttachSgModalVisible(false);
      setSelectedSgToAttach(null);
      fetchServerDetail();
    } catch (err) {
      message.error(err.response?.data?.badRequest?.message || err.message || t('Lỗi gán Security Group'));
    } finally {
      setAttachSgSubmitting(false);
    }
  };

  // Detach a security group from instance
  const handleDetachSecurityGroup = (sg) => {
    Modal.confirm({
      title: `${t('Gỡ Security Group')}?`,
      content: `${t('Bạn có chắc chắn muốn gỡ nhóm bảo mật')} "${sg.name}" ${t('khỏi máy ảo này không?')}`,
      okText: t('Gỡ bỏ'),
      okType: 'danger',
      cancelText: t('Hủy'),
      onOk: async () => {
        try {
          await novaApi.removeSecurityGroup(instance.id, sg.name);
          message.success(t('Đã gỡ Security Group khỏi máy ảo thành công'));
          fetchServerDetail();
        } catch (err) {
          message.error(err.response?.data?.badRequest?.message || err.message || t('Lỗi khi gỡ Security Group'));
        }
      },
    });
  };

  const isRunning = instance?.status === 'ACTIVE';
  const isShutoff = ['SHUTOFF', 'STOPPED', 'CRASHED'].includes(instance?.status?.toUpperCase());

  // Comprehensive categorized More Actions items matching legacy Skyline 1:1
  const moreMenuItems = useMemo(() => {
    if (!instance) return [];

    // 1. Instance Status
    const statusChildren = [
      isShutoff && {
        key: 'start',
        icon: <PlayCircleOutlined style={{ color: '#10b981' }} />,
        label: t('Start Instance'),
        title: StartAction.description,
        onClick: () => handleAction(StartAction, instance),
      },
      isRunning && {
        key: 'stop',
        icon: <PauseCircleOutlined style={{ color: '#f59e0b' }} />,
        label: t('Stop Instance'),
        title: StopAction.description,
        disabled: instance.locked,
        onClick: () => handleAction(StopAction, instance),
      },
      {
        key: 'soft-reboot',
        icon: <ReloadOutlined />,
        label: t('Soft Reboot'),
        title: SoftRebootAction.description,
        disabled: !isRunning || instance.locked,
        onClick: () => handleAction(SoftRebootAction, instance),
      },
      {
        key: 'reboot',
        icon: <ReloadOutlined style={{ color: '#ef4444' }} />,
        label: t('Hard Reboot'),
        title: RebootAction.description,
        danger: true,
        disabled: instance.locked,
        onClick: () => handleAction(RebootAction, instance),
      },
      {
        key: 'lock-toggle',
        icon: instance.locked ? <UnlockOutlined /> : <LockOutlined />,
        label: instance.locked ? t('Unlock Instance') : t('Lock Instance'),
        title: instance.locked ? UnlockAction.description : LockAction.description,
        onClick: () => handleAction(instance.locked ? UnlockAction : LockAction, instance),
      },
      isRunning && {
        key: 'pause',
        icon: <PauseCircleOutlined />,
        label: t('Pause Instance'),
        title: PauseAction.description,
        disabled: instance.locked,
        onClick: () => handleAction(PauseAction, instance),
      },
      instance.status?.toLowerCase() === 'paused' && {
        key: 'unpause',
        icon: <PlayCircleOutlined style={{ color: '#10b981' }} />,
        label: t('Unpause Instance'),
        title: UnpauseAction.description,
        disabled: instance.locked,
        onClick: () => handleAction(UnpauseAction, instance),
      },
      isRunning && {
        key: 'suspend',
        icon: <PoweroffOutlined />,
        label: t('Suspend Instance'),
        title: SuspendAction.description,
        disabled: instance.locked,
        onClick: () => handleAction(SuspendAction, instance),
      },
      instance.status?.toLowerCase() === 'suspended' && {
        key: 'resume',
        icon: <PlayCircleOutlined style={{ color: '#10b981' }} />,
        label: t('Resume Instance'),
        title: ResumeAction.description,
        disabled: instance.locked,
        onClick: () => handleAction(ResumeAction, instance),
      },
      ['active', 'shutoff', 'paused', 'suspended'].includes(instance.status?.toLowerCase()) && {
        key: 'shelve',
        icon: <CloudDownloadOutlined />,
        label: t('Shelve Instance'),
        title: ShelveAction.description,
        disabled: instance.locked,
        onClick: () => handleAction(ShelveAction, instance),
      },
      ['shelved', 'shelved_offloaded'].includes(instance.status?.toLowerCase()) && {
        key: 'unshelve',
        icon: <CloudUploadOutlined style={{ color: '#10b981' }} />,
        label: t('Unshelve Instance'),
        title: UnshelveAction.description,
        onClick: () => handleAction(UnshelveAction, instance),
      },
      ['active', 'shutoff'].includes(instance.status?.toLowerCase()) && !instance.locked && {
        key: 'rescue',
        icon: <SafetyOutlined style={{ color: '#f59e0b' }} />,
        label: t('Rescue Instance'),
        title: RescueAction.description,
        onClick: () => handleAction(RescueAction, instance),
      },
      instance.status?.toLowerCase() === 'rescue' && {
        key: 'unrescue',
        icon: <UndoOutlined style={{ color: '#10b981' }} />,
        label: t('Unrescue Instance'),
        title: UnrescueAction.description,
        onClick: () => handleAction(UnrescueAction, instance),
      },
      ['active', 'shutoff', 'error'].includes(instance.status?.toLowerCase()) && !instance.locked && {
        key: 'rebuild',
        icon: <SyncOutlined style={{ color: '#ef4444' }} />,
        label: t('Rebuild Instance'),
        title: RebuildAction.description,
        danger: true,
        onClick: () => handleAction(RebuildAction, instance),
      },
      isAdmin && {
        key: 'reset-state',
        icon: <UndoOutlined />,
        label: t('Reset State'),
        title: ResetStateAction.description,
        onClick: () => handleAction(ResetStateAction, instance),
      },
    ].filter(Boolean);

    // 2. Related Resources
    const resourceChildren = [
      {
        key: 'attach-volume',
        icon: <HddOutlined />,
        label: t('Attach Volume'),
        title: AttachVolumeAction.description,
        disabled: instance.locked,
        onClick: () => handleAction(AttachVolumeAction, instance),
      },
      {
        key: 'detach-volume',
        icon: <DisconnectOutlined />,
        label: t('Detach Volume'),
        title: DetachVolumeAction.description,
        danger: true,
        disabled: instance.locked || volumes.length === 0,
        onClick: () => handleAction(DetachVolumeAction, instance),
      },
      {
        key: 'attach-interface',
        icon: <ApartmentOutlined />,
        label: t('Attach Interface'),
        title: AttachInterfaceAction.description,
        disabled: instance.locked,
        onClick: () => handleAction(AttachInterfaceAction, instance),
      },
      {
        key: 'detach-interface',
        icon: <DisconnectOutlined />,
        label: t('Detach Interface'),
        title: DetachInterfaceAction.description,
        danger: true,
        disabled: instance.locked,
        onClick: () => handleAction(DetachInterfaceAction, instance),
      },
    ];

    // 3. Backups & Snapshots
    const backupChildren = [
      {
        key: 'create-snapshot',
        icon: <CameraOutlined />,
        label: t('Create Snapshot'),
        title: CreateSnapshotAction.description,
        disabled: instance.locked,
        onClick: () => handleAction(CreateSnapshotAction, instance),
      },
    ];

    // 4. Configuration Update
    const configChildren = [
      !instance.locked && {
        key: 'edit-instance',
        icon: <EditOutlined style={{ color: '#0068ff' }} />,
        label: t('Edit Instance'),
        title: EditInstanceAction.description,
        onClick: () => handleAction(EditInstanceAction, instance),
      },
      {
        key: 'resize',
        icon: <SettingOutlined />,
        label: t('Resize Instance'),
        title: ResizeAction.description,
        disabled: instance.locked,
        onClick: () => handleAction(ResizeAction, instance),
      },
      instance.status === 'VERIFY_RESIZE' && {
        key: 'confirm-resize',
        icon: <CheckCircleOutlined style={{ color: '#10b981' }} />,
        label: t('Confirm Resize'),
        title: ConfirmResizeAction.description,
        onClick: () => handleAction(ConfirmResizeAction, instance),
      },
      instance.status === 'VERIFY_RESIZE' && {
        key: 'revert-resize',
        icon: <CloseCircleOutlined style={{ color: '#ef4444' }} />,
        label: t('Revert Resize'),
        title: RevertResizeAction.description,
        danger: true,
        onClick: () => handleAction(RevertResizeAction, instance),
      },
      {
        key: 'change-password',
        icon: <KeyOutlined />,
        label: t('Change Admin Password'),
        title: ChangePasswordAction.description,
        disabled: !isRunning || instance.locked,
        onClick: () => handleAction(ChangePasswordAction, instance),
      },
      {
        key: 'modify-tags',
        icon: <TagOutlined />,
        label: t('Modify Tags'),
        title: ModifyTagsAction.description,
        onClick: () => handleAction(ModifyTagsAction, instance),
      },
    ].filter(Boolean);

    // 5. Administration (Admin only)
    const adminChildren = isAdmin
      ? [
          {
            key: 'cold-migrate',
            icon: <ExportOutlined />,
            label: t('Cold Migrate'),
            title: MigrateAction.description,
            onClick: () => handleAction(MigrateAction, instance),
          },
          {
            key: 'live-migrate',
            icon: <SyncOutlined />,
            label: t('Live Migrate'),
            title: LiveMigrateAction.description,
            disabled: !isRunning,
            onClick: () => handleAction(LiveMigrateAction, instance),
          },
        ]
      : [];

    const items = [
      {
        type: 'group',
        label: (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('Instance Status')}
          </span>
        ),
        children: statusChildren,
      },
      {
        type: 'group',
        label: (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('Related Resources')}
          </span>
        ),
        children: resourceChildren,
      },
      {
        type: 'group',
        label: (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('Backups & Snapshots')}
          </span>
        ),
        children: backupChildren,
      },
      {
        type: 'group',
        label: (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('Configuration')}
          </span>
        ),
        children: configChildren,
      },
    ];

    if (adminChildren.length > 0) {
      items.push({
        type: 'group',
        label: (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('Administration')}
          </span>
        ),
        children: adminChildren,
      });
    }

    items.push({ type: 'divider' });

    items.push({
      key: 'delete',
      icon: <DeleteOutlined />,
      label: t('Delete Instance'),
      danger: true,
      disabled: instance.locked,
      onClick: handleDeleteInstance,
    });

    return items;
  }, [instance, isRunning, isShutoff, isAdmin, volumes.length, t, handleAction]);

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
                <Tooltip title={t('Edit Instance')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined style={{ color: '#0068ff' }} />}
                    disabled={instance.locked}
                    onClick={() => handleAction(EditInstanceAction, instance)}
                    style={{ width: 28, height: 28, minWidth: 28 }}
                  />
                </Tooltip>
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

          {/* Action Toolbar matching legacy Skyline & UI/UX guidelines */}
          <Space wrap size={8} style={{ alignItems: 'center' }}>
            {/* 1. Primary CTA: VNC Console */}
            <Button
              type="primary"
              icon={<CodeOutlined />}
              onClick={() => handleAction(ConsoleAction, instance)}
              style={{
                backgroundColor: '#0068ff',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(0, 104, 255, 0.25)',
              }}
            >
              {t('Console')}
            </Button>

            {/* 2. Contextual Primary / Secondary Lifecycle Button */}
            {isShutoff && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => handleAction(StartAction, instance)}
                style={{
                  backgroundColor: '#10b981',
                  borderColor: '#10b981',
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)',
                }}
              >
                {t('Start')}
              </Button>
            )}

            {isRunning && (
              <>
                <Button
                  icon={<PauseCircleOutlined />}
                  disabled={instance.locked}
                  onClick={() => handleAction(StopAction, instance)}
                >
                  {t('Stop')}
                </Button>

                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'soft',
                        icon: <ReloadOutlined />,
                        label: t('Soft Reboot'),
                        onClick: () => handleAction(SoftRebootAction, instance),
                      },
                      {
                        key: 'hard',
                        icon: <ReloadOutlined style={{ color: '#ef4444' }} />,
                        label: t('Hard Reboot'),
                        danger: true,
                        onClick: () => handleAction(RebootAction, instance),
                      },
                    ],
                  }}
                  disabled={instance.locked}
                >
                  <Button icon={<ReloadOutlined />}>
                    {t('Reboot')} <DownOutlined style={{ fontSize: 10 }} />
                  </Button>
                </Dropdown>
              </>
            )}

            {instance.status === 'VERIFY_RESIZE' && (
              <>
                <Button
                  type="primary"
                  style={{ backgroundColor: '#10b981', borderColor: '#10b981', fontWeight: 600 }}
                  onClick={() => handleAction(ConfirmResizeAction, instance)}
                >
                  {t('Confirm Resize')}
                </Button>
                <Button
                  danger
                  onClick={() => handleAction(RevertResizeAction, instance)}
                >
                  {t('Revert Resize')}
                </Button>
              </>
            )}

            {instance.status === 'RESCUE' && (
              <Button
                type="primary"
                icon={<UndoOutlined />}
                style={{ backgroundColor: '#10b981', borderColor: '#10b981', fontWeight: 600 }}
                onClick={() => handleAction(UnrescueAction, instance)}
              >
                {t('Unrescue')}
              </Button>
            )}

            {instance.status === 'ERROR' && (
              <Button
                danger
                icon={<SyncOutlined />}
                onClick={() => handleAction(RebuildAction, instance)}
              >
                {t('Rebuild')}
              </Button>
            )}

            {/* 3. Snapshot Quick Action */}
            <Button
              icon={<CameraOutlined />}
              disabled={instance.locked}
              onClick={() => handleAction(CreateSnapshotAction, instance)}
            >
              {t('Create Snapshot')}
            </Button>

            {/* 4. Complete Categorized More Actions Dropdown */}
            <Dropdown menu={{ items: moreMenuItems }} trigger={['click']} placement="bottomRight">
              <Button icon={<MoreOutlined />}>
                {t('More Actions')} <DownOutlined style={{ fontSize: 10 }} />
              </Button>
            </Dropdown>
          </Space>
        </div>
      </div>

      {/* Main Tabs Container */}
      <Card
        bordered={false}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Space>
                            <DesktopOutlined style={{ color: '#0068ff' }} />
                            <span>{t('Flavor Info')}</span>
                          </Space>
                          <Button
                            type="link"
                            size="small"
                            icon={<SettingOutlined />}
                            disabled={instance.locked}
                            onClick={() => handleAction(ResizeAction, instance)}
                            style={{ padding: 0, fontWeight: 600, color: '#0068ff' }}
                          >
                            {t('Resize')}
                          </Button>
                        </div>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Space>
                            <TagOutlined style={{ color: '#0068ff' }} />
                            <span>{t('Tags Info')}</span>
                          </Space>
                          <Button
                            type="link"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => handleAction(ModifyTagsAction, instance)}
                            style={{ padding: 0, fontWeight: 600, color: '#0068ff' }}
                          >
                            {t('Edit')}
                          </Button>
                        </div>
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
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12,
                      marginBottom: 16,
                      background: '#f8fafc',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{t('Attached Volumes')}</span>
                        <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>{volumes.length}</Tag>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {t('Manage block storage volumes attached to this compute instance.')}
                      </div>
                    </div>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      disabled={instance.locked}
                      onClick={() => handleAction(AttachVolumeAction, instance)}
                      style={{ backgroundColor: '#0068ff', fontWeight: 600 }}
                    >
                      {t('Attach Volume')}
                    </Button>
                  </div>
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
                      {
                        title: t('Action'),
                        key: 'action',
                        width: 140,
                        render: (_, record) => {
                          if (record.isBootable || record.device === '/dev/vda') {
                            return (
                              <Tooltip title={t('Root system disk cannot be detached while running')}>
                                <span style={{ color: '#94a3b8', fontSize: 12 }}>{t('Root Disk')}</span>
                              </Tooltip>
                            );
                          }
                          return (
                            <Button
                              type="link"
                              danger
                              size="small"
                              icon={<DisconnectOutlined />}
                              disabled={instance.locked}
                              onClick={() => handleDetachSingleVolume(record)}
                              style={{ padding: 0 }}
                            >
                              {t('Detach')}
                            </Button>
                          );
                        },
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
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12,
                      marginBottom: 16,
                      background: '#f8fafc',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{t('Network Interfaces')}</span>
                        <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>{networkList.length}</Tag>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {t('Manage virtual NIC ports and network attachments connected to this compute instance.')}
                      </div>
                    </div>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      disabled={instance.locked}
                      onClick={() => handleAction(AttachInterfaceAction, instance)}
                      style={{ backgroundColor: '#0068ff', fontWeight: 600 }}
                    >
                      {t('Attach Interface')}
                    </Button>
                  </div>
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
                      {
                        title: t('Action'),
                        key: 'action',
                        width: 140,
                        render: (_, record) => {
                          const portId = record.portId;
                          if (!portId || portId === '-') {
                            return <span style={{ color: '#94a3b8' }}>-</span>;
                          }
                          return (
                            <Button
                              type="link"
                              danger
                              size="small"
                              icon={<DisconnectOutlined />}
                              disabled={instance.locked}
                              onClick={() => handleDetachSinglePort(record)}
                              style={{ padding: 0 }}
                            >
                              {t('Detach')}
                            </Button>
                          );
                        },
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'security-groups',
              label: t('Security Groups'),
              children: (
                <div>
                  {/* Security Groups Header Summary with Attach Action */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12,
                      marginBottom: 16,
                      background: '#f8fafc',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SafetyOutlined style={{ color: '#0068ff' }} />
                        <span>{t('Security Groups')}</span>
                        <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>{securityGroups.length}</Tag>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {t('Quản lý nhóm bảo mật, thêm/sửa/xóa luật tường lửa và áp dụng trực tiếp cho máy ảo này.')}
                      </div>
                    </div>
                    <Space wrap>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        disabled={instance.locked}
                        onClick={() => {
                          setSelectedSgToAttach(null);
                          setAttachSgModalVisible(true);
                        }}
                        style={{ backgroundColor: '#0068ff', fontWeight: 600 }}
                      >
                        {t('Gán Security Group')}
                      </Button>
                      <Button
                        icon={<SettingOutlined />}
                        onClick={() => navigate('/network/security-group')}
                      >
                        {t('Quản lý Security Groups')}
                      </Button>
                    </Space>
                  </div>

                  {/* List of Security Groups Cards with Interactive Rules Table */}
                  {securityGroups.length > 0 ? (
                    securityGroups.map((sg, idx) => (
                      <Card
                        key={sg.id || idx}
                        size="small"
                        title={
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <Space size={8} wrap>
                              <SafetyOutlined style={{ color: '#0068ff', fontSize: 16 }} />
                              <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{sg.name}</span>
                              <Tag color="blue" style={{ fontWeight: 600 }}>
                                {sg.rules?.length || 0} {t('Rules')}
                              </Tag>
                              {sg.description && (
                                <span style={{ color: '#64748b', fontSize: 12, fontWeight: 400 }}>
                                  — {sg.description}
                                </span>
                              )}
                              {sg.id && (
                                <Space size={4} style={{ fontSize: 12, color: '#64748b' }}>
                                  <span>ID:</span>
                                  <CopyableText text={sg.id} display={`${sg.id.substring(0, 10)}...`} />
                                </Space>
                              )}
                            </Space>
                            <Space size={8} wrap>
                              <Button
                                type="primary"
                                ghost
                                size="small"
                                icon={<PlusOutlined />}
                                disabled={instance.locked}
                                onClick={() => {
                                  setSelectedSgForRule(sg);
                                  addRuleForm.setFieldsValue({
                                    direction: 'ingress',
                                    ethertype: 'IPv4',
                                    ruleType: 'custom_tcp',
                                    port_min: 80,
                                    port_max: 80,
                                    remoteType: 'cidr',
                                    remote_ip_prefix: '0.0.0.0/0',
                                    description: '',
                                  });
                                  setAddRuleModalVisible(true);
                                }}
                                style={{ fontWeight: 600 }}
                              >
                                {t('Thêm Rule')}
                              </Button>
                              <Button
                                size="small"
                                danger
                                icon={<DisconnectOutlined />}
                                disabled={instance.locked}
                                onClick={() => handleDetachSecurityGroup(sg)}
                              >
                                {t('Gỡ khỏi máy ảo')}
                              </Button>
                            </Space>
                          </div>
                        }
                        bordered={false}
                        style={{
                          marginBottom: 16,
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                        }}
                      >
                        {sg.rules && sg.rules.length > 0 ? (
                          <Table
                            dataSource={sg.rules}
                            pagination={false}
                            rowKey="id"
                            size="small"
                            scroll={{ x: 760 }}
                            columns={[
                              {
                                title: t('Direction'),
                                dataIndex: 'direction',
                                key: 'direction',
                                width: 140,
                                render: (d) => (
                                  <Tag
                                    color={d === 'INGRESS' ? 'green' : 'orange'}
                                    icon={d === 'INGRESS' ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
                                    style={{ fontWeight: 600 }}
                                  >
                                    {d === 'INGRESS' ? 'Ingress (Vào)' : 'Egress (Ra)'}
                                  </Tag>
                                ),
                              },
                              {
                                title: t('Ether Type'),
                                dataIndex: 'ethertype',
                                key: 'ethertype',
                                width: 100,
                                render: (et) => <Tag color={et === 'IPv4' ? 'default' : 'purple'}>{et}</Tag>,
                              },
                              {
                                title: t('Protocol'),
                                dataIndex: 'protocol',
                                key: 'protocol',
                                width: 100,
                                render: (p) => (
                                  <Tag
                                    color={p === 'TCP' ? 'blue' : p === 'UDP' ? 'cyan' : p === 'ICMP' ? 'gold' : 'geekblue'}
                                    style={{ fontWeight: 600 }}
                                  >
                                    {p}
                                  </Tag>
                                ),
                              },
                              {
                                title: t('Port Range'),
                                dataIndex: 'portRange',
                                key: 'portRange',
                                width: 140,
                                render: (pr) => (
                                  <code
                                    style={{
                                      fontSize: 12,
                                      color: '#0f172a',
                                      fontWeight: 600,
                                      background: '#f1f5f9',
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                    }}
                                  >
                                    {pr}
                                  </code>
                                ),
                              },
                              {
                                title: t('Remote IP / CIDR / Group'),
                                dataIndex: 'remote',
                                key: 'remote',
                                render: (rem) => (
                                  <code
                                    style={{
                                      fontSize: 12,
                                      color: '#334155',
                                      background: '#f8fafc',
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      border: '1px solid #e2e8f0',
                                    }}
                                  >
                                    {rem}
                                  </code>
                                ),
                              },
                              {
                                title: t('Description'),
                                dataIndex: 'description',
                                key: 'description',
                                render: (desc) => <span style={{ color: '#64748b', fontSize: 12 }}>{desc}</span>,
                              },
                              {
                                title: t('Action'),
                                key: 'action',
                                width: 160,
                                align: 'center',
                                render: (_, rule) => (
                                  <Space size={4}>
                                    <Button
                                      type="link"
                                      size="small"
                                      icon={<EditOutlined />}
                                      disabled={instance.locked}
                                      onClick={() => handlePrefillRule(sg, rule)}
                                      style={{ padding: '0 4px', fontSize: 12 }}
                                    >
                                      {t('Sửa')}
                                    </Button>
                                    <Button
                                      type="link"
                                      danger
                                      size="small"
                                      icon={<DeleteOutlined />}
                                      disabled={instance.locked}
                                      onClick={() => handleDeleteRule(rule)}
                                      style={{ padding: '0 4px', fontSize: 12 }}
                                    >
                                      {t('Delete')}
                                    </Button>
                                  </Space>
                                ),
                              },
                            ]}
                          />
                        ) : (
                          <Alert
                            message={t('Không có luật tường lửa (rules) nào trong nhóm này')}
                            type="info"
                            showIcon
                          />
                        )}
                      </Card>
                    ))
                  ) : (
                    <Alert
                      message={t('Chưa có Security Group nào được cấu hình')}
                      description={t('Nhấn "Gán Security Group" ở trên để bảo vệ máy ảo với nhóm tường lửa phù hợp.')}
                      type="info"
                      showIcon
                    />
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

      {/* Modal: Gán Security Group vào máy ảo */}
      <Modal
        title={
          <Space>
            <SafetyOutlined style={{ color: '#0068ff' }} />
            <span>{t('Gán Security Group vào máy ảo')}</span>
          </Space>
        }
        open={attachSgModalVisible}
        onCancel={() => {
          setAttachSgModalVisible(false);
          setSelectedSgToAttach(null);
        }}
        onOk={handleAttachSecurityGroup}
        confirmLoading={attachSgSubmitting}
        okText={t('Gán vào máy ảo')}
        cancelText={t('Cancel')}
        okButtonProps={{ disabled: !selectedSgToAttach, style: { backgroundColor: '#0068ff' } }}
        destroyOnClose
      >
        <div style={{ marginTop: 12 }}>
          <p style={{ color: '#475569', fontSize: 13, marginBottom: 16 }}>
            {t('Chọn nhóm bảo mật trong dự án để gán thêm cho máy ảo ')} <b>{instance?.name}</b>:
          </p>

          <Form layout="vertical">
            <Form.Item label={t('Security Group')} required>
              <Select
                placeholder={t('Chọn nhóm bảo mật')}
                value={selectedSgToAttach}
                onChange={setSelectedSgToAttach}
                style={{ width: '100%' }}
                options={allProjectSgs
                  .filter((sg) => !securityGroups.some((att) => att.id === sg.id || att.name === sg.name))
                  .map((sg) => ({
                    value: sg.name,
                    label: (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span><b>{sg.name}</b> {sg.description ? `— ${sg.description}` : ''}</span>
                        <Tag color="blue" style={{ fontSize: 10 }}>{sg.security_group_rules?.length || 0} rules</Tag>
                      </div>
                    ),
                  }))}
              />
            </Form.Item>
          </Form>

          {allProjectSgs.filter((sg) => !securityGroups.some((att) => att.id === sg.id || att.name === sg.name)).length === 0 && (
            <Alert
              type="info"
              showIcon
              message={t('Tất cả các Security Groups trong dự án hiện đã được gán vào máy ảo này.')}
            />
          )}
        </div>
      </Modal>

      {/* Modal: Thêm luật tường lửa (Rule) */}
      <Modal
        title={
          <Space>
            <SafetyOutlined style={{ color: '#0068ff' }} />
            <span>
              {t('Thêm Luật Tường Lửa')} {selectedSgForRule?.name ? `— ${selectedSgForRule.name}` : ''}
            </span>
          </Space>
        }
        open={addRuleModalVisible}
        onCancel={() => {
          setAddRuleModalVisible(false);
          addRuleForm.resetFields();
        }}
        onOk={() => addRuleForm.submit()}
        confirmLoading={ruleSubmitting}
        okText={t('Áp dụng Rule')}
        cancelText={t('Cancel')}
        okButtonProps={{ style: { backgroundColor: '#0068ff' } }}
        width={600}
        destroyOnClose
      >
        <Form
          form={addRuleForm}
          layout="vertical"
          onFinish={handleCreateRule}
          initialValues={{
            direction: 'ingress',
            ethertype: 'IPv4',
            ruleType: 'custom_tcp',
            port_min: 80,
            port_max: 80,
            remoteType: 'cidr',
            remote_ip_prefix: '0.0.0.0/0',
          }}
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="direction" label={t('Chiều lưu lượng (Direction)')} rules={[{ required: true }]}>
                <Radio.Group buttonStyle="solid" style={{ width: '100%', display: 'flex' }}>
                  <Radio.Button value="ingress" style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
                    <ArrowDownOutlined style={{ color: '#10b981', marginRight: 4 }} />
                    {t('Ingress (Vào)')}
                  </Radio.Button>
                  <Radio.Button value="egress" style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
                    <ArrowUpOutlined style={{ color: '#f59e0b', marginRight: 4 }} />
                    {t('Egress (Ra)')}
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ethertype" label={t('Loại mạng (Ethertype)')} rules={[{ required: true }]}>
                <Radio.Group buttonStyle="solid" style={{ width: '100%', display: 'flex' }}>
                  <Radio.Button value="IPv4" style={{ flex: 1, textAlign: 'center' }}>IPv4</Radio.Button>
                  <Radio.Button value="IPv6" style={{ flex: 1, textAlign: 'center' }}>IPv6</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="ruleType" label={t('Loại giao thức / Mẫu cổng')} rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'TCP tùy chỉnh (Custom TCP)', value: 'custom_tcp' },
                { label: 'UDP tùy chỉnh (Custom UDP)', value: 'custom_udp' },
                { label: 'Tất cả ICMP (Ping / Echo)', value: 'custom_icmp' },
                { label: 'Tất cả cổng TCP (1 - 65535)', value: 'all_tcp' },
                { label: 'Tất cả cổng UDP (1 - 65535)', value: 'all_udp' },
                { label: 'Tất cả lưu lượng (ANY Protocol)', value: 'all_traffic' },
                { label: 'SSH (Cổng TCP 22)', value: 'ssh' },
                { label: 'HTTP (Cổng TCP 80)', value: 'http' },
                { label: 'HTTPS (Cổng TCP 443)', value: 'https' },
                { label: 'MySQL (Cổng TCP 3306)', value: 'mysql' },
                { label: 'PostgreSQL (Cổng TCP 5432)', value: 'postgres' },
                { label: 'RDP (Cổng TCP 3389)', value: 'rdp' },
              ]}
            />
          </Form.Item>

          {/* Conditional Port inputs */}
          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.ruleType !== curr.ruleType}
          >
            {({ getFieldValue }) => {
              const ruleType = getFieldValue('ruleType');
              if (ruleType === 'custom_tcp' || ruleType === 'custom_udp') {
                return (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="port_min"
                        label={t('Cổng từ (Port Min)')}
                        rules={[{ required: true, message: 'Nhập số cổng (1 - 65535)' }]}
                      >
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="80" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="port_max"
                        label={t('Cổng đến (Port Max)')}
                      >
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="80 (nếu cổng đơn)" />
                      </Form.Item>
                    </Col>
                  </Row>
                );
              }
              return null;
            }}
          </Form.Item>

          <Row gutter={16}>
            <Col span={10}>
              <Form.Item name="remoteType" label={t('Loại nguồn / đích')}>
                <Radio.Group>
                  <Radio value="cidr">CIDR</Radio>
                  <Radio value="sg">Security Group</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) => prev.remoteType !== curr.remoteType || prev.ethertype !== curr.ethertype}
              >
                {({ getFieldValue }) => {
                  const rType = getFieldValue('remoteType');
                  const eth = getFieldValue('ethertype');
                  if (rType === 'sg') {
                    return (
                      <Form.Item
                        name="remote_group_id"
                        label={t('Nhóm nguồn / đích (Security Group)')}
                        rules={[{ required: true, message: 'Chọn nhóm bảo mật' }]}
                      >
                        <Select
                          placeholder={t('Chọn nhóm')}
                          options={allProjectSgs.map((sg) => ({
                            value: sg.id,
                            label: sg.name,
                          }))}
                        />
                      </Form.Item>
                    );
                  }
                  return (
                    <Form.Item
                      name="remote_ip_prefix"
                      label={t('Địa chỉ CIDR nguồn / đích')}
                      rules={[{ required: true, message: 'Nhập dải mạng CIDR' }]}
                    >
                      <Input placeholder={eth === 'IPv6' ? '::/0' : '0.0.0.0/0'} />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label={t('Mô tả luật (Description)')}>
            <Input placeholder={t('Ví dụ: Cho phép truy cập Web HTTP hoặc SSH nội bộ')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Mount Dynamic Action Modal for Attach Volume, Resize, Snapshot, Password, etc. */}
      {actionModal}
    </div>
  );
}
