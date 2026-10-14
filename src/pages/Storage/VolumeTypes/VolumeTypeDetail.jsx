import React from 'react';
import { Link } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { formatTime, yesNo } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { cinderApi } from '@/api/cinder';
import { t } from '@/core/i18n';
import {
  controls,
  hasEncryption,
  fetchVolumeTypeDetail,
  extraSpecsToList,
  extraSpecColumns,
  typeExtraSpecActions,
  volumeTypeRowActions,
  fetchVolumeTypes,
} from './volumeTypeShared';
import { filterTabsByPolicy } from '@/pages/Compute/_shared';

/** names of the other volume types (legacy Edit `names` duplicate check) */
const loadVolumeTypeNames = async () => {
  try {
    return (await fetchVolumeTypes({ showQoS: false, showEncryption: false })).map((it) => it.name);
  } catch {
    return [];
  }
};

function ExtraSpecTab({ typeId }) {
  const { create, edit, del } = typeExtraSpecActions(typeId);
  return (
    <ResourcePage
      embedded
      rowKey="keyname"
      fetch={async () => extraSpecsToList((await cinderApi.listVolumeTypeExtraSpecs(typeId))?.extra_specs)}
      columns={extraSpecColumns}
      filterParams={[{ name: 'keyname', label: t('Parameter') }]}
      primaryActions={[create]}
      batchActions={[del]}
      rowActions={{ firstAction: del, moreActions: [{ action: edit }] }}
    />
  );
}

export default function VolumeTypeDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Storage'), { title: t('Volume Types'), path: '/storage/volume-type-admin' }]}
      backPath="/storage/volume-type-admin"
      title={t('Volume Type')}
      policy="volume_extension:type_get"
      fetch={(id) => fetchVolumeTypeDetail(id)}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Description'), value: d.description },
        { label: t('Public'), value: d.is_public, render: () => yesNo(d.is_public) },
        {
          label: t('QoS Spec ID'),
          value: d.qos_specs_id,
          render: () =>
            d.qos_specs_id ? <Link to={`/storage/volume-type-admin/qos/detail/${d.qos_specs_id}`}>{d.qos_specs_id}</Link> : '-',
        },
      ]}
      tabs={(d) => filterTabsByPolicy([
        ...(hasEncryption(d)
          ? [
              {
                key: 'baseDetail',
                label: t('Detail'),
                render: () => (
                  <DetailCard
                    title={t('Encryption Info')}
                    items={[
                      { label: t('Provider'), value: d.encryption.provider },
                      {
                        label: t('Control Location'),
                        value: controls()[d.encryption.control_location] || d.encryption.control_location,
                      },
                      { label: t('Cipher'), value: d.encryption.cipher },
                      { label: t('Key Size (bits)'), value: d.encryption.key_size },
                      { label: t('Created At'), value: formatTime(d.encryption.created_at) },
                    ]}
                  />
                ),
              },
            ]
          : []),
        {
          key: 'ExtraSpec',
          label: t('Extra Specs'),
          policy: 'volume_extension:types_extra_specs:index',
          render: () => <ExtraSpecTab typeId={d.id} />,
        },
      ])}
      actions={() => volumeTypeRowActions({ existingNames: loadVolumeTypeNames })}
    />
  );
}
