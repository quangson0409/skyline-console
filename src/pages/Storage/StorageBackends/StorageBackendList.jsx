import React from 'react';
import { Progress, Tooltip } from 'antd';
import { cinderApi } from '@/api/cinder';
import ResourcePage, { textColumn } from '@/components/ResourcePage';
import { t } from '@/core/i18n';

const isNumber = (v) => typeof v === 'number' && !Number.isNaN(v);

/** stores/cinder/pool mapper */
export const mapPool = (data) => {
  const { name, capabilities = {} } = data || {};
  const item = { name, id: name, ...capabilities };
  const { total_capacity_gb, free_capacity_gb } = capabilities;
  if (isNumber(total_capacity_gb) && isNumber(free_capacity_gb)) {
    item.usedGB = (total_capacity_gb - free_capacity_gb).toFixed(2);
    item.usedGBPercent = total_capacity_gb ? Number(((item.usedGB / total_capacity_gb) * 100).toFixed(0)) : 0;
  }
  return item;
};

export const fetchPools = async () => ((await cinderApi.listPools())?.pools || []).map(mapPool);

/** resources/cinder/cinder-pool poolColumns */
export const poolColumns = () => [
  { title: t('Name'), dataIndex: 'name', key: 'name', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
  textColumn(t('Protocol'), 'storage_protocol'),
  textColumn(t('Backend Name'), 'volume_backend_name'),
  {
    title: t('Storage Capacity (GiB)'),
    dataIndex: 'usedGBPercent',
    key: 'usedGBPercent',
    width: 260,
    render: (value, record) =>
      isNumber(value) ? (
        <Tooltip title={`${t('Used')}: ${record.usedGB} / ${t('Total')}: ${record.total_capacity_gb}`}>
          <div>
            <Progress percent={value} size="small" status={value >= 90 ? 'exception' : 'normal'} />
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {record.usedGB} / {record.total_capacity_gb}
            </div>
          </div>
        </Tooltip>
      ) : (
        '-'
      ),
  },
];

export default function StorageBackendList() {
  return (
    <ResourcePage
      title={t('Storage Backends')}
      breadcrumb={[t('Storage'), t('Storage Backends')]}
      description={t('Cinder scheduler pools and their capacity usage.')}
      rowKey="name"
      fetch={fetchPools}
      columns={poolColumns}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'storage_protocol', label: t('Protocol') },
        { name: 'volume_backend_name', label: t('Backend Name') },
      ]}
    />
  );
}
