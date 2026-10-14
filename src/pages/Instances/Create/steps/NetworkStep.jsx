import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, Modal, Table } from 'antd';
import { Link } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import { currentProjectId } from '@/api/endpoints';
import { t } from '@/core/i18n';
import SelectTable, { col, mapCol, timeCol } from '@/components/SelectTable';
import NetworkSelectTable from '@/components/network/NetworkSelectTable';
import NetworkSelect, { buildNetworkValue } from '../components/NetworkSelect';
import AddSelect from '../components/AddSelect';
import { FormDivider, selectTableRule, tableWrapper } from '@/components/form/fields';
import { isIPv4, isIpv6 } from '../utils';


const portStatus = () => ({
  ACTIVE: t('Active'),
  BUILD: t('Build'),
  DOWN: t('Down'),
  ERROR: t('Error'),
  N_A: t('N/A'),
});

/** Legacy RuleButton: "View Rules" link + modal with the security group rules */
function RuleButton({ item }) {
  const [open, setOpen] = useState(false);
  const data = item?.security_group_rules || [];
  const columns = [
    col(t('Direction'), 'direction', { render: (v) => (v === 'ingress' ? t('Ingress') : v === 'egress' ? t('Egress') : v) }),
    col(t('Ether Type'), 'ethertype'),
    col(t('Protocol'), 'protocol', { render: (v) => v || t('Any') }),
    col(t('Port Range'), 'port_range_min', {
      render: (_, r) => {
        if (r.port_range_min === null || r.port_range_min === undefined) return t('Any');
        return r.port_range_min === r.port_range_max ? r.port_range_min : `${r.port_range_min}:${r.port_range_max}`;
      },
    }),
    col(t('Remote IP Prefix'), 'remote_ip_prefix', { render: (v, r) => v || r.remote_group_id || '-' }),
    col(t('Description'), 'description', { render: (v) => v || '-' }),
  ];
  return (
    <>
      <Button
        type="link"
        size="small"
        style={{ paddingLeft: 0 }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {t('View Rules')}
      </Button>
      <Modal open={open} title={t('Security Group Rules')} width={960} footer={null} onCancel={() => setOpen(false)} destroyOnHidden>
        <div onClick={(e) => e.stopPropagation()} style={{ overflowX: 'auto' }}>
          <Table size="small" rowKey="id" columns={columns} dataSource={data} pagination={false} />
        </div>
      </Modal>
    </>
  );
}

const securityGroupColumns = () => [
  col(t('Name'), 'name'),
  col(t('Description'), 'description', { render: (v) => v || '-' }),
  timeCol(t('Created At'), 'created_at'),
  col(t('Rules'), 'rules', { render: (_, record) => <RuleButton item={record} /> }),
];

const portColumns = () => [
  col(t('ID/Name'), 'name', {
    render: (v, r) => (
      <div>
        <div>{v || '-'}</div>
        <div style={{ fontSize: 12, opacity: 0.65 }}>{r.id}</div>
      </div>
    ),
  }),
  col(t('Network'), 'network_name'),
  col(t('IPv4'), 'ipv4', { render: (value = []) => value.map((it) => <div key={it}>{it}</div>) }),
  col(t('IPv6'), 'ipv6', { render: (value = []) => value.map((it) => <div key={it}>{it}</div>) }),
  col(t('MAC Address'), 'mac_address'),
  mapCol(t('Status'), 'status', portStatus()),
];

/** Legacy NetworkStep.checkNetworks */
export const checkNetworks = (value) => {
  if (!Array.isArray(value) || !value.length || !value[0]?.value || !Object.keys(value[0].value).length) return false;
  if (value.find((it) => !it.value || !it.value.network)) return false;
  if (value.find((it) => it.value.ipType === 1 && !isIPv4(it.value.ip) && !isIpv6(it.value.ip))) return false;
  if (value.find((it) => it.value.errorMsg)) return false;
  return true;
};

/**
 * Port of legacy StepCreate/NetworkStep (and CreateIronic/NetworkStep with `ironic`).
 */
export default function NetworkStep({ form, context, updateContext, hasAdminRole, ironic = false }) {
  const projectId = currentProjectId();
  const subnetMap = useRef({});
  const [networkSelectRows, setNetworkSelectRows] = useState(context.networkSelectRows || []);
  const [portSelectRows, setPortSelectRows] = useState(context.portSelectRows || []);
  const [subnets, setSubnets] = useState(context.subnets || []);
  const [ports, setPorts] = useState([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [securityGroups, setSecurityGroups] = useState([]);
  const [sgLoading, setSgLoading] = useState(false);

  const loadPorts = async () => {
    if (ironic) return;
    setPortsLoading(true);
    try {
      const [res, nets] = await Promise.all([
        neutronApi.listPorts({ project_id: projectId, status: 'DOWN' }).catch(() => ({})),
        neutronApi.listNetworks({}).catch(() => ({})),
      ]);
      const netMap = Object.fromEntries((nets?.networks || []).map((n) => [n.id, n.name || n.id]));
      setPorts(
        (res?.ports || []).map((it) => {
          const ips = (it.fixed_ips || []).map((ip) => ip.ip_address);
          return {
            ...it,
            network_name: netMap[it.network_id] || it.network_id,
            ipv4: ips.filter((ip) => isIPv4(ip)),
            ipv6: ips.filter((ip) => !isIPv4(ip)),
          };
        })
      );
    } finally {
      setPortsLoading(false);
    }
  };

  const loadSecurityGroups = async () => {
    setSgLoading(true);
    try {
      const res = await neutronApi.listSecurityGroups({ project_id: projectId }).catch(() => ({}));
      setSecurityGroups(res?.security_groups || []);
    } finally {
      setSgLoading(false);
    }
  };

  useEffect(() => {
    loadPorts();
    loadSecurityGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getSubnetPromise = async (networkId) => {
    if (!subnetMap.current[networkId]) {
      const res = await neutronApi.listSubnets({ network_id: networkId }).catch(() => ({}));
      subnetMap.current[networkId] = res?.subnets || [];
    }
    return subnetMap.current[networkId];
  };

  // legacy getSubnets: build the virtual interface rows of the selected networks
  const syncInterfaces = async (rows) => {
    const results = await Promise.all(rows.map((it) => getSubnetPromise(it.id)));
    const allSubnets = results.flat();
    const networks = form.getFieldValue('networks') || [];
    const usedIndex = [];
    const initValue = rows.map((network, index) => {
      const subnet = allSubnets.find((it) => it.network_id === network.id);
      const item = networks.find((it, networkIndex) => {
        if (it?.value?.network === network.id && usedIndex.indexOf(networkIndex) < 0) {
          usedIndex.push(networkIndex);
          return true;
        }
        return false;
      });
      if (item) return item;
      return {
        value: buildNetworkValue({ network: network.id, subnet: subnet?.id || null, ipType: 0 }, { networks: rows, subnets: allSubnets }),
        index,
      };
    });
    const networkIds = rows.map((it) => it.id);
    networks.forEach((it, index) => {
      if (usedIndex.indexOf(index) < 0 && networkIds.indexOf(it?.value?.network) >= 0) initValue.push(it);
    });
    form.setFieldValue('networks', initValue);
    setSubnets(allSubnets);
    updateContext({ networks: initValue, subnets: allSubnets });
  };

  // re-sync rows when coming back to this step
  useEffect(() => {
    if (networkSelectRows.length) syncInterfaces(networkSelectRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNetworkChange = (value) => {
    const rows = value?.selectedRows || [];
    setNetworkSelectRows(rows);
    updateContext({ networkSelectRows: rows });
    syncInterfaces(rows);
  };

  const onPortChange = (value) => {
    const rows = value?.selectedRows || [];
    setPortSelectRows(rows);
    updateContext({ portSelectRows: rows });
  };

  const showNetworks = networkSelectRows.length > 0;
  const networkRequired = ironic ? true : portSelectRows.length === 0;
  const portRequired = networkSelectRows.length === 0;

  const showSecurityGroups = useMemo(() => {
    if (ironic) return networkSelectRows.length > 0 && networkSelectRows.every((it) => it.port_security_enabled);
    if (!networkSelectRows.length && !portSelectRows.length) return false;
    if (networkSelectRows.length && networkSelectRows.some((it) => !it.port_security_enabled)) return false;
    if (portSelectRows.length && portSelectRows.some((it) => !it.port_security_enabled)) return false;
    return true;
  }, [networkSelectRows, portSelectRows, ironic]);

  const networkHeader = (
    <div>
      {t('Please reasonably plan the network and subnet to which the virtual network card belongs.')} {t('You can go to the console to')}{' '}
      <Link to="/network/networks" target="_blank">
        {`${t('create a new network/subnet')} > `}
      </Link>
    </div>
  );

  return (
    <>
      <Form.Item
        name="networkSelect"
        label={t('Networks')}
        required={networkRequired}
        rules={[selectTableRule(t('Networks'), networkRequired)]}
        wrapperCol={tableWrapper}
        dependencies={['ports']}
      >
        <NetworkSelectTable
          isMulti={!ironic}
          showExternal
          hasAdminRole={hasAdminRole}
          disabledFunc={(it) => !it.subnets || it.subnets.length === 0}
          onChange={onNetworkChange}
          header={networkHeader}
        />
      </Form.Item>
      {showNetworks ? (
        <Form.Item
          name="networks"
          label={ironic ? t('Virtual LAN') : t('Virtual Interface')}
          required
          tooltip={ironic ? undefined : t('Specify a subnet of the network and assign fixed IP address automatically or manually for the instance')}
          rules={[
            {
              validator: (_, value) =>
                checkNetworks(value) ? Promise.resolve() : Promise.reject(new Error(t('Please select a network!'))),
            },
          ]}
          wrapperCol={tableWrapper}
        >
          <AddSelect
            addText={ironic ? t('Add Virtual LAN') : t('Add Virtual Interface')}
            minCount={networkSelectRows.length || 0}
            defaultItemValue={{}}
            renderItem={(itemValue, index, onItemChange) => (
              <NetworkSelect
                value={itemValue}
                onChange={onItemChange}
                networks={networkSelectRows}
                subnets={subnets}
                optionsByIndex
                index={index}
              />
            )}
          />
        </Form.Item>
      ) : null}
      <FormDivider />
      {!ironic ? (
        <>
          <Form.Item
            name="ports"
            label={t('Ports')}
            required={portRequired}
            rules={[selectTableRule(t('Ports'), portRequired)]}
            wrapperCol={tableWrapper}
            dependencies={['networkSelect']}
          >
            <SelectTable
              id="instance-create-ports"
              isMulti
              data={ports}
              columns={portColumns()}
              isLoading={portsLoading}
              filterParams={[{ label: t('Name'), name: 'name' }]}
              onChange={onPortChange}
              onRefresh={loadPorts}
              header={t(
                'Ports provide extra communication channels to your instances. You can select ports instead of networks or a mix of both (The port executes its own security group rules by default).'
              )}
            />
          </Form.Item>
          <FormDivider />
        </>
      ) : null}
      {showSecurityGroups ? (
        <Form.Item
          name="securityGroup"
          label={t('Security Group')}
          required
          rules={[selectTableRule(t('Security Group'))]}
          wrapperCol={tableWrapper}
          tooltip={t(
            'Each instance belongs to at least one security group, which needs to be specified when it is created. Instances in the same security group can communicate with each other on the network, and instances in different security groups are disconnected from the internal network by default.'
          )}
        >
          <SelectTable
            id="instance-create-security-group"
            isMulti
            data={securityGroups}
            columns={securityGroupColumns()}
            isLoading={sgLoading}
            filterParams={[{ label: t('Name'), name: 'name' }]}
            onRefresh={loadSecurityGroups}
            header={
              <div>
                {t('The security group is similar to the firewall function and is used to set up network access control.')}{' '}
                {t('You can go to the console to')}{' '}
                <Link to="/network/security-group" target="_blank">
                  {`${t('create a new security group')}> `}
                </Link>
                {t('Note: The security group you use will act on all ports of the instance.')}
              </div>
            }
          />
        </Form.Item>
      ) : null}
    </>
  );
}
