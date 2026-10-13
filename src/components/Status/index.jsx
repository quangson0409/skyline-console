import React from 'react';
import { Badge, Space } from 'antd';
import { t } from '@/core/i18n';

const successKeys = [
  'enabled',
  'running',
  'up',
  'active',
  'available',
  'in-use',
  'success',
  'new',
  'finish',
  'received',
  'resolved',
  'power on',
  'complete',
  'online',
  'ready',
  'pass',
];

const processingKeys = [
  'wait_feedback',
  'build',
  'building',
  'queued',
  'stopped',
  'shutoff',
  'rescued',
  'resized',
  'reboot',
  'rebooting',
  'soft-reboot',
  'hard-reboot',
  'progress',
];

const errorKeys = [
  'error_deleting',
  'failed',
  'failure',
  'firing',
  'power off',
  'error',
  'offline',
  'refuse',
];

const getStatusBadge = (key = '') => {
  const lower = String(key).toLowerCase();
  if (successKeys.includes(lower) || lower.includes('complete')) {
    return 'success';
  }
  if (processingKeys.includes(lower) || lower.includes('progress') || lower.includes('ing')) {
    return 'processing';
  }
  if (errorKeys.includes(lower) || lower.includes('fail')) {
    return 'error';
  }
  return 'default';
};

export default function Status({ status = 'active', text, style = {} }) {
  let badgeStatus = 'default';

  if (typeof status === 'boolean') {
    badgeStatus = status ? 'success' : 'error';
  } else if (typeof status === 'string') {
    badgeStatus = getStatusBadge(status);
  }

  // Display text: either custom text or translated status keyword
  const displayText = text || t(status.charAt(0).toUpperCase() + status.slice(1).toLowerCase());

  return (
    <Space size={6} style={style}>
      <Badge status={badgeStatus} />
      <span
        style={{
          fontWeight: 500,
          color:
            badgeStatus === 'success'
              ? '#16a34a'
              : badgeStatus === 'error'
              ? '#ef4444'
              : badgeStatus === 'processing'
              ? '#0284c7'
              : '#64748b',
        }}
      >
        {displayText}
      </span>
    </Space>
  );
}
