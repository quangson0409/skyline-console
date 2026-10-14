import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Form, Grid, InputNumber, message, notification } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { novaApi } from '@/api/nova';
import { quotaApi } from '@/api/quota';
import { currentProjectId, hasEndpoint } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import WizardShell, { listCrumb } from '@/components/Wizard/WizardShell';
import QuotaPanel from '@/components/Quota/QuotaPanel';
import { formLayout, mobileFormLayout } from '@/components/form/fields';
import BaseStep, { getBaseDefaults } from './steps/BaseStep';
import NetworkStep from './steps/NetworkStep';
import SystemStep, { getSystemDefaults } from './steps/SystemStep';
import ConfirmStep from './steps/ConfirmStep';
import { buildServerBody, getAllDataDisks, getErrorDetail, getInstanceNames, getListUrl } from './utils';
import { getGiBValue, getQuotaMessage, updateNovaQuota, updateQuotaData } from '@/components/Quota/utils';

export const usePresets = () => {
  const [searchParams] = useSearchParams();
  return useMemo(
    () => ({
      image: searchParams.get('image') || undefined,
      volume: searchParams.get('volume') || undefined,
      snapshot: searchParams.get('snapshot') || undefined,
      servergroup: searchParams.get('servergroup') || undefined,
      os_distro: searchParams.get('os_distro') || undefined,
      listUrl: getListUrl(searchParams),
    }),
    [searchParams]
  );
};

export const useCurrentProjectName = () => {
  const currentProject = useAuthStore((s) => s.currentProject);
  return currentProject?.name || currentProject?.displayName || currentProject?.id || '';
};

/** Legacy Notify.errorWithDetail */
export const notifyError = (err, title) => {
  const detail = getErrorDetail(err);
  notification.error({ message: title, description: detail || undefined, duration: 8 });
};

/** Legacy "Quota exceeded" detection (forbidden.message) */
export const isQuotaExceeded = (err) => {
  const msg = err?.response?.data?.forbidden?.message || '';
  return typeof msg === 'string' && msg.includes('Quota exceeded');
};

/**
 * Port of legacy pages/compute/containers/Instance/actions/StepCreate (StepAction wizard).
 */
export default function InstanceCreate() {
  const navigate = useNavigate();
  const presets = usePresets();
  const projectName = useCurrentProjectName();
  const hasAdminRole = useAuthStore((s) => !!s.hasAdminRole);
  const enableCinder = hasEndpoint('cinder');
  const screens = Grid.useBreakpoint();
  const layout = screens.sm === false ? mobileFormLayout : formLayout;

  const [baseForm] = Form.useForm();
  const [networkForm] = Form.useForm();
  const [systemForm] = Form.useForm();
  const [confirmForm] = Form.useForm();
  const forms = [baseForm, networkForm, systemForm, confirmForm];

  const [current, setCurrent] = useState(0);
  const [data, setData] = useState({ count: 1 });
  const dataRef = useRef(data);
  const [novaQuota, setNovaQuota] = useState(null);
  const [cinderQuota, setCinderQuota] = useState(null);
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const lastError = useRef('');

  const updateContext = useCallback((patch) => {
    setData((prev) => {
      const next = { ...prev, ...patch };
      dataRef.current = next;
      return next;
    });
  }, []);

  const steps = [{ title: t('Base Config') }, { title: t('Network Config') }, { title: t('System Config') }, { title: t('Confirm Config') }];

  // ---------------------------------------------------------------- quota (legacy getQuota)
  useEffect(() => {
    const projectId = currentProjectId();
    setQuotaLoading(true);
    Promise.all([
      quotaApi.getNovaQuota(projectId).catch(() => null),
      enableCinder ? quotaApi.getCinderQuota(projectId).catch(() => null) : null,
    ]).then(([nova, cinder]) => {
      // a failed quota request must not block creation (quota checks are then skipped)
      setNovaQuota(nova?.quota_set ? updateQuotaData(updateNovaQuota(nova.quota_set)) : null);
      setCinderQuota(updateQuotaData(cinder?.quota_set || {}));
      setQuotaLoading(false);
    });
  }, [enableCinder]);

  const instanceQuota = useMemo(() => {
    const { instances: { left = 0 } = {} } = novaQuota || {};
    return left === -1 ? Infinity : left;
  }, [novaQuota]);

  const getFlavorInput = () => {
    const { flavor = {}, count = 1 } = data;
    const { vcpus = 0, ram = 0 } = flavor?.selectedRows?.[0] || {};
    return { newCPU: vcpus * count, newRam: getGiBValue(ram) * count };
  };

  const getVolumeQuota = () => {
    const result = {};
    Object.keys(cinderQuota || {}).forEach((key) => {
      if (key.includes('volumes') || key.includes('gigabytes')) result[key] = cinderQuota[key];
    });
    return result;
  };

  const getVolumeInputMap = () => {
    const {
      systemDisk = {},
      dataDisk = [],
      count = 1,
      source: { value: sourceValue } = {},
      instanceSnapshotDisk = {},
      instanceSnapshotDataVolumes = [],
      bootFromVolume = true,
      volumeTypes = [],
    } = data;
    const newCountMap = {};
    const newSizeMap = {};
    let totalNewCount = 0;
    let totalNewSize = 0;
    const isSnapshotType = sourceValue === 'instanceSnapshot';
    if (isSnapshotType && instanceSnapshotDisk) {
      const { size, typeOption: { label } = {} } = instanceSnapshotDisk;
      if (label && bootFromVolume) {
        newCountMap[label] = !newCountMap[label] ? 1 : newCountMap[label] + 1;
        newSizeMap[label] = !newSizeMap[label] ? size : newSizeMap[label] + size;
        totalNewCount += 1 * count;
        totalNewSize += size * count;
      }
    } else if (systemDisk?.type && bootFromVolume && sourceValue !== 'bootableVolume') {
      const { size } = systemDisk;
      const { label } = systemDisk.typeOption || {};
      newCountMap[label] = !newCountMap[label] ? 1 : newCountMap[label] + 1;
      newSizeMap[label] = !newSizeMap[label] ? size : newSizeMap[label] + size;
      totalNewCount += 1 * count;
      totalNewSize += size * count;
    }
    if (dataDisk || (isSnapshotType && instanceSnapshotDataVolumes?.length > 0)) {
      const allDataDisks = getAllDataDisks({ dataDisk: dataDisk || [], instanceSnapshotDataVolumes: isSnapshotType ? instanceSnapshotDataVolumes : [] }, volumeTypes);
      allDataDisks.forEach((item) => {
        const diskItem = item.value || {};
        if (diskItem.type) {
          const { size, typeOption } = diskItem;
          const { label } = typeOption || {};
          newCountMap[label] = !newCountMap[label] ? 1 * count : newCountMap[label] + 1 * count;
          newSizeMap[label] = !newSizeMap[label] ? size * count : newSizeMap[label] + size * count;
          totalNewCount += 1 * count;
          totalNewSize += size * count;
        }
      });
    }
    return { totalNewCount, totalNewSize, newCountMap, newSizeMap };
  };

  const getServerGroupQuota = () => {
    const { serverGroupRow, count = 1, serverGroup } = data;
    const row = serverGroupRow || (serverGroup?.selectedRows || [])[0];
    if (!row) return null;
    const { server_group_members: { limit = 0 } = {} } = novaQuota || {};
    const used = (row.members || []).length;
    const left = limit === -1 ? -1 : limit - used;
    return { add: count, used, limit, left, title: t('Server Group Member'), name: 'serverGroupMember', type: 'line' };
  };

  // legacy checkQuotaInput
  const errorMsg = useMemo(() => {
    if (quotaLoading || !novaQuota) return '';
    const { instances = {}, cores = {}, ram = {} } = novaQuota;
    let msg = '';
    if (instanceQuota === 0) msg = getQuotaMessage(1, instances, t('Instance'));
    if (!msg) {
      const { newCPU, newRam } = getFlavorInput();
      const { left = 0 } = cores || {};
      const { left: leftRam = 0 } = ram || {};
      if (left !== -1 && left < newCPU) msg = getQuotaMessage(newCPU, cores, t('CPU'));
      else if (leftRam !== -1 && leftRam < newRam) msg = getQuotaMessage(newRam, ram, t('Memory'));
    }
    if (!msg && enableCinder) {
      const { totalNewCount, totalNewSize, newCountMap, newSizeMap } = getVolumeInputMap();
      const quotaAll = getVolumeQuota();
      msg = getQuotaMessage(totalNewCount, quotaAll.volumes, t('volume')) || getQuotaMessage(totalNewSize, quotaAll.gigabytes, t('volume capacity'));
      if (!msg) {
        Object.keys(newCountMap).forEach((key) => {
          const m = getQuotaMessage(newCountMap[key], quotaAll[`volumes_${key}`], t('volume type {type}', { type: key }));
          if (m) msg = m;
        });
      }
      if (!msg) {
        Object.keys(newSizeMap).forEach((key) => {
          const m = getQuotaMessage(newSizeMap[key], quotaAll[`gigabytes_${key}`], t('volume type {type} capacity', { type: key }));
          if (m) msg = m;
        });
      }
    }
    if (!msg) {
      const sg = getServerGroupQuota();
      if (sg && sg.left !== -1 && sg.left < sg.add) msg = getQuotaMessage(sg.add, sg, t('Server Group Member'));
    }
    return msg;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, novaQuota, cinderQuota, quotaLoading, instanceQuota, enableCinder]);

  useEffect(() => {
    if (errorMsg && errorMsg !== lastError.current) message.error(errorMsg);
    lastError.current = errorMsg;
  }, [errorMsg]);

  // legacy quotaInfo
  const quotaInfo = useMemo(() => {
    if (quotaLoading || !novaQuota) return [];
    const { instances = {}, cores = {}, ram = {} } = novaQuota;
    const { count = 1 } = data;
    const { newCPU, newRam } = getFlavorInput();
    const volumeQuota = getVolumeQuota();
    const { totalNewCount, totalNewSize } = getVolumeInputMap();
    const list = [
      { ...instances, add: count, name: 'instance', title: t('Instance') },
      { ...cores, add: newCPU, name: 'cpu', title: t('CPU'), type: 'line' },
      { ...ram, add: newRam, name: 'ram', title: t('Memory (GiB)'), type: 'line' },
    ];
    if (enableCinder) {
      list.push({ ...(volumeQuota.volumes || {}), add: totalNewCount, name: 'volume', title: t('Volume'), type: 'line' });
      list.push({ ...(volumeQuota.gigabytes || {}), add: totalNewSize, name: 'volumeSize', title: t('Volume Capacity (GiB)'), type: 'line' });
    }
    const sg = getServerGroupQuota();
    if (sg) list.push(sg);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, novaQuota, cinderQuota, quotaLoading, enableCinder]);

  // ---------------------------------------------------------------- navigation
  const collect = (index) => forms[index].getFieldsValue(true);

  const next = async () => {
    try {
      await forms[current].validateFields();
    } catch (e) {
      // scroll to the first error like legacy Form
      const first = e?.errorFields?.[0]?.name;
      if (first) forms[current].scrollToField(first, { behavior: 'smooth', block: 'center' });
      return;
    }
    updateContext(collect(current));
    setCurrent((c) => c + 1);
    window.scrollTo({ top: 0 });
  };

  const prev = () => {
    updateContext(collect(current));
    setCurrent((c) => c - 1);
    window.scrollTo({ top: 0 });
  };

  const goStep = (index) => {
    setCurrent(index);
    window.scrollTo({ top: 0 });
  };

  const onCancel = () => navigate(presets.listUrl);

  const errorText = (status) => {
    if (status === 'error') return t('Unable to create instance: insufficient quota to create resources.');
    if (status === 'ipBatch') return t('Unable to create instance: batch creation is not supported when specifying IP.');
    return t('The creation instruction has been issued, please refresh to see the actual situation in the list.');
  };

  const onOk = async () => {
    const values = { ...dataRef.current, ...collect(0), ...collect(1), ...collect(2), count: dataRef.current.count || 1 };
    if (errorMsg) {
      notifyError(null, errorText('error'));
      notification.error({ message: errorMsg });
      return;
    }
    const { body, error } = buildServerBody(values, { enableCinder });
    if (error) {
      notifyError(null, errorText('ipBatch'));
      return;
    }
    setSubmitting(true);
    try {
      await novaApi.createServerV(body);
      notification.success({
        message: t(
          'The creation instruction was issued successfully, instance: {name}. \n You can wait for a few seconds to follow the changes of the list data or manually refresh the data to get the final display result.',
          { action: t('Create instance').toLowerCase(), name: getInstanceNames(values.name, values.count) }
        ),
      });
      navigate(presets.listUrl);
    } catch (err) {
      if (isQuotaExceeded(err)) notification.error({ message: t('Quota exceeded') });
      else notifyError(err, errorText());
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------- footer (legacy renderFooterLeft)
  const count = data.count || 1;
  const countMax = data.source?.value === 'bootableVolume' ? 1 : Number.isFinite(instanceQuota) ? Math.max(instanceQuota, 1) : 100;
  const footerLeft = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span>{t('Count')}</span>
        <InputNumber
          className="instance-count"
          min={1}
          max={countMax}
          precision={0}
          value={count}
          onChange={(v) => updateContext({ count: v || 1 })}
          style={{ width: 96 }}
        />
      </span>
      {errorMsg ? <Badge status="error" text={errorMsg} style={{ maxWidth: 600 }} /> : null}
    </div>
  );

  const baseDefaults = useMemo(() => getBaseDefaults({ presets, enableCinder, projectName }), [presets, enableCinder, projectName]);
  const systemDefaults = useMemo(
    () => (current === 2 ? getSystemDefaults({ context: data, presets }) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current]
  );

  const stepProps = { context: data, updateContext, presets, enableCinder, hasAdminRole, projectName, goStep };

  const renderStep = () => {
    switch (current) {
      case 0:
        return (
          <Form
            key="base"
            form={baseForm}
            {...layout}
            initialValues={baseDefaults}
            onValuesChange={(changed) => updateContext(changed)}
            scrollToFirstError
          >
            <BaseStep form={baseForm} {...stepProps} />
          </Form>
        );
      case 1:
        return (
          <Form key="network" form={networkForm} {...layout} initialValues={{ networks: [] }} onValuesChange={(changed) => updateContext(changed)}>
            <NetworkStep form={networkForm} {...stepProps} />
          </Form>
        );
      case 2:
        return (
          <Form key="system" form={systemForm} {...layout} initialValues={systemDefaults} onValuesChange={(changed) => updateContext(changed)}>
            <SystemStep form={systemForm} {...stepProps} />
          </Form>
        );
      default:
        return (
          <Form key="confirm" form={confirmForm} {...layout}>
            <ConfirmStep {...stepProps} />
          </Form>
        );
    }
  };

  return (
    <WizardShell
      title={t('Create Instance')}
      breadcrumb={[{ title: t('Compute') }, listCrumb('/compute/instance', t('Instances')), { title: t('Create Instance') }]}
      steps={steps}
      current={current}
      footerLeft={footerLeft}
      quota={quotaLoading || novaQuota ? <QuotaPanel quotas={quotaInfo} loading={quotaLoading} /> : null}
      onCancel={onCancel}
      onPrev={prev}
      onNext={next}
      onOk={onOk}
      disableNext={!!errorMsg}
      disableSubmit={!!errorMsg}
      submitting={submitting}
    >
      {renderStep()}
    </WizardShell>
  );
}
