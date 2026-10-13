import React, { useRef } from 'react';
import { Breadcrumb, Card, Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import ResourcePage from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  fetchVolumeTypes,
  fetchQosSpecs,
  volumeTypeColumns,
  volumeTypeRowActions,
  createVolumeTypeAction,
  deleteVolumeTypeAction,
  qosColumns,
  createQosAction,
  editConsumerAction,
  deleteQosAction,
} from './volumeTypeShared';

/** Legacy containers/VolumeType/VolumeType */
export function VolumeTypeTab() {
  const namesRef = useRef([]);
  const existingNames = () => namesRef.current;
  return (
    <ResourcePage
      embedded
      fetch={async () => {
        const items = await fetchVolumeTypes();
        namesRef.current = items.map((it) => it.name);
        return items;
      }}
      columns={volumeTypeColumns}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'qos_specs_id', label: t('Associated QoS Spec ID') },
      ]}
      primaryActions={[createVolumeTypeAction({ existingNames })]}
      batchActions={[deleteVolumeTypeAction()]}
      rowActions={volumeTypeRowActions({ existingNames })}
    />
  );
}

/** Legacy containers/VolumeType/QosSpec */
export function QosSpecTab() {
  return (
    <ResourcePage
      embedded
      fetch={fetchQosSpecs}
      columns={qosColumns}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={[createQosAction()]}
      batchActions={[deleteQosAction()]}
      rowActions={{ firstAction: editConsumerAction(), moreActions: [{ action: deleteQosAction() }] }}
    />
  );
}

export default function VolumeTypeAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'qos' ? 'qos' : 'volume-type';

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={[{ title: t('Storage') }, { title: t('Volume Types') }]} style={{ marginBottom: 16, fontSize: 13 }} />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('Volume Types')}
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {t('Block storage volume types, their extra specs, encryption, access control and QoS specs.')}
        </p>
      </div>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Tabs
          activeKey={tab}
          onChange={(key) => setSearchParams(key === 'qos' ? { tab: 'qos' } : {})}
          destroyOnHidden
          items={[
            { key: 'volume-type', label: t('Volume Types'), children: <VolumeTypeTab /> },
            { key: 'qos', label: t('QoS Specs'), children: <QosSpecTab /> },
          ]}
        />
      </Card>
    </div>
  );
}
