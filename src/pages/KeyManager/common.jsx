import React from 'react';
import { Badge, Button, Input, Space, Typography, message } from 'antd';
import { CopyOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
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

/** <pre> payload viewer with copy & download (legacy contentCard with copyable) */
export function PayloadViewer({ value, filename, error }) {
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>;
  if (value === undefined || value === null || value === '') return <Typography.Text type="secondary">-</Typography.Text>;
  return (
    <div>
      <Space style={{ marginBottom: 8 }}>
        <Button
          size="small"
          icon={<CopyOutlined />}
          onClick={() => {
            navigator.clipboard?.writeText(String(value));
            message.success(t('Copied'));
          }}
        >
          {t('Copy')}
        </Button>
        {filename ? (
          <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadText(String(value), filename)}>
            {t('Download')}
          </Button>
        ) : null}
      </Space>
      <pre
        style={{
          margin: 0,
          padding: 12,
          maxHeight: 420,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontSize: 12,
          background: 'rgba(148,163,184,0.12)',
          borderRadius: 6,
        }}
      >
        {String(value)}
      </pre>
    </div>
  );
}

/**
 * Textarea that can be filled from a local file (legacy form type "textarea-from-file").
 * Controlled by antd Form.Item (value / onChange).
 */
export function TextareaFromFile({ value, onChange, accept, placeholder, rows = 6 }) {
  const inputRef = React.useRef(null);
  return (
    <div>
      <Input.TextArea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
      />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onChange?.(String(reader.result || ''));
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
      <Button size="small" icon={<UploadOutlined />} style={{ marginTop: 8 }} onClick={() => inputRef.current?.click()}>
        {t('Upload File')}
      </Button>
    </div>
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

/** legacy "input-name" withoutChinese */
export const noChineseRule = () => ({
  validator: (_r, value) =>
    value && /[一-龥]/.test(value)
      ? Promise.reject(new Error(t('The name cannot contain Chinese characters.')))
      : Promise.resolve(),
});
