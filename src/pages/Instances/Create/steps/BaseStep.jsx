import React, { useEffect, useMemo, useState } from 'react';
import { Checkbox, Col, Form, Row, theme } from 'antd';
import { novaApi } from '@/api/nova';
import { glanceApi } from '@/api/glance';
import { cinderApi } from '@/api/cinder';
import { currentProjectId } from '@/api/endpoints';
import { useProjectMap } from '@/hooks/useProjectMap';
import { formatSize } from '@/components/ResourcePage/helpers';
import { t } from '@/core/i18n';
import { isGpuCategory } from '@/pages/Compute/Flavors/helpers';
import SelectTable, { col, mapCol, unitCol, timeCol } from '../components/SelectTable';
import FlavorSelectTable from '../components/FlavorSelectTable';
import InstanceVolume from '../components/InstanceVolume';
import AddSelect from '../components/AddSelect';
import { WrappedRadio, WrappedSelect, LabelValue, FormDivider, selectTableRule, narrowWrapper, tableWrapper } from '../components/fields';
import {
  canImageCreateInstance,
  canImageCreateIronicInstance,
  canVolumeCreateInstance,
  getImageOS,
  getImageSystemTabs,
  getDiskInfo,
  getInstanceSnapshotDataDisk,
  imageFormats,
  imageOS,
  imageStatus,
  imageVisibility,
  isSnapshot,
  volumeStatus,
} from '../utils';


/** Glance image list mapper (legacy ImageStore.mapper: unknown os_distro -> others) */
const mapImage = (it, projectMap = {}) => {
  const os = imageOS()[it.os_distro] ? it.os_distro : 'others';
  return {
    ...it,
    key: it.id,
    os_distro: os,
    project_id: it.owner,
    project_name: it.owner_project_name || projectMap[it.owner] || it.owner,
  };
};

/** Legacy getImageColumns(self) */
export const getImageColumns = ({ hasAdminRole, projectId }) =>
  [
    col(t('Name'), 'name'),
    hasAdminRole ? col(t('Project'), 'project_name') : null,
    hasAdminRole ? col(t('Current Project'), 'owner', { render: (v) => (v === projectId ? t('Yes') : t('No')) }) : null,
    mapCol(t('System'), 'os_distro', imageOS()),
    col(t('OS Version'), 'os_version', { render: (v) => v || '-' }),
    mapCol(t('Access Control'), 'visibility', imageVisibility()),
    col(t('Image Size'), 'size', { render: (v) => formatSize(v) }),
  ].filter(Boolean);

const instanceSnapshotColumns = () => [
  col(t('Name'), 'name'),
  mapCol(t('Disk Format'), 'disk_format', imageFormats()),
  unitCol(t('Min. System Disk'), 'min_disk', 'GiB'),
  col(t('Min. Memory'), 'min_ram', { render: (text) => `${(text || 0) / 1024}GiB` }),
  mapCol(t('Status'), 'status', imageStatus()),
  timeCol(t('Created At'), 'created_at'),
];

const volumeColumns = () => [
  col(t('Name'), 'name', { render: (v, r) => v || r.id }),
  unitCol(t('Size'), 'size', 'GiB'),
  mapCol(t('Status'), 'status', volumeStatus()),
  col(t('Type'), 'volume_type'),
  timeCol(t('Created At'), 'created_at'),
];

const nameFilter = () => [{ label: t('Name'), name: 'name' }];

/** Fetch the instance snapshot volume data (legacy InstanceSnapshotStore.fetchInstanceSnapshotVolumeData) */
export const fetchInstanceSnapshotVolumeData = async (id) => {
  const item = await glanceApi.getImage(id);
  let bdm = [];
  try {
    bdm = JSON.parse(item?.block_device_mapping || '[]') || [];
  } catch {
    bdm = [];
  }
  const detail = { ...item };
  const snapshot = bdm.find((it) => it.boot_index === 0);
  if (snapshot) {
    const snapshotRes = await cinderApi.getSnapshot(snapshot.snapshot_id);
    detail.snapshotDetail = snapshotRes?.snapshot || {};
    if (detail.snapshotDetail.volume_id) {
      const volumeRes = await cinderApi.getVolume(detail.snapshotDetail.volume_id).catch(() => null);
      detail.volumeDetail = volumeRes?.volume;
    }
  }
  if (!bdm.length) return detail;
  const dataDisks = bdm.filter((it) => it.boot_index !== 0);
  detail.instanceSnapshotDataVolumes = await Promise.all(
    dataDisks.map(async (i) => {
      const snap = { ...i, bdmFormatData: i };
      const snapshotRes = await cinderApi.getSnapshot(i.snapshot_id).catch(() => null);
      snap.snapshotDetail = snapshotRes?.snapshot || {};
      const volumeRes = snap.snapshotDetail.volume_id ? await cinderApi.getVolume(snap.snapshotDetail.volume_id).catch(() => null) : null;
      snap.volumeDetail = volumeRes?.volume || {};
      return snap;
    })
  );
  return detail;
};

export const fetchAvailableZones = async () => {
  const res = await novaApi.listAvailabilityZonesV().catch(() => ({}));
  return (res?.availabilityZoneInfo || [])
    .filter((it) => it?.zoneState?.available)
    .map((it) => ({ value: it.zoneName, label: it.zoneName }));
};

export const fetchImagesForCreate = async ({ presetImage, projectMap, ironic = false }) => {
  if (presetImage) {
    const img = await glanceApi.getImage(presetImage).catch(() => null);
    return img ? [mapImage(img, projectMap)] : [];
  }
  const res = await glanceApi.listAllImages().catch(() => ({}));
  return (res?.images || []).filter((it) => !isSnapshot(it)).map((it) => mapImage(it, projectMap)).filter(ironic ? canImageCreateIronicInstance : canImageCreateInstance);
};

/** Renders a read-only snapshot disk line (legacy renderInstanceSnapshotDisk) */
const SnapshotDiskLine = ({ disk }) => {
  const { token } = theme.useToken();
  if (!disk) return null;
  const { deleteTypeLabel, typeOption = {}, size } = disk || {};
  if (!size) return null;
  const label = { marginRight: 10, color: token.colorTextSecondary };
  return (
    <Row gutter={24} style={{ lineHeight: '32px' }}>
      <Col span={8}>
        <span style={label}>{t('Type')}</span>
        {typeOption?.label}
      </Col>
      <Col span={8}>
        <span style={label}>{t('Size')}</span>
        {size}
        <span style={{ marginLeft: 6 }}>GiB</span>
      </Col>
      <Col span={8}>{deleteTypeLabel}</Col>
    </Row>
  );
};

/**
 * Port of legacy StepCreate/BaseStep.
 */
export default function BaseStep({ form, context, updateContext, presets, enableCinder, hasAdminRole, projectName }) {
  const projectMap = useProjectMap();
  const projectId = currentProjectId();
  const { image: presetImage, volume: presetVolume, snapshot: presetSnapshot, os_distro: presetOs } = presets;

  const [zones, setZones] = useState([]);
  const [images, setImages] = useState([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [volumeTypes, setVolumeTypes] = useState(context.volumeTypes || []);
  const [volumes, setVolumes] = useState([]);
  const [volumesLoading, setVolumesLoading] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [imageTab, setImageTab] = useState(context.imageTab);

  const source = Form.useWatch('source', form);
  const flavor = Form.useWatch('flavor', form);
  const image = Form.useWatch('image', form);
  const bootFromVolumeWatch = Form.useWatch('bootFromVolume', form);

  const sourceTypes = useMemo(() => {
    const types = [
      { label: t('Image'), value: 'image', disabled: !!(presetVolume || presetSnapshot) },
      { label: t('Instance Snapshot'), value: 'instanceSnapshot', disabled: !!(presetImage || presetVolume) },
    ];
    if (enableCinder) {
      types.push({ label: t('Bootable Volume'), value: 'bootableVolume', disabled: !!(presetImage || presetSnapshot) });
    }
    return types;
  }, [presetImage, presetVolume, presetSnapshot, enableCinder]);

  const availableZones = useMemo(() => [{ value: null, label: t('Any Availability Zone') }, ...zones], [zones]);

  const sourceValue = source?.value;
  const sourceTypeIsImage = sourceValue === 'image';
  const sourceTypeIsSnapshot = sourceValue === 'instanceSnapshot';
  const sourceTypeIsVolume = sourceValue === 'bootableVolume';
  const bootFromVolume = bootFromVolumeWatch === undefined ? true : bootFromVolumeWatch;

  // ---------------------------------------------------------------- data loading
  const loadImages = async () => {
    if (presetVolume || presetSnapshot) return;
    setImagesLoading(true);
    try {
      setImages(await fetchImagesForCreate({ presetImage, projectMap }));
    } finally {
      setImagesLoading(false);
    }
  };

  const loadVolumes = async () => {
    if (presetImage || presetSnapshot || !enableCinder) return;
    setVolumesLoading(true);
    try {
      if (presetVolume) {
        const res = await cinderApi.getVolume(presetVolume).catch(() => null);
        setVolumes(res?.volume ? [{ ...res.volume, key: res.volume.id }].filter(canVolumeCreateInstance) : []);
      } else {
        const res = await cinderApi.listVolumes({ sort_key: 'bootable', sort_dir: 'asc' }).catch(() => ({}));
        setVolumes((res?.volumes || []).filter(canVolumeCreateInstance).map((it) => ({ ...it, key: it.id })));
      }
    } finally {
      setVolumesLoading(false);
    }
  };

  const loadSnapshots = async () => {
    if (presetImage || presetVolume) return;
    setSnapshotsLoading(true);
    try {
      if (presetSnapshot) {
        const img = await glanceApi.getImage(presetSnapshot).catch(() => null);
        setSnapshots(img ? [{ ...img, key: img.id }] : []);
      } else {
        const res = await glanceApi.listAllImages({ owner: projectId }).catch(() => ({}));
        setSnapshots((res?.images || []).filter(isSnapshot).map((it) => ({ ...it, key: it.id })));
      }
    } finally {
      setSnapshotsLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableZones().then((list) => {
      setZones(list);
      if (form.getFieldValue('availableZone') === undefined) {
        const first = { value: null, label: t('Any Availability Zone') };
        form.setFieldValue('availableZone', first);
        updateContext({ availableZone: first });
      }
    });
    if (enableCinder) {
      cinderApi
        .listVolumeTypes({})
        .then((res) => {
          const types = (res?.volume_types || []).map((it) => ({ label: it.name, value: it.id, originData: it }));
          setVolumeTypes(types);
          updateContext({ volumeTypes: types });
        })
        .catch(() => {});
    }
    loadImages();
    loadVolumes();
    loadSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // presets: select the single preset item (image / volume / snapshot)
  useEffect(() => {
    if (presetImage && images.length && !form.getFieldValue('image')?.selectedRowKeys?.length) {
      const rows = images.filter((it) => it.id === presetImage);
      if (rows.length) {
        const v = { selectedRowKeys: [presetImage], selectedRows: rows };
        form.setFieldValue('image', v);
        updateContext({ image: v });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  useEffect(() => {
    if (presetVolume && volumes.length && !form.getFieldValue('bootableVolume')?.selectedRowKeys?.length) {
      const v = { selectedRowKeys: [volumes[0].id], selectedRows: [volumes[0]] };
      form.setFieldValue('bootableVolume', v);
      updateContext({ bootableVolume: v });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumes]);

  // ---------------------------------------------------------------- instance snapshot change
  const onInstanceSnapshotChange = async (value) => {
    const { min_disk = 0, size = 0, id } = value?.selectedRows?.[0] || {};
    if (!id) {
      const patch = { instanceSnapshotDisk: null, instanceSnapshotDataVolumes: [], instanceSnapshotMinSize: 0 };
      form.setFieldValue('instanceSnapshotDisk', null);
      updateContext(patch);
      return;
    }
    let detail = {};
    try {
      detail = await fetchInstanceSnapshotVolumeData(id);
    } catch {
      detail = {};
    }
    const { snapshotDetail, volumeDetail, instanceSnapshotDataVolumes = [] } = detail;
    if (!volumeDetail) {
      // non boot-from-volume snapshot (legacy: system disk has to be created)
      form.setFieldsValue({ bootFromVolume: true, instanceSnapshotDisk: null });
      updateContext({
        instanceSnapshotDisk: null,
        instanceSnapshotDataVolumes: [],
        bootFromVolume: true,
        instanceSnapshotMinSize: Math.max(min_disk || 0, Math.ceil((size || 0) / 1024 / 1024 / 1024)),
      });
      return;
    }
    const minSize = Math.max(min_disk || 0, size || 0, snapshotDetail?.size || 0);
    let bdm = [];
    try {
      bdm = JSON.parse(detail.block_device_mapping || '[]') || [];
    } catch {
      bdm = [];
    }
    const instanceSnapshotDisk = getDiskInfo({ volumeDetail, snapshotDetail, selfBdmData: bdm[0] || {} }, volumeTypes);
    form.setFieldValue('instanceSnapshotDisk', instanceSnapshotDisk);
    updateContext({ instanceSnapshotDisk, instanceSnapshotDataVolumes, instanceSnapshotMinSize: minSize });
  };

  useEffect(() => {
    if (presetSnapshot && snapshots.length && !form.getFieldValue('instanceSnapshot')?.selectedRowKeys?.length) {
      const v = { selectedRowKeys: [snapshots[0].id], selectedRows: [snapshots[0]] };
      form.setFieldValue('instanceSnapshot', v);
      updateContext({ instanceSnapshot: v });
      onInstanceSnapshotChange(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots]);

  // ---------------------------------------------------------------- derived (legacy getters)
  const instanceSnapshotDisk = context.instanceSnapshotDisk === undefined ? null : context.instanceSnapshotDisk;
  const snapshotDataDisks = context.instanceSnapshotDataVolumes || [];
  const flavorRow = flavor?.selectedRows?.[0] || {};
  const imageRow = image?.selectedRows?.[0] || {};

  const getSystemDiskMinSize = () => {
    const flavorSize = flavorRow.disk || 0;
    if (sourceTypeIsImage) {
      const { min_disk = 0, size = 0 } = imageRow;
      const sizeGiB = Math.ceil(size / 1024 / 1024 / 1024);
      const imageSize = Math.max(min_disk, sizeGiB, 1);
      return Math.max(flavorSize, imageSize, 1);
    }
    if (sourceTypeIsSnapshot) {
      return Math.max(flavorSize, context.instanceSnapshotMinSize || 0, 1);
    }
    return Math.max(flavorSize, 1);
  };
  const minSize = getSystemDiskMinSize();

  const showSystemDisk = enableCinder && (sourceTypeIsImage || (sourceTypeIsSnapshot && instanceSnapshotDisk === null));
  const showBootFromVolumeFormItem = enableCinder && (sourceTypeIsImage || showSystemDisk);
  const showSystemDiskByBootFromVolume = showSystemDisk && !!bootFromVolume;
  const hideInstanceSnapshotSystemDisk = showSystemDisk || sourceTypeIsVolume || !sourceTypeIsSnapshot;
  const hideInstanceSnapshotDataDisk = hideInstanceSnapshotSystemDisk || snapshotDataDisks.length === 0;
  const hideDataDisk = sourceTypeIsVolume ? false : !bootFromVolume;

  const systemTabs = useMemo(() => {
    const tabs = getImageSystemTabs();
    return tabs.filter((tab) => images.some((img) => getImageOS(img) === tab.value));
  }, [images]);
  const currentImageTab = imageTab ?? (presetOs && systemTabs.some((it) => it.value === presetOs) ? presetOs : systemTabs[0]?.value);
  const imagesInTab = useMemo(
    () => (currentImageTab ? images.filter((it) => getImageOS(it) === currentImageTab) : images),
    [images, currentImageTab]
  );

  const checkSystemDisk = (_, value) => {
    const { size = 10, type } = value || {};
    if (!type) return Promise.reject(new Error(t('Please select a type!')));
    if (!size) return Promise.reject(new Error(t('Please set the system disk size!')));
    if (size < minSize) return Promise.reject(new Error(t('Please set a size no less than {minSize} GiB!', { minSize })));
    return Promise.resolve();
  };

  const checkDataDisks = (_, value) => {
    const bad = (value || []).find((it) => !it?.value?.type);
    if (bad) return Promise.reject(new Error(t('Please select a type!')));
    return Promise.resolve();
  };

  const imageExtra = isGpuCategory(flavorRow.category)
    ? t('For GPU type, you need to install GPU drivers in the instance operating system.')
    : '';

  const defaultVolume = { size: 10, deleteType: 1 };

  return (
    <>
      <Form.Item name="project" label={t('Project')}>
        <LabelValue content={projectName} />
      </Form.Item>
      <Form.Item
        name="availableZone"
        label={t('Availability Zone')}
        wrapperCol={narrowWrapper}
        tooltip={t(
          'Availability zone refers to a physical area where power and network are independent of each other in the same area. In the same region, the availability zone and the availability zone can communicate with each other in the intranet, and the available zones can achieve fault isolation.'
        )}
        rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error(t('Please select {label}!', { label: t('Availability Zone') })))) }]}
        required
      >
        <WrappedSelect options={availableZones} placeholder={t('Please select')} id="instance-create-az" />
      </Form.Item>
      <FormDivider />
      <Form.Item name="flavor" label={t('Flavor')} required rules={[selectTableRule(t('Flavor'))]} wrapperCol={tableWrapper}>
        <FlavorSelectTable />
      </Form.Item>
      <Form.Item
        name="source"
        label={t('Start Source')}
        required
        tooltip={t('The start source is a template used to create an instance. You can choose an image or a bootable volume.')}
      >
        <WrappedRadio options={sourceTypes} id="instance-create-source" />
      </Form.Item>
      {sourceTypeIsImage ? (
        <Form.Item
          name="image"
          label={t('Operating System')}
          required
          rules={[selectTableRule(t('Operating System'))]}
          extra={imageExtra || undefined}
          wrapperCol={tableWrapper}
          validateTrigger={[]}
        >
          <SelectTable
            id="instance-create-image"
            data={imagesInTab}
            columns={getImageColumns({ hasAdminRole, projectId })}
            isLoading={imagesLoading}
            filterParams={nameFilter()}
            tabs={systemTabs}
            tabValue={currentImageTab}
            onTabChange={(v) => {
              setImageTab(v);
              updateContext({ imageTab: v });
            }}
            selectedLabel={t('Image')}
            onRefresh={loadImages}
          />
        </Form.Item>
      ) : null}
      {sourceTypeIsSnapshot ? (
        <Form.Item
          name="instanceSnapshot"
          label={t('Instance Snapshot')}
          required
          rules={[selectTableRule(t('Instance Snapshot'))]}
          wrapperCol={tableWrapper}
        >
          <SelectTable
            id="instance-create-snapshot"
            data={snapshots}
            columns={instanceSnapshotColumns()}
            isLoading={snapshotsLoading}
            filterParams={nameFilter()}
            onRefresh={loadSnapshots}
            onChange={(v) => {
              form.setFieldValue('instanceSnapshot', v);
              onInstanceSnapshotChange(v);
            }}
          />
        </Form.Item>
      ) : null}
      {sourceTypeIsVolume && enableCinder ? (
        <Form.Item
          name="bootableVolume"
          label={t('Bootable Volume')}
          required
          rules={[selectTableRule(t('Bootable Volume'))]}
          wrapperCol={tableWrapper}
        >
          <SelectTable
            id="instance-create-volume"
            data={volumes}
            columns={volumeColumns()}
            isLoading={volumesLoading}
            filterParams={nameFilter()}
            onRefresh={loadVolumes}
          />
        </Form.Item>
      ) : null}
      <FormDivider />
      <Form.Item name="bootFromVolume" label={t('Boot From Volume')} required hidden={!showBootFromVolumeFormItem}>
        <WrappedRadio
          wrapped={false}
          id="instance-create-bfv"
          options={[
            { value: true, label: t('Yes - Create a new system disk') },
            { value: false, label: t('No - Do not create a new system disk') },
          ]}
        />
      </Form.Item>
      {showSystemDiskByBootFromVolume ? (
        <Form.Item
          name="systemDisk"
          label={t('System Disk')}
          required
          rules={[{ validator: checkSystemDisk }]}
          extra={t('Disk size is limited by the min. disk of flavor, image, etc.')}
          dependencies={['flavor', 'image', 'instanceSnapshot', 'bootFromVolume']}
        >
          <InstanceVolume options={volumeTypes} minSize={minSize} />
        </Form.Item>
      ) : null}
      {sourceTypeIsVolume ? (
        <Form.Item name="deleteVolumeInstance" label={t('Delete Volume on Instance Delete')} valuePropName="checked">
          <Checkbox />
        </Form.Item>
      ) : null}
      {!hideInstanceSnapshotSystemDisk ? (
        <Form.Item label={t('System Disk')}>
          <SnapshotDiskLine disk={instanceSnapshotDisk} />
        </Form.Item>
      ) : null}
      {!hideInstanceSnapshotDataDisk ? (
        <Form.Item label={t('Required Data Disk')}>
          {snapshotDataDisks.map((i) => (
            <div style={{ marginBottom: 10 }} key={`data-disk-${i?.id || i?.snapshot_id}`}>
              <SnapshotDiskLine disk={getInstanceSnapshotDataDisk(i, volumeTypes)} />
            </div>
          ))}
        </Form.Item>
      ) : null}
      {enableCinder && !hideDataDisk ? (
        <Form.Item
          name="dataDisk"
          label={t('Data Disk')}
          rules={[{ validator: checkDataDisks }]}
          extra={t(
            'Too many disks mounted on the instance will affect the read and write performance. It is recommended not to exceed 16 disks.'
          )}
        >
          <AddSelect
            addText={t('Add Data Disks')}
            defaultItemValue={defaultVolume}
            minCount={0}
            renderItem={(itemValue, index, onItemChange) => (
              <InstanceVolume value={itemValue} onChange={onItemChange} options={volumeTypes} key={index} />
            )}
          />
        </Form.Item>
      ) : null}
    </>
  );
}

/** Legacy BaseStep.defaultValue */
export const getBaseDefaults = ({ presets, enableCinder, projectName }) => {
  const sourceTypes = {
    image: { label: t('Image'), value: 'image', disabled: !!(presets.volume || presets.snapshot) },
    instanceSnapshot: { label: t('Instance Snapshot'), value: 'instanceSnapshot', disabled: !!(presets.image || presets.volume) },
    bootableVolume: { label: t('Bootable Volume'), value: 'bootableVolume', disabled: !!(presets.image || presets.snapshot) },
  };
  let source = sourceTypes.image;
  if (presets.volume) source = enableCinder ? sourceTypes.bootableVolume : {};
  else if (presets.snapshot) source = sourceTypes.instanceSnapshot;
  const values = {
    systemDisk: { size: 10, deleteType: 1 },
    source,
    project: projectName,
    dataDisk: [],
  };
  if (source.value === 'image') values.bootFromVolume = true;
  return values;
};
