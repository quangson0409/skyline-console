import { t } from '@/core/i18n';
import { sinceTimeClamp } from '@/components/ResourcePage/helpers';

export { KpiCards } from '@/components/MetricCards';

/** Browser download of a text blob (legacy FileSaver.saveAs) */
export const downloadText = (content, filename, type = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Port of legacy FormItem "textarea-from-file" (moved to src/components/form) */
export { default as TextareaFromFile } from '@/components/form/TextareaFromFile';

/* ------------------------------------------------------------------ */
/* Embedded instance list (legacy reused pages/compute/containers/Instance
   as the "Members" / "Instances" tab of server group & hypervisor detail) */
/* ------------------------------------------------------------------ */
export const serverIps = (server = {}) =>
  Object.entries(server.addresses || {}).flatMap(([net, list]) =>
    (list || []).map((a) => ({ net, addr: a.addr, type: a['OS-EXT-IPS:type'] }))
  );

export const serverStatusMap = () => ({
  active: t('Active'),
  shutoff: t('Shutoff'),
  build: t('Build'),
  error: t('Error'),
  paused: t('Paused'),
  suspended: t('Suspended'),
  shelved_offloaded: t('Shelved Offloaded'),
  shelved: t('Shelved'),
  reboot: t('Reboot'),
  hard_reboot: t('Hard Reboot'),
  resize: t('Resize'),
  verify_resize: t('Verify Resize'),
  migrating: t('Migrating'),
  rescue: t('Rescue'),
  deleted: t('Deleted'),
  soft_deleted: t('Soft Deleted'),
});

/** legacy valueRender 'sinceTime' - "x minutes ago" (future dates read as "a few seconds ago") */
export const sinceTime = sinceTimeClamp;

/** MiB -> GiB with 2 decimals (legacy getGiBValue) */
export const getGiBValue = (mb) => {
  const v = Number(mb) || 0;
  return Number((v / 1024).toFixed(2));
};
