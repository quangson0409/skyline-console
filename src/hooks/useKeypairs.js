import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import { novaApi } from '@/api/nova';

const DEMO_KEYPAIRS = [
  {
    key: '1',
    name: 'devops-prod-key',
    type: 'ssh',
    fingerprint: '4f:91:a8:bb:34:72:90:12:ef:aa:88:21:77:43:10:99',
    createdAt: '2026-09-10 14:22:10',
  },
  {
    key: '2',
    name: 'admin-rsa-4096',
    type: 'ssh',
    fingerprint: '11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00',
    createdAt: '2026-08-01 09:15:30',
  },
  {
    key: '3',
    name: 'k8s-node-auth',
    type: 'ssh',
    fingerprint: 'aa:bb:cc:dd:11:22:33:44:55:66:77:88:99:00:12:34',
    createdAt: '2026-10-02 11:45:00',
  },
];

export function useKeypairs() {
  const [keypairs, setKeypairs] = useState(DEMO_KEYPAIRS);
  const [loading, setLoading] = useState(false);
  const [isLiveApi, setIsLiveApi] = useState(false);

  const fetchKeypairs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await novaApi.listKeypairs();
      if (res && res.keypairs && Array.isArray(res.keypairs)) {
        const normalized = res.keypairs.map((item, index) => {
          const kp = item.keypair || item;
          return {
            key: kp.name || String(index),
            name: kp.name,
            type: kp.type || 'ssh',
            fingerprint: kp.fingerprint,
            createdAt: kp.created_at ? kp.created_at.replace('T', ' ').substring(0, 19) : '',
          };
        });
        setKeypairs(normalized);
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
    fetchKeypairs();
  }, [fetchKeypairs]);

  const createKeypair = useCallback(async (values) => {
    try {
      if (isLiveApi) {
        await novaApi.createKeypair({
          keypair: {
            name: values.name,
            public_key: values.publicKey || undefined,
            key_type: values.keyType || 'ssh',
          },
        });
        message.success(`Đã tạo Keypair ${values.name} lên OpenStack Nova!`);
        await fetchKeypairs();
      } else {
        const newKey = {
          key: String(Date.now()),
          name: values.name,
          type: values.keyType || 'ssh',
          fingerprint: '3b:44:a9:cc:88:77:66:55:44:33:22:11:00:ff:ee:dd',
          createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        };
        setKeypairs((prev) => [newKey, ...prev]);
        message.success(`Đã tạo khóa SSH ${values.name} thành công!`);
      }
      return true;
    } catch (err) {
      message.error(`Lỗi tạo keypair: ${err.message}`);
      return false;
    }
  }, [isLiveApi, fetchKeypairs]);

  const deleteKeypair = useCallback(async (name) => {
    try {
      if (isLiveApi) {
        await novaApi.deleteKeypair(name);
        message.success(`Đã xóa keypair ${name} khỏi OpenStack Nova!`);
        await fetchKeypairs();
      } else {
        setKeypairs((prev) => prev.filter((k) => k.name !== name));
        message.success(`Đã xóa khóa SSH ${name}!`);
      }
      return true;
    } catch (err) {
      message.error(`Lỗi xóa keypair: ${err.message}`);
      return false;
    }
  }, [isLiveApi, fetchKeypairs]);

  return {
    keypairs,
    loading,
    isLiveApi,
    refetch: fetchKeypairs,
    createKeypair,
    deleteKeypair,
  };
}
