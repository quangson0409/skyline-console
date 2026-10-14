/**
 * Port of the legacy StepCreate / CreateIronic helpers:
 * - resources/nova/instance (getUserData, isWindowsImage, setServerPassword, physicalNodeTypes)
 * - resources/cinder/snapshot (getDiskInfo, getAllDataDisks, getInstanceSnapshotDataDisk)
 * - resources/glance/image (canImageCreateInstance, getImageOS, system tabs)
 * - utils/validate (instance name / password / ascii / ip validators)
 * - StepCreate.getVolumeAndImageData / getNetworkData / getSubmitData and CreateIronic.getSubmitData
 *
 * Form values keep the legacy shapes ({ value, label } for wrapped radios/selects,
 * { selectedRowKeys, selectedRows } for select tables, { value: {...} } items for add-select lists)
 * so that the payload builders are line-by-line ports of the legacy ones.
 */
import { t } from '@/core/i18n';
import { hashPasswordForCloudInit } from './sha512crypt';

/**
 * t() with legacy placeholder spacing support: legacy keys use "{ quota }" which the shared
 * i18n interpolation (strict "{quota}") leaves untouched.
 */
export const tt = (key, variables = {}) => {
  let message = t(key, variables);
  Object.keys(variables).forEach((k) => {
    message = message.split(new RegExp('\\{\\s*' + k + '\\s*\\}')).join(String(variables[k]));
  });
  return message;
};

const isEmpty = (v) => {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v) || typeof v === 'string') return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
};

/* ------------------------------------------------------------------ */
/* resources/nova/instance                                             */
/* ------------------------------------------------------------------ */

export const physicalNodeTypes = () => [
  { label: t('Smart Scheduling'), value: 'smart' },
  { label: t('Manually Specify'), value: 'manually' },
];

const passwordAndUserData =
  'Content-Type: multipart/mixed; boundary="===============2309984059743762475=="\n' +
  'MIME-Version: 1.0\n' +
  '\n' +
  '--===============2309984059743762475==\n' +
  'Content-Type: text/cloud-config; charset="us-ascii" \n' +
  'MIME-Version: 1.0\n' +
  'Content-Transfer-Encoding: 7bit\n' +
  'Content-Disposition: attachment; filename="ssh-pwauth-script.txt" \n' +
  '\n' +
  '#cloud-config\n' +
  'disable_root: false\n' +
  'ssh_pwauth: true\n' +
  '\n' +
  '--===============2309984059743762475==\n' +
  'Content-Type: text/x-shellscript; charset="us-ascii" \n' +
  'MIME-Version: 1.0\n' +
  'Content-Transfer-Encoding: 7bit\n' +
  'Content-Disposition: attachment; filename="passwd-script.txt" \n' +
  '\n' +
  '#!/bin/sh\n' +
  "echo 'USER_NAME:USER_PASSWORD' | chpasswd  --encrypted \n" +
  '\n' +
  '--===============2309984059743762475==\n' +
  'Content-Type: text/x-shellscript; charset="us-ascii" \n' +
  'MIME-Version: 1.0\n' +
  'Content-Transfer-Encoding: 7bit\n' +
  'Content-Disposition: attachment; filename="init-shell.txt" \n' +
  '\n' +
  'USER_DATA\n' +
  '\n' +
  '--===============2309984059743762475==--';

const onlyPassword =
  'Content-Type: multipart/mixed; boundary="===============2309984059743762475==" \n' +
  'MIME-Version: 1.0\n' +
  '\n' +
  '--===============2309984059743762475==\n' +
  'Content-Type: text/cloud-config; charset="us-ascii" \n' +
  'MIME-Version: 1.0\n' +
  'Content-Transfer-Encoding: 7bit\n' +
  'Content-Disposition: attachment; filename="ssh-pwauth-script.txt" \n' +
  '\n' +
  '#cloud-config\n' +
  'disable_root: false\n' +
  'ssh_pwauth: true\n' +
  '\n' +
  '--===============2309984059743762475==\n' +
  'Content-Type: text/x-shellscript; charset="us-ascii" \n' +
  'MIME-Version: 1.0\n' +
  'Content-Transfer-Encoding: 7bit\n' +
  'Content-Disposition: attachment; filename="passwd-script.txt" \n' +
  '\n' +
  '#!/bin/sh\n' +
  "echo 'USER_NAME:USER_PASSWORD' | chpasswd --encrypted \n" +
  '\n' +
  '--===============2309984059743762475==--';

const onlyUserData =
  'Content-Type: multipart/mixed; boundary="===============2309984059743762475==" \n' +
  'MIME-Version: 1.0\n' +
  '\n' +
  '--===============2309984059743762475==\n' +
  'Content-Type: text/x-shellscript; charset="us-ascii" \n' +
  'MIME-Version: 1.0\n' +
  'Content-Transfer-Encoding: 7bit\n' +
  'Content-Disposition: attachment; filename="init-shell.txt" \n' +
  '\n' +
  'USER_DATA | chpasswd --encrypted\n' +
  '\n' +
  '--===============2309984059743762475==--';

export const getUserData = (password, userData, username = 'root') => {
  const hashedPassword = password ? hashPasswordForCloudInit(password) : '';
  if (password && userData) {
    let str = passwordAndUserData.replace(/USER_PASSWORD/g, hashedPassword);
    str = str.replace(/USER_NAME/g, username);
    return str.replace(/USER_DATA/g, userData);
  }
  if (password) {
    const str = onlyPassword.replace(/USER_PASSWORD/g, hashedPassword);
    return str.replace(/USER_NAME/g, username);
  }
  return onlyUserData.replace(/USER_DATA/g, userData);
};

export const isWindowsImage = (values) => {
  const { source = {}, image = {}, bootableVolume = {}, instanceSnapshot = {} } = values || {};
  const { value: sourceValue } = source || {};
  if (sourceValue === 'image') {
    return image?.selectedRows?.[0]?.os_distro === 'windows';
  }
  if (sourceValue === 'bootableVolume') {
    const volMeta =
      bootableVolume?.selectedRows?.[0]?.origin_data?.volume_image_metadata ||
      bootableVolume?.selectedRows?.[0]?.volume_image_metadata;
    return volMeta?.os_distro === 'windows';
  }
  if (sourceValue === 'instanceSnapshot') {
    return instanceSnapshot?.selectedRows?.[0]?.os_distro === 'windows';
  }
  return false;
};

export const setServerPassword = (server, password) => {
  server.adminPass = password;
  server.metadata = server.metadata || {};
  server.metadata.admin_pass = password;
};

/* ------------------------------------------------------------------ */
/* resources/glance/image + cinder/volume                              */
/* ------------------------------------------------------------------ */

export const imageOS = () => ({
  centos: t('CentOS'),
  ubuntu: t('Ubuntu'),
  fedora: t('Fedora'),
  windows: t('Windows'),
  debian: t('Debian'),
  almalinux: t('AlmaLinux'),
  rocky: t('Rocky Linux'),
  rhel: t('Red Hat'),
  oraclelinux: t('Oracle Linux'),
  arch: t('Arch Linux'),
  freebsd: t('FreeBSD'),
  others: t('Others'),
});

export const IMAGE_OS_LIST = [
  'centos',
  'ubuntu',
  'fedora',
  'windows',
  'debian',
  'almalinux',
  'rocky',
  'rhel',
  'oraclelinux',
  'arch',
  'freebsd',
  'others',
];

export const getImageSystemTabs = () => {
  const names = imageOS();
  return IMAGE_OS_LIST.map((value) => ({ label: names[value] || t('Others'), value }));
};

export const getImageOS = (item) => (imageOS()[item?.os_distro] ? item.os_distro : 'others');

export const imageStatus = () => ({
  active: t('Active'),
  saving: t('Saving'),
  queued: t('Queued'),
  pending_delete: t('Pending Delete'),
  killed: t('Killed'),
  deactivated: t('Deactivated'),
  deleted: t('Deleted'),
  importing: t('Importing'),
});

export const imageVisibility = () => ({
  public: t('Public'),
  private: t('Private'),
  shared: t('Shared'),
});

export const imageFormats = () => ({
  raw: t('RAW'),
  qcow2: t('QCOW2'),
  iso: t('ISO'),
  aki: t('AKI'),
  ari: t('ARI'),
  ami: t('AMI'),
  vdi: t('VDI'),
  vhd: t('VHD'),
  vmdk: t('VMDK'),
});

const parseBdm = (item) => {
  try {
    return JSON.parse(item?.block_device_mapping || '[]') || [];
  } catch {
    return [];
  }
};

export const isSnapshot = (item = {}) => {
  const { image_type, instance_uuid } = item || {};
  return image_type === 'snapshot' || (parseBdm(item)[0] || {}).source_type === 'snapshot' || !!instance_uuid;
};

export const canImageCreateInstance = (item) =>
  item?.status === 'active' && (item.usage_type === 'common' || item.usage_type === undefined);

export const canImageCreateIronicInstance = (item) =>
  item?.status === 'active' && (item.usage_type === 'ironic' || item.usage_type === undefined);

export const canVolumeCreateInstance = (item) =>
  String(item?.bootable) === 'true' && ['available', 'downloading'].indexOf(item?.status) >= 0;

export const volumeStatus = () => ({
  available: t('Available'),
  'in-use': t('In-use'),
  error: t('Error'),
  creating: t('Creating'),
  error_extending: t('Error Extending'),
  extending: t('Extending'),
  downloading: t('Downloading'),
  attaching: t('Attaching'),
  detaching: t('Detaching'),
  deleting: t('Deleting'),
  error_deleting: t('Error Deleting'),
  'backing-up': t('Backing Up'),
  'restoring-backup': t('Restoring Backup'),
  error_restoring: t('Error Restoring'),
  maintenance: t('Maintained'),
  uploading: t('Uploading'),
  'awaiting-transfer': t('Awaiting Transfer'),
  restoring: t('Restoring'),
  retyping: t('Retyping'),
});

/* ------------------------------------------------------------------ */
/* resources/cinder/snapshot                                           */
/* ------------------------------------------------------------------ */

export const getDiskInfo = (detail, volumeTypes = []) => {
  const { snapshotDetail: { size = 0 } = {}, volumeDetail: { volume_type } = {}, selfBdmData = {} } = detail || {};
  const { delete_on_termination } = selfBdmData || {};
  const deleteType = delete_on_termination ? 1 : 0;
  const deleteTypeLabel = delete_on_termination ? t('Delete with the instance') : t('Do not delete with the instance');
  const volumeTypeItem = volumeTypes.find((it) => it.label === volume_type);
  return {
    type: volumeTypeItem?.value,
    typeOption: volumeTypeItem,
    size,
    deleteType,
    deleteTypeLabel,
  };
};

export const getInstanceSnapshotDataDisk = (disk, volumeTypes = []) => {
  const { volumeDetail, snapshotDetail, bdmFormatData: dataDiskBdm = {} } = disk || {};
  return getDiskInfo({ volumeDetail, snapshotDetail, selfBdmData: dataDiskBdm }, volumeTypes);
};

export const getAllDataDisks = ({ dataDisk = [], instanceSnapshotDataVolumes = [] }, volumeTypes = []) => {
  const allDataDisks = JSON.parse(JSON.stringify(dataDisk || []));
  (instanceSnapshotDataVolumes || []).forEach((i) => {
    const disk = getInstanceSnapshotDataDisk(i, volumeTypes) || {};
    allDataDisks.unshift({ value: disk });
  });
  return allDataDisks;
};

/* ------------------------------------------------------------------ */
/* utils/validate                                                      */
/* ------------------------------------------------------------------ */

const instanceNameRegex = /^[a-zA-Z\u4e00-\u9fa5][\u4e00-\u9fa5\w"'._-]{0,127}$/;
const instancePasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d\\[\]`~!@#$%^&*()_\-+=?:"{}|,.\\/;']{8,16}$/;
const asciiRegex = /^[\x00-\x7f]*$/; // eslint-disable-line no-control-regex

export const instanceNameMessage = () =>
  t(
    'The name should start with upper letter, lower letter or chinese, and be a string of 1 to 128, characters can only contain "0-9, a-z, A-Z, "-\'_.".'
  );

export const instanceNameValidator = (_, value) => {
  if ([undefined, null, ''].includes(value)) return Promise.resolve();
  if (typeof value === 'string' && instanceNameRegex.test(value)) return Promise.resolve();
  return Promise.reject(new Error(`${t('Invalid: ')}${instanceNameMessage()}`));
};

/** getPasswordOtherRule('password' | 'confirmPassword', 'instance') */
export const instancePasswordRule = (name) => ({ getFieldValue }) => ({
  validator(_, value) {
    if (name === 'password') {
      if (!value) return Promise.resolve();
      if (!instancePasswordRegex.test(value)) {
        return Promise.reject(
          new Error(
            `${t('Invalid: ')}${t('8 to 16 characters, at least one uppercase letter, one lowercase letter, one number.')}`
          )
        );
      }
      return Promise.resolve();
    }
    const password = getFieldValue('password');
    if (password && value !== password) {
      return Promise.reject(new Error(`${t('Invalid: ')}${t('Password must be the same with confirm password.')}`));
    }
    return Promise.resolve();
  },
});

export const asciiValidator = (_, value) => {
  if (asciiRegex.test(value || '')) return Promise.resolve();
  return Promise.reject(new Error(`${t('Invalid: ')}${t('Please enter a valid ASCII code')}`));
};

const ipv4Regex = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
export const isIPv4 = (ip) => typeof ip === 'string' && ipv4Regex.test(ip);
export const isIpv6 = (ip) => {
  if (typeof ip !== 'string' || ip.indexOf(':') < 0) return false;
  try {
    // URL parser validates IPv6 literals
    // eslint-disable-next-line no-new
    new URL(`http://[${ip}]/`);
    return true;
  } catch {
    return false;
  }
};

const ipv4ToNum = (ip) => ip.split('.').reduce((acc, it) => acc * 256 + Number(it), 0);
const expandIpv6 = (ip) => {
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const tl = ip.includes('::') ? (tail ? tail.split(':') : []) : [];
  const fill = ip.includes('::') ? new Array(8 - h.length - tl.length).fill('0') : [];
  return [...h, ...fill, ...tl].map((it) => BigInt(`0x${it || '0'}`)).reduce((acc, it) => (acc << 16n) + it, 0n);
};

/** utils/validate isIpInRangeAll */
export const isIpInRangeAll = (ip, start, end) => {
  try {
    if (isIPv4(ip) && isIPv4(start) && isIPv4(end)) {
      const v = ipv4ToNum(ip);
      return v >= ipv4ToNum(start) && v <= ipv4ToNum(end);
    }
    if (isIpv6(ip) && isIpv6(start) && isIpv6(end)) {
      const v = expandIpv6(ip);
      return v >= expandIpv6(start) && v <= expandIpv6(end);
    }
  } catch {
    return false;
  }
  return false;
};

export const ipTypeOptions = () => [
  { label: t('Automatically Assigned Address'), value: 0 },
  { label: t('Manually Assigned Address'), value: 1 },
];

/* ------------------------------------------------------------------ */
/* Quota helpers (stores/keystone/project)                             */
/* ------------------------------------------------------------------ */

/* Quota helpers moved to src/components/Quota (re-exported for existing imports) */
export { getGiBValue, updateQuotaData, updateNovaQuota, getQuotaMessage } from '@/components/Quota/utils';

/* ------------------------------------------------------------------ */
/* Payload builders                                                    */
/* ------------------------------------------------------------------ */

/** StepCreate.getVolumeAndImageData */
export const getVolumeAndImageData = (values, { enableCinder = true } = {}) => {
  const {
    bootableVolume,
    dataDisk,
    image,
    instanceSnapshot,
    instanceSnapshotDisk,
    source,
    systemDisk,
    bootFromVolume = true,
    deleteVolumeInstance,
  } = values;
  const { value: sourceValue } = source;
  const imageRef =
    sourceValue === 'bootableVolume'
      ? null
      : sourceValue === 'image'
        ? image.selectedRowKeys[0]
        : instanceSnapshot.selectedRowKeys[0];
  if (!enableCinder) {
    return { imageRef };
  }
  let rootVolume = {};
  if (sourceValue !== 'bootableVolume') {
    if (bootFromVolume) {
      const { deleteType, type, size } = systemDisk || {};
      rootVolume = {
        boot_index: 0,
        uuid: imageRef,
        source_type: 'image',
        volume_size: size,
        destination_type: 'volume',
        volume_type: type,
        delete_on_termination: deleteType === 1,
      };
      if (sourceValue === 'instanceSnapshot') {
        if (instanceSnapshotDisk) {
          delete rootVolume.volume_size;
          delete rootVolume.volume_type;
          delete rootVolume.delete_on_termination;
        }
      }
    }
  } else {
    rootVolume = {
      boot_index: 0,
      uuid: bootableVolume.selectedRowKeys[0],
      source_type: 'volume',
      destination_type: 'volume',
      delete_on_termination: deleteVolumeInstance,
    };
  }
  const dataVolumes = dataDisk
    ? dataDisk.map((it) => {
        const { size: volumeSize, type: volumeType, deleteType: volumeDelType } = it.value || {};
        return {
          source_type: 'blank',
          volume_size: volumeSize,
          destination_type: 'volume',
          volume_type: volumeType,
          delete_on_termination: volumeDelType === 1,
        };
      })
    : [];
  if (sourceValue === 'image' && image.selectedRows[0]?.disk_format === 'iso' && dataVolumes[0] && bootFromVolume) {
    dataVolumes[0].boot_index = 0;
    dataVolumes[0].device_type = 'disk';
    rootVolume.boot_index = 1;
    rootVolume.device_type = 'cdrom';
  }
  const volumes = isEmpty(rootVolume) ? [...dataVolumes] : [rootVolume, ...dataVolumes];
  return { volumes, imageRef };
};

/** StepCreate.getNetworkData */
export const getNetworkData = (values) => {
  const { networks = [], ports = {} } = values;
  let hasIp = false;
  const data = [];
  (networks || []).forEach((it) => {
    const net = { uuid: it.value.network };
    if (it.value.ipType === 1 && it.value.ip) {
      net.fixed_ip = it.value.ip;
      hasIp = true;
    }
    data.push(net);
  });
  const { selectedRowKeys = [] } = ports || {};
  selectedRowKeys.forEach((it) => {
    data.push({ port: it });
  });
  return { data, hasIp };
};

/**
 * StepCreate.getSubmitData - returns { body } or { error: 'ipBatch' }
 * (the quota "status === error" short-circuit is handled by the caller).
 */
export const buildServerBody = (values, { enableCinder = true } = {}) => {
  const { volumes, imageRef } = getVolumeAndImageData(values, { enableCinder });
  const { data: networks, hasIp } = getNetworkData(values);
  const {
    availableZone,
    keypair,
    loginType,
    password,
    physicalNode,
    physicalNodeType,
    securityGroup,
    flavor,
    userData = '',
    serverGroup,
    name,
    count = 1,
    bootFromVolume = true,
  } = values;
  if (hasIp && count > 1) {
    return { error: 'ipBatch' };
  }
  const { selectedRows: securityGroupSelectedRows = [] } = securityGroup || {};
  const server = {
    security_groups: securityGroupSelectedRows.map((it) => ({ name: it.id })),
    name,
    flavorRef: flavor.selectedRowKeys[0],
    networks,
  };
  if (availableZone?.value) {
    server.availability_zone = availableZone.value;
  }
  if (enableCinder) {
    server.block_device_mapping_v2 = volumes;
  }
  if (imageRef && (!volumes || !bootFromVolume)) {
    server.imageRef = imageRef;
  }
  if (loginType.value === 'keypair') {
    server.key_name = keypair.selectedRowKeys[0];
  } else {
    setServerPassword(server, password);
  }
  if (count > 1) {
    server.min_count = count;
    server.max_count = count;
    server.return_reservation_id = true;
  }
  if (physicalNodeType && physicalNodeType.value !== 'smart') {
    server.hypervisor_hostname = physicalNode?.selectedRows?.[0]?.hypervisor_hostname;
  }
  const { username } = values;
  if (!isWindowsImage(values) && (server.adminPass || userData)) {
    server.user_data = btoa(getUserData(server.adminPass, userData, username || 'root'));
  } else if (isWindowsImage(values) && userData) {
    server.user_data = btoa(userData);
  }
  const body = { server };
  if (serverGroup && serverGroup.selectedRowKeys?.length > 0) {
    body['OS-SCH-HNT:scheduler_hints'] = { group: serverGroup.selectedRowKeys[0] };
  }
  return { body };
};

/** CreateIronic.getSubmitData */
export const buildIronicBody = (values) => {
  const { availableZone, image, keypair, loginType, networks = [], password, securityGroup, flavor, userData = '', name, count = 1 } =
    values;
  const imageRef = image.selectedRowKeys[0];
  let hasIp = false;
  const { selectedRows: securityGroupSelectedRows = [] } = securityGroup || {};
  const server = {
    security_groups: securityGroupSelectedRows.map((it) => ({ name: it.id })),
    name,
    flavorRef: flavor.selectedRowKeys[0],
    availability_zone: availableZone?.value,
    networks: networks.map((it) => {
      const net = { uuid: it.value.network };
      if (it.value.ipType === 1 && it.value.ip) {
        net.fixed_ip = it.value.ip;
        hasIp = true;
      }
      return net;
    }),
  };
  if (hasIp && count > 1) {
    return { error: 'ipBatch' };
  }
  if (imageRef) {
    server.imageRef = imageRef;
  }
  if (loginType.value === 'keypair') {
    server.key_name = keypair.selectedRowKeys[0];
  } else {
    setServerPassword(server, password);
  }
  if (count > 1) {
    server.min_count = count;
    server.max_count = count;
    server.return_reservation_id = true;
  }
  const { username } = values;
  if (!isWindowsImage(values) && (server.adminPass || userData)) {
    server.user_data = btoa(getUserData(server.adminPass, userData, username || 'root'));
  } else if (isWindowsImage(values) && userData) {
    server.user_data = btoa(userData);
  }
  return { body: { server } };
};

/** Legacy instanceName (successText) */
export const getInstanceNames = (name, count = 1) =>
  count === 1
    ? name
    : new Array(count)
        .fill(count)
        .map((_, index) => `${name}-${index + 1}`)
        .join(', ');

/** Legacy listUrl: back to the module the wizard was opened from */
export const getListUrl = (params) => {
  const image = params.get('image');
  const volume = params.get('volume');
  const servergroup = params.get('servergroup');
  if (image) return '/compute/image';
  if (volume) return '/storage/volume';
  if (servergroup) return `/compute/server-group/detail/${servergroup}`;
  return '/compute/instance';
};

/** Notify.errorWithDetail-like extraction of an OpenStack error message */
export const getErrorDetail = (err) => {
  const data = err?.response?.data;
  if (!data) return err?.message || '';
  if (typeof data === 'string') return data;
  const first = Object.values(data).find((v) => v && typeof v === 'object' && v.message);
  if (first) return first.message;
  return data.message || data.detail || data.error?.message || JSON.stringify(data);
};
