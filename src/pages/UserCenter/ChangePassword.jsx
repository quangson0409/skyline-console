import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Space, message } from 'antd';
import { InfoCircleFilled } from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { keystoneApi } from '@/api/keystone';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import { getProfile } from '@/pages/Identity/common';
import { passwordRule, confirmPasswordRule } from '@/components/form/rules';

/**
 * Key used to hand the expired-password context from the login page to this page
 * (legacy rootStore.setPasswordInfo({ userId, oldPassword })). Also accepted via location.state.
 */
export const PASSWORD_INFO_KEY = 'skyline_password_info';

const readPasswordInfo = (state) => {
  if (state?.userId && state?.oldPassword) return state;
  try {
    const raw = sessionStorage.getItem(PASSWORD_INFO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getCount = (word) => {
  try {
    return word.split('be unique is ')[1].split('.')[0];
  } catch {
    return 0;
  }
};

/** legacy getErrorWord */
const getErrorWord = (word) => {
  if (!word) return t('Reset failed, please retry');
  if (word.indexOf('The new password cannot be identical to a previous password.') >= 0) {
    const num = getCount(word);
    if (!num) return t('The password must not be the same as the previous');
    if (num === '2') return t('The password must not be the same as the previous two');
    return t('The password must not be the same as the previous {num}', { num });
  }
  return t('Reset failed, please retry');
};

/**
 * Port of legacy auth/containers/ChangePassword.
 *  - expired-password flow: userId + old password handed over by login -> only new password asked
 *  - signed-in user (user center): asks the current password too
 */
export default function ChangePassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [form] = Form.useForm();
  const [info] = useState(() => readPasswordInfo(location.state));
  const [userId, setUserId] = useState(info?.userId || '');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const expiredFlow = Boolean(info?.userId && info?.oldPassword);

  useEffect(() => {
    if (expiredFlow) return;
    getProfile().then((p) => setUserId(p?.user?.id || ''));
  }, [expiredFlow]);

  useEffect(
    () => () => {
      try {
        sessionStorage.removeItem(PASSWORD_INFO_KEY);
      } catch {
        // ignore
      }
    },
    []
  );

  const onFinish = async ({ oldPassword, password }) => {
    setLoading(true);
    setError(null);
    try {
      await keystoneApi.changePassword(userId, expiredFlow ? info.oldPassword : oldPassword, password);
      message.success(t('Password changed successfully, please log in again.'));
      try {
        sessionStorage.removeItem(PASSWORD_INFO_KEY);
      } catch {
        // ignore
      }
      await logout(true);
      navigate('/auth/login');
    } catch (err) {
      setError(getErrorWord(err?.response?.data?.error?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>
        {t('Update Password')}
      </h1>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        {expiredFlow ? (
          <div style={{ marginBottom: 16, color: '#b45309' }}>
            <InfoCircleFilled style={{ marginRight: 8 }} />
            {t('User need to change password')}
          </div>
        ) : null}
        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
        <Form form={form} layout="vertical" size="large" onFinish={onFinish} scrollToFirstError>
          {!expiredFlow ? (
            <Form.Item
              name="oldPassword"
              label={t('Current Password')}
              rules={[{ required: true, message: t('Please input your current password!') }]}
            >
              <Input.Password placeholder={t('Current Password')} autoComplete="current-password" />
            </Form.Item>
          ) : null}
          <Form.Item
            name="password"
            label={t('Password')}
            dependencies={['oldPassword']}
            rules={[
              { required: true, message: t('Please input your password!') },
              passwordRule({ oldPasswordField: 'oldPassword', withoutPrefix: true }),
            ]}
          >
            <Input.Password placeholder={t('Password')} autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t('Confirm Password')}
            dependencies={['password']}
            rules={[
              { required: true, message: t('Please confirm your password!') },
              confirmPasswordRule({ withoutPrefix: true }),
            ]}
          >
            <Input.Password placeholder={t('Confirm Password')} autoComplete="new-password" />
          </Form.Item>
          <Space size="large">
            <Button type="primary" htmlType="submit" loading={loading} disabled={!userId}>
              {t('Confirm')}
            </Button>
            {expiredFlow ? (
              <Link to="/auth/login">{t('Back to login page')}</Link>
            ) : (
              <Button onClick={() => navigate(-1)}>{t('Cancel')}</Button>
            )}
          </Space>
        </Form>
      </Card>
    </div>
  );
}
