import React from 'react';
import { DatePicker } from 'antd';
import { barbicanApi, refId } from '@/api/barbican';
import { t } from '@/core/i18n';
import { TextareaFromFile, toIso, disabledPastDate } from '@/pages/KeyManager/common';
import { noChineseRule } from '@/components/form/rules';
import { certificateMode } from './common';

/** Port of legacy pages/network/containers/Certificate/actions */

const DOMAIN_RE = /^[a-zA-Z0-9]([-a-zA-Z0-9]{0,62}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([-a-zA-Z0-9]{0,62}[a-zA-Z0-9])?)*$/;

const validateDomain = (_rule, value) => {
  if ([undefined, null, ''].includes(value)) return Promise.resolve();
  const domains = value.split(',');
  const allCorrect = domains.every((it) => it.length <= 100 && DOMAIN_RE.test(it));
  if (domains.length > 30 || !allCorrect) {
    return Promise.reject(new Error(t('Please enter a correct domain, format is refer to the left tip!')));
  }
  return Promise.resolve();
};

const certificateContentTip = () => (
  <div>
    <p style={{ margin: '4px 0' }}>
      {t(
        'The certificate contains information such as the public key and signature of the certificate. The extension of the certificate is "pem" or "crt", you can directly enter certificate content or upload certificate file.'
      )}
    </p>
    <p style={{ margin: '4px 0' }}>
      {t('It is recommended to refer to the following description format, otherwise it may not be effective')}
    </p>
    <p style={{ margin: '4px 0' }}>
      {t(
        'The format of the certificate content is: by "----BEGIN CERTIFICATE-----" as the beginning,"-----END CERTIFICATE----" as the end, 64 characters per line, the last line does not exceed 64 characters, and there cannot be blank lines.'
      )}
    </p>
  </div>
);

const certificateKeyPairTip = () => (
  <div>
    <p style={{ margin: '4px 0' }}>
      {t(
        'The private key of the certificate, the extension of the private key is "key", you can directly enter the content of the private key file or upload a private key that conforms to the format document.'
      )}
    </p>
    <p style={{ margin: '4px 0' }}>
      {t('It is recommended to refer to the following description format, otherwise it may not be effective')}
    </p>
    <p style={{ margin: '4px 0' }}>
      {t(
        'The private key content format is: with "-----BEGIN RSA PRIVATE KEY-----" as the beginning,"-----END RSA PRIVATE KEY-----" as the end, 64 characters per line, the last line does not exceed 64 characters, and there cannot be blank lines.'
      )}
    </p>
  </div>
);

/** legacy ContainersStore.create: one secret per part, then a "certificate" container */
const createCertificate = async (values) => {
  const commonData = {
    name: values.name,
    mode: values.mode,
    payload_content_type: 'text/plain',
    secret_type: 'certificate',
    algorithm: JSON.stringify({ domain: values.domain, expiration: toIso(values.expiration) }),
  };
  const jobs = [barbicanApi.createSecret({ ...commonData, payload: values.certificate })];
  if (values.mode === 'SERVER') {
    jobs.push(barbicanApi.createSecret({ ...commonData, payload: values.private_key }));
  }
  const [content, privateKey] = await Promise.all(jobs);
  const secretRefs = [{ name: 'certificate', secret_ref: content.secret_ref }];
  if (privateKey) secretRefs.push({ name: 'private_key', secret_ref: privateKey.secret_ref });
  return barbicanApi.createContainer({ type: 'certificate', name: values.name, secret_refs: secretRefs });
};

/** mode: current tab (SERVER / CA) */
export const createCertificateAction = (mode = 'SERVER') => ({
  id: 'create-certificate',
  type: 'modal',
  policy: ['secrets:post', 'containers:post'],
  title: t('Create Certificate'),
  width: 800,
  getDefaultValues: () => ({ mode }),
  getFormItems: () => [
    { name: 'name', label: t('Certificate Name'), type: 'input', required: true, rules: [noChineseRule()] },
    {
      name: 'mode',
      label: t('Certificate Type'),
      type: 'radio',
      options: Object.entries(certificateMode())
        .filter(([value]) => value === mode)
        .map(([value, label]) => ({ value, label })),
    },
    {
      name: 'certificate',
      label: t('Certificate Content'),
      required: true,
      tip: certificateContentTip(),
      render: () => <TextareaFromFile accept=".crt,.pem" placeholder={t('PEM encoding')} rows={6} />,
    },
    mode === 'SERVER' && {
      name: 'private_key',
      label: t('Private Key'),
      required: true,
      tip: certificateKeyPairTip(),
      render: () => <TextareaFromFile accept=".key,.pem" placeholder={t('PEM encoding')} rows={6} />,
    },
    mode !== 'CA' && {
      name: 'domain',
      label: t('Domain Name'),
      type: 'textarea',
      rows: 3,
      placeholder: t('Please input'),
      rules: [{ max: 1024 }, { validator: validateDomain }],
      tip: (
        <div>
          <div>
            {t(
              'The domain name can only be composed of letters, numbers, dashes, in A dash cannot be at the beginning or end, and a single string cannot exceed more than 63 characters, separated by dots; At most can support 30 domain names, separated by commas;The length of a single domain name does not exceed 100 characters, and the total length degree does not exceed 1024 characters.'
            )}
          </div>
          <div>{t('If it is an SNI type certificate, a domain name needs to be specified')}</div>
        </div>
      ),
    },
    {
      name: 'expiration',
      label: t('Expires At'),
      render: () => <DatePicker showNow={false} disabledDate={disabledPastDate} style={{ width: '100%' }} />,
    },
  ].filter(Boolean),
  onSubmit: (values) => createCertificate({ ...values, mode: values.mode || mode }),
});

const runAll = async (target, fn) => {
  const list = Array.isArray(target) ? target : [target];
  for (const it of list) {
    // eslint-disable-next-line no-await-in-loop
    await fn(it);
  }
};

/** legacy DeleteContainer: delete every secret of the container, then the container */
export const deleteContainerAction = () => ({
  id: 'delete',
  type: 'confirm',
  policy: ['secret:delete', 'container:delete'],
  aliasPolicy: ['barbican:secret:delete', 'barbican:container:delete'],
  title: t('Delete Certificate'),
  actionName: t('delete certificate'),
  buttonText: t('Delete'),
  isDanger: true,
  allowed: (item) => !item.listener,
  onSubmit: (target) =>
    runAll(target, async (item) => {
      await Promise.all(
        (item.secret_refs || []).map((ref) => barbicanApi.deleteSecret(refId(ref.secret_ref, 'secrets')))
      );
      return barbicanApi.deleteContainer(item.id);
    }),
});

export const deleteCaSecretAction = () => ({
  id: 'delete',
  type: 'confirm',
  policy: 'secret:delete',
  title: t('Delete Certificate'),
  actionName: t('delete certificate'),
  buttonText: t('Delete'),
  isDanger: true,
  allowed: (item) => !item.listener,
  onSubmit: (target) => runAll(target, (item) => barbicanApi.deleteSecret(item.id)),
});
