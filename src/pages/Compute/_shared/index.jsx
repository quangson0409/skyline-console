import React from 'react';
import { Card, Col, Row, Input, Upload, Button, Space } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

/** KPI summary cards kept from the first version of the Compute pages */
export const KpiCards = ({ items = [] }) => {
  const span = Math.max(6, Math.floor(24 / Math.max(items.length, 1)));
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      {items.map((it) => (
        <Col xs={24} sm={12} lg={span} key={it.title}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{it.title}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: it.color || '#0068ff' }}>
              {it.value}
              {it.suffix ? <span style={{ fontSize: 13, color: '#94a3b8' }}> {it.suffix}</span> : null}
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
};

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

/** Port of legacy FormItem "textarea-from-file": textarea that can be filled from a local file */
export const TextareaFromFile = ({ value, onChange, rows = 6, placeholder, accept }) => (
  <Space direction="vertical" style={{ width: '100%' }}>
    <Upload
      accept={accept}
      showUploadList={false}
      beforeUpload={(file) => {
        const reader = new FileReader();
        reader.onload = (e) => onChange?.(String(e.target.result || ''));
        reader.readAsText(file);
        return false;
      }}
    >
      <Button icon={<UploadOutlined />}>{t('Load from local files')}</Button>
    </Upload>
    <Input.TextArea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange?.(e.target.value)} />
  </Space>
);

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

/** legacy valueRender 'sinceTime' - "x minutes ago" */
export const sinceTime = (value) => {
  if (!value) return '-';
  const str = String(value);
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(str) ? str : `${str}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return str;
  const diff = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (diff < 60) return t('a few seconds ago');
  if (diff < 3600) return `${Math.floor(diff / 60)} ${t('minutes ago')}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${t('hours ago')}`;
  return `${Math.floor(diff / 86400)} ${t('days ago')}`;
};

/** MiB -> GiB with 2 decimals (legacy getGiBValue) */
export const getGiBValue = (mb) => {
  const v = Number(mb) || 0;
  return Number((v / 1024).toFixed(2));
};
