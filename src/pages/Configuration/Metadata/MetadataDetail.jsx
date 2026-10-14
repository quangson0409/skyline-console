import React from 'react';
import { Col, Row } from 'antd';
import { glanceApi } from '@/api/glance';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { JsonBlock } from '@/components/CodeBlock';
import { mapNamespace, metadataRowActions } from './MetadataList';

/** Legacy pages/configuration/containers/Metadata/Detail */
export default function MetadataDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Global Settings'), { title: t('Metadata Definitions'), path: '/configuration-admin/metadata' }]}
      backPath="/configuration-admin/metadata"
      title={(d) => d.display_name || d.namespace}
      fetch={async (id) => {
        const res = await glanceApi.getNamespace(decodeURIComponent(id));
        return { ...mapNamespace({ namespace: decodeURIComponent(id), ...(res || {}) }), raw: res };
      }}
      info={(d) => [
        { label: t('Name'), value: d.display_name },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      tabs={(d) => [
        {
          key: 'detail',
          label: t('Detail'),
          render: () => (
            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <DetailCard
                  title={t('Base Info')}
                  column={1}
                  items={[
                    { label: t('Namespace'), value: d.namespace, copyable: true },
                    { label: t('Description'), value: d.description },
                  ]}
                />
                <DetailCard
                  title={t('Associated Resource Types')}
                  column={1}
                  items={
                    (d.resource_type_associations || []).length
                      ? d.resource_type_associations.map((it) => ({
                          label: it.name,
                          value: `${t('Prefix')}: ${it.prefix || '-'}`,
                        }))
                      : [{ label: t('Resource Types'), value: '' }]
                  }
                />
              </Col>
              <Col xs={24} lg={12}>
                <DetailCard title={t('Content')} column={1} items={[{ label: '', render: () => <JsonBlock value={d.raw} maxHeight={640} /> }]} />
              </Col>
            </Row>
          ),
        },
      ]}
      actions={metadataRowActions}
    />
  );
}
