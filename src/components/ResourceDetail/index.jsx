import React, { useMemo } from 'react';
import { Breadcrumb, Button, Card, Space, Tabs, Result, Skeleton } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import DetailCard from '@/components/DetailCard';
import Status from '@/components/Status';
import ItemActionButtons from '@/components/Action/ItemActionButtons';
import useActionRunner from '@/components/Action/useActionRunner';
import { useResource } from '@/hooks/useResource';
import { checkActionPolicy, usePolicyStore } from '@/core/policy';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/core/i18n';
import { useIsAdminPage } from '@/components/ResourcePage/helpers';

/**
 * ResourceDetail - declarative detail page (port of legacy containers/TabDetail).
 *   fetch(id, ctx)      -> Promise<object>
 *   info(detail, ctx)   -> DetailCard items for the header card
 *   tabs(detail, ctx)   -> [{ key, label, render: (detail, ctx) => node }]
 *   actions(ctx)        -> { firstAction, moreActions } executed against the detail object
 */
export default function ResourceDetail({
  title,
  breadcrumb = [],
  backPath,
  fetch,
  nameField = 'name',
  statusField = 'status',
  info,
  tabs,
  actions,
  interval = 0,
  isTransition,
  policy,
  aliasPolicy,
}) {
  const { t } = useTranslation();
  const params = useParams();
  const id = params.id;
  const navigate = useNavigate();
  const isAdmin = useIsAdminPage();
  const { currentProject, hasAdminRole } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeKey = searchParams.get('tab') || undefined;
  const setActiveKey = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const ctx = useMemo(
    () => ({ id, params, isAdmin, projectId: currentProject?.id, hasAdminRole, t }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, isAdmin, currentProject?.id, hasAdminRole, t]
  );

  // legacy TabDetail `get policy()`
  const policyRules = usePolicyStore((st) => st.rules);
  const policiesLoaded = usePolicyStore((st) => st.loaded);
  const canView = useMemo(
    () => checkActionPolicy({ policy, aliasPolicy }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [policy, aliasPolicy, policyRules]
  );
  // with a page policy, wait for /policies before the first request (avoids a 403 + toast on reload)
  const policyPending = Boolean(policy || aliasPolicy) && !policiesLoaded;
  const canFetch = canView && !policyPending;

  const { data: detail, loading, error, refetch } = useResource(() => (canFetch ? fetch(id, ctx) : Promise.resolve(null)), [ctx, canFetch], {
    initial: null,
    interval,
  });

  // detail pages poll only while the resource is in a transition status (legacy TabDetail)
  useAutoRefresh({ data: detail, refetch, initialAuto: false, ...(isTransition ? { isTransition } : {}) });

  const afterAction = (action) => {
    if (action?.id === 'delete' && backPath) {
      navigate(typeof backPath === 'function' ? backPath(ctx) : backPath);
      return;
    }
    refetch();
  };
  const { handleAction, actionModal } = useActionRunner({ onRefresh: () => refetch() });

  const fullCtx = { ...ctx, refetch, detail };
  const back = typeof backPath === 'function' ? backPath(ctx) : backPath;

  if (!canView) {
    return (
      <Result
        status="403"
        title={t("You don't have access to get {name}.", { name: typeof title === 'string' ? title : '' })}
        extra={back ? <Button onClick={() => navigate(back)}>{t('Back')}</Button> : null}
      />
    );
  }

  if (error && !detail) {
    return (
      <Result
        status="warning"
        title={t('Resource not found or failed to load')}
        extra={back ? <Button onClick={() => navigate(back)}>{t('Back')}</Button> : null}
      />
    );
  }

  const name = detail ? (typeof title === 'function' ? title(detail) : detail[nameField] || detail.id) : id;
  const actionCfg = typeof actions === 'function' ? actions(fullCtx) : actions;
  // tabs may declare `policy` / `aliasPolicy` (legacy tab-level get policy()): hidden when denied
  const tabList = (detail && tabs ? (typeof tabs === 'function' ? tabs(detail, fullCtx) : tabs) : [])
    .filter(Boolean)
    .filter((tab) => checkActionPolicy(tab, { item: detail }));
  const infoItems = detail && info ? info(detail, fullCtx) : [];

  const crumbs = [
    ...breadcrumb.map((c) => (typeof c === 'object' && c.path ? { title: <Link to={c.path}>{c.title}</Link> } : { title: c })),
    { title: name },
  ];

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={crumbs} style={{ marginBottom: 16, fontSize: 13 }} />
      <Card variant="borderless" style={{ marginBottom: 16, borderRadius: 8 }} styles={{ body: { padding: '16px 20px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Space size={12} wrap>
            {back ? <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(back)} /> : null}
            <h1 className="page-title" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
              {name}
            </h1>
            {detail && detail[statusField] !== undefined ? <Status status={detail[statusField]} /> : null}
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={loading} />
            {detail && actionCfg ? (
              <ItemActionButtons
                firstAction={actionCfg.firstAction}
                moreActions={actionCfg.moreActions}
                item={detail}
                isAdmin={hasAdminRole}
                onActionClick={async (action, item) => {
                  const wrapped = action.onSubmit
                    ? {
                        ...action,
                        onSubmit: async (...args) => {
                          const res = await action.onSubmit(...args);
                          afterAction(action);
                          return res;
                        },
                      }
                    : action;
                  handleAction(wrapped, item);
                }}
              />
            ) : null}
          </Space>
        </div>
      </Card>

      {!detail ? (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : (
        <>
          {infoItems.length ? <DetailCard title={t('Base Info')} items={infoItems} /> : null}
          {tabList.length ? (
            <Card variant="borderless" style={{ borderRadius: 8 }}>
              <Tabs
                activeKey={tabList.some((tab) => tab.key === activeKey) ? activeKey : tabList[0].key}
                onChange={setActiveKey}
                items={tabList.map((tab) => ({
                  key: tab.key,
                  label: tab.label,
                  children: tab.render(detail, fullCtx),
                }))}
              />
            </Card>
          ) : null}
        </>
      )}
      {actionModal}
    </div>
  );
}
