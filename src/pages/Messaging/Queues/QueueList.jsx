import React from 'react';
import { Link } from 'react-router-dom';
import { zaqarApi } from '@/api/zaqar';
import ResourcePage from '@/components/ResourcePage';
import { t } from '@/core/i18n';

/** legacy resources/zaqar/queue.js */
export const queueStatus = () => ({ active: t('Active') });

const QUEUE_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const queueBasePath = (isAdmin) => (isAdmin ? '/messaging/queues-admin' : '/messaging/queues');

const jsonRule = () => ({
  validator: (_, value) => {
    if (!value || String(value).trim() === '') return Promise.resolve();
    try {
      JSON.parse(value);
      return Promise.resolve();
    } catch {
      return Promise.reject(new Error(t('Please enter valid JSON.')));
    }
  },
});

/** legacy Queue/actions/Create */
export const createQueueAction = () => ({
  id: 'create-queue',
  type: 'modal',
  policy: 'queues:create',
  title: t('Create Queue'),
  formItems: [
    {
      name: 'name',
      label: t('Queue Name'),
      type: 'input',
      required: true,
      placeholder: t('Enter queue name'),
      tip: t('Queue names may only contain letters, digits, underscores and hyphens.'),
      rules: [
        {
          validator: (_, v) =>
            !v || QUEUE_NAME_RE.test(v)
              ? Promise.resolve()
              : Promise.reject(new Error(t('Queue names may only contain letters, digits, underscores and hyphens.'))),
        },
      ],
    },
  ],
  onSubmit: (values) => zaqarApi.createQueue(values.name, {}),
});

/** legacy Queue/actions/Delete (id 'delete' so the detail page returns to the list) */
export const deleteQueueAction = () => ({
  id: 'delete',
  type: 'confirm',
  policy: 'queues:delete',
  title: t('Delete Queue'),
  buttonText: t('Delete'),
  actionName: t('Delete queue'),
  isDanger: true,
  onSubmit: async (target) => {
    for (const it of [].concat(target)) {
      // eslint-disable-next-line no-await-in-loop
      await zaqarApi.deleteQueue(it.name);
    }
  },
});

/** legacy QueueStore.purge: pop 20 messages per call until the queue is empty */
export const purgeQueue = async (name) => {
  for (let i = 0; i < 1000; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await zaqarApi.popMessages(name, 20);
    const list = Array.isArray(res) ? res : res?.messages;
    if (!Array.isArray(list) || list.length === 0) break;
  }
};

/** legacy Queue/actions/Purge */
export const purgeQueueAction = () => ({
  id: 'purge-queue',
  type: 'confirm',
  policy: 'queues:purge',
  title: t('Purge Queue'),
  buttonText: t('Purge'),
  actionName: t('Purge all messages from queue'),
  isDanger: true,
  description: t('This will permanently delete ALL messages in the queue. This action cannot be undone.'),
  onSubmit: async (target) => {
    for (const it of [].concat(target)) {
      // eslint-disable-next-line no-await-in-loop
      await purgeQueue(it.name);
    }
  },
});

/** legacy Queue/actions/EditMetadata */
export const editMetadataAction = () => ({
  id: 'edit-queue-metadata',
  type: 'modal',
  policy: 'queues:update',
  title: t('Edit Queue Metadata'),
  buttonText: t('Edit Metadata'),
  getDefaultValues: async (item) => {
    let metadata = item.metadata || {};
    try {
      const result = (await zaqarApi.getQueueMetadata(item.name)) || {};
      metadata = result.metadata || result.queue?.metadata || (!result.name && !result.href ? result : {}) || {};
    } catch {
      // keep list metadata
    }
    return { metadata: JSON.stringify(metadata || {}, null, 2) };
  },
  formItems: [
    {
      name: 'metadata',
      label: t('Metadata (JSON)'),
      type: 'textarea',
      rows: 10,
      placeholder: '{}',
      tip: t('Enter valid JSON for the queue metadata.'),
      rules: [jsonRule()],
    },
  ],
  onSubmit: (values, item) => {
    let parsed;
    try {
      parsed = JSON.parse((values.metadata || '').trim() || '{}');
    } catch {
      parsed = {};
    }
    return zaqarApi.setQueueMetadata(item.name, parsed);
  },
});

export const queueRowActions = () => ({
  firstAction: deleteQueueAction(),
  moreActions: [{ action: purgeQueueAction() }, { action: editMetadataAction() }],
});

/** legacy QueueStore: id = name, stats fetched per queue */
export const fetchQueues = async () => {
  const res = await zaqarApi.listQueues();
  const items = (res?.queues || []).map((it) => ({ ...it, id: it.name }));
  return Promise.all(
    items.map(async (item) => {
      try {
        const stats = await zaqarApi.getQueueStats(item.name);
        return { ...item, stats };
      } catch {
        return item;
      }
    })
  );
};

const statCol = (title, key) => ({
  title,
  dataIndex: `messages_${key}`,
  key: `messages_${key}`,
  width: 150,
  sorter: (a, b) => (a.stats?.messages?.[key] ?? 0) - (b.stats?.messages?.[key] ?? 0),
  render: (_, r) => r.stats?.messages?.[key] ?? '-',
});

export default function QueueList() {
  return (
    <ResourcePage
      policy="queues:get_all"
      title={t('Queues')}
      breadcrumb={[t('Messaging'), t('Queues')]}
      description={t('Zaqar message queues: post, claim and subscribe to messages.')}
      rowKey="name"
      fetch={fetchQueues}
      columns={({ isAdmin }) => [
        {
          title: t('Queue Name'),
          dataIndex: 'name',
          key: 'name',
          width: 240,
          sorter: (a, b) => String(a.name).localeCompare(String(b.name)),
          render: (v) =>
            v ? (
              <Link to={`${queueBasePath(isAdmin)}/${encodeURIComponent(v)}`} style={{ fontWeight: 600 }}>
                {v}
              </Link>
            ) : (
              '-'
            ),
        },
        statCol(t('Messages Total'), 'total'),
        statCol(t('Messages Free'), 'free'),
        statCol(t('Messages Claimed'), 'claimed'),
      ]}
      filterParams={[{ name: 'name', label: t('Queue Name') }]}
      primaryActions={[createQueueAction()]}
      batchActions={[deleteQueueAction()]}
      rowActions={queueRowActions()}
    />
  );
}
