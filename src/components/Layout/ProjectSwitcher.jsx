import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Table, Input, Tag, Space, message } from 'antd';
import { SearchOutlined, SwapOutlined, AppstoreOutlined, DownOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { keystoneApi } from '@/api/keystone';
import { useAuthStore, formatErrorMessage } from '@/store/authStore';
import { useTranslation } from '@/core/i18n';
import { useThemeStore, THEMES } from '@/store/themeStore';

/**
 * Header project switcher - port of legacy GlobalHeader/ProjectDropdown + ProjectTable:
 * lists the user's projects (keystone /users/{id}/projects), disabled projects are not
 * selectable, and confirming re-scopes the token via skyline switch_project.
 */
export default function ProjectSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, currentProject, projects: sessionProjects, switchProject } = useAuthStore();
  const { currentTheme } = useThemeStore();
  const isDark = currentTheme === THEMES.DARK_OPS;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projects, setProjects] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState(currentProject?.id);

  useEffect(() => {
    if (!open) return;
    setSelected(currentProject?.id);
    setKeyword('');
    setLoading(true);
    keystoneApi
      .listUserProjects(user?.id)
      .then((res) => setProjects(res?.projects || []))
      .catch(() =>
        // fall back to the projects carried by the skyline profile
        setProjects(
          (sessionProjects || []).map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            domain_id: p.domainId,
            enabled: p.enabled !== false,
          }))
        )
      )
      .finally(() => setLoading(false));
  }, [open, user?.id, currentProject?.id, sessionProjects]);

  const data = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return projects.filter(
      (p) => !q || p.name?.toLowerCase().includes(q) || p.id?.toLowerCase().includes(q)
    );
  }, [projects, keyword]);

  const handleOk = async () => {
    const target = projects.find((p) => p.id === selected);
    if (!target || target.id === currentProject?.id) {
      setOpen(false);
      return;
    }
    setSubmitting(true);
    try {
      await switchProject(target.id, target.domain_id);
      message.success(`${t('Switch Project')}: ${target.name}`);
      setOpen(false);
      navigate('/base/overview');
      // every page keeps per-project data in local state: reload like the legacy console
      window.location.reload();
    } catch (err) {
      message.error(formatErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
        title={t('Switch Project')}
        style={{
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: isDark ? '#cbd5e1' : '#334155',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? '#1e293b' : '#f8fafc')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <AppstoreOutlined style={{ color: '#0068ff', fontSize: 13 }} />
        <span style={{ fontWeight: 600 }}>{currentProject?.name || '-'}</span>
        {currentProject?.domainName ? (
          <span style={{ color: '#94a3b8', fontSize: 12 }}>({currentProject.domainName})</span>
        ) : null}
        <SwapOutlined style={{ fontSize: 11, color: '#94a3b8' }} />
        <DownOutlined style={{ fontSize: 9, color: '#94a3b8', display: 'none' }} />
      </div>

      <Modal
        title={t('Switch Project')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleOk}
        okText={t('Confirm')}
        cancelText={t('Cancel')}
        confirmLoading={submitting}
        width={880}
        destroyOnHidden
      >
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder={t('Project Name')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 300, marginBottom: 12 }}
        />
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={data}
          pagination={{ pageSize: 10, size: 'small' }}
          scroll={{ x: 'max-content' }}
          onRow={(record) => ({
            onClick: () => record.enabled !== false && setSelected(record.id),
            style: { cursor: record.enabled !== false ? 'pointer' : 'not-allowed' },
          })}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selected ? [selected] : [],
            onChange: (keys) => setSelected(keys[0]),
            getCheckboxProps: (record) => ({ disabled: record.enabled === false }),
          }}
          columns={[
            {
              title: t('Project Name'),
              dataIndex: 'name',
              render: (v, r) => (
                <Space size={6}>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                  {r.id === currentProject?.id ? <Tag color="blue">{t('Current')}</Tag> : null}
                  {r.enabled === false ? <Tag>{t('Disabled')}</Tag> : null}
                </Space>
              ),
            },
            { title: t('ID'), dataIndex: 'id' },
            { title: t('Description'), dataIndex: 'description', render: (v) => v || '-' },
            {
              title: t('Tags'),
              dataIndex: 'tags',
              render: (tags) =>
                Array.isArray(tags) && tags.length ? tags.map((tag) => <Tag key={tag}>{tag}</Tag>) : '-',
            },
          ]}
        />
      </Modal>
    </>
  );
}
