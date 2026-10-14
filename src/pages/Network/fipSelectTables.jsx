/**
 * Select-tables of the legacy "Associate Floating IP" forms (resources/neutron/floatingip
 * getFixedIPFormItemForAssociate / getFIPFormItemForAssociate), shared by the Port and the
 * Load Balancer actions. Values stay plain (fixed IP address / floating IP id) so the payloads
 * of the actions are unchanged; data comes from components/network loadAssociateFipData.
 */
import React from 'react';
import { Form } from 'antd';
import SelectTable from '@/components/SelectTable';
import { t } from '@/core/i18n';

const single = (value) => ({ selectedRowKeys: value ? [value] : [] });

/** Fixed IPs of the port (legacy getFixedIPFormItemForAssociate: unavailable rows show the reason) */
export function FixedIpSelectTable({ value, onChange, interfaces = [], showSubnet = true }) {
  return (
    <SelectTable
      value={single(value)}
      onChange={(v) => onChange?.(v?.selectedRowKeys?.[0])}
      data={interfaces}
      rowKey="fixed_ip_address"
      tagKey="fixed_ip_address"
      secondTagKey="network_name"
      disabledFunc={(r) => !r.available}
      filterParams={[{ name: 'fixed_ip_address', label: t('IP Address') }]}
      columns={[
        { title: t('IP Address'), dataIndex: 'fixed_ip_address', key: 'fixed_ip_address' },
        { title: t('Mac Address'), dataIndex: 'mac_address', key: 'mac_address', render: (v) => v || '-' },
        { title: t('Network'), dataIndex: 'network_name', key: 'network_name', render: (v) => v || '-' },
        showSubnet && { title: t('Subnet ID'), dataIndex: 'subnet_id', key: 'subnet_id', render: (v) => v || '-' },
        { title: t('Reason'), dataIndex: 'reason', key: 'reason', render: (v) => v || '-' },
      ].filter(Boolean)}
    />
  );
}

/**
 * Floating IPs reachable from the selected fixed IP (legacy getFIPFormItemForAssociate):
 * floating IPs with port forwardings cannot be bound.
 *  depName: form field holding the fixed IP; fipsFor(fixedIp) -> candidate floating IPs
 */
export function FipSelectTable({ value, onChange, form, depName = 'fixed_ip', fipsFor }) {
  const fixedIp = Form.useWatch(depName, form);
  const rows = fixedIp ? fipsFor(fixedIp) || [] : [];
  return (
    <SelectTable
      value={single(value)}
      onChange={(v) => onChange?.(v?.selectedRowKeys?.[0])}
      data={rows}
      rowKey="id"
      tagKey="floating_ip_address"
      secondTagKey="network_name"
      disabledFunc={(r) => (r.port_forwardings || []).length > 0}
      header={fixedIp ? null : <div style={{ color: '#94a3b8', marginBottom: 8 }}>{t('Please select fixed IP first')}</div>}
      filterParams={[
        { name: 'floating_ip_address', label: t('Floating IP') },
        { name: 'network_name', label: t('Network') },
      ]}
      columns={[
        { title: t('Floating IP'), dataIndex: 'floating_ip_address', key: 'floating_ip_address' },
        { title: t('Network'), dataIndex: 'network_name', key: 'network_name', render: (v) => v || '-' },
        { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
      ]}
    />
  );
}
