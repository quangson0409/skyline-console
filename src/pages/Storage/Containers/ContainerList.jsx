import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Popover, Row, Col, Skeleton } from 'antd';
import { swiftApi, swiftAccountUrl } from '@/api/swift';
import { hasEndpoint } from '@/api/endpoints';
import ResourcePage, { formatSize, formatTime, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';

/* ------------------------------------------------------------------ helpers */
const SWIFT_NAME_RE = /^[A-Za-z一-龥]+[A-Za-z一-龥\d\-._]{2,62}$/;

/** legacy NameInput isSwiftFile validator */
export const swiftNameRule = () => ({
  validator: (_, value) =>
    !value || SWIFT_NAME_RE.test(value)
      ? Promise.resolve()
      : Promise.reject(
          new Error(
            t(
              'The name should start with upper letter, lower letter or chinese, and be a string of 3 to 63, characters can only contain "0-9, a-z, A-Z, chinese, -, _, .".'
            )
          )
        ),
});

/** Swift X-Timestamp (seconds, float) -> local time string */
export const timestampToStr = (ts) => {
  if (!ts) return '-';
  const n = Number(ts);
  if (Number.isNaN(n)) return String(ts);
  return formatTime(new Date(n * 1000).toISOString());
};

export const containerDetailPath = (container, folder) =>
  `/storage/container/detail/${encodeURIComponent(container)}${folder ? `/${encodeURIComponent(folder)}` : ''}`;

/** stores/swift/container detailFetchByClient */
export const fetchContainerDetail = async (name) => {
  const headers = await swiftApi.showContainerMetadata(name);
  const isPublic = !!headers['x-container-read'];
  return {
    used: headers['x-container-bytes-used'],
    object_count: headers['x-container-object-count'],
    storage_policy: headers['x-storage-policy'],
    timestamp: headers['x-timestamp'],
    is_public: isPublic,
    link: isPublic ? `/api${swiftAccountUrl()}/${encodeURIComponent(name)}` : null,
  };
};

const checkContainerName = async (name) => {
  let exists = false;
  try {
    await swiftApi.showContainerMetadata(name);
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) throw new Error(t('A container with the same name already exists'));
};

export const updatePublic = (name, isPublic) =>
  swiftApi.updateContainerMetadata(name, { 'X-Container-Read': isPublic ? '.r:*,.rlistings' : '' });

const publicTip = () =>
  t('A public container will allow anyone to use the objects in your container through a public URL.');

/* ------------------------------------------------------------------ actions */
export const createContainerAction = () => ({
  id: 'create',
  type: 'modal',
  title: t('Create Container'),
  description: t("Note: Please consider the container name carefully since it couldn't be changed after created."),
  getDefaultValues: () => ({ isPublic: false }),
  formItems: [
    { name: 'name', label: t('Container Name'), type: 'input', required: true, rules: [swiftNameRule()] },
    { name: 'isPublic', label: t('Public Access'), type: 'switch', tip: publicTip() },
  ],
  onSubmit: async ({ name, isPublic }) => {
    await checkContainerName(name);
    await swiftApi.createContainer(name);
    if (isPublic) await updatePublic(name, true);
  },
});

export const accessContainerAction = () => ({
  id: 'access',
  type: 'modal',
  title: t('Update Access'),
  getDefaultValues: async (item) => {
    try {
      const d = await fetchContainerDetail(item.name);
      return { isPublic: d.is_public || false };
    } catch {
      return { isPublic: false };
    }
  },
  formItems: [{ name: 'isPublic', label: t('Public Access'), type: 'switch', tip: publicTip() }],
  onSubmit: ({ isPublic = false }, item) => updatePublic(item.name, isPublic),
});

export const deleteContainerAction = () =>
  deleteAction({
    name: t('Container'),
    title: t('Delete Container'),
    onDelete: async (it) => {
      try {
        await swiftApi.deleteContainer(it.name);
      } catch (error) {
        if (error?.response?.status === 409) {
          throw new Error(t('Cannot delete container "{name}". The container is not empty.', { name: it.name }));
        }
        throw error;
      }
    },
  });

/* ------------------------------------------------------------------ detail popover */
function ContainerPopContent({ name }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchContainerDetail(name)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({}));
    return () => {
      alive = false;
    };
  }, [name]);
  if (!data) return <Skeleton active paragraph={{ rows: 3 }} style={{ width: 300 }} />;
  const rows = [
    [t('Object Count'), data.object_count ?? '-'],
    [t('Size'), formatSize(data.used)],
    [t('Created At'), timestampToStr(data.timestamp)],
    [
      t('Public Access'),
      data.link ? (
        <a href={data.link.endsWith('/') ? data.link : `${data.link}/`} target="_blank" rel="noreferrer">
          {t('Click To View')}
        </a>
      ) : (
        t('Private')
      ),
    ],
  ];
  return (
    <div style={{ width: 300 }}>
      {rows.map(([label, value]) => (
        <Row key={label} style={{ marginBottom: 4 }}>
          <Col span={10} style={{ color: '#64748b' }}>
            {label}
          </Col>
          <Col span={14}>{value}</Col>
        </Row>
      ))}
    </div>
  );
}

export const fetchContainers = async () =>
  (await swiftApi.listContainers()).map((it) => ({ ...it, id: it.name }));

export default function ContainerList() {
  const enabled = hasEndpoint('swift');
  return (
    <ResourcePage
      title={t('Object Storage')}
      breadcrumb={[t('Storage'), t('Object Storage')]}
      description={t('Swift containers and the objects stored in them.')}
      notice={enabled ? undefined : t('The Swift (object storage) service is not available in the current region.')}
      rowKey="name"
      fetch={() => (enabled ? fetchContainers() : [])}
      columns={[
        {
          title: t('Name'),
          dataIndex: 'name',
          key: 'name',
          sorter: (a, b) => String(a.name).localeCompare(String(b.name)),
          render: (v) => (
            <Link to={containerDetailPath(v)} style={{ fontWeight: 600 }}>
              {v}
            </Link>
          ),
        },
        { title: t('Object Count'), dataIndex: 'count', key: 'count', render: (v) => v ?? '-' },
        { title: t('Size'), dataIndex: 'bytes', key: 'bytes', sorter: (a, b) => (a.bytes || 0) - (b.bytes || 0), render: (v) => formatSize(v) },
        { title: t('Last Updated'), dataIndex: 'last_modified', key: 'last_modified', render: (v) => formatTime(v) },
        {
          title: t('Detail Info'),
          key: 'detail',
          render: (_, r) => (
            <Popover content={<ContainerPopContent name={r.name} />} trigger="click" destroyOnHidden>
              <a>{t('Detail Info')}</a>
            </Popover>
          ),
        },
      ]}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={({ isAdmin }) => (isAdmin || !enabled ? [] : [createContainerAction()])}
      batchActions={[deleteContainerAction()]}
      rowActions={({ isAdmin }) => ({
        firstAction: isAdmin ? null : accessContainerAction(),
        moreActions: [{ action: deleteContainerAction() }],
      })}
    />
  );
}
