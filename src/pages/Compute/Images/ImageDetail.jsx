import React from 'react';
import { useNavigate } from 'react-router-dom';
import { glanceApi } from '@/api/glance';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime, formatSize, CopyText, yesNo } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { imageStatus, imageVisibility, imageOS, imageContainerFormats, imageProperties, mapImage } from './helpers';
import { imageRowActions } from './actions';

/** Header info (legacy ImageDetail.detailInfos) */
export const imageHeaderInfo = (d) => [
  { label: t('ID'), value: d.id, copyable: true },
  { label: t('Name'), value: d.name },
  { label: t('Status'), value: d.status, render: () => imageStatus()[d.status] || d.status || '-' },
  { label: t('Project ID'), value: d.owner, copyable: true },
  { label: t('Description'), value: d.description },
  { label: t('Created At'), value: formatTime(d.created_at) },
  { label: t('Updated At'), value: formatTime(d.updated_at) },
];

const NO_USE_KEYS = [
  'checksum',
  'created_at',
  'min_disk',
  'min_ram',
  'name',
  'updated_at',
  'status',
  'protected',
  'visibility',
  'owner',
  'disk_format',
  'container_format',
  'size',
  'id',
];
const COPYABLE = ['locations', 'file', 'direct_url'];

const renderPropValue = (value) => {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'boolean') return yesNo(value);
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return <span style={{ wordBreak: 'break-all' }}>{text}</span>;
};

/** Legacy BaseDetail cards: (Instance Info) / Base Info / Security Info / Custom Properties Info */
export const ImageDetailCards = ({ detail: d = {}, instanceCard = null }) => {
  const properties = d.originData || d;
  const propLabels = imageProperties();
  const propItems = Object.keys(properties)
    .filter((key) => !NO_USE_KEYS.includes(key) && key !== 'originData')
    .map((key) => {
      const value = properties[key];
      return {
        label: propLabels[key] || key,
        value,
        render: () =>
          COPYABLE.includes(key) && value ? (
            <CopyText value={typeof value === 'object' ? JSON.stringify(value) : String(value)}>
              {renderPropValue(value)}
            </CopyText>
          ) : (
            renderPropValue(value)
          ),
      };
    });

  return (
    <>
      {instanceCard}
      <DetailCard
        title={t('Base Info')}
        items={[
          { label: t('Size'), value: d.size, render: () => formatSize(d.size) },
          { label: t('Min. System Disk (GiB)'), value: d.min_disk ?? '-' },
          {
            label: t('Min. Memory (GiB)'),
            value: d.min_ram,
            render: () => (d.min_ram === undefined || d.min_ram === null ? '-' : `${Number(d.min_ram) / 1024} GiB`),
          },
          { label: t('Disk Format'), value: d.disk_format ? String(d.disk_format).toUpperCase() : '' },
          { label: t('OS'), value: imageOS()[d.os_distro] || d.os_distro },
          { label: t('OS Version'), value: d.os_version },
          { label: t('Container Format'), value: imageContainerFormats()[d.container_format] || d.container_format },
        ]}
      />
      <DetailCard
        title={t('Security Info')}
        items={[
          { label: t('Owner'), value: d.owner, copyable: true },
          { label: t('Filename'), value: d.file, copyable: true },
          { label: t('Visibility'), value: imageVisibility()[d.visibility] || d.visibility },
          { label: t('Protected'), value: d.protected, render: () => yesNo(d.protected) },
          { label: t('Checksum'), value: d.checksum, copyable: true },
        ]}
      />
      <DetailCard title={t('Custom Properties Info')} items={propItems} column={{ xs: 1, sm: 1, md: 2 }} />
    </>
  );
};

export const fetchRawImage = async (id) => {
  const res = await glanceApi.getImage(id);
  const image = res?.image && typeof res.image === 'object' ? res.image : res;
  return image && typeof image === 'object' && image.id ? image : { id };
};

export const fetchImageDetail = async (id) => mapImage(await fetchRawImage(id));

export default function ImageDetail() {
  const navigate = useNavigate();
  return (
    <ResourceDetail
      breadcrumb={[t('Compute'), { title: t('Images'), path: '/compute/image' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/compute/image-admin' : '/compute/image')}
      fetch={fetchImageDetail}
      info={(d) => imageHeaderInfo(d)}
      tabs={() => [
        {
          key: 'detail',
          label: t('Detail'),
          render: (d) => <ImageDetailCards detail={d} />,
        },
      ]}
      actions={({ isAdmin }) => imageRowActions({ isAdmin, navigate })}
      interval={15000}
    />
  );
}
