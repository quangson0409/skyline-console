import React from 'react';
import { Typography } from 'antd';
import { keystoneApi } from '@/api/keystone';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';

/**
 * Header avatar menu actions - port of legacy components/Layout/GlobalHeader
 * (Token.jsx, OpenRc.jsx, CloudsYaml.jsx) and resources/keystone/{openstack-rc,clouds-yaml}.
 */

const { Paragraph } = Typography;

const saveTextFile = (content, filename) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const getAuthContext = async () => {
  const { user, currentProject, currentRegion } = useAuthStore.getState();
  const catalog = await keystoneApi.getCatalog();
  const keystone = (catalog?.catalog || []).find((service) => service.name === 'keystone') || {};
  const publicEndpoint =
    (keystone.endpoints || []).find(
      (ep) => ep.interface === 'public' && (!ep.region || ep.region === currentRegion)
    ) || (keystone.endpoints || []).find((ep) => ep.interface === 'public');
  return {
    authUrl: (publicEndpoint?.url || '').replace(/\/v3\/?$/, ''),
    projectId: currentProject?.id || '',
    projectName: currentProject?.name || '',
    projectDomain: currentProject?.domainName || 'Default',
    userDomain: user?.domain || 'Default',
    userName: user?.username || '',
    region: currentRegion || '',
  };
};

const RC_HEADER =
  '#!/usr/bin/env bash\n' +
  '# To use an OpenStack cloud you need to authenticate against the Identity\n' +
  '# service named keystone, which returns a **Token** and **Service Catalog**.\n' +
  '# The catalog contains the endpoints for all services the user/tenant has\n' +
  '# access to - such as Compute, Image Service, Identity, Object Storage, Block\n' +
  '# Storage, and Networking (code-named nova, glance, keystone, swift,\n' +
  '# cinder, and neutron).\n' +
  '#\n' +
  '# *NOTE*: Using the 3 *Identity API* does not necessarily mean any other\n' +
  '# OpenStack API is version 3. For example, your cloud provider may implement\n' +
  '# Image API v1.1, Block Storage API v2, and Compute API v2.0. OS_AUTH_URL is\n' +
  '# only for the Identity API served through keystone.\n';

export const getPwdOpenRc = ({ authUrl, projectId, projectName, projectDomain, userDomain, userName, region }) =>
  `${RC_HEADER}` +
  `export OS_AUTH_URL=${authUrl}/v3/\n` +
  '\n' +
  '# With the addition of Keystone we have standardized on the term **project**\n' +
  '# as the entity that owns the resources.\n' +
  `export OS_PROJECT_ID=${projectId} \n` +
  `export OS_PROJECT_NAME=${projectName}\n` +
  `export OS_PROJECT_DOMAIN_NAME=${projectDomain}\n` +
  `export OS_USER_DOMAIN_NAME=${userDomain}\n` +
  '\n' +
  '# unset v2.0 items in case set\n' +
  'unset OS_TENANT_ID\n' +
  'unset OS_TENANT_NAME\n' +
  '# In addition to the owning entity (tenant), OpenStack stores the entity\n' +
  '# performing the action as the **user**.\n' +
  `export OS_USERNAME=${userName}\n` +
  '\n' +
  '# With Keystone you pass the keystone password.\n' +
  'echo "Please enter your OpenStack Password for project $OS_PROJECT_NAME as user $OS_USERNAME: "\n' +
  'read -sr OS_PASSWORD_INPUT\n' +
  'export OS_PASSWORD=$OS_PASSWORD_INPUT\n' +
  '# If your configuration has multiple regions, we set that information here.\n' +
  '# OS_REGION_NAME is optional and only valid in certain environments.\n' +
  `export OS_REGION_NAME=${region}\n` +
  '\n' +
  "# Don't leave a blank variable, unset it if it was empty\n" +
  'if [ -z "$OS_REGION_NAME" ]; then unset OS_REGION_NAME; fi\n' +
  'export OS_INTERFACE=public\n' +
  'export OS_IDENTITY_API_VERSION=3\n' +
  '\n' +
  '# If OS_AUTH_URL use private SSL, Please add CACERT file path \n' +
  '# export OS_CACERT={crtPath}';

export const getCredentialOpenRc = ({ authUrl, region }) =>
  `${RC_HEADER}` +
  `export OS_AUTH_URL=${authUrl}/v3/\n` +
  '\n' +
  '# With Keystone you pass the keystone password.\n' +
  'echo "Please enter your OpenStack Credential ID as OS_APPLICATION_CREDENTIAL_ID: "\n' +
  'read -sr OS_APPLICATION_CREDENTIAL_ID\n' +
  'export OS_APPLICATION_CREDENTIAL_ID=$OS_APPLICATION_CREDENTIAL_ID\n' +
  'echo "Please enter your OpenStack Credential Secret as OS_APPLICATION_CREDENTIAL_SECRET: "\n' +
  'read -sr OS_APPLICATION_CREDENTIAL_SECRET\n' +
  'export OS_APPLICATION_CREDENTIAL_SECRET=$OS_APPLICATION_CREDENTIAL_SECRET\n' +
  '\n' +
  "# Don't leave a blank variable, unset it if it was empty\n" +
  'if [ -z "$OS_REGION_NAME" ]; then unset OS_REGION_NAME; fi\n' +
  'export OS_INTERFACE=public\n' +
  'export OS_IDENTITY_API_VERSION=3\n' +
  'export OS_AUTH_TYPE=v3applicationcredential\n' +
  '# If your configuration has multiple regions, we set that information here.\n' +
  '# OS_REGION_NAME is optional and only valid in certain environments.\n' +
  `export OS_REGION_NAME=${region}\n` +
  '\n' +
  '# If OS_AUTH_URL use private SSL, Please add CACERT file path \n' +
  '# export OS_CACERT={crtPath}';

export const getPwdCloudsYaml = ({ authUrl, projectId, projectName, projectDomain, userDomain, userName, region }) =>
  `clouds:\n` +
  `  ${region || 'openstack'}:\n` +
  `    auth:\n` +
  `      auth_url: ${authUrl}\n` +
  `      project_id: ${projectId}\n` +
  `      project_name: ${projectName}\n` +
  `      project_domain_name: ${projectDomain}\n` +
  `      user_domain_name: ${userDomain}\n` +
  `      username: ${userName}\n` +
  `    region_name: ${region}\n` +
  `    interface: public\n` +
  `    identity_api_version: 3\n`;

export const getCredentialCloudsYaml = ({ authUrl, region }) =>
  `clouds:\n` +
  `  ${region || 'openstack'}:\n` +
  `    auth:\n` +
  `      auth_url: ${authUrl}\n` +
  `    auth_type: v3applicationcredential\n` +
  `    interface: public\n` +
  `    identity_api_version: 3\n` +
  `    region_name: ${region}\n`;

const typeField = () => ({
  name: 'type',
  label: t('Type'),
  type: 'select',
  required: true,
  options: [
    { label: t('Password Type'), value: 'password' },
    { label: t('Credential Type'), value: 'credential' },
  ],
});

export const openRcAction = () => ({
  id: 'get-openrc',
  type: 'modal',
  title: t('Get OpenRC file'),
  width: 520,
  defaultValue: { type: 'password' },
  getFormItems: () => [typeField()],
  onSubmit: async ({ type }) => {
    const ctx = await getAuthContext();
    saveTextFile(type === 'password' ? getPwdOpenRc(ctx) : getCredentialOpenRc(ctx), 'openrc.sh');
  },
});

export const cloudsYamlAction = () => ({
  id: 'get-clouds-yaml',
  type: 'modal',
  title: t('Get clouds.yaml file'),
  width: 520,
  defaultValue: { type: 'password' },
  getFormItems: () => [typeField()],
  onSubmit: async ({ type }) => {
    const ctx = await getAuthContext();
    saveTextFile(type === 'password' ? getPwdCloudsYaml(ctx) : getCredentialCloudsYaml(ctx), 'clouds.yaml');
  },
});

const leftTime = (expiresAt) => {
  const seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (Number.isNaN(seconds)) return '-';
  if (seconds < 60) return t('{seconds} seconds', { seconds });
  const minutes = Math.floor(seconds / 60);
  const leftSeconds = seconds % 60;
  if (minutes < 60) return t('{minutes} minutes {leftSeconds} seconds', { minutes, leftSeconds });
  const hours = Math.floor(minutes / 60);
  return t('{hours} hours {leftMinutes} minutes {leftSeconds} seconds', {
    hours,
    leftMinutes: minutes % 60,
    leftSeconds,
  });
};

export const tokenAction = () => ({
  id: 'get-token',
  type: 'modal',
  title: t('Get Token'),
  width: 640,
  okText: t('Close'),
  getFormItems: () => {
    const { token, expiresAt } = useAuthStore.getState();
    const expired = expiresAt && Date.now() > new Date(expiresAt).getTime();
    return [
      {
        name: 'tip',
        type: 'alert',
        alertType: expired ? 'error' : 'info',
        message: expired
          ? t('Token has expired, please log in again.')
          : `${t('Token remaining validity')}: ${leftTime(expiresAt)}`,
      },
      {
        name: 'token',
        label: t('Token'),
        render: () => (
          <Paragraph copyable code style={{ wordBreak: 'break-all', marginBottom: 0 }}>
            {token}
          </Paragraph>
        ),
      },
    ];
  },
  onSubmit: async () => undefined,
});
