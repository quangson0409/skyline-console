import React from 'react';
import { Link } from 'react-router-dom';
import { Row, Col } from 'antd';
import { zunApi } from '@/api/zun';
import { glanceApi } from '@/api/glance';
import { neutronApi } from '@/api/neutron';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { containerStatus, containerTaskStatus, imageDrivers, exitPolicies, stringifyContent, listRender } from '../common';
import { containerRowActions } from './actions';
import { mapAddresses, mapContainer } from './ContainerList';
import { ActionLogs, Logs, Console } from './ContainerTabs';

const yn = (v) => (v ? t('Yes') : t('No'));
const fixed = (v) => (typeof v === 'number' ? v.toFixed(4) : v ?? '-');

/** Legacy ContainersStore.detailDidFetch */
export const fetchContainerDetail = async (id) => {
  const raw = await zunApi.getContainer(id);
  const item = mapContainer({ ...raw, uuid: raw.uuid || id });
  const [stats, image, nets, subs] = await Promise.all([
    item.status === 'Running' ? zunApi.getContainerStats(item.uuid).catch(() => ({})) : {},
    item.image_driver === 'glance' && item.image ? glanceApi.getImage(item.image).catch(() => null) : null,
    neutronApi.listNetworks().catch(() => ({})),
    neutronApi.listSubnets().catch(() => ({})),
  ]);
  return {
    ...item,
    stats: stats || {},
    imageInfo: image || undefined,
    ...mapAddresses(item, nets?.networks || [], subs?.subnets || []),
  };
};

const SHOW_LOG_STATUS = ['Created', 'Running', 'Stopped', 'Paused'];

function ContainerInfoTab({ d, isAdmin }) {
  const one = { xs: 1, sm: 1, md: 1 };
  const net = (path) => (isAdmin ? path.replace('/network/networks/', '/network/networks-admin/') : path);
  const stats = d.stats || {};
  const hasStats = Object.keys(stats).length > 0;
  const policy = d.restart_policy || {};
  const hc = d.healthcheck || {};
  return (
    <Row gutter={16}>
      <Col xs={24} xl={12}>
        <DetailCard
          title={t('Base Info')}
          column={one}
          items={[
            {
              label: t('Image'),
              render: () =>
                d.imageInfo ? (
                  <Link to={`/compute/${isAdmin ? 'image-admin' : 'image'}/detail/${d.imageInfo.id}`}>{d.imageInfo.name || d.imageInfo.id}</Link>
                ) : (
                  d.image || '-'
                ),
            },
            { label: t('Image Driver'), value: imageDrivers()[d.image_driver] || d.image_driver },
            { label: t('Status Detail'), value: containerStatus()[d.status_detail] || d.status_detail },
            { label: t('Status Reason'), value: d.status_reason },
            { label: t('Task State'), value: containerTaskStatus()[d.task_state_key] || d.task_state_key },
          ]}
        />
        <DetailCard
          title={t('Others')}
          column={one}
          items={[
            { label: t('Host'), value: d.host },
            { label: t('Hostname'), value: d.hostname },
            { label: t('Runtime'), value: d.runtime },
            { label: t('CMD'), render: () => stringifyContent(d.command) },
            { label: t('ENTRYPOINT'), render: () => stringifyContent(d.entrypoint) },
            { label: t('Workdir'), value: d.workdir },
            { label: t('Environment'), render: () => stringifyContent(d.environment) },
            { label: t('Labels'), render: () => stringifyContent(d.labels) },
          ]}
        />
        {hasStats ? (
          <DetailCard
            title={t('Stats Information')}
            column={one}
            items={[
              { label: t('BLOCK I/O (B)'), value: stats['BLOCK I/O(B)'] },
              { label: t('NET I/O (B)'), value: stats['NET I/O(B)'] },
              { label: t('CPU %'), value: fixed(stats['CPU %'] ?? 0) },
              { label: t('MEM LIMIT (MiB)'), value: stats['MEM LIMIT(MiB)'] },
              { label: t('MEM USAGE (MiB)'), value: fixed(stats['MEM USAGE(MiB)'] ?? 0) },
              { label: t('MEM %'), value: fixed(stats['MEM %'] ?? 0) },
            ]}
          />
        ) : null}
      </Col>
      <Col xs={24} xl={12}>
        <DetailCard
          title={t('Spec')}
          column={one}
          items={[
            { label: t('CPU (Core)'), value: d.cpu },
            { label: t('Memory (MiB)'), value: d.memory },
            { label: t('Disk (GiB)'), value: d.disk },
            {
              label: t('Exit Policy'),
              render: () =>
                policy && Object.keys(policy).length ? (
                  <div>
                    <div>
                      {t('Name')}: {exitPolicies()[policy.Name] || policy.Name || '-'}
                    </div>
                    <div>
                      {t('Max Retry')}: {policy.MaximumRetryCount ?? '-'}
                    </div>
                  </div>
                ) : (
                  '-'
                ),
            },
            { label: t('Enable auto remove'), value: yn(d.auto_remove) },
            { label: t('Enable auto heal'), value: yn(d.auto_heal) },
            { label: t('Enable interactive mode'), value: yn(d.interactive) },
            {
              label: t('Enable Health Check'),
              render: () =>
                hc && Object.keys(hc).length ? (
                  <div>
                    <div>
                      {t('Health Check CMD')}: {Array.isArray(hc.test) ? hc.test.join(' ') : hc.test}
                    </div>
                    <div>
                      {t('Health Check Interval')}: {hc.interval} s
                    </div>
                    <div>
                      {t('Health Check Retries')}: {hc.retries}
                    </div>
                    <div>
                      {t('Health Check Timeout')}: {hc.timeout} s
                    </div>
                  </div>
                ) : (
                  t('No')
                ),
            },
            { label: t('Addresses'), render: () => stringifyContent(d.addresses) },
            { label: t('IP Address'), render: () => listRender(d.addrs, (it) => it.addr, (it) => `${it.addr}-${it.port}`) },
            {
              label: t('Networks'),
              render: () =>
                listRender(
                  d.networks,
                  (it) => <Link to={net(`/network/networks/detail/${it.id}`)}>{it.name || it.id}</Link>,
                  (it) => it.id
                ),
            },
            {
              label: t('Subnets'),
              render: () =>
                listRender(
                  d.subnets,
                  (it) => <Link to={net(`/network/networks/detail/${it.network_id}/subnet/${it.id}`)}>{it.name || it.id}</Link>,
                  (it) => it.id
                ),
            },
            { label: t('Ports'), render: () => listRender(Array.isArray(d.ports) ? d.ports : [], (it) => String(it), (it) => String(it)) },
            {
              label: t('Security Groups'),
              render: () =>
                listRender(
                  d.security_groups || [],
                  (it) => {
                    const sg = typeof it === 'object' && it ? it.id || it.name : it;
                    const label = typeof it === 'object' && it ? it.name || it.id : it;
                    return <Link to={`/network/${isAdmin ? 'security-group-admin' : 'security-group'}/detail/${sg}`}>{String(label)}</Link>;
                  },
                  (it) => (typeof it === 'object' && it ? it.id || it.name : it)
                ),
            },
          ]}
        />
      </Col>
    </Row>
  );
}

export default function ContainerDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Container Service'), { title: t('Zun Containers'), path: '/container-service/containers' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/container-service/containers-admin' : '/container-service/containers')}
      fetch={fetchContainerDetail}
      info={(d) => [
        { label: t('ID'), value: d.uuid, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Container Status'), value: d.status, render: () => containerStatus()[d.status] || d.status || '-' },
        { label: t('Project ID'), value: d.project_id },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      tabs={(d, { isAdmin }) =>
        [
          { key: 'general_info', label: t('Detail'), render: () => <ContainerInfoTab d={d} isAdmin={isAdmin} /> },
          { key: 'action_logs', label: t('Action Logs'), render: () => <ActionLogs detail={d} isAdmin={isAdmin} /> },
          SHOW_LOG_STATUS.includes(d.status) && { key: 'logs', label: t('Logs'), render: () => <Logs detail={d} /> },
          d.interactive === true && { key: 'console', label: t('Console'), render: () => <Console detail={d} /> },
        ].filter(Boolean)
      }
      actions={({ isAdmin }) => containerRowActions(isAdmin)}
    />
  );
}
