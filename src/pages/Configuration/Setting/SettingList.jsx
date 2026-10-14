import React from 'react';
import { Modal, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { skylineApi } from '@/api/skyline';
import ResourcePage, { textColumn } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { JsonBlock } from '@/components/CodeBlock';
import { jsonRule } from '@/components/form/rules';
import JsonEditor from './JsonEditor';

/** Legacy pages/configuration/containers/Setting (skyline settings: flavor_families, gpu_models, usb_models...) */

export const settingDesc = () => ({
  flavor_families: t('Flavor families, used to configure the instance flavor classification'),
  gpu_models: t('GPU model, used when configuring Compute Optimized Type with GPU'),
  usb_models: t('USB model, used when configuring instance flavor'),
});

const modeOptions = () => [
  { key: 'false', value: false, label: t('Immediate effect') },
  { key: 'true', value: true, label: t('Take effect after restart') },
];

export const fetchSettings = async () => {
  const res = await skylineApi.listSettings();
  const desc = settingDesc();
  return (res?.settings || [])
    .filter((it) => !it.hidden)
    .map((it) => ({ ...it, id: it.key, name: it.key, description: desc[it.key] || '-' }));
};

export const viewSettingAction = () => ({
  id: 'view',
  type: 'custom',
  policy: { rules: ['admin', 'reader'], every: false },
  enableSystemReader: true,
  title: t('View Detail'),
  onExecute: (item) =>
    Modal.info({
      title: `${t('View Detail')}: ${item.key}`,
      icon: null,
      width: 760,
      okText: t('OK'),
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>
            <b>{t('Name')}:</b> {item.key}
          </div>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>{t('Value')}</div>
          <JsonBlock value={item.value} />
        </div>
      ),
    }),
});

export const editSettingAction = () => ({
  id: 'edit',
  type: 'modal',
  policy: { rules: ['admin'], every: false },
  title: t('Edit'),
  adminOnly: true,
  width: 760,
  getDefaultValues: (item) => ({ key: item.key, value: JSON.stringify(item.value, null, 2) }),
  formItems: [
    { name: 'key', label: t('Name'), type: 'label' },
    {
      name: 'value',
      label: t('Value'),
      required: true,
      rules: [jsonRule()],
      tip: t('Please enter JSON in the correct format!'),
      // legacy CodeEditor (mode json)
      render: () => <JsonEditor rows={14} />,
    },
  ],
  onSubmit: (values, item) => skylineApi.updateSetting({ key: item.key, value: JSON.parse(values.value) }),
});

export const resetSettingAction = () => ({
  id: 'reset',
  type: 'confirm',
  policy: { rules: ['admin'], every: false },
  title: t('Reset To Initial Value'),
  actionName: t('Reset To Initial Value'),
  isDanger: true,
  adminOnly: true,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await skylineApi.resetSetting(it.key);
    }
  },
});

export default function SettingList() {
  return (
    <ResourcePage
      // legacy Setting get policy(): onlyAdminCanReadPolicy
      policy={{ rules: ['admin', 'reader'], every: false }}
      title={t('System Config')}
      breadcrumb={[t('Global Settings'), t('System Config')]}
      description={t('Console settings stored by the skyline apiserver.')}
      fetch={fetchSettings}
      rowKey="key"
      searchFields={['key', 'description']}
      columns={() => [
        { ...textColumn(t('Parameter'), 'key'), render: (v) => <b>{v}</b> },
        {
          title: (
            <span>
              {t('Effective Mode')}{' '}
              <Tooltip title={t('Effective mode after configuration changes')}>
                <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
              </Tooltip>
            </span>
          ),
          dataIndex: 'restart_service',
          key: 'restart_service',
          render: (v) => modeOptions().find((m) => m.value === v)?.label || '-',
        },
        textColumn(t('Description'), 'description'),
      ]}
      filterParams={[
        { name: 'key', label: t('Parameter') },
        { name: 'restart_service', label: t('Effective Mode'), options: modeOptions().map(({ key, label }) => ({ key, label })) },
        { name: 'description', label: t('Description') },
      ]}
      batchActions={[resetSettingAction()]}
      rowActions={() => ({
        firstAction: viewSettingAction(),
        moreActions: [{ action: editSettingAction() }, { action: resetSettingAction() }],
      })}
    />
  );
}
