/**
 * Port of legacy pages/heat/containers/Stack/actions/Create (StepCreate: Template + Parameter steps)
 * and actions/Edit ("Update Template", same steps on /heat/stack/edit/:id/:name).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Result,
  Select,
  Skeleton,
  Space,
  Steps,
  message,
} from 'antd';
import { heatApi } from '@/api/heat';
import { useIsAdminPage } from '@/components/ResourcePage';
import { getErrorMessage } from '@/hooks/useResource';
import { t } from '@/core/i18n';
import BaseTextareaFromFile from '@/components/form/TextareaFromFile';
import {
  yamlTip,
  paramTip,
  rollbackTip,
  validateYaml,
  getTemplateParamFields,
  getFormDefaultValues,
  getEnvParams,
  getParamsFromContent,
  shouldSendEnvironment,
  normalizeParamValue,
  toFormParamValue,
  stackListPath,
  mapStack,
} from './resources';
import { loadYaml, dumpYaml } from './yaml';

const MONO =
  '"Menlo", "Liberation Mono", "Consolas", "DejaVu Sans Mono", "Ubuntu Mono", "Courier New", "andale mono", "lucida console", monospace';

/** legacy utils/validate stackNameRegex */
const STACK_NAME_RE = /^[A-Za-z]+[A-Za-z\d._-]{1,254}$/;
const stackNameMessage = () =>
  t(
    'The name should start with upper letter, lower letter, and be a string of 2 to 255, characters can only contain "0-9, a-z, A-Z, -, ., _".'
  );

const HIDDEN_VALUE = '******';

/** legacy components/FormItem/TextareaFromFile (textarea first, link button below) */
function TextareaFromFile({ value, onChange, rows = 6, placeholder, accept, id, ...rest }) {
  return (
    <BaseTextareaFromFile
      id={id}
      value={value}
      onChange={onChange}
      rows={rows}
      accept={accept}
      placeholder={placeholder || t('Please input')}
      buttonPosition="bottom"
      buttonText={t('Load from local files')}
      buttonProps={{ type: 'link', style: { paddingLeft: 0 } }}
      textareaStyle={{ fontFamily: MONO, fontSize: 12.5 }}
      textareaProps={{ spellCheck: false, ...rest }}
      readErrorMessage={t('Failed to read the file')}
    />
  );
}

const jsonRule = {
  validator: (_, value) => {
    if (value === undefined || value === null || value === '' || typeof value === 'object') return Promise.resolve();
    try {
      JSON.parse(value);
      return Promise.resolve();
    } catch {
      return Promise.reject(new Error(t('Please enter a valid JSON value')));
    }
  },
};

/** legacy getFormItemType: number / json / boolean / default input (+ allowed values, hidden -> password) */
const renderParamInput = (field) => {
  if (field.allowedValues) {
    return (
      <Select
        allowClear
        showSearch
        placeholder={t('Please select')}
        options={field.allowedValues.map((v) => ({ value: v, label: String(v) }))}
      />
    );
  }
  switch (field.type) {
    case 'number':
      return <InputNumber style={{ width: '100%' }} />;
    case 'json':
      return <Input.TextArea rows={4} style={{ fontFamily: MONO, fontSize: 12.5 }} placeholder='{"key": "value"}' />;
    case 'boolean':
      return (
        <Radio.Group
          options={[
            { label: t('Yes'), value: true },
            { label: t('No'), value: false },
          ]}
        />
      );
    case 'comma_delimited_list':
      return <Input placeholder={t('Comma separated values, e.g. a,b,c')} />;
    default:
      return field.hidden ? <Input.Password autoComplete="new-password" /> : <Input />;
  }
};

export default function StackForm() {
  const navigate = useNavigate();
  const isAdmin = useIsAdminPage();
  const { id, name: routeName } = useParams();
  const isEdit = Boolean(id);
  const listUrl = stackListPath(isAdmin);
  const tenant = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('project') || undefined;
    } catch {
      return undefined;
    }
  }, []);
  const stackRefValue = useMemo(
    () => (isEdit ? { id, name: decodeURIComponent(routeName || ''), tenant } : null),
    [isEdit, id, routeName, tenant]
  );

  const [form] = Form.useForm();
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [extra, setExtra] = useState(null); // legacy "extra": stack detail when editing
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [templateText, setTemplateText] = useState(''); // template used to build the parameter form
  const [urlWarning, setUrlWarning] = useState(false);
  const [editInitial, setEditInitial] = useState({});
  const templateSource = Form.useWatch('templateSource', form);

  // legacy StepCreate.getDetail
  useEffect(() => {
    if (!isEdit) return undefined;
    let alive = true;
    (async () => {
      try {
        const [detailRes, tpl] = await Promise.all([
          heatApi.getStack(stackRefValue),
          heatApi.getTemplate(stackRefValue).catch(() => null),
        ]);
        if (!alive) return;
        const stack = mapStack(detailRes?.stack || {});
        setExtra(stack);
        // legacy Parameter.defaultValue for edit: stack name + rollback; the current template is preloaded
        setEditInitial({
          name: stack.stack_name,
          rollback: !stack.disable_rollback,
          timeout_mins: stack.timeout_mins || 60,
          content: tpl ? dumpYaml(tpl) : '',
        });
      } catch (err) {
        if (alive) setLoadError(getErrorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isEdit, stackRefValue]);

  const paramFields = useMemo(() => getTemplateParamFields(templateText), [templateText]);
  const templateDefaults = useMemo(() => getFormDefaultValues(templateText), [templateText]);

  /** legacy Parameter.defaultParams: template defaults, (edit) current values, then environment parameters */
  const applyParamDefaults = (text) => {
    const fields = getTemplateParamFields(text);
    const env = getEnvParams(form.getFieldValue('params') || '');
    const templateDefaults = getFormDefaultValues(text);
    const stackParams = extra?.parameters || {};
    const values = {};
    fields.forEach((field) => {
      let v = templateDefaults[field.name];
      const current = stackParams[field.name];
      if (isEdit && current !== undefined && current !== HIDDEN_VALUE && !field.hidden) v = current;
      if (env && Object.prototype.hasOwnProperty.call(env, field.name)) v = env[field.name];
      values[field.name] = toFormParamValue(field, v);
    });
    form.setFieldsValue(values);
  };

  /** legacy Parameter.updateParamsInContext: keeps the environment text in sync with the parameter form */
  const syncEnvironment = (changed) => {
    const keys = Object.keys(getParamsFromContent(templateText));
    const touched = Object.keys(changed).filter((k) => keys.includes(k));
    if (!touched.length) return;
    const text = form.getFieldValue('params') || '';
    let env = text ? loadYaml(text) : {};
    if (!env || typeof env !== 'object' || Array.isArray(env)) env = {};
    const bare = Object.keys(env).length && !('parameters' in env) && !shouldSendEnvironment(text);
    const target = bare ? env : (env.parameters = env.parameters && typeof env.parameters === 'object' ? env.parameters : {});
    touched.forEach((key) => {
      const field = paramFields.find((f) => f.name === key);
      target[key] = normalizeParamValue(field, changed[key]);
    });
    form.setFieldValue('params', dumpYaml(env));
  };

  const goNext = async () => {
    try {
      await form.validateFields(['templateSource', 'content', 'template_url', 'params']);
    } catch {
      return;
    }
    const source = form.getFieldValue('templateSource');
    let text = form.getFieldValue('content') || '';
    setUrlWarning(false);
    if (source === 'url') {
      text = '';
      try {
        const res = await fetch(form.getFieldValue('template_url'));
        if (res.ok) text = await res.text();
      } catch {
        // cross-origin URLs cannot be read by the browser; Heat downloads the template itself
      }
      if (!text || !loadYaml(text)) {
        text = '';
        setUrlWarning(true);
      }
    }
    setTemplateText(text);
    applyParamDefaults(text);
    setCurrent(1);
  };

  const onSubmit = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const values = form.getFieldsValue(true);
    const { name, rollback, timeout_mins, params, content, templateSource: source, template_url } = values;
    const parameters = {};
    paramFields.forEach((field) => {
      const v = values[field.name];
      if (v === undefined) return;
      parameters[field.name] = normalizeParamValue(field, v);
    });
    if (!paramFields.length) {
      // template could not be read (URL source): submit the parameters written in the environment
      Object.assign(parameters, shouldSendEnvironment(params) ? {} : getEnvParams(params || ''));
    }
    const body = {
      stack_name: name,
      disable_rollback: !rollback,
      timeout_mins,
      parameters,
    };
    // the template text is sent as-is (Heat parses YAML / JSON itself) or downloaded by Heat from the URL
    if (source === 'url') body.template_url = template_url;
    else body.template = content;
    if (shouldSendEnvironment(params)) body.environment = params;
    setSubmitting(true);
    try {
      if (isEdit) {
        const { stack_name: _ignored, ...editBody } = body;
        await heatApi.updateStack(stackRefValue, editBody);
      } else {
        await heatApi.createStack(body);
      }
      message.success(
        isEdit
          ? t('{action} successfully, instance: {name}.', { action: t('update template'), name })
          : t('{action} successfully, instance: {name}.', { action: t('create stack'), name })
      );
      navigate(listUrl);
    } catch (err) {
      message.error(getErrorMessage(err, t('Operation failed')));
    } finally {
      setSubmitting(false);
    }
  };

  const title = isEdit ? t('Update Template') : t('Create Stack');

  if (loadError) {
    return (
      <Result
        status="warning"
        title={t('Resource not found or failed to load')}
        subTitle={loadError}
        extra={<Button onClick={() => navigate(listUrl)}>{t('Back')}</Button>}
      />
    );
  }

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { title: t('Orchestration') },
          { title: <Link to={listUrl}>{t('Stacks')}</Link> },
          { title },
        ]}
        style={{ marginBottom: 16, fontSize: 13 }}
      />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {title}
          {isEdit && extra ? <span style={{ fontWeight: 400, color: '#64748b' }}> · {extra.stack_name}</span> : null}
        </h1>
      </div>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Steps
          current={current}
          items={[{ title: t('Prepare Template') }, { title: t('Orchestration information') }]}
          style={{ maxWidth: 640, margin: '0 auto 24px' }}
        />
        {loading ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Form
            form={form}
            labelCol={{ xs: { span: 24 }, md: { span: 5 } }}
            wrapperCol={{ xs: { span: 24 }, md: { span: 17 } }}
            initialValues={{ templateSource: 'content', rollback: true, timeout_mins: 60, content: '', params: '', ...editInitial }}
            onValuesChange={(changed) => {
              if (current === 1) syncEnvironment(changed);
            }}
          >
            {current === 0 ? (
              <>
                {isEdit ? (
                  <Form.Item label={t('Template Name')}>
                    <span style={{ fontWeight: 600 }}>{extra?.stack_name || '-'}</span>
                  </Form.Item>
                ) : null}
                <Form.Item name="templateSource" label={t('Template Source')}>
                  <Radio.Group
                    optionType="button"
                    options={[
                      { value: 'content', label: t('Template Content') },
                      { value: 'url', label: t('Template URL') },
                    ]}
                  />
                </Form.Item>
                {templateSource === 'url' ? (
                  <Form.Item
                    name="template_url"
                    label={t('Template URL')}
                    extra={t('Heat downloads the template from this URL (http/https), it must be reachable from the Heat service.')}
                    rules={[
                      { required: true, message: `${t('Please enter/select')} ${t('Template URL')}!` },
                      { type: 'url', message: t('Please enter a valid URL') },
                    ]}
                  >
                    <Input placeholder="https://example.com/template.yaml" />
                  </Form.Item>
                ) : (
                  <Form.Item
                    name="content"
                    label={t('Template Content')}
                    extra={yamlTip()}
                    rules={[
                      { required: true, message: `${t('Please enter/select')} ${t('Template Content')}!` },
                      { validator: validateYaml },
                    ]}
                  >
                    <TextareaFromFile rows={14} accept=".yaml,.yml,.json,.template,.txt" />
                  </Form.Item>
                )}
                <Form.Item
                  name="params"
                  label={t('Environment Variable')}
                  extra={paramTip()}
                  rules={[{ validator: validateYaml }]}
                >
                  <TextareaFromFile rows={6} accept=".yaml,.yml,.json,.env,.txt" />
                </Form.Item>
              </>
            ) : (
              <>
                {isEdit ? (
                  <Form.Item label={t('Stack Name')}>
                    <span style={{ fontWeight: 600 }}>{extra?.stack_name || '-'}</span>
                  </Form.Item>
                ) : (
                  <Form.Item
                    name="name"
                    label={t('Stack Name')}
                    extra={stackNameMessage()}
                    rules={[
                      { required: true, message: `${t('Please enter/select')} ${t('Stack Name')}!` },
                      {
                        validator: (_, value) =>
                          !value || STACK_NAME_RE.test(value)
                            ? Promise.resolve()
                            : Promise.reject(new Error(`${t('Invalid: ')}${stackNameMessage()}`)),
                      },
                    ]}
                  >
                    <Input maxLength={255} />
                  </Form.Item>
                )}
                <Form.Item
                  name="timeout_mins"
                  label={t('Creation Timeout (Minutes)')}
                  rules={[{ required: true, message: `${t('Please enter/select')} ${t('Creation Timeout (Minutes)')}!` }]}
                >
                  <InputNumber min={1} precision={0} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item
                  name="rollback"
                  label={t('Fail Rollback')}
                  extra={rollbackTip()}
                  rules={[{ required: true }]}
                >
                  <Radio.Group
                    options={[
                      { value: true, label: t('Enable') },
                      { value: false, label: t('Disable') },
                    ]}
                  />
                </Form.Item>
                <Divider orientation="left" style={{ fontSize: 14, fontWeight: 600 }}>
                  {t('Fill In The Parameters')}
                </Divider>
                {urlWarning ? (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={t(
                      'The template could not be read from the URL in the browser, so its parameters cannot be listed. Provide the parameter values in the environment variable file of the previous step.'
                    )}
                  />
                ) : null}
                {!paramFields.length && !urlWarning ? (
                  <div style={{ color: '#94a3b8', marginBottom: 16, textAlign: 'center' }}>
                    {t('The template does not define any parameters.')}
                  </div>
                ) : null}
                {paramFields.map((field) => {
                  const hasDefault = Object.prototype.hasOwnProperty.call(templateDefaults, field.name);
                  const rules = [];
                  if (!hasDefault && field.type !== 'boolean') {
                    rules.push({ required: true, message: `${t('Please enter/select')} ${field.label}!` });
                  }
                  if (field.type === 'json') rules.push(jsonRule);
                  return (
                    <Form.Item
                      key={field.name}
                      name={field.name}
                      label={field.label}
                      extra={field.extra || undefined}
                      tooltip={field.label !== field.name ? field.name : undefined}
                      rules={rules}
                    >
                      {renderParamInput(field)}
                    </Form.Item>
                  );
                })}
              </>
            )}
            <Divider />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Space>
                <Button onClick={() => navigate(listUrl)}>{t('Cancel')}</Button>
                {current === 1 ? <Button onClick={() => setCurrent(0)}>{t('Previous')}</Button> : null}
                {current === 0 ? (
                  <Button type="primary" onClick={goNext}>
                    {t('Next')}
                  </Button>
                ) : (
                  <Button type="primary" loading={submitting} onClick={onSubmit}>
                    {t('Confirm')}
                  </Button>
                )}
              </Space>
            </div>
          </Form>
        )}
      </Card>
    </div>
  );
}
