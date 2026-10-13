import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Breadcrumb, Button, Card, Input, Popconfirm, QRCode, Space, Spin, Typography, message } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { keystoneApi } from '@/api/keystone';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import { getProfile } from '@/pages/Identity/common';

const { Title, Text, Paragraph } = Typography;

/* ---- legacy stores/keystone/totp.js helpers ---- */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSeed() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let output = '';
  for (let i = 0; i < bytes.length; i += 5) {
    const b = [0, 1, 2, 3, 4].map((j) => (i + j < bytes.length ? bytes[i + j] : 0));
    output += BASE32[Math.floor(b[0] / 8)];
    output += BASE32[(b[0] % 8) * 4 + Math.floor(b[1] / 64)];
    output += BASE32[Math.floor(b[1] / 2) % 32];
    output += BASE32[(b[1] % 2) * 16 + Math.floor(b[2] / 16)];
    output += BASE32[(b[2] % 16) * 2 + Math.floor(b[3] / 128)];
    output += BASE32[Math.floor(b[3] / 4) % 32];
    output += BASE32[(b[3] % 4) * 8 + Math.floor(b[4] / 32)];
    output += BASE32[b[4] % 32];
  }
  return output;
}

function base32Decode(base32) {
  const str = base32.toUpperCase().replace(/=+$/, '');
  const bytes = [];
  for (let i = 0; i < str.length; i += 8) {
    const c = Array.from({ length: 8 }, (_, j) => {
      const idx = BASE32.indexOf(str[i + j] || 'A');
      return idx === -1 ? 0 : idx;
    });
    bytes.push(c[0] * 8 + Math.floor(c[1] / 4));
    bytes.push((c[1] % 4) * 64 + c[2] * 2 + Math.floor(c[3] / 16));
    bytes.push((c[3] % 16) * 16 + Math.floor(c[4] / 2));
    bytes.push((c[4] % 2) * 128 + c[5] * 4 + Math.floor(c[6] / 8));
    bytes.push((c[6] % 8) * 32 + c[7]);
  }
  return new Uint8Array(bytes);
}

async function verifyTotpCode(seed, code) {
  if (!code || code.length !== 6) return false;
  const key = await crypto.subtle.importKey('raw', base32Decode(seed), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000 / 30);
  const otps = await Promise.all(
    [now - 1, now, now + 1].map(async (counter) => {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setUint32(4, counter, false);
      const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
      const offset = hmac[19] % 16;
      const p = new DataView(hmac.buffer, offset, 4);
      return String((p.getUint32(0) % 2147483648) % 1000000).padStart(6, '0');
    })
  );
  return otps.includes(code);
}

const buildOtpauthUrl = (seed, username) => {
  const issuer = 'OpenStack';
  const label = encodeURIComponent(`${issuer}:${username}`);
  return `otpauth://totp/${label}?secret=${seed}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
};

/**
 * legacy TOTPConfig. targetUserId/targetUsername + isAdminView are used by the admin user detail tab;
 * without them the current user (from the skyline profile) is managed.
 */
export function TOTPConfig({ targetUserId, targetUsername, isAdminView = false }) {
  const { hasAdminRole } = useAuthStore();
  const [self, setSelf] = useState({ id: '', name: '' });
  const [state, setState] = useState({ credentials: [], isLoading: true, mfaEnabled: false });
  const [mfaLoading, setMfaLoading] = useState(false);
  const [pendingSeed, setPendingSeed] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState(false);
  const fetchId = useRef(0);

  const userId = targetUserId || self.id;
  const username = targetUsername || self.name || 'user';
  const isAdmin = isAdminView || !!hasAdminRole;

  useEffect(() => {
    if (targetUserId) return;
    getProfile().then((p) => setSelf({ id: p?.user?.id || '', name: p?.user?.name || '' }));
  }, [targetUserId]);

  const fetchCredentials = useCallback(async () => {
    if (!userId) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    fetchId.current += 1;
    const id = fetchId.current;
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const [credRes, userRes] = await Promise.all([
        keystoneApi.listCredentials({ type: 'totp', user_id: userId }),
        keystoneApi.getUser(userId),
      ]);
      if (id !== fetchId.current) return;
      const user = userRes?.user;
      const rules = user?.options?.multi_factor_auth_rules || [];
      const totpInRules = rules.some((rule) => Array.isArray(rule) && rule.includes('totp'));
      setState({
        credentials: credRes?.credentials || [],
        mfaEnabled: user?.options?.multi_factor_auth_enabled === true && totpInRules,
        isLoading: false,
      });
    } catch {
      if (id !== fetchId.current) return;
      setState((s) => ({ ...s, isLoading: false }));
      message.error(t('Failed to load TOTP credentials.'));
    }
  }, [userId]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const onVerifyAndSave = async () => {
    setVerifyLoading(true);
    setVerifyError(false);
    try {
      const ok = await verifyTotpCode(pendingSeed, verifyCode.trim());
      if (!ok) {
        setVerifyLoading(false);
        setVerifyError(true);
        return;
      }
      await keystoneApi.createCredential({ type: 'totp', user_id: userId, blob: pendingSeed });
      message.success(t('TOTP authenticator saved. It will be required at your next login.'));
      setPendingSeed(null);
      setVerifyCode('');
      setVerifyLoading(false);
      await fetchCredentials();
    } catch {
      message.error(t('Failed to create TOTP credential.'));
      setVerifyLoading(false);
    }
  };

  const onToggleMfa = async () => {
    setMfaLoading(true);
    try {
      if (state.mfaEnabled) {
        await keystoneApi.updateUser(userId, {
          options: { multi_factor_auth_enabled: false, multi_factor_auth_rules: [] },
        });
        message.success(t('Two-factor authentication disabled.'));
      } else {
        await keystoneApi.updateUser(userId, {
          options: {
            multi_factor_auth_enabled: true,
            multi_factor_auth_rules: [['password', 'totp'], ['application_credential']],
          },
        });
        message.success(t('Two-factor authentication enabled.'));
      }
      await fetchCredentials();
    } catch {
      message.error(t('Failed to update MFA settings.'));
    } finally {
      setMfaLoading(false);
    }
  };

  const onDelete = async (credentialId) => {
    try {
      await keystoneApi.deleteCredential(credentialId);
      message.success(t('TOTP credential deleted.'));
      await fetchCredentials();
    } catch {
      message.error(t('Failed to delete TOTP credential.'));
    }
  };

  const { credentials, mfaEnabled, isLoading } = state;
  const hasCredential = credentials.length > 0;

  return (
    <Card variant="borderless" style={{ borderRadius: 8 }}>
      <Title level={4} style={{ marginTop: 0 }}>
        {t('Two-Factor Authentication (TOTP)')}
      </Title>
      <Paragraph>
        {t(
          'Time-based One-Time Passwords (TOTP) add an extra layer of security to your account. After entering your password, you will be prompted for a 6-digit code from your authenticator app.'
        )}
      </Paragraph>
      <Spin spinning={isLoading}>
        <div style={{ marginBottom: 16 }}>
          <Space wrap>
            {mfaEnabled ? (
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
            ) : (
              <CloseCircleOutlined style={{ color: '#d2d2d2' }} />
            )}
            <Text strong>
              {mfaEnabled ? t('Two-factor authentication is enabled') : t('Two-factor authentication is disabled')}
            </Text>
            {isAdmin ? (
              <Button
                size="small"
                type={mfaEnabled ? 'default' : 'primary'}
                danger={mfaEnabled}
                loading={mfaLoading}
                disabled={!hasCredential && !mfaEnabled}
                onClick={onToggleMfa}
              >
                {mfaEnabled ? t('Disable 2FA') : t('Enable 2FA')}
              </Button>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('Contact an administrator to enable or disable 2FA.')}
              </Text>
            )}
          </Space>
          {isAdmin && !hasCredential && !mfaEnabled ? (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{t('Add a TOTP authenticator before enabling 2FA.')}</Text>
            </div>
          ) : null}
        </div>

        {!hasCredential ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('No TOTP authenticator configured.')}
            description={t('Click "Add TOTP Authenticator" to set up two-factor authentication.')}
          />
        ) : (
          <div style={{ marginBottom: 16 }}>
            <Title level={5}>{t('Active TOTP Authenticators')}</Title>
            {credentials.map((cred) => {
              const isLastWithMfa = mfaEnabled && credentials.length === 1;
              return (
                <div key={cred.id} style={{ padding: '6px 0' }}>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text>{t('TOTP Authenticator')}</Text>
                    <Text type="secondary">({String(cred.id).substring(0, 8)}…)</Text>
                    <Popconfirm
                      title={t('Delete this TOTP authenticator?')}
                      description={
                        isLastWithMfa
                          ? t('Disable 2FA before deleting the last authenticator.')
                          : t('You will need to set up TOTP again after deletion.')
                      }
                      onConfirm={isLastWithMfa ? undefined : () => onDelete(cred.id)}
                      okButtonProps={{ disabled: isLastWithMfa, danger: true }}
                      okText={t('Delete')}
                      cancelText={t('Cancel')}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />} size="small">
                        {t('Delete')}
                      </Button>
                    </Popconfirm>
                  </Space>
                </div>
              );
            })}
          </div>
        )}

        {!pendingSeed ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!userId}
            onClick={() => {
              setPendingSeed(generateTotpSeed());
              setVerifyCode('');
              setVerifyError(false);
            }}
          >
            {t('Add TOTP Authenticator')}
          </Button>
        ) : (
          <div>
            <Alert type="warning" showIcon message={t('Save this QR code now — it will not be shown again.')} />
            <Title level={5} style={{ marginTop: 16 }}>
              {t('Scan this QR Code with your authenticator app')}
            </Title>
            <Paragraph type="secondary">{t('Use Google Authenticator, Authy, or any TOTP-compatible app.')}</Paragraph>
            <QRCode value={buildOtpauthUrl(pendingSeed, username)} size={200} errorLevel="M" bgColor="#ffffff" />
            <Paragraph style={{ marginTop: 12 }}>
              <Text type="secondary">{t('Or enter the secret manually:')}</Text>
              <br />
              <Text copyable code>
                {pendingSeed}
              </Text>
            </Paragraph>
            <Paragraph strong>{t('Enter the 6-digit code from your app to confirm setup:')}</Paragraph>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Input
                placeholder={t('TOTP Code')}
                maxLength={6}
                autoComplete="one-time-code"
                value={verifyCode}
                onChange={(e) => {
                  setVerifyCode(e.target.value.replace(/\D/g, ''));
                  setVerifyError(false);
                }}
                onPressEnter={verifyCode.length === 6 ? onVerifyAndSave : undefined}
                style={{ width: 160 }}
                status={verifyError ? 'error' : ''}
              />
              {verifyError ? <Text type="danger">{t('Invalid TOTP code. Please try again.')}</Text> : null}
              <Space>
                <Button
                  type="primary"
                  icon={<SafetyCertificateOutlined />}
                  loading={verifyLoading}
                  disabled={verifyCode.length !== 6}
                  onClick={onVerifyAndSave}
                >
                  {t('Verify & Save')}
                </Button>
                <Button
                  onClick={() => {
                    setPendingSeed(null);
                    setVerifyCode('');
                    setVerifyError(false);
                  }}
                >
                  {t('Cancel')}
                </Button>
              </Space>
            </Space>
          </div>
        )}
      </Spin>
    </Card>
  );
}

export default function TOTPPage() {
  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={[{ title: t('User Center') }, { title: t('Two-Factor Authentication') }]} style={{ marginBottom: 16, fontSize: 13 }} />
      <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>
        {t('Two-Factor Authentication')}
      </h1>
      <TOTPConfig />
    </div>
  );
}
