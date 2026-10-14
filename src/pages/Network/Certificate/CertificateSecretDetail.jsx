import React from 'react';
import { Card } from 'antd';
import ResourceDetail from '@/components/ResourceDetail';
import { t } from '@/core/i18n';
import { PayloadViewer } from '@/components/CodeBlock';
import { certificateInfo, fetchCertificateSecret } from './common';
import { certificateRowActions } from './CertificateList';

export default function CertificateSecretDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Network'), { title: t('Certificates'), path: '/network/certificate?tab=CA' }]}
      backPath="/network/certificate?tab=CA"
      fetch={fetchCertificateSecret}
      info={(d) => certificateInfo(d, { withDomain: false })}
      tabs={(d) => [
        {
          key: 'detail_info',
          label: t('Detail Info'),
          render: () => (
            <Card variant="borderless" title={t('Certificate Content')} styles={{ body: { padding: 0 } }}>
              <PayloadViewer value={d.payload} filename={`${d.name || d.id}.crt`} />
            </Card>
          ),
        },
      ]}
      actions={certificateRowActions('CA')}
    />
  );
}
