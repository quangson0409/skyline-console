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
import { canSeeTab } from '@/pages/Compute/_shared';
import { usePolicyStore } from '@/core/policy';

const VOLUME_TYPE_LIST_POLICY = 'volume_extension:type_get_all';
const QOS_LIST_POLICY = 'volume_extension:qos_specs_manage:get_all';

/** Legacy containers/VolumeType/VolumeType */
export function VolumeTypeTab() {
  const namesRef = useRef([]);
  const existingNames = () => namesRef.current;
  return (
    <ResourcePage
      embedded
      title={t('Volume Types')}
      policy={VOLUME_TYPE_LIST_POLICY}
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
      title={t('QoS Specs')}
      policy={QOS_LIST_POLICY}
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
  usePolicyStore((st) => st.rules); // re-render when the policies are loaded
  // legacy tab containers `get policy()`: a denied tab is hidden
  const tabItems = [
    canSeeTab(VOLUME_TYPE_LIST_POLICY) && { key: 'volume-type', label: t('Volume Types'), children: <VolumeTypeTab /> },
    canSeeTab(QOS_LIST_POLICY) && { key: 'qos', label: t('QoS Specs'), children: <QosSpecTab /> },
  ].filter(Boolean);
  const wanted = searchParams.get('tab') === 'qos' ? 'qos' : 'volume-type';
  const tab = tabItems.some((it) => it.key === wanted) ? wanted : tabItems[0]?.key;

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
          items={tabItems.length ? tabItems : [{ key: 'volume-type', label: t('Volume Types'), children: <VolumeTypeTab /> }]}
        />
      </Card>
    </div>
  );
}
