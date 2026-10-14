import React from 'react';
import { Row, Col, Card } from 'antd';
import ResourceDetail from '@/components/ResourceDetail';
import { t } from '@/core/i18n';
import { PayloadViewer } from '@/components/CodeBlock';
import { certificateInfo, fetchCertificateContainer } from './common';
import { certificateRowActions } from './CertificateList';

const secretPayload = (d, name) => (d.secret_refs || []).find((it) => it.name === name)?.secret_info?.payload;

export default function CertificateContainerDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Network'), { title: t('Certificates'), path: '/network/certificate?tab=SERVER' }]}
      backPath="/network/certificate?tab=SERVER"
      fetch={fetchCertificateContainer}
      info={(d) => certificateInfo(d)}
      tabs={(d) => [
        {
          key: 'detail_info',
          label: t('Detail Info'),
          render: () => (
            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <Card variant="borderless" title={t('Certificate Content')} styles={{ body: { padding: 0 } }}>
                  <PayloadViewer value={secretPayload(d, 'certificate')} filename={`${d.name || d.id}.crt`} />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card variant="borderless" title={t('Private Key')} styles={{ body: { padding: 0 } }}>
                  <PayloadViewer value={secretPayload(d, 'private_key')} filename={`${d.name || d.id}.key`} />
                </Card>
              </Col>
            </Row>
          ),
        },
      ]}
      actions={certificateRowActions('SERVER')}
    />
  );
}
