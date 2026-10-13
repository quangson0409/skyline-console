import { lazy } from 'react';

// Barbican - port of legacy pages/barbican (key-manager/*) and pages/network/containers/Certificate
const SecretList = lazy(() => import('@/pages/KeyManager/Secret/SecretList'));
const SecretDetail = lazy(() => import('@/pages/KeyManager/Secret/SecretDetail'));
const CertificateList = lazy(() => import('@/pages/Network/Certificate/CertificateList'));
const CertificateContainerDetail = lazy(() => import('@/pages/Network/Certificate/CertificateContainerDetail'));
const CertificateSecretDetail = lazy(() => import('@/pages/Network/Certificate/CertificateSecretDetail'));

export default [
  { path: 'key-manager/secret', component: SecretList },
  { path: 'key-manager/secret/detail/:id', component: SecretDetail },
  { path: 'network/certificate', component: CertificateList },
  { path: 'network/certificate-container/detail/:id', component: CertificateContainerDetail },
  { path: 'network/certificate-secret/detail/:id', component: CertificateSecretDetail },
];
