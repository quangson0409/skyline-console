import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Breadcrumb, Button, Card, Form, Input, Modal, Select, Space, Steps, Switch, message } from 'antd';
import { masakariApi } from '@/api/masakari';
import { getErrorMessage } from '@/hooks/useResource';
import { formatTime } from '@/components/ResourcePage';
import { useTranslation } from '@/core/i18n';
import { SearchSelectTable as SelectTable } from '@/components/SelectTable';
import { recoveryMethodOptions, fetchAvailableComputeHosts } from './SegmentList';

const LIST_URL = '/ha/segments-admin';

/**
 * Legacy pages/ha/containers/Segments/actions/StepCreate (StepSegment + StepHost).
 * Step 1 creates the segment immediately (legacy behaviour); step 2 registers the selected
 * compute hosts in it. Going back / cancelling from step 2 deletes the created segment.
 */
export default function SegmentCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [segmentId, setSegmentId] = useState(null);
  const [segmentValues, setSegmentValues] = useState({ recovery_method: 'auto', service_type: 'compute' });
  const [hosts, setHosts] = useState([]);
  const [hostLoading, setHostLoading] = useState(true);
  const [hostMap, setHostMap] = useState({});
  const [selection, setSelection] = useState({ selectedRowKeys: [], selectedRows: [] });

  useEffect(() => {
    let alive = true;
    fetchAvailableComputeHosts()
      .then((list) => {
        if (!alive) return;
        setHosts(list);
        setHostMap(
          Object.fromEntries(
            list.map((h) => [h.host, { reserved: false, type: '', control_attributes: '', on_maintenance: false }])
          )
        );
      })
      .catch(() => alive && setHosts([]))
      .finally(() => alive && setHostLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const setHostField = (id, key, value) =>
    setHostMap((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));

  const steps = [{ title: t('Create Segment') }, { title: t('Add Host') }];

  const next = async () => {
    const values = await form.validateFields();
    setSegmentValues(values);
    setLoading(true);
    try {
      const res = await masakariApi.createSegment({
        segment: {
          name: values.segment_name,
          recovery_method: values.recovery_method,
          service_type: values.service_type,
          description: values.description,
        },
      });
      setSegmentId(res?.segment?.uuid);
      setCurrent(1);
    } catch (err) {
      message.error(getErrorMessage(err, t('Operation failed')));
    } finally {
      setLoading(false);
    }
  };

  const prev = async () => {
    if (segmentId) {
      try {
        await masakariApi.deleteSegment(segmentId);
      } catch {
        // ignore: the segment may already be gone
      }
    }
    setSegmentId(null);
    setCurrent(0);
    setTimeout(() => form.setFieldsValue(segmentValues), 0);
  };

  const cancel = () => {
    if (current === 0) {
      navigate(LIST_URL);
      return;
    }
    Modal.confirm({
      title: t('Confirm'),
      content: t('Segment will be deleted. Are you sure want to cancel this created segment?'),
      okText: t('OK'),
      cancelText: t('Cancel'),
      onOk: () => masakariApi.deleteSegment(segmentId).catch(() => {}).finally(() => navigate(LIST_URL)),
    });
  };

  const submit = async () => {
    const rows = selection.selectedRows || [];
    if (!rows.length) {
      message.warning(`${t('Please select')} ${t('Host Name')}`);
      return;
    }
    const missing = rows.find((r) => !hostMap[r.host]?.type || !hostMap[r.host]?.control_attributes);
    if (missing) {
      message.warning(`${t('Please enter/select')} ${t('Type')} / ${t('Control Attributes')}: ${missing.host}`);
      return;
    }
    setLoading(true);
    try {
      await Promise.all(
        rows.map((r) => {
          const extra = hostMap[r.host] || {};
          return masakariApi.createHost(segmentId, {
            host: {
              name: r.host,
              reserved: !!extra.reserved,
              type: extra.type,
              control_attributes: extra.control_attributes,
              on_maintenance: !!extra.on_maintenance,
            },
          });
        })
      );
      message.success(t('Operation completed successfully'));
      navigate(LIST_URL);
    } catch (err) {
      message.error(getErrorMessage(err, t('Operation failed')));
    } finally {
      setLoading(false);
    }
  };

  const hostColumns = useMemo(
    () => [
      { title: t('Name'), dataIndex: 'host', key: 'host' },
      { title: t('Zone'), dataIndex: 'zone', key: 'zone', render: (v) => v || '-' },
      { title: t('Updated'), dataIndex: 'updated_at', key: 'updated_at', render: (v) => formatTime(v) },
      {
        title: t('Reserved'),
        key: 'reserved',
        render: (_, r) => (
          <Switch
            size="small"
            checked={!!hostMap[r.host]?.reserved}
            onClick={(_v, e) => e?.stopPropagation?.()}
            onChange={(v) => setHostField(r.host, 'reserved', v)}
          />
        ),
      },
      {
        title: t('Type'),
        key: 'type',
        render: (_, r) => (
          <Input
            size="small"
            value={hostMap[r.host]?.type}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setHostField(r.host, 'type', e.target.value)}
          />
        ),
      },
      {
        title: t('Control Attributes'),
        key: 'control_attributes',
        render: (_, r) => (
          <Input
            size="small"
            value={hostMap[r.host]?.control_attributes}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setHostField(r.host, 'control_attributes', e.target.value)}
          />
        ),
      },
      {
        title: t('On Maintenance'),
        key: 'on_maintenance',
        render: (_, r) => (
          <Switch
            size="small"
            checked={!!hostMap[r.host]?.on_maintenance}
            onChange={(v) => setHostField(r.host, 'on_maintenance', v)}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hostMap, t]
  );

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        style={{ marginBottom: 16, fontSize: 13 }}
        items={[
          { title: t('Instance-HA') },
          { title: <Link to={LIST_URL}>{t('Segments')}</Link> },
          { title: t('Create Segment') },
        ]}
      />
      <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>
        {t('Create Segment')}
      </h1>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Steps current={current} items={steps} style={{ maxWidth: 640, marginBottom: 24 }} />
        {current === 0 ? (
          <Form form={form} layout="vertical" initialValues={segmentValues} style={{ maxWidth: 640 }}>
            <Form.Item name="segment_name" label={t('Segment Name')} rules={[{ required: true, message: `${t('Please enter/select')} ${t('Segment Name')}!` }]}>
              <Input />
            </Form.Item>
            <Form.Item name="recovery_method" label={t('Recovery Method')} rules={[{ required: true }]}>
              <Select options={recoveryMethodOptions()} />
            </Form.Item>
            <Form.Item name="service_type" label={t('Service Type')} rules={[{ required: true }]}>
              <Input disabled />
            </Form.Item>
            <Form.Item name="description" label={t('Description')}>
              <Input.TextArea rows={4} />
            </Form.Item>
          </Form>
        ) : (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              <span style={{ color: '#ef4444' }}>* </span>
              {t('Host Name')}
            </div>
            <SelectTable
              data={hosts}
              columns={hostColumns}
              loading={hostLoading}
              value={selection}
              onChange={setSelection}
              searchFields={['host', 'zone']}
              rowKey="host"
            />
          </div>
        )}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={cancel}>{t('Cancel')}</Button>
          <Space>
            {current > 0 ? <Button onClick={prev}>{`${t('Previous')}: ${steps[0].title}`}</Button> : null}
            {current === 0 ? (
              <Button type="primary" loading={loading} onClick={next}>
                {`${t('Next')}: ${steps[1].title}`}
              </Button>
            ) : (
              <Button type="primary" loading={loading} onClick={submit}>
                {t('Confirm')}
              </Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  );
}
