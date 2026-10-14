import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Form, Input, Button, Alert, Select } from 'antd';
import { skylineApi } from '@/api/skyline';
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { useAuthStore, formatErrorMessage } from '@/store/authStore';
import { useTranslation } from '@/core/i18n';
import { PASSWORD_INFO_KEY } from '@/pages/UserCenter/ChangePassword';

const PASSWORD_EXPIRED = 'The password is expired and needs to be changed for user';

/** legacy getUsernameAndDomain: "<username>" or "<username>@<domain>" (e-mail usernames keep the domain field) */
export const splitUsernameDomain = (raw = '', fallbackDomain = 'Default') => {
  const value = String(raw).trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { username: value, domain: fallbackDomain };
  const at = value.lastIndexOf('@');
  return at > 0
    ? { username: value.slice(0, at), domain: value.slice(at + 1) || fallbackDomain }
    : { username: value, domain: fallbackDomain };
};

/** legacy Login getErrorMessage: friendly texts for common keystone failures */
const friendlyLoginError = (message, t) => {
  const msg = String(message || '');
  if (msg.includes('The account is locked for user')) {
    return t('Frequent login failure will cause the account to be temporarily locked, please operate after 5 minutes');
  }
  if (msg.includes('The account is disabled for user')) {
    return t('The user has been disabled, please contact the administrator');
  }
  if (msg.includes('You are not authorized for any projects or domains')) {
    return t(
      'If you are not authorized to access any project, or if the project you are involved in has been deleted or disabled, contact the platform administrator to reassign the project'
    );
  }
  if (msg.includes('requires authentication') || msg.includes('(HTTP 401)')) {
    return t('Username or password is incorrect');
  }
  if (msg === 'invalid_totp') return t('Invalid TOTP code. Please try again.');
  if (msg === 'receipt_expired') return t('Session expired. Please log in again.');
  // keep transport failures readable; legacy answered every other failure with this text
  if (!msg || /network error|timeout|ECONN|failed to fetch|status code 5\d\d|HTTP 5\d\d|server connection/i.test(msg)) return msg || t('Login Failed');
  return t('Username or password is incorrect');
};

export default function Login() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { login, loginTotp } = useAuthStore();
  // legacy login: region select when several regions exist; TOTP passcode step for 2FA users
  const [regions, setRegions] = useState([]);
  const [totp, setTotp] = useState(null); // { receipt, domain, username }
  const [passcode, setPasscode] = useState('');
  // legacy: default domain from skyline /config, SSO login types from /sso
  const [defaultDomain, setDefaultDomain] = useState('Default');
  const [sso, setSso] = useState({ enable_sso: false, protocols: [] });
  const [loginType, setLoginType] = useState('password');

  useEffect(() => {
    skylineApi
      .getRegions()
      .then((res) => setRegions(Array.isArray(res) ? res : []))
      .catch(() => setRegions([]));
    skylineApi
      .getConfig()
      .then((res) => {
        if (res?.default_domain) {
          setDefaultDomain(res.default_domain);
          if (!form.getFieldValue('domain')) form.setFieldsValue({ domain: res.default_domain });
        }
      })
      .catch(() => {});
    skylineApi
      .getSSO()
      .then((res) => setSso({ enable_sso: Boolean(res?.enable_sso), protocols: res?.protocols || [] }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ssoOptions = sso.enable_sso
    ? [
        { value: 'password', label: t('Keystone Credentials') },
        ...sso.protocols.map((it) => ({
          value: it.url,
          label: it.label || (it.protocol === 'openid' ? t('OpenID Connect') : it.protocol),
        })),
      ]
    : [];

  const handleTotpLogin = async () => {
    if (!/^\d{6}$/.test(passcode)) {
      setErrorMsg(t('Please enter the 6-digit passcode'));
      return;
    }
    setLoading(true);
    setErrorMsg('');
    const res = await loginTotp({ ...totp, passcode });
    setLoading(false);
    if (res.success) {
      navigate(redirectUrl, { replace: true });
    } else if (res.code === 'receipt_expired') {
      // legacy: the receipt expired -> back to the password step
      setTotp(null);
      setPasscode('');
      setErrorMsg(t('Session expired. Please log in again.'));
    } else {
      setErrorMsg(t('Invalid TOTP code. Please try again.'));
    }
  };
  const redirectUrl = searchParams.get('redirect') || '/base/overview';

  const handlePasswordLogin = async (values) => {
    if (loginType !== 'password') {
      // legacy SSO: hand over to the identity provider
      document.location.href = loginType;
      return;
    }
    setLoading(true);
    setErrorMsg('');
    // "user@domain" in the username box overrides the domain box (legacy single-field login)
    const { username, domain } = splitUsernameDomain(values.username, values.domain || defaultDomain);
    try {
      const res = await login({
        domain,
        username,
        password: values.password,
        region: values.region,
      });

      if (res.totpRequired) {
        setTotp({ receipt: res.receipt, domain, username });
        setPasscode('');
        return;
      }
      if (res.success) {
        navigate(redirectUrl, { replace: true });
      } else {
        const msg = typeof res.error === 'string' ? res.error : formatErrorMessage(res.error);
        if (msg && msg.includes(PASSWORD_EXPIRED)) {
          // legacy dealWithChangePassword: "...for user: <user_id>. ..." -> change-password page
          const userId = msg.split(':')[1]?.trim().split('.')[0];
          sessionStorage.setItem(PASSWORD_INFO_KEY, JSON.stringify({ userId, oldPassword: values.password }));
          navigate('/auth/change-password', { state: { userId, oldPassword: values.password } });
          return;
        }
        setErrorMsg(friendlyLoginError(msg, t));
      }
    } catch (err) {
      setErrorMsg(friendlyLoginError(formatErrorMessage(err), t));
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
          message={t('Your OpenStack session has expired. Please log in again to continue.')}
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

      {totp ? (
        <div>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
            message={t('Two-Factor Authentication')}
            description={t('Enter the passcode from your authenticator app for user {name}.', { name: totp.username })}
          />
          <Input
            autoFocus
            size="large"
            maxLength={6}
            value={passcode}
            placeholder="123456"
            prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
            onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
            onPressEnter={handleTotpLogin}
            style={{ borderRadius: 8, letterSpacing: 4 }}
          />
          <Button type="primary" size="large" block loading={loading} onClick={handleTotpLogin} style={{ marginTop: 16, height: 44, borderRadius: 8, fontWeight: 600 }}>
            {t('Verify')}
          </Button>
          <Button type="link" block onClick={() => setTotp(null)} style={{ marginTop: 8 }}>
            {t('Back to login')}
          </Button>
        </div>
      ) : (
      <Form
        form={form}
        layout="vertical"
        onFinish={handlePasswordLogin}
        initialValues={{
          domain: defaultDomain,
          username: '',
          password: '',
        }}
        requiredMark={false}
      >
        {ssoOptions.length > 0 && (
          <Form.Item
            label={t('Login Type')}
            extra={t('If you are not sure which authentication method to use, please contact your administrator.')}
          >
            <Select size="large" value={loginType} onChange={setLoginType} options={ssoOptions} />
          </Form.Item>
        )}

        {loginType === 'password' && regions.length > 1 && (
          <Form.Item label={t('Region')} name="region" initialValue={regions[0]}>
            <Select size="large" options={regions.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
        )}

        {loginType === 'password' && (
          <>
        <Form.Item
          label={t('Domain')}
          name="domain"
          rules={[{ required: true, message: t('Please input your Domain!') }]}
          extra={
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {t('Tips: If no domain is provided, the configured default domain "{domain}" will be used.', {
                domain: defaultDomain,
              })}
            </span>
          }
        >
          <Input
            prefix={<GlobalOutlined style={{ color: '#94a3b8' }} />}
            placeholder={defaultDomain}
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
          </>
        )}

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
      )}
    </div>
  );
}
