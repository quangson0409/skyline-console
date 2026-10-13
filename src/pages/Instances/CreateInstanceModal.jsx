import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Steps,
  Form,
  Input,
  InputNumber,
  Select,
  Radio,
  Switch,
  Button,
  Space,
  Row,
  Col,
  Card,
  Tag,
  Alert,
  Spin,
  Tooltip,
  Divider,
  message,
} from 'antd';
import {
  CloudServerOutlined,
  HddOutlined,
  ApartmentOutlined,
  SafetyCertificateOutlined,
  KeyOutlined,
  CodeOutlined,
  CheckCircleFilled,
  InfoCircleOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from '@/core/i18n';
import { useAuthStore } from '@/store/authStore';
import { novaApi } from '@/api/nova';
import { glanceApi } from '@/api/glance';
import { neutronApi } from '@/api/neutron';
import { cinderApi } from '@/api/cinder';

export default function CreateInstanceModal({ open, onCancel, onSuccess }) {
  const { t } = useTranslation();
  const { currentProject } = useAuthStore();
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  // OpenStack Resources
  const [images, setImages] = useState([]);
  const [flavors, setFlavors] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [subnets, setSubnets] = useState([]);
  const [securityGroups, setSecurityGroups] = useState([]);
  const [keypairs, setKeypairs] = useState([]);
  const [zones, setZones] = useState([]);
  const [volumeTypes, setVolumeTypes] = useState([]);
  const [availableVolumes, setAvailableVolumes] = useState([]);

  // Form State Watchers / Filters
  const [sourceType, setSourceType] = useState('image'); // 'image' | 'volume'
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [createNewVolume, setCreateNewVolume] = useState(false);
  const [selectedFlavorId, setSelectedFlavorId] = useState(null);
  const [flavorFilter, setFlavorFilter] = useState('');
  const [imageFilter, setImageFilter] = useState('');

  // Fetch all necessary OpenStack resources on open
  useEffect(() => {
    if (!open) return;
    setCurrentStep(0);
    form.resetFields();
    setSelectedImageId(null);
    setSelectedFlavorId(null);
    setCreateNewVolume(false);
    setSourceType('image');

    const fetchData = async () => {
      setLoadingData(true);
      try {
        const [
          imgRes,
          flvRes,
          netRes,
          subRes,
          sgRes,
          keyRes,
          azRes,
          vtRes,
          volRes,
        ] = await Promise.allSettled([
          glanceApi.listImages(),
          novaApi.listFlavors(),
          neutronApi.listNetworks(),
          neutronApi.listSubnets(),
          neutronApi.listSecurityGroups(currentProject?.id ? { project_id: currentProject.id } : {}),
          novaApi.listKeypairs(),
          novaApi.listAvailabilityZones(),
          cinderApi.listVolumeTypes(),
          cinderApi.listVolumes(),
        ]);

        if (imgRes.status === 'fulfilled') {
          const imgs = imgRes.value?.images || imgRes.value?.data?.images || [];
          setImages(imgs.filter((img) => img.status === 'active'));
          if (imgs.length > 0 && !selectedImageId) {
            setSelectedImageId(imgs[0].id);
            form.setFieldsValue({ imageRef: imgs[0].id });
          }
        }

        if (flvRes.status === 'fulfilled') {
          const flvs = flvRes.value?.flavors || flvRes.value?.data?.flavors || [];
          const sortedFlvs = [...flvs].sort((a, b) => (a.vcpus || 0) - (b.vcpus || 0) || (a.ram || 0) - (b.ram || 0));
          setFlavors(sortedFlvs);
          if (sortedFlvs.length > 0 && !selectedFlavorId) {
            setSelectedFlavorId(sortedFlvs[0].id);
            form.setFieldsValue({ flavorRef: sortedFlvs[0].id });
          }
        }

        if (netRes.status === 'fulfilled') {
          const nets = netRes.value?.networks || netRes.value?.data?.networks || [];
          setNetworks(nets.filter((n) => n.status === 'ACTIVE' || n.admin_state_up));
          if (nets.length > 0) {
            form.setFieldsValue({ networkId: nets[0].id });
          }
        }

        if (subRes.status === 'fulfilled') {
          const subs = subRes.value?.subnets || subRes.value?.data?.subnets || [];
          setSubnets(subs);
        }

        if (sgRes.status === 'fulfilled') {
          const sgs = sgRes.value?.security_groups || sgRes.value?.data?.security_groups || [];
          setSecurityGroups(sgs);
          const defaultSg = sgs.find((s) => s.name === 'default');
          if (defaultSg) {
            form.setFieldsValue({ securityGroupNames: ['default'] });
          } else if (sgs.length > 0) {
            form.setFieldsValue({ securityGroupNames: [sgs[0].name] });
          }
        }

        if (keyRes.status === 'fulfilled') {
          const keys = keyRes.value?.keypairs || keyRes.value?.data?.keypairs || [];
          setKeypairs(keys.map((k) => k.keypair || k));
        }

        if (azRes.status === 'fulfilled') {
          const azs = azRes.value?.availabilityZoneInfo || [];
          setZones(azs.filter((z) => z.zoneState?.available));
        }

        if (vtRes.status === 'fulfilled') {
          const vts = vtRes.value?.volume_types || [];
          setVolumeTypes(vts);
        }

        if (volRes.status === 'fulfilled') {
          const vols = volRes.value?.volumes || [];
          setAvailableVolumes(vols.filter((v) => v.status === 'available'));
        }
      } catch (err) {
        console.error('Lỗi nạp tài nguyên tạo instance:', err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [open, form]);

  // Selected entities for quick display & validation
  const currentImage = useMemo(
    () => images.find((img) => img.id === selectedImageId),
    [images, selectedImageId]
  );

  const currentFlavor = useMemo(
    () => flavors.find((flv) => String(flv.id) === String(selectedFlavorId)),
    [flavors, selectedFlavorId]
  );

  // Network enriched with subnets CIDR
  const enrichedNetworks = useMemo(() => {
    return networks.map((net) => {
      const netSubnets = subnets.filter((s) => s.network_id === net.id);
      const cidrs = netSubnets.map((s) => s.cidr).join(', ');
      return {
        ...net,
        cidrDisplay: cidrs || t('Auto DHCP'),
      };
    });
  }, [networks, subnets, t]);

  // Flavor compatibility check
  const flavorWarning = useMemo(() => {
    if (!currentImage || !currentFlavor) return null;
    const minRamMb = currentImage.min_ram || 0;
    const minDiskGb = currentImage.min_disk || 0;
    const flvRamMb = currentFlavor.ram || 0;
    const flvDiskGb = currentFlavor.disk || 0;

    if (flvRamMb < minRamMb) {
      return t('Warning: Image requires at least {minRam} MB RAM, but Flavor only has {flvRam} MB!', { minRam: minRamMb, flvRam: flvRamMb });
    }
    if (flvDiskGb > 0 && flvDiskGb < minDiskGb) {
      return t('Warning: Image requires at least {minDisk} GB Disk, but Flavor only has {flvDisk} GB!', { minDisk: minDiskGb, flvDisk: flvDiskGb });
    }
    return null;
  }, [currentImage, currentFlavor, t]);

  // Step Validation before next
  const handleNext = async () => {
    try {
      if (currentStep === 0) {
        await form.validateFields(['name', 'count', 'availability_zone']);
        if (sourceType === 'image') {
          await form.validateFields(['imageRef']);
          if (createNewVolume) {
            await form.validateFields(['volumeSize']);
          }
        } else {
          await form.validateFields(['volumeId']);
        }
      } else if (currentStep === 1) {
        await form.validateFields(['flavorRef']);
        if (flavorWarning) {
          message.warning(flavorWarning);
          return;
        }
      } else if (currentStep === 2) {
        await form.validateFields(['networkId', 'securityGroupNames']);
      }
      setCurrentStep((prev) => prev + 1);
    } catch (err) {
      if (err.errorFields && err.errorFields.length > 0) {
        const errorMsg = err.errorFields[0]?.errors?.[0];
        if (errorMsg) message.warning(errorMsg);
      }
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  // Submit Launch Instance with robust validation and schema compliance
  const handleLaunch = async () => {
    try {
      const values = await form.validateFields();
      if (flavorWarning) {
        message.warning(flavorWarning);
        setCurrentStep(1);
        return;
      }
      setSubmitting(true);

      const payload = {
        name: values.name.trim(),
        flavorRef: values.flavorRef,
        availability_zone: values.availability_zone || 'nova',
        min_count: values.count || 1,
        max_count: values.count || 1,
      };

      // Boot Source logic - strictly conforming to OpenStack Nova BDM v2 schema (no unexpected properties like volume_type)
      if (sourceType === 'image') {
        if (createNewVolume) {
          payload.block_device_mapping_v2 = [
            {
              boot_index: 0,
              uuid: values.imageRef,
              source_type: 'image',
              destination_type: 'volume',
              volume_size: Number(values.volumeSize) || 20,
              delete_on_termination: Boolean(values.deleteOnTermination ?? true),
            },
          ];
        } else {
          payload.imageRef = values.imageRef;
        }
      } else if (sourceType === 'volume') {
        payload.block_device_mapping_v2 = [
          {
            boot_index: 0,
            uuid: values.volumeId,
            source_type: 'volume',
            destination_type: 'volume',
            delete_on_termination: Boolean(values.deleteOnTermination ?? false),
          },
        ];
      }

      // Networks
      if (values.networkId) {
        payload.networks = [{ uuid: values.networkId }];
      }

      // Security Groups
      if (values.securityGroupNames && values.securityGroupNames.length > 0) {
        payload.security_groups = values.securityGroupNames.map((name) => ({ name }));
      }

      // SSH Keypair
      if (values.key_name) {
        payload.key_name = values.key_name;
      }

      // Admin Password
      if (values.adminPass) {
        payload.adminPass = values.adminPass;
      }

      // User Data (Cloud-init)
      if (values.user_data) {
        try {
          payload.user_data = btoa(unescape(encodeURIComponent(values.user_data)));
        } catch {
          payload.user_data = btoa(values.user_data);
        }
      }

      await novaApi.createServer(payload);
      message.success(t("Instance '{name}' created successfully!", { name: values.name }));
      if (onSuccess) onSuccess();
      if (onCancel) onCancel();
    } catch (err) {
      if (err.errorFields && err.errorFields.length > 0) {
        const firstError = err.errorFields[0];
        const errorMsg = firstError.errors?.[0] || t('Please complete required fields');
        message.warning(errorMsg);

        // Auto-navigate to step containing the invalid field
        const fieldName = firstError.name?.[0];
        if (['name', 'count', 'availability_zone', 'imageRef', 'volumeId', 'volumeSize'].includes(fieldName)) {
          setCurrentStep(0);
        } else if (fieldName === 'flavorRef') {
          setCurrentStep(1);
        } else if (['networkId', 'securityGroupNames'].includes(fieldName)) {
          setCurrentStep(2);
        }
        return;
      }

      const data = err.response?.data;
      const msg =
        data?.badRequest?.message ||
        data?.conflictingRequest?.message ||
        data?.forbidden?.message ||
        data?.itemNotFound?.message ||
        data?.computeFault?.message ||
        err.message ||
        t('Failed to create instance');
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick cloud-init templates
  const applyCloudInitTemplate = (templateKey) => {
    switch (templateKey) {
      case 'nginx':
        form.setFieldsValue({
          user_data: `#!/bin/bash\napt-get update -y || yum update -y\napt-get install -y nginx || yum install -y nginx\nsystemctl start nginx\nsystemctl enable nginx\necho "<h1>Hello from Skyline Cloud Instance</h1>" > /var/www/html/index.html\n`,
        });
        break;
      case 'docker':
        form.setFieldsValue({
          user_data: `#!/bin/bash\ncurl -fsSL https://get.docker.com -o get-docker.sh\nsh get-docker.sh\nsystemctl enable --now docker\n`,
        });
        break;
      case 'update':
        form.setFieldsValue({
          user_data: `#!/bin/bash\napt-get update && apt-get upgrade -y || yum update -y\n`,
        });
        break;
      default:
        form.setFieldsValue({ user_data: '' });
    }
  };

  const stepsItems = [
    {
      title: t('Source & Basic'),
      icon: <CloudServerOutlined />,
    },
    {
      title: t('Flavor & Hardware'),
      icon: <ThunderboltOutlined />,
    },
    {
      title: t('Network & Security'),
      icon: <ApartmentOutlined />,
    },
    {
      title: t('Keypair & Advanced'),
      icon: <KeyOutlined />,
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      width={940}
      style={{ top: 24 }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              backgroundColor: '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0068ff',
              fontSize: 18,
            }}
          >
            <CloudServerOutlined />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
              {t('Launch Instance')}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {t('Launch Instance Subtitle')}
            </div>
          </div>
        </div>
      }
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 12,
            borderTop: '1px solid #f1f5f9',
          }}
        >
          {/* Live Configuration Badge Summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tag color="blue" style={{ borderRadius: 4, margin: 0 }}>
              {form.getFieldValue('name') || t('Unnamed')}
            </Tag>
            {currentImage && (
              <Tag color="cyan" style={{ borderRadius: 4, margin: 0 }}>
                {currentImage.name}
              </Tag>
            )}
            {currentFlavor && (
              <Tag color="geekblue" style={{ borderRadius: 4, margin: 0 }}>
                {currentFlavor.name} ({currentFlavor.vcpus} vCPU / {currentFlavor.ram >= 1024 ? currentFlavor.ram / 1024 : currentFlavor.ram} GiB)
              </Tag>
            )}
          </div>

          <Space size={10}>
            <Button onClick={onCancel}>{t('Cancel')}</Button>
            {currentStep > 0 && (
              <Button onClick={handlePrev} disabled={submitting}>
                {t('Previous')}
              </Button>
            )}
            {currentStep < 3 ? (
              <Button type="primary" onClick={handleNext} style={{ backgroundColor: '#0068ff' }}>
                {t('Next')}
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={handleLaunch}
                loading={submitting}
                style={{
                  backgroundColor: '#0068ff',
                  boxShadow: '0 2px 8px rgba(0, 104, 255, 0.3)',
                }}
              >
                {t('Create Instance')}
              </Button>
            )}
          </Space>
        </div>
      }
      destroyOnHidden
    >
      <Spin spinning={loadingData}>
        {/* Step Indicator */}
        <div style={{ marginBottom: 24, marginTop: 8 }}>
          <Steps current={currentStep} items={stepsItems} size="small" />
        </div>

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            count: 1,
            availability_zone: 'nova',
            volumeSize: 20,
            deleteOnTermination: true,
          }}
        >
          {/* STEP 0: NGUỒN KHỞI ĐỘNG & THÔNG TIN CƠ BẢN */}
          <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="name"
                  label={<b>{t('Instance Name')}</b>}
                  rules={[
                    { required: true, message: t('Please enter instance name!') },
                    {
                      pattern: /^[a-zA-Z0-9-._]+$/,
                      message: t('Only letters, numbers, hyphens, underscores and dots are allowed'),
                    },
                  ]}
                  tooltip={t('Unique instance name in OpenStack')}
                >
                  <Input placeholder="my-server-01" size="middle" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item
                  name="count"
                  label={<b>{t('Count')}</b>}
                  rules={[{ required: true }]}
                >
                  <InputNumber min={1} max={10} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item
                  name="availability_zone"
                  label={<b>{t('Availability Zone')}</b>}
                  rules={[{ required: true }]}
                >
                  <Select
                    options={
                      zones.length > 0
                        ? zones.map((z) => ({ label: z.zoneName, value: z.zoneName }))
                        : [{ label: 'nova', value: 'nova' }]
                    }
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item name="description" label={t('Description')}>
              <Input placeholder={t('Enter description (optional)...')} />
            </Form.Item>

            <Divider style={{ margin: '14px 0' }} />

            {/* Boot Source Mode */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                {t('Boot Source')}
              </div>
              <Radio.Group
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                buttonStyle="solid"
              >
                <Radio.Button value="image">
                  <Space>
                    <CloudServerOutlined />
                    <span>{t('Boot from Image')}</span>
                  </Space>
                </Radio.Button>
                <Radio.Button value="volume">
                  <Space>
                    <HddOutlined />
                    <span>{t('Boot from Existing Volume')}</span>
                  </Space>
                </Radio.Button>
              </Radio.Group>
            </div>

            {sourceType === 'image' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                    {t('Operating System Image')}:
                  </span>
                  <Input
                    placeholder={t('Search OS images...')}
                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                    size="small"
                    style={{ width: 220 }}
                    value={imageFilter}
                    onChange={(e) => setImageFilter(e.target.value)}
                    allowClear
                  />
                </div>

                <Form.Item
                  name="imageRef"
                  rules={[{ required: true, message: t('Please select an image!') }]}
                >
                  <Row gutter={[12, 12]} style={{ maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                    {images
                      .filter((img) =>
                        img.name.toLowerCase().includes(imageFilter.toLowerCase())
                      )
                      .map((img) => {
                        const isSelected = selectedImageId === img.id;
                        return (
                          <Col xs={24} sm={12} key={img.id}>
                            <Card
                              size="small"
                              hoverable
                              onClick={() => {
                                setSelectedImageId(img.id);
                                form.setFieldsValue({ imageRef: img.id });
                              }}
                              style={{
                                borderColor: isSelected ? '#0068ff' : '#e2e8f0',
                                backgroundColor: isSelected ? '#f0f7ff' : '#ffffff',
                                borderRadius: 8,
                                transition: 'all 0.2s',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? '#0068ff' : '#0f172a' }}>
                                  {img.name}
                                </div>
                                {isSelected && <CheckCircleFilled style={{ color: '#0068ff', fontSize: 16 }} />}
                              </div>
                              <Space size={6} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                                <Tag color="default" style={{ fontSize: 11, margin: 0 }}>
                                  {img.disk_format?.toUpperCase() || 'RAW'}
                                </Tag>
                                <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
                                  Min RAM: {img.min_ram || 0} MB
                                </Tag>
                                <Tag color="purple" style={{ fontSize: 11, margin: 0 }}>
                                  Min Disk: {img.min_disk || 0} GB
                                </Tag>
                              </Space>
                            </Card>
                          </Col>
                        );
                      })}
                  </Row>
                </Form.Item>

                {/* Option to create volume from image */}
                <Card
                  size="small"
                  style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    marginTop: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space direction="vertical" size={2}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                        {t('Create New Volume as Root Disk')}
                      </span>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {t('Store root disk on persistent Cinder storage instead of ephemeral hypervisor disk')}
                      </span>
                    </Space>
                    <Switch checked={createNewVolume} onChange={setCreateNewVolume} />
                  </div>

                  {createNewVolume && (
                    <Row gutter={16} style={{ marginTop: 14 }}>
                      <Col xs={24} sm={8}>
                        <Form.Item
                          name="volumeSize"
                          label={t('Root Disk Size (GiB)')}
                          rules={[{ required: true }]}
                        >
                          <InputNumber min={currentImage?.min_disk || 10} max={1000} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="volumeType" label={t('Volume Type (Optional)')}>
                          <Select
                            placeholder={t('Default')}
                            allowClear
                            options={volumeTypes.map((vt) => ({ label: vt.name, value: vt.name }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item
                          name="deleteOnTermination"
                          label={t('Delete Volume on Instance Delete')}
                          tooltip={t('Automatically purge attached root volume when instance is deleted')}
                          valuePropName="checked"
                        >
                          <Switch defaultChecked />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                </Card>
              </div>
            )}

            {sourceType === 'volume' && (
              <Form.Item
                name="volumeId"
                label={<b>{t('Existing Bootable Volume')}</b>}
                rules={[{ required: true, message: t('Please select a volume!') }]}
              >
                <Select
                  placeholder={t('Please select a volume!')}
                  options={availableVolumes.map((vol) => ({
                    label: `${vol.name || vol.id} (${vol.size} GiB - ${vol.volume_type || 'standard'})`,
                    value: vol.id,
                  }))}
                />
              </Form.Item>
            )}
          </div>

          {/* STEP 1: FLAVOR & PHẦN CỨNG */}
          <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{t('Select Compute Flavor')}</span>
                <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                  ({flavors.length} {t('available flavors')})
                </span>
              </div>
              <Input
                placeholder={t('Filter flavors by name, CPU, RAM...')}
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                size="small"
                style={{ width: 220 }}
                value={flavorFilter}
                onChange={(e) => setFlavorFilter(e.target.value)}
                allowClear
              />
            </div>

            {flavorWarning && (
              <Alert
                message={flavorWarning}
                type="warning"
                showIcon
                style={{ marginBottom: 14, borderRadius: 6 }}
              />
            )}

            <Form.Item
              name="flavorRef"
              rules={[{ required: true, message: t('Please select a flavor!') }]}
            >
              <Row gutter={[12, 12]} style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
                {flavors
                  .filter((flv) => flv.name.toLowerCase().includes(flavorFilter.toLowerCase()))
                  .map((flv) => {
                    const isSelected = String(selectedFlavorId) === String(flv.id);
                    const ramGb = flv.ram >= 1024 ? (flv.ram / 1024).toFixed(0) : flv.ram;
                    const ramUnit = flv.ram >= 1024 ? 'GiB' : 'MB';

                    return (
                      <Col xs={24} sm={12} md={8} key={flv.id}>
                        <Card
                          size="small"
                          hoverable
                          onClick={() => {
                            setSelectedFlavorId(flv.id);
                            form.setFieldsValue({ flavorRef: flv.id });
                          }}
                          style={{
                            borderColor: isSelected ? '#0068ff' : '#e2e8f0',
                            backgroundColor: isSelected ? '#f0f7ff' : '#ffffff',
                            borderRadius: 8,
                            boxShadow: isSelected ? '0 0 0 1px #0068ff' : 'none',
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: isSelected ? '#0068ff' : '#0f172a' }}>
                              {flv.name}
                            </div>
                            {isSelected && <CheckCircleFilled style={{ color: '#0068ff', fontSize: 16 }} />}
                          </div>

                          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b' }}>vCPUs:</span>
                              <b style={{ color: '#0f172a' }}>{flv.vcpus} Core</b>
                            </div>
                            <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b' }}>RAM:</span>
                              <b style={{ color: '#0068ff' }}>{ramGb} {ramUnit}</b>
                            </div>
                            <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b' }}>Root Disk:</span>
                              <b style={{ color: '#0f172a' }}>{flv.disk || 0} GiB</b>
                            </div>
                          </div>
                        </Card>
                      </Col>
                    );
                  })}
              </Row>
            </Form.Item>
          </div>

          {/* STEP 2: MẠNG & BẢO MẬT */}
          <div style={{ display: currentStep === 2 ? 'block' : 'none' }}>
            <Form.Item
              name="networkId"
              label={<b>{t('VPC Network')}</b>}
              rules={[{ required: true, message: t('Please select a network!') }]}
            >
              <Select
                placeholder={t('Please select a network!')}
                options={enrichedNetworks.map((net) => ({
                  label: `${net.name || net.id} (Subnet: ${net.cidrDisplay})`,
                  value: net.id,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="securityGroupNames"
              label={<b>{t('Security Groups')}</b>}
              rules={[{ required: true, message: t('Please select at least one security group!') }]}
              tooltip={t('Firewall rules applied to instance interfaces')}
            >
              <Select
                mode="multiple"
                placeholder={t('Select security groups to apply...')}
                options={securityGroups.map((sg) => ({
                  label: `${sg.name} (${sg.description || 'Rules: ' + (sg.security_group_rules?.length || 0)})`,
                  value: sg.name,
                }))}
              />
            </Form.Item>

            <Alert
              message={t('Note on Instance IP')}
              description={t('Fixed internal IP will be automatically assigned via DHCP from the selected subnet. You can associate a Floating IP after instance creation.')}
              type="info"
              showIcon
              style={{ marginTop: 12, borderRadius: 6 }}
            />
          </div>

          {/* STEP 3: KHÓA SSH & NÂNG CAO */}
          <div style={{ display: currentStep === 3 ? 'block' : 'none' }}>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="key_name"
                  label={<b>{t('SSH Keypair')}</b>}
                  tooltip={t('Select SSH keypair to inject for remote login')}
                >
                  <Select
                    placeholder={t('Select SSH keypair...')}
                    allowClear
                    options={[
                      { label: t('No keypair'), value: '' },
                      ...keypairs.map((k) => ({
                        label: `${k.name} (Fingerprint: ${k.fingerprint?.substring(0, 16)}...)`,
                        value: k.name,
                      })),
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  name="adminPass"
                  label={<b>{t('Administrator Password (Optional)')}</b>}
                  tooltip={t('Initial root/administrator password if guest OS supports qemu-guest-agent')}
                >
                  <Input.Password placeholder={t('Leave blank if only using SSH key...')} />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '14px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Space>
                <CodeOutlined style={{ color: '#0068ff' }} />
                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                  {t('Cloud-init User Data Script')}
                </span>
              </Space>
              <Select
                placeholder={t('Quick template...')}
                size="small"
                style={{ width: 220 }}
                onChange={applyCloudInitTemplate}
                options={[
                  { label: t('Clear script'), value: 'clear' },
                  { label: t('Install Nginx Web Server'), value: 'nginx' },
                  { label: t('Install Docker Engine'), value: 'docker' },
                  { label: t('Update OS packages (apt/yum)'), value: 'update' },
                ]}
              />
            </div>

            <Form.Item name="user_data">
              <Input.TextArea
                rows={6}
                placeholder={`#!/bin/bash\n# Script tự động chạy khi máy ảo boot lần đầu tiên\necho "Hello from Skyline" > /tmp/skyline.log\n`}
                style={{
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: 12,
                  backgroundColor: '#0f172a',
                  color: '#38bdf8',
                  borderRadius: 6,
                }}
              />
            </Form.Item>
          </div>
        </Form>
      </Spin>
    </Modal>
  );
}
