import React, { useEffect, useState } from 'react';
import { t as tPolicy } from '@/core/i18n';
import { useParams as usePolicyParams, useLocation as usePolicyLocation } from 'react-router-dom';
import { checkActionPolicy as checkPagePolicy, usePolicyStore as usePagePolicyStore } from '@/core/policy';
import { Result as PolicyResult } from 'antd';
import { Breadcrumb, Button, Card, Checkbox, Col, Divider, Form, Input, Radio, Row, Select, Space, Switch, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { keystoneApi } from '@/api/keystone';
import { getErrorMessage } from '@/hooks/useResource';
import { t } from '@/core/i18n';
import { statusTypes, fetchDomainOptions, listDomains, listRoles, listAllProjects, listAllGroups, withDomainName, MemberRoleSelector, DomainSelect, emailRule } from '../common';
import { PhoneInput, phoneNumberRule } from '../phone';
import { passwordRule, confirmPasswordRule } from '@/components/form/rules';
import { userNameRule } from './UserList';

/** legacy identity/containers/User/actions/Create (FormAction page at /identity/user-admin/create) */
function UserCreatePage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState({ domainOptions: [], allDomains: [], projects: [], groups: [], roles: [] });
  const more = Form.useWatch('more', form);
  const listUrl = '/identity/user-admin';

  useEffect(() => {
    let alive = true;
    Promise.all([fetchDomainOptions(), listDomains(), listAllProjects(), listAllGroups(), listRoles()]).then(
      ([domainOptions, domains, projects, groups, roles]) => {
        if (!alive) return;
        setData({
          domainOptions,
          allDomains: domains.map((d) => ({ label: d.name, value: d.id })),
          projects: withDomainName(projects, domains),
          groups: withDomainName(groups, domains),
          roles,
        });
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  const onFinish = async (values) => {
    const { confirmPassword, more: _more, showAllDomains, projectRoles = {}, select_user_group = [], ...user } = values;
    setSubmitting(true);
    try {
      const result = await keystoneApi.createUser(user);
      const userId = result?.user?.id;
      if (userId) {
        const reqs = [];
        select_user_group.forEach((groupId) => reqs.push(keystoneApi.addUserToGroup(groupId, userId)));
        Object.keys(projectRoles).forEach((projectId) => {
          (projectRoles[projectId] || []).forEach((roleId) =>
            reqs.push(keystoneApi.assignProjectUserRole(projectId, userId, roleId))
          );
        });
        await Promise.all(reqs);
      }
      message.success(t('Operation completed successfully'));
      navigate(listUrl);
    } catch (err) {
      message.error(getErrorMessage(err, t('Operation failed')));
    } finally {
      setSubmitting(false);
    }
  };

  const col = { xs: 24, md: 12 };

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        items={[{ title: t('Identity') }, { title: <Link to={listUrl}>{t('Users')}</Link> }, { title: t('Create User') }]}
        style={{ marginBottom: 16, fontSize: 13 }}
      />
      <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>
        {t('Create User')}
      </h1>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ more: false, enabled: true, domain_id: 'default', projectRoles: {}, select_user_group: [] }}
          onFinish={onFinish}
          scrollToFirstError
        >
          <Row gutter={24}>
            <Col {...col}>
              <Form.Item
                name="name"
                label={t('User Name')}
                extra={t('User name can not be duplicated')}
                dependencies={['domain_id']}
                rules={[
                  { required: true, message: t('Please input') },
                  { max: 30 },
                  ({ getFieldValue }) => userNameRule(() => getFieldValue('domain_id')),
                ]}
              >
                <Input maxLength={30} />
              </Form.Item>
            </Col>
            <Col {...col}>
              <Form.Item name="email" label={t('Email')} rules={[{ required: true, message: t('Please input') }, emailRule()]}>
                <Input />
              </Form.Item>
            </Col>
            <Col {...col}>
              <Form.Item
                name="password"
                label={t('Password')}
                rules={[{ required: true, message: t('Please input') }, passwordRule()]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col {...col}>
              <Form.Item name="phone" label={t('Phone')} rules={[{ required: true, message: t('Please input') }, phoneNumberRule()]}>
                <PhoneInput />
              </Form.Item>
            </Col>
            <Col {...col}>
              <Form.Item
                name="confirmPassword"
                label={t('Confirm Password')}
                dependencies={['password']}
                rules={[{ required: true, message: t('Please input') }, confirmPasswordRule()]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col {...col}>
              <Form.Item name="domain_id" label={t('Domain')} rules={[{ required: true, message: t('Please select') }]}>
                <DomainSelect form={form} options={data.domainOptions} allOptions={data.allDomains} />
              </Form.Item>
              <Form.Item name="showAllDomains" valuePropName="checked" style={{ marginTop: -16 }}>
                <Checkbox>{t('Show All Domains')}</Checkbox>
              </Form.Item>
            </Col>
            <Col {...col}>
              <Form.Item name="enabled" label={t('Status')} rules={[{ required: true }]}>
                <Radio.Group options={statusTypes()} />
              </Form.Item>
            </Col>
            <Col {...col}>
              <Form.Item name="description" label={t('Description')}>
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
            <Col {...col}>
              <Form.Item name="real_name" label={t('Real Name')} rules={[{ required: true, message: t('Please input') }]}>
                <Input maxLength={30} />
              </Form.Item>
            </Col>
          </Row>
          <Divider />
          <Form.Item name="more" label={t('Advanced Options')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <div style={{ display: more ? 'block' : 'none' }}>
            <Form.Item name="projectRoles" label={t('Select Project')}>
              <MemberRoleSelector
                members={data.projects}
                roles={data.roles}
                memberTitle={t('Project ID/Name')}
                defaultRolesFor={() => (data.roles[0] ? [data.roles[0].id] : [])}
              />
            </Form.Item>
            <Form.Item name="select_user_group" label={t('Select User Group')}>
              <Select
                mode="multiple"
                allowClear
                showSearch
                placeholder={t('Please select')}
                options={data.groups.map((g) => ({ value: g.id, label: `${g.name} (${g.domainName})` }))}
                filterOption={(input, opt) => (opt?.label || '').toLowerCase().includes((input || '').toLowerCase())}
              />
            </Form.Item>
          </div>
          <Space style={{ marginTop: 8 }}>
            <Button onClick={() => navigate(listUrl)}>{t('Cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {t('Confirm')}
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}

/** legacy page `get policy()`: without the permission the page shows the no-access notice */
export default function UserCreate(props) {
  const params = usePolicyParams();
  const isAdmin = /-admin(\/|$)/.test(usePolicyLocation().pathname);
  usePagePolicyStore((st) => st.rules);
  const policy = { aliasPolicy: ['keystone:identity:create_user', 'keystone:identity:update_user', 'keystone:identity:list_roles'] };
  if (!checkPagePolicy(policy, { item: params })) {
    return <PolicyResult status="403" title={tPolicy("You don't have access to get {name}.", { name: tPolicy('Create User') })} />;
  }
  return <UserCreatePage {...props} />;
}
