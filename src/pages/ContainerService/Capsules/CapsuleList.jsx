import React, { useRef } from 'react';
import { Button, Input, Space } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { zunApi } from '@/api/zun';
import ResourcePage, { nameColumn, statusColumn, timeColumn, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { capsuleStatus, parseYaml } from '../common';

const toOptions = (map) => Object.entries(map).map(([key, label]) => ({ key, label }));

/** Legacy FormItem "textarea-from-file": textarea + load from a local file */
function TextareaFromFile({ value, onChange, accept = '.yaml,.yml,.json', rows = 10 }) {
  const ref = useRef(null);
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Button icon={<UploadOutlined />} onClick={() => ref.current?.click()}>
        {t('Load Template from a file')}
      </Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onChange?.(String(reader.result || ''));
          reader.readAsText(file);
          e.target.value = '';
        }}
      />
      <Input.TextArea
        rows={rows}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
      />
    </Space>
  );
}

export const createCapsuleAction = () => ({
  id: 'create-capsules',
  type: 'modal',
  title: t('Create Capsule'),
  buttonText: t('Create Capsule'),
  width: 760,
  formItems: [
    {
      name: 'template_file',
      label: t('Load Template from a file'),
      rules: [
        {
          validator: (_, value) => {
            if (!value) return Promise.reject(new Error(t('Please input or load Template from a file')));
            try {
              parseYaml(value);
              return Promise.resolve();
            } catch (err) {
              return Promise.reject(err);
            }
          },
        },
      ],
      tip: t('YAML or JSON capsule template (kind: capsule, metadata, spec).'),
      render: () => <TextareaFromFile />,
    },
  ],
  onSubmit: (values) => zunApi.createCapsule({ template: parseYaml(values.template_file) }),
});

export const deleteCapsuleAction = () =>
  deleteAction({
    name: t('Capsule'),
    title: t('Delete Capsule'),
    onDelete: (it) => zunApi.deleteCapsule(it.uuid || it.id),
  });

export const capsuleRowActions = () => ({ firstAction: deleteCapsuleAction(), moreActions: [] });

export const mapCapsule = (it) => ({ ...it, id: it.uuid, name: it.meta_name || it.name });

export default function CapsuleList() {
  return (
    <ResourcePage
      title={t('Capsules')}
      breadcrumb={[t('Container Service'), t('Capsules')]}
      description={t('Capsules group several Zun containers that share network and storage, like a Kubernetes pod.')}
      rowKey="uuid"
      fetch={async () => {
        const res = await zunApi.listCapsules();
        return (res?.capsules || []).map(mapCapsule);
      }}
      columns={[
        nameColumn({ idIndex: 'uuid', linkTo: (r) => `/container-service/capsules/detail/${r.uuid}` }),
        statusColumn({ textMap: capsuleStatus() }),
        { title: t('CPU'), dataIndex: 'cpu', key: 'cpu', render: (v) => v ?? '-' },
        { title: t('Memory'), dataIndex: 'memory', key: 'memory', render: (v) => v ?? '-' },
        timeColumn(),
      ]}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'status', label: t('Status'), options: toOptions(capsuleStatus()) },
      ]}
      primaryActions={[createCapsuleAction()]}
      batchActions={[deleteCapsuleAction()]}
      rowActions={capsuleRowActions()}
    />
  );
}
