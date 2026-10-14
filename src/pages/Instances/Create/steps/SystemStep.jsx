import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, Input, theme } from 'antd';
import { DownOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons';
import { novaApi } from '@/api/nova';
import { currentProjectId } from '@/api/endpoints';
import useActionRunner from '@/components/Action/useActionRunner';
import { t } from '@/core/i18n';
import { createKeypairAction, mapKeypair } from '@/pages/Compute/Keypairs/KeypairList';
import { fetchHypervisors, cpuRender, memoryRender } from '@/pages/Compute/Hypervisors/HypervisorList';
import { policyType } from '@/pages/Compute/ServerGroups/ServerGroupList';
import TextareaFromFile from '@/components/form/TextareaFromFile';
import SelectTable, { col, mapCol } from '@/components/SelectTable';
import { WrappedRadio, FormDivider, selectTableRule, narrowWrapper, tableWrapper, textWrapper } from '@/components/form/fields';
import { asciiValidator, instanceNameValidator, instancePasswordRule, isWindowsImage, physicalNodeTypes } from '../utils';


/** Legacy SystemStep.sourceInfo: image / volume image metadata / snapshot of the start source */
export const getSourceInfo = (context = {}) => {
  const { source = {}, image = {}, bootableVolume = {}, instanceSnapshot = {} } = context;
  if (source?.value === 'image') return image?.selectedRows?.[0] || false;
  if (source?.value === 'bootableVolume') {
    const row = bootableVolume?.selectedRows?.[0];
    return row?.origin_data?.volume_image_metadata || row?.volume_image_metadata || false;
  }
  if (source?.value === 'instanceSnapshot') return instanceSnapshot?.selectedRows?.[0] || false;
  return false;
};

export const getLoginTypes = (isWindows) => [
  { label: t('Keypair'), value: 'keypair', disabled: !!isWindows },
  { label: t('Password'), value: 'password' },
];

/** Legacy SystemStep.defaultValue */
export const getSystemDefaults = ({ context = {}, presets = {}, ironic = false }) => {
  const sourceInfo = ironic ? context.image?.selectedRows?.[0] : getSourceInfo(context);
  const windows = !ironic && isWindowsImage(context);
  const loginTypes = getLoginTypes(windows);
  const data = {
    loginType: context.loginType || (windows ? loginTypes[1] : loginTypes[0]),
    more: false,
    username: (sourceInfo && sourceInfo.os_admin_user) || context.username || '',
  };
  if (!ironic) {
    data.physicalNodeType = physicalNodeTypes()[0];
    data.userData = '';
  }
  if (!ironic && presets.servergroup) {
    data.serverGroup = { selectedRowKeys: [presets.servergroup], selectedRows: [] };
  }
  return data;
};

/** Legacy getKeyPairHeader: text + "Create Keypair" shortcut */
function KeypairHeader({ onCreate }) {
  const { token } = theme.useToken();
  return (
    <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ color: token.colorTextSecondary }}>
        {t(
          'The key pair allows you to SSH into your newly created instance. You can select an existing key pair, import a key pair, or generate a new key pair.'
        )}
      </span>
      <Button size="small" icon={<PlusOutlined />} onClick={onCreate} id="instance-create-keypair-btn">
        {t('Create Keypair')}
      </Button>
    </div>
  );
}

/**
 * Port of legacy StepCreate/SystemStep (and CreateIronic/SystemStep with `ironic`).
 */
export default function SystemStep({ form, context, updateContext, presets = {}, hasAdminRole, ironic = false }) {
  const { token } = theme.useToken();
  const [keypairs, setKeypairs] = useState([]);
  const [keypairsLoading, setKeypairsLoading] = useState(false);
  const [hypervisors, setHypervisors] = useState([]);
  const [hypervisorsLoading, setHypervisorsLoading] = useState(false);
  const [serverGroups, setServerGroups] = useState([]);
  const [serverGroupsLoading, setServerGroupsLoading] = useState(false);
  const createdName = useRef(null);

  const loginType = Form.useWatch('loginType', form);
  const more = Form.useWatch('more', form);
  const physicalNodeType = Form.useWatch('physicalNodeType', form);

  const sourceInfo = ironic ? context.image?.selectedRows?.[0] : getSourceInfo(context);
  const windows = !ironic && isWindowsImage(context);
  const loginTypes = getLoginTypes(windows);
  const loginUserName = sourceInfo && sourceInfo.os_admin_user;
  const isPassword = loginType?.value === 'password';
  const isManually = physicalNodeType?.value === 'manually';
  const serverGroupRequired = !!presets.servergroup && !!more;

  const loadKeypairs = async () => {
    setKeypairsLoading(true);
    try {
      const res = await novaApi.listKeypairsV().catch(() => ({}));
      const list = (res?.keypairs || []).map(mapKeypair).map((it) => ({ ...it, key: it.name, id: it.name }));
      setKeypairs(list);
      return list;
    } finally {
      setKeypairsLoading(false);
    }
  };

  const loadServerGroups = async () => {
    setServerGroupsLoading(true);
    try {
      const res = await novaApi.listServerGroupsV().catch(() => ({}));
      const list = (res?.server_groups || []).filter((it) => (presets.servergroup ? it.id === presets.servergroup : true));
      setServerGroups(list);
      if (presets.servergroup) {
        const rows = list.filter((it) => it.id === presets.servergroup);
        const v = { selectedRowKeys: [presets.servergroup], selectedRows: rows };
        if (!form.getFieldValue('serverGroup')?.selectedRows?.length) form.setFieldValue('serverGroup', v);
        updateContext({ serverGroupRow: rows[0] || null, serverGroup: form.getFieldValue('serverGroup') });
      }
    } finally {
      setServerGroupsLoading(false);
    }
  };

  const loadHypervisors = async () => {
    setHypervisorsLoading(true);
    try {
      const list = await fetchHypervisors().catch(() => []);
      setHypervisors(list.map((it) => ({ ...it, key: it.id, name: it.hypervisor_hostname })));
    } finally {
      setHypervisorsLoading(false);
    }
  };

  useEffect(() => {
    loadKeypairs();
    if (!ironic) {
      if (hasAdminRole) loadHypervisors();
      loadServerGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // login name follows the image property (legacy defaultValue / disabled when known)
  useEffect(() => {
    if (loginUserName && form.getFieldValue('username') !== loginUserName) form.setFieldValue('username', loginUserName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginUserName]);

  const { handleAction, actionModal } = useActionRunner({
    onRefresh: async () => {
      const list = await loadKeypairs();
      const newItem = list.find((it) => it.name === createdName.current);
      if (newItem) {
        const v = { selectedRowKeys: [newItem.id], selectedRows: [newItem] };
        form.setFieldValue('keypair', v);
        form.validateFields(['keypair']).catch(() => {});
      }
    },
  });

  const keypairAction = useMemo(() => {
    const base = createKeypairAction({ projectId: currentProjectId(), used: keypairs.length });
    return {
      ...base,
      onSubmit: async (values) => {
        const res = await base.onSubmit(values);
        createdName.current = values.name;
        return res;
      },
    };
  }, [keypairs.length]);

  const hypervisorColumns = [
    col(t('Hostname'), 'hypervisor_hostname'),
    col(t('Type'), 'hypervisor_type'),
    col(t('CPU (Core)'), 'vcpus_used_percent', { render: cpuRender, width: 180 }),
    col(t('Configured Memory (GiB)'), 'memory_mb_percent', { render: memoryRender, width: 180 }),
    col(t('Instances'), 'running_vms'),
  ];

  const policyMap = policyType();

  return (
    <>
      <Form.Item
        name="name"
        label={t('Name')}
        required
        wrapperCol={narrowWrapper}
        rules={[{ required: true, message: t('Please input {label}!', { label: t('Name') }) }, { validator: instanceNameValidator }]}
        extra={
          <span style={{ fontSize: 12 }}>
            {t(
              'The name should start with upper letter, lower letter or chinese, and be a string of 1 to 128, characters can only contain "0-9, a-z, A-Z, "-\'_.".'
            )}
          </span>
        }
      >
        <Input placeholder={t('Please input name')} id="instance-create-name" />
      </Form.Item>
      <Form.Item name="loginType" label={t('Login Type')}>
        <WrappedRadio options={loginTypes} id="instance-create-login-type" />
      </Form.Item>
      {isPassword ? (
        <Form.Item
          name="username"
          label={t('Login Name')}
          required
          wrapperCol={narrowWrapper}
          rules={[{ required: true, message: t('Please input {label}!', { label: t('Login Name') }) }]}
          tooltip={t(
            'Whether the Login Name can be used is up to the feasible configuration of cloud-init or cloudbase-init service in the image.'
          )}
          extra={
            loginUserName
              ? undefined
              : t(
                  "The feasible configuration of cloud-init or cloudbase-init service in the image is not synced to image's properties, so the Login Name is unknown."
                )
          }
        >
          <Input disabled={!!loginUserName} id="instance-create-username" />
        </Form.Item>
      ) : null}
      {!isPassword ? (
        <Form.Item
          name="keypair"
          label={t('Keypair')}
          required
          rules={[selectTableRule(t('Keypair'))]}
          wrapperCol={tableWrapper}
          tooltip={t(
            'The SSH key is a way to remotely log in to the instance. The cloud platform only helps to keep the public key. Please keep your private key properly.'
          )}
        >
          <SelectTable
            id="instance-create-keypair"
            data={keypairs}
            isLoading={keypairsLoading}
            rowKey="id"
            columns={[col(t('Name'), 'name'), col(t('Fingerprint'), 'fingerprint')]}
            filterParams={[{ label: t('Name'), name: 'name' }]}
            selectedLabel={t('Keypair')}
            onRefresh={loadKeypairs}
            header={ironic ? null : <KeypairHeader onCreate={() => handleAction(keypairAction)} />}
          />
        </Form.Item>
      ) : null}
      {isPassword ? (
        <>
          <Form.Item
            name="password"
            label={ironic ? t('Password') : t('Login Password')}
            required
            wrapperCol={narrowWrapper}
            dependencies={['confirmPassword']}
            rules={[{ required: true, message: t('Please input {label}!', { label: t('Password') }) }, instancePasswordRule('password')]}
          >
            <Input.Password autoComplete="new-password" id="instance-create-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t('Confirm Password')}
            required
            wrapperCol={narrowWrapper}
            dependencies={['password']}
            rules={[
              { required: true, message: t('Please input {label}!', { label: t('Confirm Password') }) },
              instancePasswordRule('confirmPassword'),
            ]}
          >
            <Input.Password autoComplete="new-password" id="instance-create-confirm-password" />
          </Form.Item>
        </>
      ) : null}
      {!ironic ? (
        <>
          <FormDivider />
          <Form.Item name="more" label={t('Advanced Options')}>
            <MoreToggle />
          </Form.Item>
          {more && hasAdminRole ? (
            <Form.Item
              name="physicalNodeType"
              label={t('Physical Node')}
              tooltip={t(
                'Smart Scheduling automatically selects the most suitable physical node based on available resources. Manual mode lets you explicitly choose the physical node for placement.'
              )}
            >
              <WrappedRadio options={physicalNodeTypes()} id="instance-create-physical-node-type" />
            </Form.Item>
          ) : null}
          {hasAdminRole && more && isManually ? (
            <Form.Item
              name="physicalNode"
              label={t('Specify Physical Node')}
              required
              rules={[selectTableRule(t('Specify Physical Node'))]}
              extra={t('You can manually specify a physical node to create an instance.')}
              wrapperCol={tableWrapper}
            >
              <SelectTable
                id="instance-create-physical-node"
                data={hypervisors}
                isLoading={hypervisorsLoading}
                columns={hypervisorColumns}
                filterParams={[
                  { label: t('Hostname'), name: 'hypervisor_hostname' },
                  { label: t('Type'), name: 'hypervisor_type' },
                ]}
                onRefresh={loadHypervisors}
              />
            </Form.Item>
          ) : null}
          {more ? (
            <Form.Item
              name="serverGroup"
              label={t('Server Group')}
              required={serverGroupRequired}
              rules={[selectTableRule(t('Server Group'), serverGroupRequired)]}
              extra={t(
                'Using server groups, you can create cloud hosts on the same/different physical nodes as much as possible to meet the affinity/non-affinity requirements of business applications.'
              )}
              wrapperCol={tableWrapper}
            >
              <SelectTable
                id="instance-create-server-group"
                data={serverGroups}
                isLoading={serverGroupsLoading}
                columns={[
                  col(t('Name'), 'name'),
                  col(t('Member Count'), 'members', { render: (value) => (value || []).length }),
                  mapCol(t('Policy'), 'policy', policyMap),
                ]}
                filterParams={[
                  { label: t('Name'), name: 'name' },
                  { label: t('Policy'), name: 'policy', options: Object.entries(policyMap).map(([key, label]) => ({ key, label })) },
                ]}
                onChange={(v) => updateContext({ serverGroupRow: v?.selectedRows?.[0] || null })}
                onRefresh={loadServerGroups}
              />
            </Form.Item>
          ) : null}
          {more ? (
            <Form.Item
              name="userData"
              label={t('User Data')}
              rules={[{ validator: asciiValidator }]}
              extra={t('The user needs to ensure that the input is a shell script that can run completely and normally.')}
              wrapperCol={textWrapper}
            >
              <TextareaFromFile rows={8} />
            </Form.Item>
          ) : null}
        </>
      ) : null}
      {actionModal}
      <style>{`.instance-create-wizard .ant-form-item-extra { color: ${token.colorTextTertiary}; }`}</style>
    </>
  );
}

/** Legacy FormItem/More: "Advanced Options" expand toggle */
function MoreToggle({ value, onChange }) {
  return (
    <Button type="link" style={{ paddingLeft: 0 }} onClick={() => onChange?.(!value)} id="instance-create-more">
      {value ? t('Hide Advanced Options') : t('Expand Advanced Options')} {value ? <UpOutlined /> : <DownOutlined />}
    </Button>
  );
}
