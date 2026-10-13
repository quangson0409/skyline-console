import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { glanceApi } from '@/api/glance';

const DEMO_IMAGES = [
  {
    key: '1',
    id: 'f98a2104-cd5e-4bb2-9011-8899aabbcc01',
    name: 'Ubuntu 22.04 LTS (Jammy Jellyfish)',
    format: 'QCOW2',
    minDisk: 20,
    minRam: 2048,
    size: '2.1 GB',
    status: 'active',
    visibility: 'public',
    os: 'Linux (Ubuntu)',
    createdAt: '2026-08-15 10:20:00',
  },
  {
    key: '2',
    id: 'b12c8790-ee21-44aa-9cbb-1234567890ab',
    name: 'Rocky Linux 9 (x86_64 CloudImg)',
    format: 'QCOW2',
    minDisk: 20,
    minRam: 2048,
    size: '1.8 GB',
    status: 'active',
    visibility: 'public',
    os: 'Linux (Rocky)',
    createdAt: '2026-09-01 14:15:22',
  },
  {
    key: '3',
    id: 'cc459012-11bb-45de-8922-334455667788',
    name: 'Debian 12 Bookworm Minimal',
    format: 'RAW',
    minDisk: 10,
    minRam: 1024,
    size: '1.2 GB',
    status: 'active',
    visibility: 'public',
    os: 'Linux (Debian)',
    createdAt: '2026-09-10 16:40:11',
  },
  {
    key: '4',
    id: '77ea8812-4411-99ee-bbaa-556677889900',
    name: 'Windows Server 2022 Datacenter Cloud',
    format: 'QCOW2',
    minDisk: 60,
    minRam: 4096,
    size: '14.5 GB',
    status: 'active',
    visibility: 'private',
    os: 'Windows Server',
    createdAt: '2026-07-20 08:12:05',
  },
  {
    key: '5',
    id: '1234abcd-5678-90ef-1122-334455667788',
    name: 'CirrOS 0.6.2 (Test Tiny Image)',
    format: 'QCOW2',
    minDisk: 1,
    minRam: 512,
    size: '16.0 MB',
    status: 'active',
    visibility: 'public',
    os: 'CirrOS',
    createdAt: '2026-06-01 12:00:00',
  },
];

export function useImages() {
  const [images, setImages] = useState(DEMO_IMAGES);
  const [loading, setLoading] = useState(false);
  const [isLiveApi, setIsLiveApi] = useState(false);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await glanceApi.listImages();
      if (res && res.images && Array.isArray(res.images)) {
        const normalized = res.images.map((img) => ({
          key: img.id,
          id: img.id,
          name: img.name || img.id,
          format: (img.disk_format || 'RAW').toUpperCase(),
          minDisk: img.min_disk || 0,
          minRam: img.min_ram || 0,
          size: img.size ? `${(img.size / 1024 / 1024 / 1024).toFixed(1)} GB` : '0 GB',
          status: img.status || 'active',
          visibility: img.visibility || 'public',
          os: img.os_distro || img.name || 'Linux',
          createdAt: img.created_at ? img.created_at.replace('T', ' ').substring(0, 19) : '',
        }));
        setImages(normalized);
        setIsLiveApi(true);
      } else {
        setIsLiveApi(false);
      }
    } catch {
      setIsLiveApi(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const deleteImage = useCallback(async (id) => {
    try {
      if (isLiveApi) {
        await glanceApi.deleteImage(id);
        message.success('Đã xóa Image khỏi OpenStack Glance!');
        await fetchImages();
      } else {
        setImages((prev) => prev.filter((i) => i.id !== id));
        message.success('Đã xóa Image thành công!');
      }
      return true;
    } catch (err) {
      message.error(`Lỗi xóa image: ${err.message}`);
      return false;
    }
  }, [isLiveApi, fetchImages]);

  return {
    images,
    loading,
    isLiveApi,
    refetch: fetchImages,
    deleteImage,
  };
}
