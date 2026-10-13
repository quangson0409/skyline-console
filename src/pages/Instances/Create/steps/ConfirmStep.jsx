import React from 'react';
import { Button, Descriptions, Divider, Form, theme } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';
import { LabelValue } from '../components/fields';
import { getAllDataDisks, physicalNodeTypes } from '../utils';

/** Legacy FormItem/Descriptions: titled block (click to go back to the step) with label/value pairs */
export function ConfirmSection({ title, items = [], onClick, column = 2 }) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        padding: '12px 16px',
        background: token.colorFillQuaternary,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: token.colorText }}>{title}</span>
        {onClick ? (
          <Button type="link" size="small" icon={<EditOutlined />} onClick={onClick}>
            {t('Edit')}
          </Button>
        ) : null}
      </div>
      <Descriptions
        size="small"
        column={{ xs: 1, md: column }}
        items={items.map((it, idx) => ({
          key: it.key || `${it.label}-${idx}`,
          label: it.label,
          span: it.span,
          children: it.value === undefined || it.value === null || it.value === '' ? '-' : it.value,
        }))}
      />
    </div>
  );
}

const lines = (values = []) =>
  values.length ? (
    <div>
      {values.map((i, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={`${i}-${idx}`}>{i}</div>
      ))}
    </div>
  ) : (
    '-'
  );

const getFlavorText = (flavor, compact = false) => {
  const row = flavor?.selectedRows?.[0];
  if (!row) return '-';
  const { disk, ram, vcpus } = row;
  const ramGiB = Number.parseInt(ram / 1024, 10);
  if (compact) return disk ? `${vcpus}VCPU/${disk}GiB/${ramGiB}GiB` : `${vcpus}VCPU/${ramGiB}GiB`;
  return disk ? `${vcpus} vCPU/${disk} GiB/${ramGiB} GiB` : `${vcpus} vCPU/${ramGiB} GiB`;
};

const getVirtualLANs = (networks = [], withParens = true) =>
  (networks || []).map((it) => {
    const { networkOption = {}, subnetOption = {}, ipTypeOption = {}, ip } = it.value || {};
    const subnet = ipTypeOption.value === 1 ? subnetOption?.name || subnetOption?.label || '' : '';
    const typeLabel = withParens ? `(${ipTypeOption.label})` : ipTypeOption.label;
    return `${networkOption?.name || networkOption?.label || ''} ${typeLabel} ${subnet} ${ipTypeOption.value === 1 ? ip : ''}`.trim();
  });

const getLoginType = (context) => {
  const { loginType = {}, keypair } = context;
  const { value, label } = loginType;
  return `${label || ''} ${value === 'keypair' ? keypair?.selectedRows?.[0]?.name || keypair?.selectedRowKeys?.[0] || '' : ''}`.trim();
};

/** Port of legacy StepCreate/ConfirmStep */
export default function ConfirmStep({ context, goStep, enableCinder }) {
  const getDisk = (diskInfo, bootFromVolume) => {
    if (!bootFromVolume) return null;
    const { size, typeOption, deleteTypeLabel } = diskInfo || {};
    return (
      <span style={{ whiteSpace: 'pre-line' }}>{`${typeOption?.label || ''} ${size}GiB\n(${deleteTypeLabel || ''})`}</span>
    );
  };

  const getSystemDisk = () => {
    if (!enableCinder) return null;
    const { systemDisk, source: { value } = {}, instanceSnapshotDisk, bootFromVolume = true, bootableVolume } = context;
    if (value === 'bootableVolume') {
      const row = bootableVolume?.selectedRows?.[0] || {};
      return `${row.volume_type || ''} ${row.size}GiB`;
    }
    if (value === 'instanceSnapshot' && instanceSnapshotDisk !== null && instanceSnapshotDisk !== undefined) {
      return getDisk(instanceSnapshotDisk, bootFromVolume);
    }
    return getDisk(systemDisk, bootFromVolume);
  };

  const getDataDisk = () => {
    if (!enableCinder) return null;
    const { dataDisk = [], source: { value } = {}, instanceSnapshotDataVolumes = [], volumeTypes = [] } = context;
    let allDataDisks = dataDisk || [];
    if (value === 'instanceSnapshot' && instanceSnapshotDataVolumes?.length > 0) {
      allDataDisks = getAllDataDisks({ dataDisk, instanceSnapshotDataVolumes }, volumeTypes);
    }
    if (!allDataDisks.length) return null;
    return (
      <div>
        {allDataDisks.map((it, idx) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={idx}>{getDisk(it.value, true)}</div>
        ))}
      </div>
    );
  };

  const getSourceValue = () => {
    const { source } = context;
    const { selectedRows = [], selectedRowKeys = [] } = context[source?.value] || {};
    return selectedRows.length ? selectedRows[0].name || selectedRows[0].id : selectedRowKeys[0];
  };

  const getPhysicalNode = () => {
    const { physicalNodeType, physicalNode } = context;
    if (!physicalNodeType) return physicalNodeTypes()[0].label;
    if (physicalNodeType.value === 'smart') return physicalNodeType.label;
    return physicalNode?.selectedRows?.[0]?.hypervisor_hostname;
  };

  const getServerGroup = () => {
    const { serverGroup } = context;
    if (!serverGroup || !serverGroup.selectedRows?.length) return '-';
    return serverGroup.selectedRows[0].name;
  };

  let baseItems = [
    { label: t('Start Source'), value: context.source?.label },
    { label: t('System Disk'), value: getSystemDisk(), key: 'systemDisk' },
    { label: t('Delete Volume on Instance Delete'), value: context.deleteVolumeInstance ? t('Yes') : t('No'), key: 'deleteVolume' },
    { label: t('Availability Zone'), value: context.availableZone?.label },
    { label: t('Start Source Name'), value: getSourceValue() },
    { label: t('Data Disk'), value: getDataDisk(), key: 'dataDisk' },
    { label: t('Project'), value: context.project },
    { label: t('Flavor'), value: getFlavorText(context.flavor) },
  ];
  if (!enableCinder) baseItems = baseItems.filter((it) => !['systemDisk', 'dataDisk'].includes(it.key));
  if (String(context.source?.value || '').toUpperCase() !== 'BOOTABLEVOLUME') baseItems = baseItems.filter((it) => it.key !== 'deleteVolume');

  return (
    <>
      <Form.Item label={t('Count')}>
        <LabelValue content={context.count || 1} />
      </Form.Item>
      <Form.Item label={t('Config Overview')}>
        <ConfirmSection title={t('Base Config')} items={baseItems} onClick={() => goStep(0)} />
        <Divider style={{ margin: '16px 0' }} />
        <ConfirmSection
          title={t('Network Config')}
          column={3}
          onClick={() => goStep(1)}
          items={[
            { label: t('Virtual Interfaces'), value: lines(getVirtualLANs(context.networks)), span: 1 },
            {
              label: t('Ports'),
              value: lines((context.ports?.selectedRows || []).map((it) => it.name || it.id)),
              span: 1,
            },
            { label: t('Security Group'), value: lines((context.securityGroup?.selectedRows || []).map((it) => it.name)), span: 1 },
          ]}
        />
        <Divider style={{ margin: '16px 0' }} />
        <ConfirmSection
          title={t('System Config')}
          onClick={() => goStep(2)}
          items={[
            { label: t('Instance Name'), value: context.name },
            { label: t('Login Type'), value: getLoginType(context) },
            { label: t('Physical Node'), value: getPhysicalNode() },
            { label: t('Server Group'), value: getServerGroup() },
          ]}
        />
      </Form.Item>
    </>
  );
}

/** Port of legacy CreateIronic/ConfirmStep */
export function IronicConfirmStep({ context, goStep }) {
  return (
    <>
      <Form.Item label={t('Count')}>
        <LabelValue content={context.count || 1} />
      </Form.Item>
      <Form.Item label={t('Config Overview')}>
        <ConfirmSection
          title={t('Base Config')}
          onClick={() => goStep(0)}
          items={[
            { label: t('Availability Zone'), value: context.availableZone?.label },
            { label: t('Project'), value: context.project },
            { label: t('Flavor'), value: getFlavorText(context.flavor, true) },
            {
              label: t('Image Name'),
              value: context.image?.selectedRows?.[0]?.name || context.image?.selectedRowKeys?.[0],
            },
          ]}
        />
        <Divider style={{ margin: '16px 0' }} />
        <ConfirmSection
          title={t('Network Config')}
          onClick={() => goStep(1)}
          items={[
            { label: t('Virtual LAN'), value: lines(getVirtualLANs(context.networks, false)), span: 1 },
            { label: t('Security Group'), value: lines((context.securityGroup?.selectedRows || []).map((it) => it.name)), span: 1 },
          ]}
        />
        <Divider style={{ margin: '16px 0' }} />
        <ConfirmSection
          title={t('System Config')}
          onClick={() => goStep(2)}
          items={[
            { label: t('Name'), value: context.name },
            { label: t('Login Type'), value: getLoginType(context) },
          ]}
        />
      </Form.Item>
    </>
  );
}
