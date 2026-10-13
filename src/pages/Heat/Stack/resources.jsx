/**
 * Port of legacy src/resources/heat/stack.js (status map, tips, template helpers).
 */
import { t } from '@/core/i18n';
import { parseYaml, loadYaml } from './yaml';

export const stackStatus = () => ({
  INIT_IN_PROGRESS: t('Init In Progress'),
  INIT_COMPLETE: t('Init Complete'),
  INIT_FAILED: t('Init Failed'),
  CREATE_IN_PROGRESS: t('Create In Progress'),
  CREATE_COMPLETE: t('Create Complete'),
  CREATE_FAILED: t('Create Failed'),
  DELETE_IN_PROGRESS: t('Delete In Progress'),
  DELETE_COMPLETE: t('Delete Complete'),
  DELETE_FAILED: t('Delete Failed'),
  UPDATE_IN_PROGRESS: t('Update In Progress'),
  UPDATE_COMPLETE: t('Update Complete'),
  UPDATE_FAILED: t('Update Failed'),
  ROLLBACK_IN_PROGRESS: t('Rollback In Progress'),
  ROLLBACK_COMPLETE: t('Rollback Complete'),
  ROLLBACK_FAILED: t('Rollback Failed'),
  SUSPEND_IN_PROGRESS: t('Suspend In Progress'),
  SUSPEND_COMPLETE: t('Suspend Complete'),
  SUSPEND_FAILED: t('Suspend Failed'),
  RESUME_IN_PROGRESS: t('Resume In Progress'),
  RESUME_COMPLETE: t('Resume Complete'),
  RESUME_FAILED: t('Resume Failed'),
  ADOPT_IN_PROGRESS: t('Adopt In Progress'),
  ADOPT_COMPLETE: t('Adopt Complete'),
  ADOPT_FAILED: t('Adopt Failed'),
  SNAPSHOT_IN_PROGRESS: t('Snapshot In Progress'),
  SNAPSHOT_COMPLETE: t('Snapshot Complete'),
  SNAPSHOT_FAILED: t('Snapshot Failed'),
  CHECK_IN_PROGRESS: t('Check In Progress'),
  CHECK_COMPLETE: t('Check Complete'),
  CHECK_FAILED: t('Check Failed'),
});

/** Statuses offered by the legacy list search filter */
export const FILTER_STATUSES = [
  'CREATE_COMPLETE',
  'CREATE_FAILED',
  'ROLLBACK_COMPLETE',
  'ROLLBACK_FAILED',
  'UPDATE_COMPLETE',
  'UPDATE_FAILED',
  'DELETE_COMPLETE',
  'DELETE_FAILED',
];

/** Heat busy states are "*_IN_PROGRESS" */
export const isStackInProgress = (item = {}) => /_IN_PROGRESS$/.test(item.stack_status || item.resource_status || '');

export const yamlTip = () => t('A template is a YAML file that contains configuration information.');

export const paramTip = () =>
  t(
    'When your Yaml file is a fixed template, variable variables can be stored in an environment variable file to implement template deployment. The parameters in the environment variable file need to match the parameters defined in the template file.'
  );

export const rollbackTip = () =>
  t(
    'If "Enable" fails to roll back, the resource will be deleted after the creation fails; if "Disable" fails to roll back, the resource will be retained after the creation fails.'
  );

export const yamlErrorMessage = () =>
  t('A template is a YAML file that contains configuration information, please enter the correct format.');

/** legacy validateYaml (antd rule validator) */
export const validateYaml = (_rule, value) => {
  if (!value) return Promise.resolve();
  try {
    parseYaml(value);
  } catch (e) {
    return Promise.reject(new Error(`${yamlErrorMessage()} ${e.message || ''}`.trim()));
  }
  return Promise.resolve();
};

export const getYaml = loadYaml;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** legacy getParamsFromContent: the "parameters" section of a template */
export const getParamsFromContent = (contentYaml) => {
  const content = loadYaml(contentYaml);
  if (!isObject(content)) return {};
  return isObject(content.parameters) ? content.parameters : {};
};

/** Allowed values constraint of a HOT parameter (rendered as a select) */
export const getAllowedValues = (param = {}) => {
  const constraints = Array.isArray(param.constraints) ? param.constraints : [];
  const found = constraints.find((c) => c && Array.isArray(c.allowed_values));
  return found ? found.allowed_values : null;
};

/** legacy getFormItems: one form field per template parameter */
export const getTemplateParamFields = (contentYaml) =>
  Object.entries(getParamsFromContent(contentYaml)).map(([key, value]) => {
    const param = isObject(value) ? value : {};
    const { type = 'string', description = '', label, hidden } = param;
    return {
      name: key,
      label: label || key,
      extra: description,
      type: String(type).toLowerCase(),
      hidden: hidden === true || hidden === 'true',
      allowedValues: getAllowedValues(param),
      required: true,
    };
  });

/** legacy getFormDefaultValues: parameter defaults from the template */
export const getFormDefaultValues = (contentYaml) => {
  const values = {};
  Object.entries(getParamsFromContent(contentYaml)).forEach(([key, value]) => {
    const param = isObject(value) ? value : {};
    if (Object.prototype.hasOwnProperty.call(param, 'default')) {
      values[key] = param.default;
    } else if (param.type === 'boolean') {
      values[key] = false;
    }
  });
  return values;
};

/** Parameters given in an environment file ("parameters:" section or a bare mapping, like legacy) */
export const getEnvParams = (envYaml) => {
  const env = loadYaml(envYaml);
  if (!isObject(env)) return {};
  return isObject(env.parameters) ? env.parameters : env;
};

const ENV_SECTIONS = [
  'parameters',
  'parameter_defaults',
  'resource_registry',
  'event_sinks',
  'encrypted_param_names',
  'parameter_merge_strategies',
];

/**
 * The environment text is sent to Heat when it carries sections other than "parameters"
 * (resource_registry, parameter_defaults...); plain parameters are submitted through the form like legacy.
 */
export const shouldSendEnvironment = (envYaml) => {
  const env = loadYaml(envYaml);
  if (!isObject(env)) return false;
  const keys = Object.keys(env);
  return keys.length > 0 && keys.every((k) => ENV_SECTIONS.includes(k)) && keys.some((k) => k !== 'parameters');
};

/** Converts a form value back to the parameter type expected by Heat */
export const normalizeParamValue = (field, value) => {
  if (field?.type === 'json' && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (field?.type === 'comma_delimited_list' && Array.isArray(value)) return value.join(',');
  return value;
};

/** Value shown in the form for a parameter (json params are edited as text) */
export const toFormParamValue = (field, value) => {
  if (field?.type === 'json' && value !== undefined && value !== null && typeof value !== 'string') {
    return JSON.stringify(value, null, 2);
  }
  if (field?.type === 'comma_delimited_list' && Array.isArray(value)) return value.join(',');
  if (field?.type === 'boolean' && typeof value === 'string') return value.toLowerCase() === 'true';
  if (field?.type === 'number' && typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value;
};

/** Reference used by the Heat API for a stack ("stacks/{name}/{id}", project of the stack) */
export const stackRef = (item = {}) => ({
  id: item.id,
  name: item.stack_name || item.name,
  tenant: item.project || item.project_id || undefined,
});

export const adminSuffix = (isAdmin) => (isAdmin ? '-admin' : '');

export const stackDetailPath = (item, isAdmin) => {
  const name = item.stack_name || item.name || '-';
  const base = `/heat/stack${adminSuffix(isAdmin)}/detail/${item.id}/${encodeURIComponent(name)}`;
  const project = item.project || item.project_id;
  return isAdmin && project ? `${base}?project=${project}` : base;
};

export const stackListPath = (isAdmin) => `/heat/stack${adminSuffix(isAdmin)}`;

export const stackEditPath = (item, isAdmin) => {
  const base = `/heat/stack${adminSuffix(isAdmin)}/edit/${item.id}/${encodeURIComponent(item.stack_name || item.name)}`;
  const project = item.project || item.project_id;
  return isAdmin && project ? `${base}?project=${project}` : base;
};

/** legacy StackStore.mapper / mapperBeforeFetchProject */
export const mapStack = (data = {}) => ({
  ...data,
  name: data.stack_name,
  status: data.stack_status,
  project_id: data.project,
});
