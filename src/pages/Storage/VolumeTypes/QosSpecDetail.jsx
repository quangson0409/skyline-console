import React from 'react';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage from '@/components/ResourcePage';
import { cinderApi } from '@/api/cinder';
import { t } from '@/core/i18n';
import {
  consumerTypes,
  extraSpecsToList,
  extraSpecColumns,
  qosKeyActions,
  editConsumerAction,
  deleteQosAction,
  fetchQosSpecs,
} from './volumeTypeShared';
import { renderSpecs } from '../shared';
import { filterTabsByPolicy } from '@/pages/Compute/_shared';

const QOS_GET_POLICY = 'volume_extension:qos_specs_manage:get';

function QosKeyTab({ qosId }) {
  const { create, edit, del } = qosKeyActions(qosId);
  return (
    <ResourcePage
      embedded
      rowKey="keyname"
      fetch={async () => extraSpecsToList((await cinderApi.getQosSpec(qosId))?.qos_specs?.specs)}
      columns={extraSpecColumns}
      filterParams={[{ name: 'keyname', label: t('Parameter') }]}
      primaryActions={[create]}
      batchActions={[del]}
      rowActions={{ firstAction: del, moreActions: [{ action: edit }] }}
    />
  );
}

export default function QosSpecDetail() {
  const back = '/storage/volume-type-admin?tab=qos';
  return (
    <ResourceDetail
      breadcrumb={[t('Storage'), { title: t('Volume Types'), path: '/storage/volume-type-admin' }, { title: t('QoS Specs'), path: back }]}
      backPath={back}
      title={t('QoS Spec')}
      policy={QOS_GET_POLICY}
      fetch={async (id) => {
        let qos = (await cinderApi.getQosSpec(id))?.qos_specs;
        if (!qos || Array.isArray(qos)) qos = (await fetchQosSpecs()).find((it) => it.id === id);
        if (!qos) throw new Error(t('Resource not found or failed to load'));
        return qos;
      }}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Consumer'), value: consumerTypes()[d.consumer] || d.consumer },
        { label: t('Specs'), value: d.specs, render: () => renderSpecs(d.specs) },
      ]}
      tabs={(d) =>
        filterTabsByPolicy([
          { key: 'ExtraSpec', label: t('Extra Specs'), policy: QOS_GET_POLICY, render: () => <QosKeyTab qosId={d.id} /> },
        ])
      }
      actions={() => ({ firstAction: editConsumerAction(), moreActions: [{ action: deleteQosAction() }] })}
    />
  );
}
