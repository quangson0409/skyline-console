import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { checkActionPolicy, usePolicyStore } from '@/core/policy';
import { buildGroupedMenuItems } from '@/components/Action/moreMenu';
import { useParams, useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
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
  Result,
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
import { glanceApi } from '@/api/glance';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/core/i18n';
import Status from '@/components/Status';
import { useActionRunner } from '@/components/Action/useActionRunner';
import { getInstanceActions } from '@/pages/Instances/actions';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { hasEndpoint } from '@/api/endpoints';
import { useIsAdminPage, IdNameCell, formatTime } from '@/components/ResourcePage/helpers';
import {
  normalizeServer,
  isInstanceTransition,
  isIronicInstance,
  instanceStatusText,
  renderTags,
} from '@/pages/Instances/resources';
import {
  VolumesTab,
  SnapshotsTab,
  InterfacesTab,
  FloatingIpsTab,
  ActionLogTab,
  LogsTab,
  ConsoleTab,
  AddButton,
} from '@/pages/Instances/detail/tabs';

/** legacy tab keys (?tab=) and the keys used by the previous version of this page */
const TAB_ALIASES = {
  details: 'detail',
  interfaces: 'interface',
  'security-groups': 'securityGroup',
  'action-logs': 'action',
  'console-log': 'logs',
  floatingips: 'floatingIps',
};

// Quick-copy helper with visual feedback
function CopyableText({ text, display, style }) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopied(true);
    message.success(t('Copied to clipboard'));
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
      <Tooltip title={copied ? t('Copied!') : t('Copy')}>
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
  const isAdminPage = useIsAdminPage();
  const isSystemReaderOnly = useAuthStore((st) => st.isSystemReaderOnly);
  usePolicyStore((st) => st.rules); // re-render when policies load
  // legacy Instance Detail `get policy()` (also the recycle bin detail, which reuses this page)
  const canView = checkActionPolicy({ policy: 'os_compute_api:servers:show' });
  // inline (non action) operations of the page: same legacy policy check as the actions
  const allow = (policy) => checkActionPolicy({ policy }, { isAdminPage, isSystemReaderOnly });
  // legacy tab components with their own list policy are hidden when it is denied
  const canTab = (policy) => checkActionPolicy({ policy });
  const { pathname } = useLocation();
  const isRecycleBinDetail = pathname.includes('recycle-bin');
  const listPath = isRecycleBinDetail
    ? `/management/recycle-bin${isAdminPage ? '-admin' : ''}`
    : `/compute/instance${isAdminPage ? '-admin' : ''}`;
  const A = getInstanceActions(isAdminPage);
  const {
    Console: ConsoleAction,
    Start: StartAction,
    Stop: StopAction,
    Reboot: RebootAction,
    SoftReboot: SoftRebootAction,
    Unrescue: UnrescueAction,
    Rebuild: RebuildAction,
    Edit: EditInstanceAction,
    AttachVolume: AttachVolumeAction,
    AttachInterface: AttachInterfaceAction,
    AssociateFip: AssociateFipAction,
    ManageSecurityGroup: ManageSecurityGroupAction,
    CreateSnapshot: CreateSnapshotAction,
    Resize: ResizeAction,
    ConfirmResize: ConfirmResizeAction,
    RevertResize: RevertResizeAction,
    ModifyTags: ModifyTagsAction,
    Delete: DeleteAction,
  } = A;

  const [instance, setInstance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'detail';
  const activeTab = TAB_ALIASES[rawTab] || rawTab;
  const setActiveTab = useCallback(
    (key) => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', key);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );
  const [serverGroup, setServerGroup] = useState(null);
  const [sgPortId, setSgPortId] = useState('all');

  // Enriched sub-resources
  const [volumes, setVolumes] = useState([]);
  const [ports, setPorts] = useState([]);

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
  const fetchServerDetail = useCallback(async (opts) => {
    if (!id) return;
    if (!canView) {
      setLoading(false);
      return;
    }
    const quiet = Boolean(opts && opts.quiet);
    if (!quiet) setLoading(true);
    try {
      // microversion 2.79: embedded flavor (original_name, vcpus, ram) like legacy
      const res = await novaApi.getServerV(id);
      const srv = res?.server || res;
      if (!srv) {
        setInstance(null);
        return;
      }
      // legacy Instance/Detail: a soft-deleted server is shown in the recycle bin detail
      if (!isRecycleBinDetail && String(srv.status).toLowerCase() === 'soft_deleted') {
        navigate(`/management/recycle-bin${isAdminPage ? '-admin' : ''}/detail/${srv.id || id}`, { replace: true });
        return;
      }

      const instanceProjectId = srv.tenant_id || srv.project_id || currentProject?.id;

      // Concurrently query flavor list, neutron ports, security groups scoped to project
      const [flavorsRes, portsRes, secGroupsRes] = await Promise.allSettled([
        novaApi.listFlavorsV(),
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
      // nova returns { id, links } only: resolve name / os_distro from glance (legacy itemInList.image_name)
      if (enrichedImage && typeof enrichedImage === 'object' && enrichedImage.id && !enrichedImage.name) {
        try {
          const img = await glanceApi.getImage(enrichedImage.id);
          if (img?.id) enrichedImage = { ...enrichedImage, name: img.name, os_distro: img.os_distro, disk_format: img.disk_format };
        } catch {
          // image deleted or not visible
        }
      }
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
          enrichedImage = { name: t('Boot from Volume'), isVolumeBacked: true };
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
        raw: srv,
        volumesAttached: enrichedVolumes.length > 0 ? enrichedVolumes : attached,
        security_groups: enrichedSgs,
      });
      setVolumes(enrichedVolumes);
      setPorts(enrichedPorts);
      // legacy serverGroupCard
      if ((srv.server_groups || [])[0]) {
        novaApi
          .getServerGroupV(srv.server_groups[0])
          .then((r) => setServerGroup(r?.server_group || null))
          .catch(() => setServerGroup(null));
      }
    } catch (err) {
      if (!quiet) message.error(t('Failed to load instance details: ') + err.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [id, t, canView, isRecycleBinDetail, isAdminPage, navigate]);

  const { handleAction, actionModal } = useActionRunner({ onRefresh: () => fetchServerDetail({ quiet: true }) });

  // normalized item for the legacy action checks (status, vm_state, locked, flavor_info, addresses...)
  const actionItem = useMemo(() => (instance?.raw ? normalizeServer(instance.raw) : null), [instance]);

  // legacy TabDetail watcher: poll while the server is in a transition status
  useAutoRefresh({
    data: actionItem,
    refetch: fetchServerDetail,
    initialAuto: false,
    isTransition: isInstanceTransition,
  });

  const can = (action) => {
    if (!action || !actionItem) return false;
    if (action.adminOnly && !isAdmin) return false;
    // legacy policy rules (same check as list row actions)
    if (!checkActionPolicy(action, { item: actionItem, isAdminPage, isSystemReaderOnly })) return false;
    try {
      return action.allowed ? Boolean(action.allowed(actionItem)) : true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    fetchServerDetail();
  }, [fetchServerDetail]);

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
          await novaApi.deleteVolumeAttachmentV(id, volume.id);
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
          await novaApi.deleteServerInterfaceV(id, portId);
          message.success(t('Detached interface successfully'));
          fetchServerDetail();
        } catch (err) {
          message.error(err.message || t('Failed to detach interface'));
        }
      },
    });
  };

  // Delete (legacy SoftDelete) then back to the list
  const handleDeleteInstance = () =>
    handleAction(
      {
        ...DeleteAction,
        onSubmit: async (target) => {
          await DeleteAction.onSubmit(target);
          navigate(listPath);
        },
      },
      actionItem
    );

  // Delete a security group rule with confirmation
  const handleDeleteRule = (rule) => {
    Modal.confirm({
      title: t('Delete security group rule?'),
      content: (
        <div>
          <p>{t('Are you sure you want to delete this rule? The firewall rules will be updated immediately.')}</p>
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
            <div><b>{t('Direction')}:</b> {rule.direction}</div>
            <div><b>{t('Protocol')}:</b> {rule.protocol}</div>
            <div><b>{t('Port')}:</b> {rule.portRange}</div>
            <div><b>{t('Remote')}:</b> {rule.remote}</div>
          </div>
        </div>
      ),
      okText: t('Delete Rule'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await neutronApi.deleteSecurityGroupRule(rule.id);
          message.success(t('Security group rule deleted successfully'));
          fetchServerDetail();
        } catch (err) {
          message.error(err.response?.data?.NeutronError?.message || err.message || t('Failed to delete rule'));
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
      message.success(t('Security group rule added and applied immediately'));
      setAddRuleModalVisible(false);
      addRuleForm.resetFields();
      fetchServerDetail();
    } catch (err) {
      message.error(err.response?.data?.NeutronError?.message || err.message || t('Failed to add rule'));
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
      message.success(t('Security group attached to the instance successfully'));
      setAttachSgModalVisible(false);
      setSelectedSgToAttach(null);
      fetchServerDetail();
    } catch (err) {
      message.error(err.response?.data?.badRequest?.message || err.message || t('Failed to attach security group'));
    } finally {
      setAttachSgSubmitting(false);
    }
  };

  // Detach a security group from instance
  const handleDetachSecurityGroup = (sg) => {
    Modal.confirm({
      title: `${t('Detach Security Group')}?`,
      content: t('Are you sure you want to detach security group "{name}" from this instance?', { name: sg.name }),
      okText: t('Detach'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await novaApi.removeSecurityGroup(instance.id, sg.name);
          message.success(t('Security group detached from the instance successfully'));
          fetchServerDetail();
        } catch (err) {
          message.error(err.response?.data?.badRequest?.message || err.message || t('Failed to detach security group'));
        }
      },
    });
  };


  // legacy Detail/SecurityGroup/action/Detach: PUT /ports/{id} { port: { security_groups } }
  const handleDetachPortSecurityGroup = (port, sg) => {
    Modal.confirm({
      title: t('Detach Security Group'),
      content: t('Are you sure to {action} "{name}"?', { action: t('detach security group'), name: sg.name }),
      okText: t('Detach'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await neutronApi.updatePort(port.id, {
            security_groups: (port.security_groups || []).filter((it) => it !== sg.id),
          });
          message.success(t('Operation completed successfully'));
          fetchServerDetail({ quiet: true });
        } catch (err) {
          message.error(err.response?.data?.NeutronError?.message || err.message || t('Operation failed'));
        }
      },
    });
  };

  // "More Actions" menu built from the legacy row action groups (project / administrator sets)
  // with the legacy allowed rules; Delete navigates back to the list.
  const rowActionConfig = useMemo(() => A.getRowActions(), [A]);
  const moreMenuItems = useMemo(() => {
    if (!actionItem) return [];
    // same builder as the Instance list rows (components/Action/moreMenu.jsx)
    return buildGroupedMenuItems(rowActionConfig.moreActions, {
      can,
      tooltip: (act) => act.description || act.title,
      onClick: (act) => (act.id === 'delete' ? handleDeleteInstance() : handleAction(act, actionItem)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionItem, rowActionConfig, isAdmin, handleAction]);

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

  if (!canView) {
    return (
      <Result
        status="403"
        title={t("You don't have access to get {name}.", { name: t('Instance') })}
        extra={<Button onClick={() => navigate(listPath)}>{t('Back')}</Button>}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '120px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#64748b', fontSize: 13 }}>
          {t('Loading OpenStack instance details...')}
        </div>
      </div>
    );
  }

  if (!instance) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message={t('Instance not found')}
          description={t('The instance does not exist or has been deleted from the OpenStack cluster.')}
        />
        <Button style={{ marginTop: 16 }} onClick={() => navigate(listPath)}>
          {t('Back to instance list')}
        </Button>
      </div>
    );
  }

  const ironic = isIronicInstance(actionItem || {});
  // legacy tabs: Volumes only with cinder, Volumes / Snapshots hidden for ironic instances
  const showVolumes = hasEndpoint('cinder') && !ironic && canTab('volume:get_all');
  const selectedSgPort = sgPortId !== 'all' ? ports.find((p) => p.id === sgPortId) : null;
  const allSecurityGroups = instance.security_groups || [];
  const securityGroups = selectedSgPort
    ? allSecurityGroups.filter((sg) => (selectedSgPort.security_groups || []).includes(sg.id))
    : allSecurityGroups;
  const tags = instance.tags || [];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 40 }}>
      {/* Top Breadcrumb Navigation */}
      <div style={{ marginBottom: 16 }}>
        <Space size={8} style={{ marginBottom: 10 }}>
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(listPath)}
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
                <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                  {instance.name}
                </h1>
                {!isAdminPage && !isRecycleBinDetail && (
                <Tooltip title={t('Edit Instance')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined style={{ color: '#0068ff' }} />}
                    disabled={!can(EditInstanceAction)}
                    onClick={() => handleAction(EditInstanceAction, actionItem)}
                    style={{ width: 28, height: 28, minWidth: 28 }}
                  />
                </Tooltip>
                )}
                <Status status={String(instance.status || '').toLowerCase()} text={instanceStatusText(instance.status)} />
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
                  {t('Host')}: <b>{instance['OS-EXT-SRV-ATTR:host'] || '-'}</b>
                </span>
                <span>
                  {t('Availability Zone')}: <b>{instance['OS-EXT-AZ:availability_zone'] || 'nova'}</b>
                </span>
                <span>
                  {t('Created At')}: {instance.created ? formatTime(instance.created) : '-'}
                </span>
                <span>
                  {t('Lock Status')}: <b>{instance.locked ? t('Locked') : t('Not locked')}</b>
                </span>
                {isAdminPage && (
                  <span>
                    {t('Project ID')}: <CopyableText text={instance.tenant_id} />
                  </span>
                )}
              </Space>
            </div>
          </div>

          {/* Action Toolbar matching legacy Skyline & UI/UX guidelines */}
          {!isRecycleBinDetail && (
          <Space wrap size={8} style={{ alignItems: 'center' }}>
            {/* 1. Primary CTA: Console (legacy first action) */}
            <Button
              type="primary"
              icon={<CodeOutlined />}
              disabled={!can(ConsoleAction)}
              onClick={() => handleAction(ConsoleAction, actionItem)}
              style={{
                backgroundColor: '#0068ff',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(0, 104, 255, 0.25)',
              }}
            >
              {t('Console')}
            </Button>

            {/* 2. Contextual Primary / Secondary Lifecycle Button */}
            {can(StartAction) && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => handleAction(StartAction, actionItem)}
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

            {(can(StopAction) || can(SoftRebootAction) || can(RebootAction)) && (
              <>
                <Button
                  icon={<PauseCircleOutlined />}
                  disabled={!can(StopAction)}
                  onClick={() => handleAction(StopAction, actionItem)}
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
                        disabled: !can(SoftRebootAction),
                        onClick: () => handleAction(SoftRebootAction, actionItem),
                      },
                      {
                        key: 'hard',
                        icon: <ReloadOutlined style={{ color: '#ef4444' }} />,
                        label: t('Hard Reboot'),
                        danger: true,
                        disabled: !can(RebootAction),
                        onClick: () => handleAction(RebootAction, actionItem),
                      },
                    ],
                  }}
                >
                  <Button icon={<ReloadOutlined />}>
                    {t('Reboot')} <DownOutlined style={{ fontSize: 10 }} />
                  </Button>
                </Dropdown>
              </>
            )}

            {can(ConfirmResizeAction) && (
              <>
                <Button
                  type="primary"
                  style={{ backgroundColor: '#10b981', borderColor: '#10b981', fontWeight: 600 }}
                  onClick={() => handleAction(ConfirmResizeAction, actionItem)}
                >
                  {t('Confirm Resize')}
                </Button>
                <Button
                  danger
                  disabled={!can(RevertResizeAction)}
                  onClick={() => handleAction(RevertResizeAction, actionItem)}
                >
                  {t('Revert Resize')}
                </Button>
              </>
            )}

            {can(UnrescueAction) && (
              <Button
                type="primary"
                icon={<UndoOutlined />}
                style={{ backgroundColor: '#10b981', borderColor: '#10b981', fontWeight: 600 }}
                onClick={() => handleAction(UnrescueAction, actionItem)}
              >
                {t('Unrescue')}
              </Button>
            )}

            {instance.status === 'ERROR' && can(RebuildAction) && !isAdminPage && (
              <Button
                danger
                icon={<SyncOutlined />}
                onClick={() => handleAction(RebuildAction, actionItem)}
              >
                {t('Rebuild')}
              </Button>
            )}

            {/* 3. Snapshot Quick Action (not in the administrator action set) */}
            {!isAdminPage && can(CreateSnapshotAction) && (
            <Button
              icon={<CameraOutlined />}
              onClick={() => handleAction(CreateSnapshotAction, actionItem)}
            >
              {t('Create Snapshot')}
            </Button>
            )}

            {/* 4. Complete Categorized More Actions Dropdown */}
            <Dropdown menu={{ items: moreMenuItems }} trigger={['click']} placement="bottomRight" disabled={!moreMenuItems.length}>
              <Button icon={<MoreOutlined />}>
                {t('More Actions')} <DownOutlined style={{ fontSize: 10 }} />
              </Button>
            </Dropdown>
          </Space>
          )}
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
              key: 'detail',
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
                        <span style={{ color: '#94a3b8' }}>{t('No network ports')}</span>
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
                            onClick={() => handleAction(ResizeAction, actionItem)}
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
                          <b>{instance.flavor?.original_name || instance.flavor?.name || instance.flavor?.id || '-'}</b>
                        </Descriptions.Item>
                        <Descriptions.Item label="vCPU">
                          <b>{instance.flavor?.vcpus ?? '-'} {t('Cores')}</b>
                        </Descriptions.Item>
                        <Descriptions.Item label="RAM">
                          <b>
                            {instance.flavor?.ram ? `${instance.flavor.ram / 1024} GiB` : '-'}
                          </b>
                        </Descriptions.Item>
                        <Descriptions.Item label={t('Root Disk')}>
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
                          {instance.image?.name || (volumes[0]?.volume_image_metadata?.image_name) || t('Boot from Volume')}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('OS Distro')}>
                          <Tag color="cyan">
                            {instance.image?.os_distro || volumes[0]?.volume_image_metadata?.os_distro || 'Linux'}
                          </Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label={t('Image ID')} span={2}>
                          {instance.image?.id ? (
                            <Link to={`/compute/image${isAdminPage ? '-admin' : ''}/detail/${instance.image.id}`}>
                              {instance.image.id}
                            </Link>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>{t('Booted from volume')}</span>
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
                                <Tag key={i} color="blue" onClick={() => setActiveTab('securityGroup')} style={{ cursor: 'pointer' }}>
                                  {sg.name}
                                </Tag>
                              ))}
                            </Space>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>default</span>
                          )}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('SSH Keypair')}>
                          {instance.key_name ? (
                            isAdminPage ? (
                              instance.key_name
                            ) : (
                              <Link to={`/compute/keypair/detail/${encodeURIComponent(instance.key_name)}`}>{instance.key_name}</Link>
                            )
                          ) : (
                            <span style={{ color: '#94a3b8' }}>{t('None')}</span>
                          )}
                        </Descriptions.Item>
                        {!ironic && (
                          <Descriptions.Item label={t('Server Group')} span={2}>
                            {serverGroup ? (
                              <IdNameCell
                                id={serverGroup.id}
                                name={serverGroup.name}
                                href={`/compute/server-group${isAdminPage ? '-admin' : ''}/detail/${serverGroup.id}`}
                                bold={false}
                              />
                            ) : (
                              '-'
                            )}
                          </Descriptions.Item>
                        )}
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
                            onClick={() => handleAction(ModifyTagsAction, actionItem)}
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
                        <span style={{ color: '#94a3b8' }}>{t('No tags')}</span>
                      )}
                    </Card>
                  </Col>

                  {/* Right Column: Skyline Signature Resource Topology */}
                  <Col xs={24} lg={10}>
                    {/* legacy errorCard: server fault */}
                    {instance.fault?.message && (
                      <Card
                        size="small"
                        title={<span style={{ color: '#ef4444' }}>{t('Error')}</span>}
                        style={{ marginBottom: 16, borderRadius: 8, borderColor: '#fecaca' }}
                      >
                        <Descriptions column={1} size="small" bordered>
                          <Descriptions.Item label={t('Message')}>{instance.fault.message}</Descriptions.Item>
                          {hasAdminRole && instance.fault.details ? (
                            <Descriptions.Item label={t('Details')}>
                              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 11, maxHeight: 240, overflow: 'auto' }}>
                                {instance.fault.details}
                              </pre>
                            </Descriptions.Item>
                          ) : null}
                          <Descriptions.Item label={t('Code')}>{instance.fault.code}</Descriptions.Item>
                          <Descriptions.Item label={t('Created At')}>{formatTime(instance.fault.created)}</Descriptions.Item>
                        </Descriptions>
                      </Card>
                    )}
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
                            <span>{t('Network Ports')} ({networkList.length})</span>
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
                                  {t('Port')}: <CopyableText text={net.portId} display={`${net.portId.substring(0, 10)}...`} />
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
                            {t('Status')}: <b>{instance.status}</b> | {t('Host')}: <b>{instance['OS-EXT-SRV-ATTR:host'] || 'nova'}</b>
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                            {instance.flavor?.original_name || instance.flavor?.name || instance.flavor?.id || '-'} ({instance.flavor?.vcpus ?? '-'} vCPU / {instance.flavor?.ram ? instance.flavor.ram / 1024 : '-'} GiB)
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
                            <span>{t('Volumes')} ({volumes.length})</span>
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
                                      {vol.isBootable ? t('Root Disk') : t('Data Disk')}
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
                                  <span>{t('Type')}: <b>{vol.volume_type || 'ssd'}</b></span>
                                  <span>{t('Device')}: <code>{vol.device || '/dev/vda'}</code></span>
                                </div>
                                <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
                                  ID: <CopyableText text={vol.id} display={`${vol.id?.substring(0, 12)}...`} />
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, fontSize: 12, color: '#64748b' }}>
                              {t('Root disk (Ephemeral Storage)')}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Col>
                </Row>
              ),
            },
            showVolumes && {
              key: 'volumes',
              label: t('Volumes'),
              children: (
                <VolumesTab
                  item={actionItem}
                  isAdminPage={isAdminPage}
                  attachButton={
                    can(AttachVolumeAction) ? (
                      <AddButton onClick={() => handleAction(AttachVolumeAction, actionItem)}>{t('Attach Volume')}</AddButton>
                    ) : null
                  }
                />
              ),
            },
            !ironic && canTab('get_images') && {
              key: 'snapshots',
              label: t('Snapshots'),
              children: <SnapshotsTab item={actionItem} />,
            },
            canTab('get_port') && {
              key: 'interface',
              label: t('Interfaces'),
              children: (
                <InterfacesTab
                  item={actionItem}
                  count={ports.length}
                  attachButton={
                    can(AttachInterfaceAction) ? (
                      <AddButton onClick={() => handleAction(AttachInterfaceAction, actionItem)}>{t('Attach Interface')}</AddButton>
                    ) : null
                  }
                />
              ),
            },
            canTab('get_floatingip') && {
              key: 'floatingIps',
              label: t('Floating IPs'),
              children: (
                <FloatingIpsTab
                  item={actionItem}
                  isAdminPage={isAdminPage}
                  associateButton={
                    can(AssociateFipAction) ? (
                      <AddButton onClick={() => handleAction(AssociateFipAction, actionItem)}>{t('Associate Floating IP')}</AddButton>
                    ) : null
                  }
                />
              ),
            },
            {
              key: 'securityGroup',
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
                        {t('Manage security groups, add/edit/delete firewall rules and apply them directly to this instance.')}
                      </div>
                    </div>
                    <Space wrap>
                      {!isAdminPage && allow('os_compute_api:os-security-groups:add') && (
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
                        {t('Attach Security Group')}
                      </Button>
                      )}
                      {!isAdminPage && can(ManageSecurityGroupAction) && (
                        <Button
                          icon={<SafetyOutlined />}
                          onClick={() =>
                            handleAction(ManageSecurityGroupAction, {
                              ...actionItem,
                              __portId: selectedSgPort ? selectedSgPort.id : undefined,
                            })
                          }
                        >
                          {t('Manage Security Group')}
                        </Button>
                      )}
                      <Button
                        icon={<SettingOutlined />}
                        onClick={() => navigate(`/network/security-group${isAdminPage ? '-admin' : ''}`)}
                      >
                        {t('Manage Security Groups')}
                      </Button>
                    </Space>
                  </div>

                  {/* legacy per-interface view: pick a port to see / manage only its security groups */}
                  {ports.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <Radio.Group
                        value={sgPortId}
                        onChange={(e) => setSgPortId(e.target.value)}
                        optionType="button"
                        buttonStyle="solid"
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
                      >
                        <Radio.Button value="all">{t('All Interfaces')}</Radio.Button>
                        {ports.map((p) => (
                          <Radio.Button key={p.id} value={p.id}>
                            {t('Interface Name:')} {p.id.substring(0, 8)} · {t('Security Group Num:')} {(p.security_groups || []).length}
                          </Radio.Button>
                        ))}
                      </Radio.Group>
                      {selectedSgPort && selectedSgPort.port_security_enabled === false && (
                        <Alert
                          style={{ marginTop: 8 }}
                          type="warning"
                          showIcon
                          message={t('Port security is disabled on this interface.')}
                        />
                      )}
                    </div>
                  )}

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
                              {!isAdminPage && allow('create_security_group_rule') && (
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
                                {t('Add Rule')}
                              </Button>
                              )}
                              {selectedSgPort ? (
                                // legacy Detail/SecurityGroup Detach: port level, only when more than one group
                                !isAdminPage && securityGroups.length !== 1 && allow('update_port') && (
                                  <Button
                                    size="small"
                                    danger
                                    icon={<DisconnectOutlined />}
                                    onClick={() => handleDetachPortSecurityGroup(selectedSgPort, sg)}
                                  >
                                    {t('Detach')}
                                  </Button>
                                )
                              ) : (
                                !isAdminPage && allow('os_compute_api:os-security-groups:remove') && (
                                <Button
                                  size="small"
                                  danger
                                  icon={<DisconnectOutlined />}
                                  disabled={instance.locked}
                                  onClick={() => handleDetachSecurityGroup(sg)}
                                >
                                  {t('Detach from Instance')}
                                </Button>
                                )
                              )}
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
                                    {d === 'INGRESS' ? t('Ingress') : t('Egress')}
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
                              // legacy: rule actions only on project pages
                              ...(isAdminPage ? [] : [{
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
                                      disabled={instance.locked || !allow('create_security_group_rule')}
                                      onClick={() => handlePrefillRule(sg, rule)}
                                      style={{ padding: '0 4px', fontSize: 12 }}
                                    >
                                      {t('Edit')}
                                    </Button>
                                    <Button
                                      type="link"
                                      danger
                                      size="small"
                                      icon={<DeleteOutlined />}
                                      disabled={instance.locked || !allow('delete_security_group_rule')}
                                      onClick={() => handleDeleteRule(rule)}
                                      style={{ padding: '0 4px', fontSize: 12 }}
                                    >
                                      {t('Delete')}
                                    </Button>
                                  </Space>
                                ),
                              }]),
                            ]}
                          />
                        ) : (
                          <Alert
                            message={t('There are no rules in this security group')}
                            type="info"
                            showIcon
                          />
                        )}
                      </Card>
                    ))
                  ) : (
                    <Alert
                      message={t('No security groups configured')}
                      description={t('Click "Attach Security Group" above to protect the instance with a suitable security group.')}
                      type="info"
                      showIcon
                    />
                  )}
                </div>
              ),
            },
            canTab('os_compute_api:os-instance-actions:list') && {
              key: 'action',
              label: t('Action Logs'),
              children: <ActionLogTab item={actionItem} isAdminPage={isAdminPage} />,
            },
            {
              key: 'logs',
              label: t('Logs'),
              children: <LogsTab item={actionItem} />,
            },
            {
              key: 'console',
              label: t('Console'),
              children: activeTab === 'console' ? <ConsoleTab item={actionItem} /> : null,
            },
          ].filter(Boolean)}

        />
      </Card>

      {/* Modal: Gán Security Group vào máy ảo */}
      <Modal
        title={
          <Space>
            <SafetyOutlined style={{ color: '#0068ff' }} />
            <span>{t('Attach Security Group to Instance')}</span>
          </Space>
        }
        open={attachSgModalVisible}
        onCancel={() => {
          setAttachSgModalVisible(false);
          setSelectedSgToAttach(null);
        }}
        onOk={handleAttachSecurityGroup}
        confirmLoading={attachSgSubmitting}
        okText={t('Attach to Instance')}
        cancelText={t('Cancel')}
        okButtonProps={{ disabled: !selectedSgToAttach, style: { backgroundColor: '#0068ff' } }}
        destroyOnClose
      >
        <div style={{ marginTop: 12 }}>
          <p style={{ color: '#475569', fontSize: 13, marginBottom: 16 }}>
            {t('Select a security group in the project to attach to instance')} <b>{instance?.name}</b>:
          </p>

          <Form layout="vertical">
            <Form.Item label={t('Security Group')} required>
              <Select
                placeholder={t('Select security group')}
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
                        <Tag color="blue" style={{ fontSize: 10 }}>{t('{count} rules', { count: sg.security_group_rules?.length || 0 })}</Tag>
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
              message={t('All security groups in the project are already attached to this instance.')}
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
              {t('Add Security Group Rule')} {selectedSgForRule?.name ? `— ${selectedSgForRule.name}` : ''}
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
        okText={t('Apply Rule')}
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
              <Form.Item name="direction" label={t('Direction')} rules={[{ required: true }]}>
                <Radio.Group buttonStyle="solid" style={{ width: '100%', display: 'flex' }}>
                  <Radio.Button value="ingress" style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
                    <ArrowDownOutlined style={{ color: '#10b981', marginRight: 4 }} />
                    {t('Ingress')}
                  </Radio.Button>
                  <Radio.Button value="egress" style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
                    <ArrowUpOutlined style={{ color: '#f59e0b', marginRight: 4 }} />
                    {t('Egress')}
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ethertype" label={t('Ether Type')} rules={[{ required: true }]}>
                <Radio.Group buttonStyle="solid" style={{ width: '100%', display: 'flex' }}>
                  <Radio.Button value="IPv4" style={{ flex: 1, textAlign: 'center' }}>IPv4</Radio.Button>
                  <Radio.Button value="IPv6" style={{ flex: 1, textAlign: 'center' }}>IPv6</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="ruleType" label={t('Protocol / Port Template')} rules={[{ required: true }]}>
            <Select
              options={[
                { label: t('Custom TCP'), value: 'custom_tcp' },
                { label: t('Custom UDP'), value: 'custom_udp' },
                { label: t('All ICMP (Ping / Echo)'), value: 'custom_icmp' },
                { label: t('All TCP ports (1 - 65535)'), value: 'all_tcp' },
                { label: t('All UDP ports (1 - 65535)'), value: 'all_udp' },
                { label: t('All traffic (ANY protocol)'), value: 'all_traffic' },
                { label: t('{name} (TCP port {port})', { name: 'SSH', port: 22 }), value: 'ssh' },
                { label: t('{name} (TCP port {port})', { name: 'HTTP', port: 80 }), value: 'http' },
                { label: t('{name} (TCP port {port})', { name: 'HTTPS', port: 443 }), value: 'https' },
                { label: t('{name} (TCP port {port})', { name: 'MySQL', port: 3306 }), value: 'mysql' },
                { label: t('{name} (TCP port {port})', { name: 'PostgreSQL', port: 5432 }), value: 'postgres' },
                { label: t('{name} (TCP port {port})', { name: 'RDP', port: 3389 }), value: 'rdp' },
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
                        label={t('Port Min')}
                        rules={[{ required: true, message: t('Enter a port number (1 - 65535)') }]}
                      >
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="80" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="port_max"
                        label={t('Port Max')}
                      >
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder={t('80 (if single port)')} />
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
              <Form.Item name="remoteType" label={t('Remote Type')}>
                <Radio.Group>
                  <Radio value="cidr">CIDR</Radio>
                  <Radio value="sg">{t('Security Group')}</Radio>
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
                        label={t('Remote Security Group')}
                        rules={[{ required: true, message: t('Select security group') }]}
                      >
                        <Select
                          placeholder={t('Select group')}
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
                      label={t('Remote CIDR')}
                      rules={[{ required: true, message: t('Enter a CIDR range') }]}
                    >
                      <Input placeholder={eth === 'IPv6' ? '::/0' : '0.0.0.0/0'} />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label={t('Rule Description')}>
            <Input placeholder={t('e.g. Allow web HTTP or internal SSH access')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Mount Dynamic Action Modal for Attach Volume, Resize, Snapshot, Password, etc. */}
      {actionModal}
    </div>
  );
}
