import React, { useState } from 'react';
import { create } from 'zustand';
import {
  Alert,
  Button,
  Divider,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { zaqarApi } from '@/api/zaqar';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { queueBasePath, deleteQueueAction, purgeQueueAction, editMetadataAction } from './QueueList';

const { Text } = Typography;

const show = (v) => (v !== undefined && v !== null ? v : '-');

const bodyText = (body) => {
  if (body === null || body === undefined) return '-';
  return typeof body === 'object' ? JSON.stringify(body) : String(body);
};

const BodyCell = ({ value }) => {
  const display = bodyText(value);
  return (
    <Text ellipsis={{ tooltip: display }} style={{ maxWidth: 300 }}>
      {display}
    </Text>
  );
};

const MonoCell = ({ value }) => (
  <Text ellipsis={{ tooltip: value }} style={{ fontFamily: 'monospace', maxWidth: 220 }}>
    {value || '-'}
  </Text>
);

const messageId = (item = {}) => (item.href ? String(item.href).split('?')[0].split('/messages/')[1] || item.id : item.id);

/* ------------------------------------------------------------------ Messages tab (legacy Detail/Message) */
const postMessageAction = (queueName) => ({
  id: 'post-message',
  type: 'modal',
  policy: 'messages:create',
  title: t('Post Message'),
  formItems: [
    {
      name: 'body',
      label: t('Message Body'),
      type: 'textarea',
      required: true,
      rows: 4,
      placeholder: t('Enter message body (text or JSON)'),
    },
    {
      name: 'ttl',
      label: t('TTL (seconds)'),
      type: 'number',
      min: 60,
      max: 1209600,
      placeholder: t('Default: 3600'),
      tip: t('Time-to-live in seconds (60 – 1,209,600). Default is 3600.'),
    },
  ],
  onSubmit: ({ body, ttl }) => zaqarApi.postMessages(queueName, [{ body, ttl: ttl || 3600 }]),
});

const deleteMessageAction = (queueName) => ({
  id: 'delete-message',
  type: 'confirm',
  policy: 'messages:delete',
  title: t('Delete Message'),
  buttonText: t('Delete'),
  actionName: t('Delete Message'),
  isDanger: true,
  confirmText: (items = []) =>
    items.length > 1
      ? t('Are you sure to delete the selected messages?')
      : t('Are you sure to delete message {name}?', { name: items[0]?.id || '' }),
  onSubmit: async (target) => {
    for (const it of [].concat(target)) {
      // a claimed message can only be deleted together with its claim id
      // eslint-disable-next-line no-await-in-loop
      await zaqarApi.deleteMessage(queueName, it.id, it.claim_id ? { claim_id: it.claim_id } : undefined);
    }
  },
});

function MessagesTab({ queueName }) {
  const del = deleteMessageAction(queueName);
  return (
    <ResourcePage
      embedded
      fetch={async () => {
        const res = await zaqarApi.listMessages(queueName, { echo: true, include_claimed: true });
        return (res?.messages || []).map((it) => ({ ...it, id: messageId(it) }));
      }}
      deps={[queueName]}
      columns={[
        { title: t('Message ID'), dataIndex: 'id', key: 'id', width: 220, render: (v) => <MonoCell value={v} /> },
        { title: t('Body'), dataIndex: 'body', key: 'body', width: 300, render: (v) => <BodyCell value={v} /> },
        { title: t('TTL (s)'), dataIndex: 'ttl', key: 'ttl', width: 100, render: show },
        { title: t('Age (s)'), dataIndex: 'age', key: 'age', width: 100, render: show },
        {
          title: t('Status'),
          dataIndex: 'claim_id',
          key: 'claim_id',
          width: 120,
          render: (claimId) =>
            claimId ? (
              <Tag color="orange" title={claimId}>
                {t('Claimed')}
              </Tag>
            ) : (
              <Tag color="green">{t('Free')}</Tag>
            ),
        },
      ]}
      primaryActions={[postMessageAction(queueName)]}
      batchActions={[del]}
      rowActions={{ firstAction: del, moreActions: [] }}
    />
  );
}

/* ------------------------------------------------------------------ Claims tab (legacy Detail/Claim) */
/** legacy stores/zaqar/claim: claim state survives tab switches, reset when another queue is opened */
const useClaimStore = create((set) => ({
  claimedMessages: [],
  lastClaimId: null,
  lastClaimQueue: null,
  setClaim: (queue, claimId, messages) => set({ lastClaimQueue: queue, lastClaimId: claimId, claimedMessages: messages }),
  clearClaimed: () => set({ claimedMessages: [], lastClaimId: null, lastClaimQueue: null }),
}));

export const createClaim = async (queueName, ttl = 300, grace = 60, limit = 1) => {
  const response = await zaqarApi.createClaim({ queueName, ttl, grace, limit });
  if (response?.status >= 400) {
    const msg = response?.data?.description || response?.data?.title || `HTTP ${response.status}`;
    throw new Error(msg);
  }
  const data = response?.data;
  let messages = [];
  if (Array.isArray(data)) messages = data;
  else if (data && Array.isArray(data.messages)) messages = data.messages;
  const location = response?.headers?.location || response?.headers?.Location;
  let claimId = null;
  if (location) {
    const parts = String(location).split('/claims/');
    claimId = parts.length > 1 ? parts[1].split('/')[0].split('?')[0] : null;
  }
  if (!claimId && messages.length > 0) {
    claimId = messages[0].claim_id || (messages[0].href ? String(messages[0].href).split('claim_id=')[1] : null) || null;
  }
  const list = messages.map((item) => ({ ...item, id: messageId(item) }));
  return { messages: list, claimId };
};

function ClaimsTab({ queueName }) {
  const { claimedMessages, lastClaimId, lastClaimQueue, setClaim, clearClaimed } = useClaimStore();
  const isCurrent = lastClaimQueue === queueName;
  const messages = isCurrent ? claimedMessages : [];
  const claimId = isCurrent ? lastClaimId : null;
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState(null);
  const [form] = Form.useForm();

  const submit = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const ttl = form.getFieldValue('ttl') || 300;
    const grace = form.getFieldValue('grace') || 60;
    const limit = form.getFieldValue('limit') || 1;
    setCreating(true);
    setError(null);
    try {
      const res = await createClaim(queueName, ttl, grace, limit);
      setClaim(queueName, res.claimId, res.messages);
      setOpen(false);
      form.resetFields();
    } catch (e) {
      setError(e?.message || t('Failed to create claim'));
    } finally {
      setCreating(false);
    }
  };

  const release = async () => {
    if (!claimId) return;
    setReleasing(true);
    setError(null);
    try {
      await zaqarApi.releaseClaim(queueName, claimId);
      clearClaimed();
    } catch (e) {
      setError(e?.message || t('Failed to release claim'));
    } finally {
      setReleasing(false);
    }
  };

  const columns = [
    { title: t('Message ID'), dataIndex: 'id', key: 'id', width: 220, render: (v) => <MonoCell value={v} /> },
    { title: t('Body'), dataIndex: 'body', key: 'body', width: 280, render: (v) => <BodyCell value={v} /> },
    { title: t('TTL (s)'), dataIndex: 'ttl', key: 'ttl', width: 90, render: show },
    { title: t('Age (s)'), dataIndex: 'age', key: 'age', width: 90, render: show },
    { title: t('Claim ID'), dataIndex: 'claim_id', key: 'claim_id', width: 220, render: (v) => <MonoCell value={v || claimId} /> },
  ];

  return (
    <div style={{ padding: '8px 0' }}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" onClick={() => { setError(null); setOpen(true); }}>
          {t('Create Claim')}
        </Button>
        {claimId ? (
          <Popconfirm
            title={t('This will release the claim and make messages available again. Continue?')}
            onConfirm={release}
            okText={t('Release')}
            cancelText={t('Cancel')}
            okButtonProps={{ danger: true }}
          >
            <Button danger loading={releasing}>
              {t('Release Claim')}
            </Button>
          </Popconfirm>
        ) : null}
        {messages.length > 0 ? (
          <Button onClick={() => { setError(null); clearClaimed(); }}>{t('Clear Results')}</Button>
        ) : null}
      </Space>
      {error ? (
        <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16 }} />
      ) : null}
      {claimId ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              {t('Claim created successfully. Claim ID:')}{' '}
              <Text code copyable style={{ fontFamily: 'monospace' }}>
                {claimId}
              </Text>
            </span>
          }
        />
      ) : null}
      {messages.length > 0 ? (
        <>
          <Divider orientation="left">
            <Tag color="orange">{`${t('Claimed Messages')} (${messages.length})`}</Tag>
          </Divider>
          <Table rowKey="id" dataSource={messages} columns={columns} pagination={false} size="small" scroll={{ x: 'max-content' }} />
        </>
      ) : !claimId ? (
        <Alert
          type="info"
          showIcon
          message={t(
            'Click "Create Claim" to claim messages from this queue. Claimed messages are temporarily locked for exclusive processing.'
          )}
        />
      ) : null}
      <Modal
        title={t('Create Claim')}
        open={open}
        onOk={submit}
        confirmLoading={creating}
        onCancel={() => { setOpen(false); form.resetFields(); }}
        okText={t('Create')}
        cancelText={t('Cancel')}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false} initialValues={{ ttl: 300, grace: 60, limit: 1 }}>
          <Form.Item name="ttl" label={t('TTL (seconds)')} extra={t('How long (in seconds) the claim will be valid.')}>
            <InputNumber min={60} max={43200} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="grace" label={t('Grace (seconds)')} extra={t('Extra seconds to allow consumers to ack after a claim expires.')}>
            <InputNumber min={60} max={43200} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="limit" label={t('Limit')} extra={t('Maximum number of messages to claim (1–20).')}>
            <InputNumber min={1} max={20} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ Subscriptions tab (legacy Detail/Subscription) */
const createSubscriptionAction = (queueName) => ({
  id: 'create-subscription',
  type: 'modal',
  policy: 'subscription:create',
  title: t('Create Subscription'),
  formItems: [
    {
      name: 'subscriber',
      label: t('Subscriber URL'),
      type: 'input',
      required: true,
      placeholder: t('e.g. http://example.com/webhook'),
      tip: t('The URL endpoint that will receive event notifications for this queue.'),
    },
    {
      name: 'ttl',
      label: t('TTL (seconds)'),
      type: 'number',
      min: 60,
      placeholder: t('Default: 3600'),
      tip: t('Time-to-live for the subscription in seconds.'),
    },
  ],
  onSubmit: ({ subscriber, ttl }) => zaqarApi.createSubscription(queueName, { subscriber, ttl: ttl || 3600 }),
});

const updateSubscriptionAction = (queueName) => ({
  id: 'update-subscription',
  type: 'modal',
  policy: 'subscription:update',
  title: t('Update Subscription'),
  buttonText: t('Update'),
  getDefaultValues: (item) => ({ id: item.id, ttl: item.ttl || 3600 }),
  formItems: [
    { name: 'id', label: t('Subscription ID'), type: 'label' },
    {
      name: 'ttl',
      label: t('TTL (seconds)'),
      type: 'number',
      required: true,
      min: 60,
      max: 1209600,
      tip: t('Time-to-live in seconds for the subscription.'),
    },
  ],
  onSubmit: ({ ttl }, item) => zaqarApi.updateSubscription(queueName, item.id, { ttl }),
});

const deleteSubscriptionAction = (queueName) => ({
  id: 'delete-subscription',
  type: 'confirm',
  policy: 'subscription:delete',
  title: t('Delete Subscription'),
  buttonText: t('Delete'),
  actionName: t('Delete subscription'),
  isDanger: true,
  confirmText: (items = []) =>
    t('Are you sure to {action} "{name}"?', {
      action: t('Delete subscription'),
      name: items.map((it) => it.subscriber || it.id).join(', '),
    }),
  onSubmit: async (target) => {
    for (const it of [].concat(target)) {
      // eslint-disable-next-line no-await-in-loop
      await zaqarApi.deleteSubscription(queueName, it.id);
    }
  },
});

function SubscriptionsTab({ queueName }) {
  return (
    <ResourcePage
      embedded
      fetch={async () => (await zaqarApi.listSubscriptions(queueName))?.subscriptions || []}
      deps={[queueName]}
      columns={[
        { title: t('Subscription ID'), dataIndex: 'id', key: 'id', width: 280, render: show },
        { title: t('Subscriber URL'), dataIndex: 'subscriber', key: 'subscriber', width: 300, render: show },
        { title: t('TTL (s)'), dataIndex: 'ttl', key: 'ttl', width: 100, render: show },
        { title: t('Age (s)'), dataIndex: 'age', key: 'age', width: 100, render: show },
      ]}
      filterParams={[{ name: 'subscriber', label: t('Subscriber URL') }]}
      primaryActions={[createSubscriptionAction(queueName)]}
      rowActions={{
        firstAction: updateSubscriptionAction(queueName),
        moreActions: [{ action: deleteSubscriptionAction(queueName) }],
      }}
    />
  );
}

/* ------------------------------------------------------------------ page */
const fetchQueue = async (name) => {
  const [metaRes, stats] = await Promise.all([
    zaqarApi.getQueueMetadata(name).catch(() => ({})),
    zaqarApi.getQueueStats(name).catch(() => null),
  ]);
  const result = metaRes || {};
  const metadata = result.metadata || result.queue?.metadata || (!result.name && !result.href ? result : {}) || {};
  return { id: name, name, metadata, stats: stats || {} };
};

export default function QueueDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Messaging'), { title: t('Queues'), path: '/messaging/queues' }]}
      backPath={({ isAdmin }) => queueBasePath(isAdmin)}
      fetch={fetchQueue}
      info={(d) => {
        const m = d.stats?.messages || {};
        return [
          { label: t('Queue Name'), value: d.name, copyable: true },
          { label: t('Messages Total'), value: show(m.total) },
          { label: t('Messages Free'), value: show(m.free) },
          { label: t('Messages Claimed'), value: show(m.claimed) },
          { label: t('Oldest Message'), value: m.oldest ? formatTime(m.oldest.created) : '-' },
          { label: t('Newest Message'), value: m.newest ? formatTime(m.newest.created) : '-' },
          {
            label: t('Metadata'),
            value: Object.keys(d.metadata || {}).length ? JSON.stringify(d.metadata) : '',
          },
        ];
      }}
      tabs={(d) => [
        { key: 'messages', label: t('Messages'), render: () => <MessagesTab queueName={d.name} /> },
        { key: 'claims', label: t('Claims'), render: () => <ClaimsTab queueName={d.name} /> },
        { key: 'subscriptions', label: t('Subscriptions'), render: () => <SubscriptionsTab queueName={d.name} /> },
      ]}
      actions={{
        firstAction: purgeQueueAction(),
        moreActions: [{ action: editMetadataAction() }, { action: deleteQueueAction() }],
      }}
    />
  );
}
