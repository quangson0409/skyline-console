import { t } from '@/core/i18n';

/**
 * Quota helpers shared by every create / extend form
 * (port of legacy stores/keystone/project updateQuotaData / getLeftQuotaData / updateNovaQuota
 * and the resources/* getQuotaInfo / checkQuotaDisable helpers).
 */

/** Legacy utils getGiBValue: MiB -> GiB with 2 decimals */
export const getGiBValue = (input) => {
  if (typeof input !== 'number' || Number.isNaN(input) || !input) return 0;
  return parseFloat(Number(input / 1024).toFixed(2));
};

/** Legacy projectStore.getLeftQuotaData: -1 = unlimited */
export const getLeftQuotaData = ({ used = 0, limit = 0, reserved = 0 } = {}) =>
  limit === -1 ? -1 : limit - used - (reserved || 0);

/** Legacy projectStore.updateQuotaData: in_use -> used, left = limit - used - reserved */
export const updateQuotaData = (quota) => {
  const newData = JSON.parse(JSON.stringify(quota || {}));
  Object.keys(newData).forEach((it) => {
    if (newData[it] && typeof newData[it] === 'object') {
      if (newData[it].in_use !== undefined) newData[it].used = newData[it].in_use;
      newData[it].left = getLeftQuotaData(newData[it]);
    }
  });
  return newData;
};

/** Legacy projectStore.updateNovaQuota: RAM in GiB */
export const updateNovaQuota = (quota = {}) => {
  const { ram: { limit = 0, in_use = 0, reserved = 0 } = {} } = quota || {};
  return {
    ...quota,
    ram: {
      in_use: getGiBValue(in_use),
      limit: limit === -1 ? limit : getGiBValue(limit),
      reserved: getGiBValue(reserved),
    },
  };
};

/** Legacy StepCreate getQuotaMessage (wizard footer error) */
export const getQuotaMessage = (value, quota, name) => {
  const { left = 0 } = quota || {};
  if (left === -1) return '';
  if (value > left) {
    return t('Insufficient {name} quota to create resources (left { quota }, input { input }).', {
      name,
      quota: left,
      input: value,
    });
  }
  return '';
};

/** Legacy resources/cinder/volume getErrorMessage (ModalAction quota error) */
export const quotaErrorMessage = ({ name, left, input }) => {
  if (left === 0) {
    return t('Quota: Insufficient { name } quota to create resources.', { name });
  }
  return t(
    'Quota: Insufficient { name } quota to create resources, please adjust resource quantity or quota (available { left }, input { input }).',
    { name, left, input }
  );
};

/** `left` of a quota item (computes it when the item was not normalized) */
export const quotaLeft = (item = {}) => {
  if (!item) return 0;
  if (item.left !== undefined) return item.left;
  const used = item.used ?? item.in_use ?? 0;
  return getLeftQuotaData({ used, limit: item.limit ?? 0, reserved: item.reserved ?? 0 });
};

/**
 * Builds one chart line from a (normalized or raw) quota item.
 *   quotaItem(neutron.port, { name: 'port', title: t('Ports'), add: 1 })
 * Extra keys: `check: false` (informational line, never blocks), `errorName` (name used in the
 * legacy "Insufficient {name} quota" message, defaults to the title), `error` (custom message).
 */
export const quotaItem = (raw, { name, title, add = 0, ...rest } = {}) => {
  const it = raw || {};
  const used = it.used ?? it.in_use ?? 0;
  const limit = it.limit === undefined || it.limit === null ? 0 : Number(it.limit);
  const reserved = Number(it.reserved || 0);
  return {
    name,
    title,
    used: Number(used) || 0,
    limit,
    reserved,
    left: limit === -1 ? -1 : limit - (Number(used) || 0) - reserved,
    add: Number(add) || 0,
    missing: !raw,
    ...rest,
  };
};

/** True when the new resources do not fit in the quota */
export const isQuotaExceeded = (q = {}) => {
  if (q.check === false || q.missing) return false;
  if (q.error) return true;
  const limit = Number(q.limit);
  if (limit === -1) return false;
  const left = q.left !== undefined ? q.left : getLeftQuotaData({ used: q.used, limit, reserved: q.reserved });
  const add = Number(q.add) || 0;
  // legacy disableSubmit: the wished amount does not fit in what is left
  return add > 0 && add > left;
};

/** First legacy "quota exceeded" message of a quota line list ('' when everything fits) */
export const quotaError = (quotas = []) => {
  const bad = (quotas || []).find((q) => q && isQuotaExceeded(q));
  if (!bad) return '';
  if (bad.error) return bad.error;
  const left = bad.left !== undefined ? bad.left : quotaLeft(bad);
  return quotaErrorMessage({ name: bad.errorName || bad.title || bad.name, left: Math.max(left, 0), input: bad.add });
};

/**
 * Helper for ActionModal `quota`: loads the raw quota once per modal opening and recomputes the
 * chart lines on every form change.
 *   quota: withQuota(async (item) => fetchNeutronQuota(), (raw, values, item) => [quotaItem(raw.port, ...)])
 */
export const withQuota = (load, compute) => async (item, values, cache = {}) => {
  if (!cache.promise) cache.promise = Promise.resolve(load(item)).catch(() => null);
  const raw = await cache.promise;
  if (!raw) return [];
  return compute(raw, values || {}, item) || [];
};

/**
 * Like withQuota, but reloads the raw quota when the target project changes
 * (administrator forms with a "Project" field).
 *   quota: withProjectQuota((pid) => fetchNeutronQuota(pid), (values) => values.project_id, compute)
 */
export const withProjectQuota = (load, getProjectId, compute) => async (item, values, cache = {}) => {
  const pid = getProjectId(values || {}, item);
  if (!cache.promise || cache.pid !== pid) {
    cache.pid = pid;
    cache.promise = Promise.resolve(load(pid, item)).catch(() => null);
  }
  const raw = await cache.promise;
  if (!raw) return [];
  return compute(raw, values || {}, item) || [];
};
