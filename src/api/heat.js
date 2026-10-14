import apiClient from './client';
import { useAuthStore } from '@/store/authStore';
import { serviceBase, currentProjectId } from './endpoints';
import { getPage } from './paging';

/**
 * OpenStack Heat Orchestration API (v1) - port of legacy src/client/heat.
 * Base path resolved per call: serviceBase('heat') -> /openstack/<region>/heat/v1
 * Legacy client has `projectInUrl`, so every path is /v1/{project_id}/...
 * Stack detail URLs use "stacks/{name}/{id}" like the legacy getDetailUrlForStack.
 * `tenant` (optional) lets administrators address a stack owned by another project.
 */
const projectId = () => {
  const id = currentProjectId();
  if (id) return id;
  try {
    return useAuthStore.getState()?.user?.project_id || '';
  } catch {
    return '';
  }
};

const base = (tenant) => `${serviceBase('heat')}/${tenant || projectId()}`;

const stackUrl = ({ id, name, tenant }) =>
  `${base(tenant)}/stacks/${encodeURIComponent(name)}/${encodeURIComponent(id)}`;

export const heatApi = {
  // ----------------------------------------------------------------- Stacks
  /** GET /stacks (tenant / global_tenant / with_count / sort_keys / sort_dir / id / name / status ...) */
  listStacks: (params) => apiClient.get(`${base()}/stacks`, { params }),
  getStack: (stack) => apiClient.get(stackUrl(stack)),
  /** body: { stack_name, template | template_url, parameters, environment, disable_rollback, timeout_mins } */
  createStack: (body) => apiClient.post(`${base()}/stacks`, body),
  /** PUT replaces the template (legacy "Update Template") */
  updateStack: (stack, body) => apiClient.put(stackUrl(stack), body),
  deleteStack: (stack) => apiClient.delete(stackUrl(stack)),
  /** DELETE .../abandon - deletes the stack but keeps its resources, returns the abandon data */
  abandonStack: (stack) => apiClient.delete(`${stackUrl(stack)}/abandon`),
  getTemplate: (stack) => apiClient.get(`${stackUrl(stack)}/template`),
  getEnvironment: (stack) => apiClient.get(`${stackUrl(stack)}/environment`),
  listEvents: (stack, params) => apiClient.get(`${stackUrl(stack)}/events`, { params }),
  listResources: (stack, params) => apiClient.get(`${stackUrl(stack)}/resources`, { params }),
  /** POST .../actions { suspend | resume | check | cancel_update | cancel_without_rollback: null } */
  stackAction: (stack, action) => apiClient.post(`${stackUrl(stack)}/actions`, { [action]: null }),

  // --------------------------------------------------------------- Services
  listServices: (params) => apiClient.get(`${base()}/services`, { params }),
};

export default heatApi;

/** One page of GET /stacks (legacy fetchListByPage): { items, total (with_count), hasNext, marker } */
Object.assign(heatApi, {
  listStacksPage: (params) => getPage(`${base()}/stacks`, { key: 'stacks', params }),
});
