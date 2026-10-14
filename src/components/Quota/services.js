import { quotaApi } from '@/api/quota';
import { currentProjectId } from '@/api/endpoints';
import { t } from '@/core/i18n';
import { quotaItem, updateNovaQuota, updateQuotaData, withQuota } from './utils';

/*
 * Per-service quota loaders (legacy stores/keystone/project fetchProject*Quota: used / left added)
 * and the chart line builders of legacy resources/* getQuotaInfo, shared by every create form.
 */

export const fetchNovaQuota = async (projectId = currentProjectId()) =>
  updateQuotaData(updateNovaQuota((await quotaApi.getNovaQuota(projectId))?.quota_set || {}));

export const fetchCinderQuota = async (projectId = currentProjectId()) =>
  updateQuotaData((await quotaApi.getCinderQuota(projectId))?.quota_set || {});

export const fetchNeutronQuota = async (projectId = currentProjectId()) =>
  updateQuotaData((await quotaApi.getNeutronQuota(projectId))?.quota || {});

export const fetchManilaQuota = async (projectId = currentProjectId()) =>
  updateQuotaData((await quotaApi.getShareQuota(projectId))?.quota_set || {});

export const fetchTroveQuota = async (projectId = currentProjectId()) => {
  const res = await quotaApi.getTroveQuota(projectId);
  const list = res?.quotas || [];
  return updateQuotaData(Object.fromEntries(list.map((it) => [it.resource, it])));
};

/* ------------------------------------------------------------------ cinder */

/**
 * Legacy resources/cinder/volume getQuotaInfo: volume count, capacity and the per volume-type
 * count / capacity lines (`volumes_<type>` / `gigabytes_<type>`, type = volume type name).
 * sizeOnly: capacity lines only (legacy ExtendVolume).
 */
export const volumeQuotaItems = (quota = {}, { count = 1, size = 0, typeName, sizeOnly = false } = {}) => {
  const add = Number(count) || 0;
  const total = (Number(size) || 0) * (sizeOnly ? 1 : add);
  const items = [];
  if (!sizeOnly) items.push(quotaItem(quota.volumes, { name: 'volume', title: t('Volume'), add, errorName: t('volume') }));
  items.push(
    quotaItem(quota.gigabytes, {
      name: 'gigabytes',
      title: t('Volume Capacity (GiB)'),
      add: total,
      errorName: t('volume capacity'),
    })
  );
  if (typeName) {
    const typeQuota = quota[`volumes_${typeName}`];
    const typeSizeQuota = quota[`gigabytes_${typeName}`];
    if (typeQuota && !sizeOnly) {
      items.push(quotaItem(typeQuota, { name: 'type', title: t('{name} type', { name: typeName }), add }));
    }
    if (typeSizeQuota) {
      items.push(
        quotaItem(typeSizeQuota, { name: 'typeSize', title: t('{name} type capacity', { name: typeName }), add: total })
      );
    }
  }
  return items;
};

/**
 * ActionModal `quota` for the "create a volume" forms (legacy getQuotaInfo + checkQuotaDisable):
 * size / count read from the form values, typeName(values, item) gives the volume type name.
 */
export const volumeCreateQuota = ({ sizeField = 'size', typeName, count } = {}) =>
  withQuota(
    () => fetchCinderQuota(),
    (quota, values, item) =>
      volumeQuotaItems(quota, {
        count: count !== undefined ? count : values.count ?? 1,
        size: values[sizeField] ?? 0,
        typeName: typeof typeName === 'function' ? typeName(values, item) : typeName,
      })
  );

/** Legacy resources/cinder/backup getQuotaInfo: one backup of the volume size */
export const backupQuotaItems = (quota = {}, volumeSize = 0) => [
  quotaItem(quota.backups, { name: 'backup', title: t('Volume Backup'), add: 1 }),
  quotaItem(quota.backup_gigabytes, {
    name: 'gigabytes',
    title: t('Volume Backup Capacity (GiB)'),
    add: Number(volumeSize) || 0,
  }),
];

/* ------------------------------------------------------------------ neutron */

const neutronTitles = () => ({
  network: t('Network'),
  subnet: t('Subnet'),
  port: t('Ports'),
  router: t('Router'),
  security_group: t('Security Group'),
  security_group_rule: t('Security Group Rule'),
  floatingip: t('Floating IP'),
  firewall_group: t('Firewall'),
  firewall_policy: t('Firewall Policy'),
  firewall_rule: t('Firewall Rule'),
});

/** Legacy resources/neutron/network getQuotaInfo(quotaKeys, wishes) */
export const neutronQuotaItems = (quota = {}, keys = ['network'], wishes = [1]) =>
  keys.map((key, idx) => quotaItem(quota[key], { name: key, title: neutronTitles()[key] || key, add: wishes[idx] ?? 0 }));

/* ------------------------------------------------------------------ manila */

const shareTitles = () => ({
  shares: t('Share'),
  gigabytes: t('Share Capacity (GiB)'),
  share_networks: t('Share Network'),
  share_groups: t('Share Group'),
});

/** Legacy resources/manila/share getQuotaInfo(quotaKeys, wishes) */
export const shareQuotaItems = (quota = {}, keys = ['shares', 'gigabytes'], wishes = [1, 1]) =>
  keys.map((key, idx) => quotaItem(quota[key], { name: key, title: shareTitles()[key] || key, add: wishes[idx] ?? 0 }));
