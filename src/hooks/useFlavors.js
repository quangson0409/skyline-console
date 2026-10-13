import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { novaApi } from '@/api/nova';

const DEMO_FLAVORS = [
  { key: '1', id: '1', name: 'm1.tiny', vcpus: 1, ram: 512, disk: 1, swap: 0, isPublic: true },
  { key: '2', id: '2', name: 'm1.small', vcpus: 1, ram: 2048, disk: 20, swap: 0, isPublic: true },
  { key: '3', id: '3', name: 'm1.medium', vcpus: 2, ram: 4096, disk: 40, swap: 0, isPublic: true },
  { key: '4', id: '4', name: 'm1.large', vcpus: 4, ram: 8192, disk: 80, swap: 0, isPublic: true },
  { key: '5', id: '5', name: 'm1.xlarge', vcpus: 8, ram: 16384, disk: 160, swap: 0, isPublic: true },
  { key: '6', id: '6', name: 'm1.2xlarge', vcpus: 16, ram: 32768, disk: 320, swap: 0, isPublic: true },
  { key: '7', id: '7', name: 'g1.gpu', vcpus: 8, ram: 32768, disk: 200, swap: 0, isPublic: false },
];

export function useFlavors() {
  const [flavors, setFlavors] = useState(DEMO_FLAVORS);
  const [loading, setLoading] = useState(false);
  const [isLiveApi, setIsLiveApi] = useState(false);

  const fetchFlavors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await novaApi.listFlavors();
      if (res && res.flavors && Array.isArray(res.flavors)) {
        const normalized = res.flavors.map((f) => ({
          key: f.id,
          id: f.id,
          name: f.name,
          vcpus: f.vcpus,
          ram: f.ram,
          disk: f.disk,
          swap: f.swap || 0,
          isPublic: f['os-flavor-access:is_public'] ?? true,
        }));
        setFlavors(normalized);
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
    fetchFlavors();
  }, [fetchFlavors]);

  const createFlavor = useCallback(async (values) => {
    try {
      if (isLiveApi) {
        await novaApi.createFlavor({
          flavor: {
            name: values.name,
            vcpus: values.vcpus,
            ram: values.ram,
            disk: values.disk,
            'os-flavor-access:is_public': values.isPublic ?? true,
          },
        });
        message.success(`Đã tạo cấu hình Flavor ${values.name} lên OpenStack Nova!`);
        await fetchFlavors();
      } else {
        const newFlavor = {
          key: String(Date.now()),
          id: String(flavors.length + 1),
          name: values.name,
          vcpus: values.vcpus,
          ram: values.ram,
          disk: values.disk,
          swap: 0,
          isPublic: values.isPublic ?? true,
        };
        setFlavors((prev) => [...prev, newFlavor]);
        message.success(`Đã tạo cấu hình Flavor ${values.name} thành công!`);
      }
      return true;
    } catch (err) {
      message.error(`Lỗi tạo flavor: ${err.message}`);
      return false;
    }
  }, [isLiveApi, flavors, fetchFlavors]);

  const deleteFlavor = useCallback(async (id) => {
    try {
      if (isLiveApi) {
        await novaApi.deleteFlavor(id);
        message.success('Đã xóa flavor khỏi OpenStack Nova!');
        await fetchFlavors();
      } else {
        setFlavors((prev) => prev.filter((f) => f.id !== id));
        message.success('Đã xóa flavor thành công!');
      }
      return true;
    } catch (err) {
      message.error(`Lỗi xóa flavor: ${err.message}`);
      return false;
    }
  }, [isLiveApi, fetchFlavors]);

  return {
    flavors,
    loading,
    isLiveApi,
    refetch: fetchFlavors,
    createFlavor,
    deleteFlavor,
  };
}
