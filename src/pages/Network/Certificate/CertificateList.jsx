import React from 'react';
import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import ResourcePage, { nameColumn, statusColumn, timeColumn, formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  certificateMode,
  certificateStatus,
  certificateDetailPath,
  renderListeners,
  fetchServerCertificates,
  fetchCaCertificates,
} from './common';
import { createCertificateAction, deleteContainerAction, deleteCaSecretAction } from './actions';

export const certificateRowActions = (mode) => ({
  firstAction: mode === 'CA' ? deleteCaSecretAction() : deleteContainerAction(),
  moreActions: [],
});

/** Port of legacy pages/network/containers/Certificate (TabList: Server / CA certificates) */
export default function CertificateList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('tab') === 'CA' ? 'CA' : 'SERVER';
  const deleteAction = mode === 'CA' ? deleteCaSecretAction() : deleteContainerAction();

  return (
    <ResourcePage
      key={mode}
      title={t('Certificates')}
      breadcrumb={[t('Network'), t('Certificates')]}
      description={t('TLS certificates stored in Barbican for load balancer listeners.')}
      header={
        <Tabs
          activeKey={mode}
          onChange={(key) => {
            const next = new URLSearchParams(searchParams);
            next.set('tab', key);
            setSearchParams(next, { replace: true });
          }}
          items={[
            { key: 'SERVER', label: t('Server Certificates') },
            { key: 'CA', label: t('CA Certificates') },
          ]}
        />
      }
      deps={[mode]}
      fetch={() => (mode === 'CA' ? fetchCaCertificates() : fetchServerCertificates())}
      columns={[
        nameColumn({ linkTo: (r) => certificateDetailPath(mode, r.id) }),
        {
          title: t('Certificate Type'),
          dataIndex: 'mode',
          key: 'mode',
          render: (v) => certificateMode()[v] || v || '-',
        },
        { title: t('Expires At'), dataIndex: 'expiration', key: 'expiration', render: (v) => formatTime(v) },
        mode !== 'CA' && {
          title: t('Domain Name'),
          dataIndex: 'domain',
          key: 'domain',
          render: (v) => v || '-',
        },
        { title: t('Listener'), dataIndex: 'listener', key: 'listener', render: renderListeners },
        statusColumn({ textMap: certificateStatus() }),
        timeColumn({ dataIndex: 'created' }),
      ].filter(Boolean)}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={[createCertificateAction(mode)]}
      batchActions={[deleteAction]}
      rowActions={certificateRowActions(mode)}
    />
  );
}
