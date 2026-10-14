/**
 * Shared helpers of the instance actions (legacy ServerStore helpers, remote console,
 * SoftDelete confirm content, quota helpers).
 */
import React, { useEffect, useState } from 'react';
import { Checkbox } from 'antd';
import { t, useLocaleStore } from '@/core/i18n';
import { novaApi } from '@/api/nova';
import { cinderApi } from '@/api/cinder';
import { currentProjectId } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';
import { isIronicInstance } from '../resources';

export const toList = (target) => (Array.isArray(target) ? target : [target]).filter(Boolean);
export const serverAction = (id, body) => novaApi.serverActionV(id, body);
/** legacy batch submit: every target in parallel (Promise.all) */
export const forEach = (target, fn) => Promise.all(toList(target).map(fn));
export const hasAdminRole = () => Boolean(useAuthStore.getState()?.hasAdminRole);

/** Adds translated getters for title / buttonText / actionName / description */
export const define = (cfg) => {
  const action = { ...cfg };
  [
    ['title', 'titleKey'],
    ['buttonText', 'buttonTextKey'],
    ['actionName', 'actionNameKey'],
    ['description', 'descKey'],
  ].forEach(([prop, keyProp]) => {
    if (cfg[keyProp]) {
      Object.defineProperty(action, prop, { get: () => t(cfg[keyProp]), enumerable: true, configurable: true });
    }
  });
  return action;
};

export const instanceLabel = () => ({ name: 'instance', label: t('Instance'), type: 'label' });
export const tipsAlert = (message, alertType = 'info') => ({ name: `tips-${alertType}`, type: 'alert', alertType, message });

/* ------------------------------------------------------------------ */
/* Remote console (legacy getConsole / getConsoleIronic)              */
/* ------------------------------------------------------------------ */
export const CONSOLE_TYPES = {
  novnc: { protocol: 'vnc', type: 'novnc' },
  spice: { protocol: 'spice', type: 'spice-html5' },
  serial: { protocol: 'serial', type: 'serial' },
};

const consoleLanguage = () => {
  const locale = useLocaleStore.getState()?.locale || 'en';
  return locale === 'zh' ? 'zh-hans' : locale;
};

export const consoleErrorMessage = (err) =>
  err?.response?.data?.badRequest?.message ||
  err?.response?.data?.conflictingRequest?.message ||
  err?.response?.data?.itemNotFound?.message ||
  err?.response?.data?.forbidden?.message ||
  err?.message ||
  '';

/**
 * POST /servers/{id}/remote-consoles. Without an explicit kind the legacy body goes first
 * (ironic -> serial, others -> vnc/novnc); for non ironic servers spice and serial are tried
 * next when the cloud has no noVNC proxy. The URL gets `language=<locale>` like legacy.
 */
export const getRemoteConsoleUrl = async (item, kind) => {
  const order = kind ? [kind] : isIronicInstance(item) ? ['serial'] : ['novnc', 'spice', 'serial'];
  let lastError;
  for (const k of order) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await novaApi.createRemoteConsoleV(item.id, CONSOLE_TYPES[k]);
      const url = res?.remote_console?.url;
      if (url) return { url: `${url}${url.includes('?') ? '&' : '?'}language=${consoleLanguage()}`, kind: k };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(t('Could not get the console URL from the server'));
};

/* ------------------------------------------------------------------ */
/* Delete (legacy SoftDelete with "Immediately delete")                */
/* ------------------------------------------------------------------ */
export const deleteState = { hard: false };
export const isShelvedOffloaded = (item) => String(item?.status || '').toLowerCase() === 'shelved_offloaded';

export function DeleteConfirmContent({ items = [] }) {
  const allShelved = items.length > 0 && items.every(isShelvedOffloaded);
  const someShelved = items.some(isShelvedOffloaded);
  const [checked, setChecked] = useState(allShelved);
  useEffect(() => {
    deleteState.hard = allShelved;
  }, [allShelved]);
  const names = items.map((it) => it.name || it.id).join(', ');
  return (
    <div>
      <p style={{ marginBottom: 12 }}>{t('Are you sure to delete instance { name }? ', { name: names })}</p>
      <p style={{ marginBottom: 12, color: '#64748b', fontSize: 12 }}>
        {t(
          'When the computing service starts the recycling instance interval, the instance will be stored in the recycling bin after deletion, and will be retained according to the corresponding time interval. You can choose to restore it within this period. After successful recovery, the status of the instance is running and related resources remain unchanged.'
        )}
      </p>
      <Checkbox
        id="instance-delete-immediately"
        checked={checked}
        disabled={allShelved}
        onChange={(e) => {
          setChecked(e.target.checked);
          deleteState.hard = e.target.checked;
        }}
      >
        {t('Immediately delete')}
      </Checkbox>
      {checked ? (
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', borderRadius: 6, fontSize: 12 }}>
          <b>{t('The instance deleted immediately cannot be restored')}</b>
          <div>{t('The associated floating IP, port, volume and other resources will be automatically disassociated.')}</div>
          <div>
            {t('If you still want to keep the disk data, it is recommended that you create a backup for the disk before deleting.')}
          </div>
        </div>
      ) : null}
      {someShelved ? (
        <div style={{ marginTop: 8, color: 'rgba(0, 0, 0, 0.45)' }}>
          {t('The shelved offloaded instance only supports immediate deletion')}
        </div>
      ) : null}
    </div>
  );
}

/** Checkbox control for the Resize "Forced Shutdown" agreement */
export function ForceShutdownCheck({ value, onChange, id }) {
  return (
    <Checkbox id={id} checked={value === true} onChange={(e) => onChange?.(e.target.checked)}>
      {t('Agree to force shutdown')}
    </Checkbox>
  );
}

/* ------------------------------------------------------------------ */
/* Quota / volume helpers                                              */
/* ------------------------------------------------------------------ */
export const fetchNovaQuota = async () => {
  const pid = currentProjectId();
  if (!pid) return null;
  try {
    const res = await novaApi.getQuotaSetDetailV(pid);
    return res?.quota_set || null;
  } catch {
    return null;
  }
};

export const fetchCinderQuotaSet = async () => {
  try {
    const res = await cinderApi.getQuotaSet(currentProjectId());
    return res?.quota_set || null;
  } catch {
    return null;
  }
};

/** left of a quota item ({ limit, in_use, reserved }); -1 = unlimited / unknown */
export const quotaLeft = (q) => {
  if (q === undefined || q === null) return -1;
  if (typeof q === 'number') return q;
  if (q.limit === undefined || q.limit === -1) return -1;
  return q.limit - (q.in_use || 0) - (q.reserved || 0);
};

/** Volumes attached to the server (InstanceVolumeStore) */
export const loadServerVolumes = async (item) => {
  const res = await novaApi.listVolumeAttachmentsV(item.id).catch(() => ({}));
  const attachments = res?.volumeAttachments || [];
  const vols = await Promise.all(
    attachments.map((a) =>
      cinderApi
        .getVolume(a.volumeId)
        .then((r) => ({ ...(r?.volume || {}), __attachment: a }))
        .catch(() => ({ id: a.volumeId, name: a.volumeId, __attachment: a, attachments: [{ device: a.device, server_id: item.id }] }))
    )
  );
  return vols.filter((v) => v && v.id);
};
