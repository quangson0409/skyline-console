import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Radio, theme } from 'antd';
import { novaApi } from '@/api/nova';
import { t } from '@/core/i18n';
import {
  flavorArchitectures,
  flavorCategoryList,
  categoryHasIOPS,
  categoryHasEphemeral,
  isBareMetal,
  isBareMetalFlavor,
  getFlavorArchInfo,
  mapFlavor,
  formatRam,
  fetchSkylineSettings,
  cpuPolicyList,
  cpuThreadPolicyMap,
  pageTypeMap,
} from '@/pages/Compute/Flavors/helpers';
import SelectTable, { col, mapCol } from '@/components/SelectTable';

/** Legacy resources/nova/flavor getBaseColumns (default-visible columns only) */
const baseColumns = () => [
  col(t('Name'), 'name'),
  mapCol(t('Category'), 'category', flavorCategoryList()),
  col(t('Disk (GiB)'), 'disk'),
  col(t('vCPU'), 'vcpus'),
  col(t('Memory'), 'ram', { render: (v) => formatRam(v) }),
  col(t('Ephemeral Disk (GiB)'), 'OS-FLV-EXT-DATA:ephemeral'),
  col(t('Storage IOPS'), 'quota:disk_total_iops_sec', { render: (v) => v || '-' }),
];

const gpuColumns = () => [
  col(t('GPU Type'), 'gpuType'),
  col(t('GPU Count'), 'gpuCount'),
  col(t('NUMA Nodes'), 'hw:numa_nodes'),
  mapCol(t('CPU Policy'), 'hw:cpu_policy', cpuPolicyList()),
  mapCol(t('CPU Thread Policy'), 'hw:cpu_thread_policy', cpuThreadPolicyMap()),
  mapCol(t('Memory Page'), 'hw:mem_page_size', pageTypeMap()),
];

const flavorFilters = () => [
  { label: t('Name'), name: 'name' },
  { label: t('CPU'), name: 'vcpus', filterFunc: (vcpus, value) => `${vcpus}`.includes(value) },
  { label: t('Memory'), name: 'ram', filterFunc: (ram, value) => (formatRam(ram) || '').includes(value) },
  { label: t('Disk'), name: 'disk', filterFunc: (disk, value) => `${disk}`.includes(value) },
];

/**
 * Port of legacy pages/compute/containers/Instance/components/FlavorSelectTable:
 * architecture radio buttons (from the skyline "flavor_families" setting), category buttons,
 * flavor select-table with architecture specific columns.
 */
export default function FlavorSelectTable({ value, onChange, isIronic = false, filterIronic = true, excludeFlavors = [] }) {
  const { token } = theme.useToken();
  const [settings, setSettings] = useState(null);
  const [flavors, setFlavors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [arch, setArch] = useState(null);
  const [category, setCategory] = useState(null);
  const initialized = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, res] = await Promise.all([fetchSkylineSettings(), novaApi.listFlavorsV({}).catch(() => ({}))]);
      setSettings(s || []);
      setFlavors((res?.flavors || []).map(mapFlavor));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const architectures = useMemo(() => {
    const custom = { architecture: 'custom' };
    const all = { architecture: 'all' };
    const item = (settings || []).find((it) => it.key === 'flavor_families');
    if (!item) return [all, custom];
    const values = (Array.isArray(item.value) ? item.value : []).filter((it) => {
      const { architecture } = it || {};
      if (!architecture) return false;
      if (filterIronic) return isIronic ? isBareMetal(architecture) : !isBareMetal(architecture);
      return true;
    });
    return [all, ...values, custom];
  }, [settings, isIronic, filterIronic]);

  // legacy initDefaultValue
  useEffect(() => {
    if (settings === null || loading || initialized.current) return;
    initialized.current = true;
    const key = value?.selectedRowKeys?.[0];
    const flavor = key ? flavors.find((it) => it.id === key) : null;
    if (flavor) {
      setArch(flavor.architecture);
      setCategory(flavor.category);
    } else {
      const first = architectures[0];
      setArch(first.architecture);
      setCategory(first.categories?.[0]?.name || null);
    }
  }, [settings, loading, flavors, architectures, value]);

  const categories = useMemo(() => {
    if (!arch) return [];
    const item = architectures.find((it) => it.architecture === arch);
    return (item && item.categories) || [];
  }, [arch, architectures]);

  const data = useMemo(() => {
    if (!arch) return [];
    return flavors
      .filter((it) => (excludeFlavors.length ? excludeFlavors.indexOf(it.id) < 0 : true))
      .filter((it) => (!filterIronic ? true : isIronic ? isBareMetalFlavor(it) : !isBareMetalFlavor(it)))
      .filter((it) => {
        if (arch === 'all') return true;
        if (arch === 'custom') return it.architecture === arch;
        return it.architecture === arch && it.category === category;
      });
  }, [flavors, arch, category, isIronic, filterIronic, excludeFlavors]);

  const columns = useMemo(() => {
    let base = baseColumns();
    base.splice(1, 1);
    if (!categoryHasIOPS(category)) base = base.filter((it) => it.dataIndex !== 'quota:disk_total_iops_sec');
    if (!categoryHasEphemeral(category)) base = base.filter((it) => it.dataIndex !== 'OS-FLV-EXT-DATA:ephemeral');
    if (arch === 'all') {
      base = [...base, col(t('Architecture'), 'architecture', { key: 'arch-info', render: (_, r) => getFlavorArchInfo(r) })];
    }
    if (isBareMetal(arch)) return base.filter((_, index) => index < 3);
    if (arch !== 'heterogeneous_computing') return base;
    const gpus =
      category === 'compute_optimized_type'
        ? gpuColumns().filter((it) => it.dataIndex.indexOf('gpu') < 0)
        : gpuColumns().filter((it) => it.dataIndex.indexOf('gpu') >= 0);
    return [...base, ...gpus];
  }, [arch, category]);

  const archNames = flavorArchitectures();
  const catNames = flavorCategoryList();
  const labelStyle = { display: 'inline-block', minWidth: 50, marginRight: 16, color: token.colorTextSecondary };

  const tableHeader = (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={labelStyle}>{t('Architecture')}</span>
        <Radio.Group
          id="flavor-select-arch"
          value={arch}
          buttonStyle="solid"
          onChange={(e) => {
            const next = e.target.value;
            setArch(next);
            // select the first category of the new architecture when the current one does not belong to it
            const cats = architectures.find((it) => it.architecture === next)?.categories || [];
            if (cats.length && !cats.some((c) => c.name === category)) setCategory(cats[0].name);
          }}
        >
          {architectures.map(({ architecture }) => (
            <Radio.Button value={architecture} key={architecture}>
              {archNames[architecture] || architecture}
            </Radio.Button>
          ))}
        </Radio.Group>
      </div>
      {arch !== 'custom' && arch !== 'all' ? (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={labelStyle}>{t('Category')}</span>
          <Radio.Group id="flavor-select-category" value={category} buttonStyle="solid" onChange={(e) => setCategory(e.target.value)}>
            {categories.map(({ name }) => (
              <Radio.Button value={name} key={name}>
                {catNames[name] || name}
              </Radio.Button>
            ))}
          </Radio.Group>
        </div>
      ) : null}
    </div>
  );

  return (
    <SelectTable
      id="flavor-select-table"
      value={value}
      onChange={onChange}
      data={data}
      columns={columns}
      isLoading={loading}
      filterParams={flavorFilters()}
      tableHeader={tableHeader}
      selectedLabel={t('Flavor')}
      onRefresh={load}
    />
  );
}
