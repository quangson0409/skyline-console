import React from 'react';
import { Link } from 'react-router-dom';
import { Row, Col } from 'antd';
import { zunApi } from '@/api/zun';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { capsuleStatus, stringifyContent } from '../common';
import { capsuleRowActions, mapCapsule } from './CapsuleList';

function CapsuleInfoTab({ d }) {
  const one = { xs: 1, sm: 1, md: 1 };
  const containers = d.containers || [];
  return (
    <Row gutter={16}>
      <Col xs={24} xl={12}>
        <DetailCard
          title={t('Capsule Type')}
          column={one}
          items={[
            { label: t('Status Reason'), value: d.status_reason },
            { label: t('Project ID'), value: d.project_id },
            { label: t('User ID'), value: d.user_id },
          ]}
        />
        {containers.length ? (
          <DetailCard
            title={t('Containers Info')}
            column={one}
            items={[
              {
                label: t('Containers'),
                render: () =>
                  containers.map((it) => (
                    <div key={it.uuid} style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>
                        <Link to={`/container-service/containers/detail/${it.uuid}`}>{it.name || it.uuid}</Link>
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{it.uuid}</div>
                    </div>
                  )),
              },
            ]}
          />
        ) : null}
      </Col>
      <Col xs={24} xl={12}>
        <DetailCard
          title={t('Spec')}
          column={one}
          items={[
            { label: t('CPU'), value: d.cpu },
            { label: t('Memory (MiB)'), value: d.memory },
            { label: t('Exit Policy'), render: () => stringifyContent(d.restart_policy) },
            { label: t('Addresses'), render: () => stringifyContent(d.addresses) },
            { label: t('Labels'), render: () => stringifyContent(d.labels) },
          ]}
        />
      </Col>
    </Row>
  );
}

export default function CapsuleDetail() {
  return (
    <ResourceDetail
      policy="capsule:get_one_all_projects"
      breadcrumb={[t('Container Service'), { title: t('Capsules'), path: '/container-service/capsules' }]}
      backPath="/container-service/capsules"
      fetch={async (id) => {
        const raw = await zunApi.getCapsule(id);
        return mapCapsule({ ...raw, uuid: raw.uuid || id });
      }}
      info={(d) => [
        { label: t('ID'), value: d.uuid, copyable: true },
        { label: t('Name'), value: d.meta_name },
        { label: t('Status'), value: d.status, render: () => capsuleStatus()[d.status] || d.status || '-' },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      tabs={(d) => [{ key: 'general_info', label: t('Detail'), render: () => <CapsuleInfoTab d={d} /> }]}
      actions={capsuleRowActions()}
    />
  );
}
