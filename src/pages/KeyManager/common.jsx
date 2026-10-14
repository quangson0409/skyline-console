import React from 'react';
import { Badge } from 'antd';
import BaseTextareaFromFile from '@/components/form/TextareaFromFile';
import { barbicanApi, refId, decodePayload } from '@/api/barbican';
import { t } from '@/core/i18n';

/**
 * Shared Barbican helpers - port of legacy stores/barbican/{secrets,containers}.js mappers.
 * Used by the Key Manager secret pages and the Network > Certificates pages.
 */

const parseAlgorithmJson = (algorithm) => {
  if (algorithm && String(algorithm).startsWith('{')) {
    try {
      return JSON.parse(algorithm) || {};
    } catch {
      return {};
    }
  }
  return {};
};

/** legacy SecretsStore.mapper */
export const mapSecret = (data = {}) => {
  const parsed = parseAlgorithmJson(data.algorithm);
  return {
    ...data,
    id: refId(data.secret_ref, 'secrets') || data.id,
    expiration: parsed.expiration || data.expiration,
  };
};

/** legacy ContainersStore.mapper (runs after listDidFetch copied the secret algorithm) */
export const mapContainer = (data = {}) => {
  const parsed = parseAlgorithmJson(data.algorithm);
  return {
    ...data,
    id: refId(data.container_ref, 'containers') || data.id,
    domain: parsed.domain,
    expiration: parsed.expiration,
  };
};

/** Octavia listeners with `lbIds` (legacy ListenerStore mapper); empty when octavia is unavailable */
export const fetchListeners = async () => {
  try {
    const listeners = await barbicanApi.listLbListeners();
    return listeners.map((ls) => ({ ...ls, lbIds: (ls.loadbalancers || []).map((lb) => lb.id) }));
  } catch {
    return [];
  }
};

/** legacy updateItem: mark certificates referenced by a listener (default / client CA / SNI) */
export const attachListeners = (item, ref, listeners = []) => {
  const used = listeners.filter((ls) =>
    [ls.default_tls_container_ref, ls.client_ca_tls_container_ref, ...(ls.sni_container_refs || [])].includes(ref)
  );
  if (used.length) {
    item.listener = used.map((ls) => ({ id: ls.id, name: ls.name, lb: ls.lbIds[0] }));
  }
  return item;
};

export const isExpired = (value) => Boolean(value) && new Date(value) < new Date();

/** Legacy "Status" column of secrets: computed from the expiration date */
export const ExpirationStatus = ({ value }) => {
  const expired = isExpired(value);
  return <Badge color={expired ? '#D32F45' : '#3C9E6C'} text={expired ? t('Expired') : t('Active')} />;
};

/** Fetch & decode a secret payload (legacy fetchDetail) */
export const fetchDecodedPayload = async (id, contentType, opts) => {
  const raw = await barbicanApi.getSecretPayload(id);
  return decodePayload(raw, contentType, opts);
};

const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Download the raw payload bytes of a secret */
export const downloadSecretPayload = async (secret) => {
  const raw = await barbicanApi.getSecretPayload(secret.id);
  const type = secret.payload_content_type || 'application/octet-stream';
  saveBlob(new Blob([raw], { type }), `${secret.name || secret.id}.payload`);
};

/** Download already-decoded text content (certificate / private key) */
export const downloadText = (text, filename) => {
  saveBlob(new Blob([text || ''], { type: 'text/plain' }), filename);
};

/* Shared building blocks moved to src/components (re-exported for existing imports) */
export { PayloadViewer } from '@/components/CodeBlock';
export { noChineseRule } from '@/components/form/rules';

/**
 * Textarea that can be filled from a local file (legacy form type "textarea-from-file"),
 * KeyManager layout: textarea first, small "Upload File" button below.
 */
export function TextareaFromFile(props) {
  return (
    <BaseTextareaFromFile
      buttonPosition="bottom"
      buttonText={t('Upload File')}
      buttonProps={{ size: 'small', style: { marginTop: 8 } }}
      {...props}
    />
  );
}

/** antd DatePicker -> ISO string (legacy moment serialized by JSON.stringify) */
export const toIso = (value) => {
  if (!value) return undefined;
  if (typeof value.toISOString === 'function') return value.toISOString();
  return String(value);
};

export const disabledPastDate = (current) => {
  if (!current) return false;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return current.valueOf() <= end.getTime();
};
