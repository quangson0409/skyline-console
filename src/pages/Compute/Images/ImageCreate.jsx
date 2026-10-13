import React, { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Progress,
  Radio,
  Select,
  Space,
  Switch,
  Upload,
  message,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { glanceApi } from '@/api/glance';
import { getErrorMessage } from '@/hooks/useResource';
import { isAdminPathname, formatSize } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  NoSetValue,
  imageOS,
  imageUsage,
  imageFormats,
  imageFormatsConsole,
  imageVisibility,
  imageContainerFormats,
  cpuPolicyOptions,
  cpuThreadPolicyOptions,
  yesNoOptions,
  toOptions,
  ProjectSelect,
} from './helpers';
import { createImageMembers } from './actions';

/** antd Upload wrapper holding a single File object as form value (legacy FormItem "upload") */
const FileInput = ({ value, onChange, accept }) => (
  <Space direction="vertical" style={{ width: '100%' }}>
    <Upload
      accept={accept}
      maxCount={1}
      fileList={
        value ? [{ uid: '-1', name: `${value.name} (${formatSize(value.size)})`, status: 'done' }] : []
      }
      beforeUpload={(file) => {
        onChange?.(file);
        return false;
      }}
      onRemove={() => onChange?.(undefined)}
    >
      <Button icon={<UploadOutlined />}>{t('Select File')}</Button>
    </Upload>
  </Space>
);

const DISK_FORMAT_TIP =
  'RAW - Raw disk image format\n' +
  'QCOW2 - QEMU image format\n' +
  'ISO - Optical disc image format\n' +
  'AKI - Amazon kernel image format\n' +
  'ARI - Amazon ramdisk image format\n' +
  'AMI - Amazon server image format\n' +
  'VDI - VirtualBox compatible image format\n' +
  'VHD - VirtualPC compatible image format\n' +
  'VMDK - Hyper-V compatible image format';

export default function ImageCreate() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAdmin = isAdminPathname(pathname);
  const listUrl = isAdmin ? '/compute/image-admin' : '/compute/image';
  const [form] = Form.useForm();
  const [more, setMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(null); // { step, percent, loaded, total }
  const abortRef = useRef(null);

  const formats = isAdmin ? imageFormats() : imageFormatsConsole();
  const formatKeys = Object.keys(formats);
  const containerFormatList = toOptions(imageContainerFormats());
  const showContainerFormat = containerFormatList.length > 1;
  const usageOptions = toOptions(imageUsage()).filter(
    (it) => isAdmin || it.value === 'common' || it.value === 'ironic'
  );

  const uploadType = Form.useWatch('uploadType', form) || 'file';
  const visibility = Form.useWatch('visibility', form);
  const containerFormat = Form.useWatch('container_format', form) || 'bare';
  const isUrl = uploadType === 'url';
  const isShare = isAdmin && visibility === 'shared';
  const isBareFormat = containerFormat === 'bare';

  const validateFile = (_, value) => {
    if (!value) return Promise.reject(new Error(t('Please select a file')));
    const { name = '' } = value;
    const suffix = name.substring(name.lastIndexOf('.') + 1).toLowerCase();
    if (!formatKeys.some((it) => suffix.includes(it))) {
      return Promise.reject(
        new Error(t('Please select a file with the suffix {types}', { types: formatKeys.join(',') }))
      );
    }
    return Promise.resolve();
  };

  const validateURL = (_, value) => {
    if (!value) return Promise.reject(new Error(t('Please enter URL!')));
    if (!/^https?:\/\/(.*)/.test(value)) {
      return Promise.reject(new Error(t('Please enter a file link starting with "http://" or "https://"!')));
    }
    return Promise.resolve();
  };

  const onFinish = async (values) => {
    const {
      uploadType: type,
      file,
      url,
      visibility: vis,
      hw_cpu_policy,
      hw_cpu_thread_policy,
      min_ram,
      owner,
      usage_type = 'common',
      members,
      os_distro,
      os_version,
      os_admin_user,
      container_format = 'bare',
      ...rest
    } = values;
    const body = {
      visibility: vis || 'private',
      container_format,
      usage_type,
      ...rest,
    };
    if (min_ram) body.min_ram = min_ram * 1024;
    if (hw_cpu_policy !== NoSetValue) body.hw_cpu_policy = hw_cpu_policy;
    if (hw_cpu_thread_policy !== NoSetValue) body.hw_cpu_thread_policy = hw_cpu_thread_policy;
    if (isAdmin) body.owner = owner;
    if (container_format === 'bare') {
      body.os_distro = os_distro;
      body.os_version = os_version;
      body.os_admin_user = os_admin_user;
      if (os_distro === 'windows') body.os_type = 'windows';
    }
    Object.keys(body).forEach((k) => {
      if (body[k] === undefined || body[k] === null) delete body[k];
    });
    const mems = vis === 'shared' ? members || [] : [];

    setSubmitting(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setProgress({ step: t('Create Image'), percent: 0 });
      const image = await glanceApi.createImage(body);
      const id = image?.id;
      if (mems.length) await createImageMembers(id, mems);
      if (type === 'url') {
        setProgress({ step: t('File URL'), percent: 50 });
        await glanceApi.importImageUrl(id, url);
        setProgress({ step: t('File URL'), percent: 100 });
      } else {
        setProgress({ step: t('Upload File'), percent: 0, loaded: 0, total: file?.size });
        await glanceApi.uploadImageFile(id, file, {
          signal: controller.signal,
          onUploadProgress: (evt) => {
            const total = evt.total || file?.size || 0;
            const percent = total ? Math.floor((evt.loaded / total) * 100) : 0;
            setProgress({ step: t('Upload File'), percent, loaded: evt.loaded, total });
          },
        });
      }
      message.success(t('Operation completed successfully'));
      navigate(listUrl);
    } catch (err) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
        message.warning(t('Upload canceled'));
      } else {
        message.error(getErrorMessage(err, t('Operation failed')));
      }
      setProgress(null);
    } finally {
      abortRef.current = null;
      setSubmitting(false);
    }
  };

  const onCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      return;
    }
    navigate(listUrl);
  };

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        style={{ marginBottom: 16, fontSize: 13 }}
        items={[
          { title: t('Compute') },
          { title: <Link to={listUrl}>{t('Images')}</Link> },
          { title: t('Create Image') },
        ]}
      />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('Create Image')}
        </h1>
      </div>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Form
          form={form}
          layout="horizontal"
          labelCol={{ xs: { span: 24 }, sm: { span: 6 }, lg: { span: 5 } }}
          wrapperCol={{ xs: { span: 24 }, sm: { span: 16 }, lg: { span: 12 } }}
          initialValues={{
            uploadType: 'file',
            hw_qemu_guest_agent: 'yes',
            usage_type: 'common',
            container_format: 'bare',
            visibility: isAdmin ? 'public' : undefined,
            hw_cpu_policy: NoSetValue,
            hw_cpu_thread_policy: NoSetValue,
          }}
          onFinish={onFinish}
          disabled={submitting}
        >
          <Form.Item name="name" label={t('Image Name')} rules={[{ required: true, message: t('Please input name') }]}>
            <Input />
          </Form.Item>
          {isAdmin ? (
            <Form.Item name="owner" label={t('Project')} rules={[{ required: true, message: t('Please select') }]}>
              <ProjectSelect />
            </Form.Item>
          ) : null}
          <Form.Item name="uploadType" label={t('Upload Type')}>
            <Radio.Group
              options={[
                { value: 'file', label: t('Upload File') },
                { value: 'url', label: t('File URL') },
              ]}
            />
          </Form.Item>
          {isUrl ? (
            <Form.Item name="url" label={t('File URL')} required rules={[{ validator: validateURL }]}>
              <Input placeholder="https://" />
            </Form.Item>
          ) : (
            <Form.Item name="file" label={t('File')} required rules={[{ validator: validateFile }]}>
              <FileInput accept={formatKeys.map((k) => `.${k}`).join(',')} />
            </Form.Item>
          )}
          <Form.Item
            name="disk_format"
            label={t('Disk Format')}
            tooltip={<span style={{ whiteSpace: 'pre-line' }}>{t(DISK_FORMAT_TIP)}</span>}
            rules={[{ required: true, message: t('Please select') }]}
          >
            <Select options={toOptions(formats)} />
          </Form.Item>
          {showContainerFormat ? (
            <Form.Item
              name="container_format"
              label={t('Container Format')}
              rules={[{ required: true, message: t('Please select') }]}
            >
              <Select options={containerFormatList} />
            </Form.Item>
          ) : null}
          {isBareFormat ? (
            <>
              <Form.Item name="os_distro" label={t('OS')} rules={[{ required: true, message: t('Please select') }]}>
                <Select options={toOptions(imageOS())} />
              </Form.Item>
              <Form.Item name="os_version" label={t('OS Version')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item
                name="os_admin_user"
                label={t('OS Admin')}
                rules={[{ required: true }]}
                extra={t('In general, administrator for Windows, root for Linux, please fill by image uploading.')}
              >
                <Input />
              </Form.Item>
            </>
          ) : null}
          <Form.Item name="min_disk" label={t('Min. System Disk (GiB)')}>
            <InputNumber min={0} max={500} precision={0} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="min_ram" label={t('Min. Memory (GiB)')}>
            <InputNumber min={0} max={500} precision={0} style={{ width: 200 }} />
          </Form.Item>
          {isAdmin ? (
            <Form.Item name="visibility" label={t('Visibility')}>
              <Radio.Group options={toOptions(imageVisibility())} />
            </Form.Item>
          ) : null}
          {isShare ? (
            <Form.Item name="members" label={t('Project')} rules={[{ required: true, message: t('Please select') }]}>
              <ProjectSelect multiple />
            </Form.Item>
          ) : null}
          <Form.Item name="protected" label={t('Protection')} valuePropName="checked">
            <Checkbox>{t('Protected')}</Checkbox>
          </Form.Item>
          <Form.Item name="usage_type" label={t('Usage Type')}>
            <Select options={usageOptions} />
          </Form.Item>
          <Form.Item name="description" label={t('Description')} rules={[{ max: 255 }]}>
            <Input.TextArea rows={3} maxLength={255} showCount />
          </Form.Item>
          <Form.Item label={t('Advanced Options')}>
            <Switch checked={more} onChange={setMore} />
          </Form.Item>
          {/* advanced fields stay mounted (legacy hidden items keep their default values) */}
          <div style={{ display: more ? 'block' : 'none' }}>
            <Form.Item
              name="hw_qemu_guest_agent"
              label={t('QEMU Guest Agent Enabled')}
              tooltip={t(
                'It is recommended to install and use this agent. The instance created with this image can be used to modify the password (QEMU Guest Agent needs to be installed when creating the image).'
              )}
            >
              <Radio.Group options={yesNoOptions()} optionType="button" />
            </Form.Item>
            <Form.Item
              name="hw_cpu_policy"
              label={t('CPU Policy')}
              rules={[{ required: true }]}
              tooltip={t(
                'CPU policy defines how instance vCPUs are mapped to host physical CPUs. Shared policy allows vCPUs to float and share host CPUs (overcommit enabled, default behavior). Dedicated policy pins vCPUs to specific physical CPUs, providing exclusive cores and predictable performance.'
              )}
            >
              <Select options={cpuPolicyOptions()} />
            </Form.Item>
            <Form.Item
              name="hw_cpu_thread_policy"
              label={t('CPU Thread Policy')}
              rules={[{ required: true }]}
              tooltip={t(
                'CPU thread policy defines how instance vCPUs are placed on CPU threads when hyperthreading is enabled. Prefer policy allows vCPUs to share sibling threads if needed (default behavior). Isolate policy ensures vCPUs are placed on separate physical cores, avoiding sibling threads for better isolation. Require policy forces vCPUs to be scheduled on sibling threads of the same core.'
              )}
            >
              <Select options={cpuThreadPolicyOptions()} />
            </Form.Item>
          </div>

          {progress ? (
            <Form.Item label={progress.step}>
              <Progress percent={progress.percent} status={submitting ? 'active' : undefined} />
              {progress.total ? (
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {formatSize(progress.loaded || 0)} / {formatSize(progress.total)}
                </div>
              ) : null}
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 8 }}
                message={t('Please do not close or leave this page until the upload finishes.')}
              />
            </Form.Item>
          ) : null}

          <Form.Item wrapperCol={{ xs: { span: 24 }, sm: { offset: 6, span: 16 }, lg: { offset: 5, span: 12 } }}>
            <Space>
              <Button onClick={onCancel} disabled={false}>
                {submitting && abortRef.current ? t('Cancel Upload') : t('Cancel')}
              </Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                {t('Confirm')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
