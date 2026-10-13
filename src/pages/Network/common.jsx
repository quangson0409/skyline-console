/**
 * Shared helpers for the Neutron network pages (ports of legacy resources/neutron/*.jsx
 * and common option loaders used across Port / Router / Network / VPN / Firewall pages).
 * Page modules may add their own local helpers; keep this file generic.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import { novaApi } from '@/api/nova';
import { t } from '@/core/i18n';

export const adminSuffix = (isAdmin) => (isAdmin ? '-admin' : '');

/** `/network/<base>[-admin]/detail/<id>` */
export const detailPath = (baseName, id, isAdmin) => `/network/${baseName}${adminSuffix(isAdmin)}/detail/${id}`;

export const networkStatus = () => ({
  ACTIVE: t('Active'),
  BUILD: t('Build'),
  DOWN: t('Down'),
  ERROR: t('Error'),
});

export const adminStateOptions = () => [
  { value: true, label: t('Up') },
  { value: false, label: t('Down') },
];

export const adminStateText = (v) => (v ? t('Up') : t('Down'));

export const ipVersionOptions = () => [
  { value: 4, label: 'IPv4' },
  { value: 6, label: 'IPv6' },
];

/* ---------------- IP validation (legacy utils/validate) ---------------- */
const ipv4Re = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
export const isIPv4 = (v) => ipv4Re.test(String(v || '').trim());
export const isIPv6 = (v) => {
  const s = String(v || '').trim();
  if (!s.includes(':')) return false;
  try {
    // URL parser validates IPv6 literals
    // eslint-disable-next-line no-new
    new URL(`http://[${s}]/`);
    return true;
  } catch {
    return false;
  }
};
export const isIP = (v) => isIPv4(v) || isIPv6(v);
export const isCidr = (v, version) => {
  const [ip, mask, extra] = String(v || '').trim().split('/');
  if (extra !== undefined || mask === undefined || !/^\d+$/.test(mask)) return false;
  const m = Number(mask);
  if ((version === 4 || version === undefined) && isIPv4(ip) && m <= 32) return true;
  if ((version === 6 || version === undefined) && isIPv6(ip) && m <= 128) return true;
  return false;
};
export const ipRule = (msg) => ({
  validator: (_, value) => (!value || isIP(value) ? Promise.resolve() : Promise.reject(new Error(msg || t('Invalid IP address')))),
});
export const cidrRule = (version, msg) => ({
  validator: (_, value) =>
    !value || isCidr(value, version) ? Promise.resolve() : Promise.reject(new Error(msg || t('Invalid CIDR.'))),
});
export const macRule = () => ({
  validator: (_, value) =>
    !value || /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/.test(value)
      ? Promise.resolve()
      : Promise.reject(new Error(t('Invalid MAC address'))),
});

/* ---------------- option loaders ---------------- */
const safe = async (p, key) => {
  try {
    const res = await p;
    return res?.[key] || [];
  } catch {
    return [];
  }
};

export const listAll = {
  networks: (params) => safe(neutronApi.listNetworks(params), 'networks'),
  subnets: (params) => safe(neutronApi.listSubnets(params), 'subnets'),
  ports: (params) => safe(neutronApi.listPorts(params), 'ports'),
  routers: (params) => safe(neutronApi.listRouters(params), 'routers'),
  floatingips: (params) => safe(neutronApi.listFloatingIps(params), 'floatingips'),
  securityGroups: (params) => safe(neutronApi.listSecurityGroups(params), 'security_groups'),
  qosPolicies: (params) => safe(neutronApi.listQosPolicies(params), 'policies'),
  servers: (params) => safe(novaApi.listServers(params), 'servers'),
};

export const toOptions = (items, labelFn) =>
  (items || []).map((it) => ({
    value: it.id,
    label: labelFn ? labelFn(it) : it.name ? `${it.name}` : it.id,
    raw: it,
  }));

export const mapById = (items) => Object.fromEntries((items || []).map((it) => [it.id, it]));

export const subnetLabel = (s) => `${s.name || s.id} (${s.cidr})`;

/** Instance link (compute module) */
export const instanceLink = (id, name, isAdmin) =>
  id ? <Link to={`/compute/instance${adminSuffix(isAdmin)}/detail/${id}`}>{name || id}</Link> : '-';

export const networkLink = (id, name, isAdmin) =>
  id ? <Link to={detailPath('networks', id, isAdmin)}>{name || id}</Link> : '-';

export const routerLink = (id, name, isAdmin) =>
  id ? <Link to={detailPath('router', id, isAdmin)}>{name || id}</Link> : '-';

export const portLink = (id, name, isAdmin) =>
  id ? <Link to={detailPath('port', id, isAdmin)}>{name || id}</Link> : '-';

/** Renders fixed_ips list as lines "ip (subnet)" */
export const renderFixedIps = (fixedIps = []) =>
  fixedIps?.length ? (
    <div>
      {fixedIps.map((f) => (
        <div key={`${f.subnet_id}-${f.ip_address}`}>{f.ip_address}</div>
      ))}
    </div>
  ) : (
    '-'
  );

export const yesNoText = (v) => (v ? t('Yes') : t('No'));
