import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Form, Input, Button, Alert } from 'antd';
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { useAuthStore, formatErrorMessage } from '@/store/authStore';
import { useTranslation } from '@/core/i18n';

export default function Login() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { login } = useAuthStore();
  const redirectUrl = searchParams.get('redirect') || '/base/overview';

  const handlePasswordLogin = async (values) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await login({
        domain: values.domain || 'Default',
        username: values.username,
        password: values.password,
      });

      if (res.success) {
        navigate(redirectUrl, { replace: true });
      } else {
        const msg = typeof res.error === 'string' ? res.error : formatErrorMessage(res.error);
        setErrorMsg(msg || t('Login Failed'));
      }
    } catch (err) {
      setErrorMsg(formatErrorMessage(err) || t('Login Failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Brand Header */}
      <div style={{ marginBottom: 28, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #0068ff, #004ecc)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 104, 255, 0.35)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 18 L12 6 L20 18 Z" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="2.2" fill="#ffffff" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: -0.4 }}>
              <span style={{ color: '#0068ff' }}>Skyline</span> Console
            </div>
          </div>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', color: '#0f172a' }}>
          {t('Welcome to Skyline Console')}
        </h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          {t('Sign in to access your cloud resources')}
        </p>
      </div>

      {/* Session Expired Notice */}
      {searchParams.get('expired') === '1' && (
        <Alert
          type="warning"
          showIcon
          message={t('Phiên làm việc OpenStack đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.')}
          style={{ marginBottom: 16, borderRadius: 8 }}
          closable
        />
      )}

      {/* Error Alert */}
      {errorMsg && (
        <Alert
          type="error"
          showIcon
          message={typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)}
          style={{ marginBottom: 16, borderRadius: 8 }}
          closable
          onClose={() => setErrorMsg('')}
        />
      )}

      {/* Login Form */}
      <Form
        form={form}
        layout="vertical"
        onFinish={handlePasswordLogin}
        initialValues={{
          domain: 'Default',
          username: 'admin',
          password: '',
        }}
        requiredMark={false}
      >
        <Form.Item
          label={t('Domain')}
          name="domain"
          rules={[{ required: true, message: t('Please input your Domain!') }]}
          extra={<span style={{ fontSize: 11, color: '#94a3b8' }}>{t('Default Domain Tips')}</span>}
        >
          <Input
            prefix={<GlobalOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Default"
            size="large"
            style={{ borderRadius: 8 }}
          />
        </Form.Item>

        <Form.Item
          label={t('Username')}
          name="username"
          rules={[{ required: true, message: t('Please input your Username!') }]}
        >
          <Input
            prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
            placeholder={t('Username')}
            size="large"
            style={{ borderRadius: 8 }}
          />
        </Form.Item>

        <Form.Item
          label={t('Password')}
          name="password"
          rules={[{ required: true, message: t('Please input your Password!') }]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
            placeholder={t('Password')}
            size="large"
            style={{ borderRadius: 8 }}
          />
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          block
          loading={loading}
          style={{
            backgroundColor: '#0068ff',
            borderRadius: 8,
            fontWeight: 600,
            height: 44,
            marginTop: 12,
          }}
        >
          {loading ? t('Connecting...') : t('Log In')}
        </Button>
      </Form>
    </div>
  );
}
