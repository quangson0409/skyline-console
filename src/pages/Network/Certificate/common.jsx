import React from 'react';
import { Link } from 'react-router-dom';
import { barbicanApi, refId } from '@/api/barbican';
import { formatTime } from '@/components/ResourcePage';
import Status from '@/components/Status';
import { t } from '@/core/i18n';
import {
  mapSecret,
  mapContainer,
  fetchListeners,
  attachListeners,
  fetchDecodedPayload,
} from '@/pages/KeyManager/common';

/** Port of legacy resources/octavia/lb.jsx (certificate parts) + resources/octavia/secrets.jsx */
export const certificateMode = () => ({
  SERVER: t('Server Certificate'),
  CA: t('CA Certificate'),
});

export const certificateStatus = () => ({
  ACTIVE: t('Active'),
  ERROR: t('Error'),
});

export const certificateDetailPath = (mode, id) =>
  mode === 'CA' ? `/network/certificate-secret/detail/${id}` : `/network/certificate-container/detail/${id}`;

export const renderListeners = (value) =>
  Array.isArray(value) && value.length
    ? value.map((it) => (
        <div key={it.id}>
          <Link to={`/network/load-balancers/${it.lb}/listener/${it.id}`}>{it.name || it.id}</Link>
        </div>
      ))
    : '-';

/** Detail header items (legacy getCertificateColumns) */
export const certificateInfo = (d, { withDomain = true } = {}) =>
  [
    { label: t('ID'), value: d.id, copyable: true },
    { label: t('Name'), value: d.name },
    { label: t('Certificate Type'), value: d.mode, render: () => certificateMode()[d.mode] || d.mode || '-' },
    { label: t('Expires At'), value: formatTime(d.expiration) },
    withDomain && { label: t('Domain Name'), value: d.domain || '-' },
    { label: t('Listener'), value: d.listener, render: renderListeners },
    {
      label: t('Status'),
      value: d.status,
      render: () => (d.status ? <Status status={d.status} text={certificateStatus()[d.status]} /> : '-'),
    },
    { label: t('Created At'), value: formatTime(d.created) },
  ].filter(Boolean);

/** Resolve a container's secrets against the SERVER-mode secret list (legacy listDidFetch / detailDidFetch) */
const resolveContainerSecrets = (container, secrets) => {
  let missing = false;
  const refs = (container.secret_refs || []).map((ref) => {
    const secretId = refId(ref.secret_ref, 'secrets');
    const theSecret = secrets.find((s) => s.id === secretId);
    if (!theSecret) {
      missing = true;
      return { ...ref };
    }
    Object.assign(container, { algorithm: theSecret.algorithm, mode: theSecret.mode });
    return { ...ref, secret_info: { ...theSecret } };
  });
  container.secret_refs = refs;
  return missing;
};

/** SERVER tab: certificate containers whose secrets are all SERVER certificates */
export const fetchServerCertificates = async () => {
  const containers = await barbicanApi.listContainers();
  if (!containers.length) return [];
  const [rawSecrets, listeners] = await Promise.all([barbicanApi.listSecrets({ mode: 'SERVER' }), fetchListeners()]);
  const secrets = rawSecrets.map(mapSecret);
  return containers
    .map((raw) => {
      const it = { ...raw };
      if (!(it.secret_refs || []).length) return null;
      if (resolveContainerSecrets(it, secrets)) return null;
      attachListeners(it, it.container_ref, listeners);
      return mapContainer(it);
    })
    .filter(Boolean);
};

/** CA tab: CA certificate secrets */
export const fetchCaCertificates = async () => {
  const [secrets, listeners] = await Promise.all([barbicanApi.listSecrets({ mode: 'CA' }), fetchListeners()]);
  return secrets.map((s) => mapSecret(attachListeners({ ...s }, s.secret_ref, listeners)));
};

export const fetchCertificateContainer = async (id) => {
  const container = { ...(await barbicanApi.getContainer(id)) };
  const [rawSecrets, listeners] = await Promise.all([barbicanApi.listSecrets({ mode: 'SERVER' }), fetchListeners()]);
  resolveContainerSecrets(container, rawSecrets.map(mapSecret));
  attachListeners(container, container.container_ref, listeners);
  await Promise.all(
    (container.secret_refs || []).map(async (ref) => {
      if (!ref.secret_info) return;
      try {
        ref.secret_info.payload = await fetchDecodedPayload(ref.secret_info.id, 'text/plain', { strictType: false });
      } catch {
        ref.secret_info.payload = null;
      }
    })
  );
  return mapContainer({ ...container, id });
};

export const fetchCertificateSecret = async (id) => {
  const [item, listeners] = await Promise.all([barbicanApi.getSecret(id), fetchListeners()]);
  const detail = mapSecret(attachListeners({ ...item, id }, item?.secret_ref, listeners));
  try {
    detail.payload = await fetchDecodedPayload(id, item?.payload_content_type || 'text/plain');
  } catch {
    detail.payload = null;
  }
  return detail;
};
