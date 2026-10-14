import React from 'react';
import { novaApi } from '@/api/nova';
import InstanceList from '@/pages/Instances/InstanceList';

/**
 * Embedded instance list of the flavor / hypervisor / server group detail pages.
 * Legacy reused pages/compute/containers/Instance there (inDetailPage) with its row / batch
 * actions and backend paging; this renders the same Instance list page in embedded mode:
 *   <InstanceTable flavorId={id} />        backend paging, flavor_id filter (flavor column hidden)
 *   <InstanceTable host={serviceHost} />   backend paging, host filter (host column hidden)
 *   <InstanceTable memberIds={[...]} serverGroupId={id} />  server group members (loaded by id)
 */
export default function InstanceTable({ flavorId, host, memberIds, serverGroupId }) {
  if (flavorId) {
    return <InstanceList embedded inFlavor extraParams={{ flavor_id: flavorId }} showImageColumn />;
  }
  if (host !== undefined) {
    // a hypervisor without a nova-compute service host has no instances (legacy service.host)
    if (!host) return <InstanceList embedded inHost memberIds={[]} showImageColumn />;
    return <InstanceList embedded inHost extraParams={{ host }} showImageColumn />;
  }
  return <InstanceList embedded memberIds={memberIds || []} serverGroupId={serverGroupId} showImageColumn />;
}

/** Loads servers then keeps only the given ids (kept for callers of the former embedded table) */
export const fetchServersByIds = async (ids = [], { isAdmin } = {}) => {
  if (!ids.length) return [];
  const res = await novaApi.listServersV(isAdmin ? { all_tenants: true } : {});
  const set = new Set(ids);
  return (res?.servers || []).filter((s) => set.has(s.id));
};
