import React from 'react';
import { Breadcrumb, Button, Card, Grid, Spin, Steps, theme } from 'antd';
import { Link } from 'react-router-dom';
import { t } from '@/core/i18n';

/**
 * Port of legacy components/StepForm (StepAction): page header, steps bar, step form,
 * bottom footer bar (left: count / quota badge, right: Cancel / Previous / Next / OK) and the
 * right-top quota panel.
 */
export default function WizardShell({
  title,
  breadcrumb = [],
  steps = [],
  current = 0,
  children,
  footerLeft = null,
  quota = null,
  onCancel,
  onPrev,
  onNext,
  onOk,
  disableNext = false,
  disableSubmit = false,
  submitting = false,
  loading = false,
}) {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const wide = !!screens.xl;
  const isLast = current === steps.length - 1;

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }} className="instance-create-wizard">
      <Breadcrumb items={breadcrumb} style={{ marginBottom: 16, fontSize: 13 }} />
      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0, color: token.colorText }}>
          {title}
        </h1>
      </div>
      <Spin spinning={loading || submitting}>
        <Card variant="borderless" styles={{ body: { padding: 0 } }} style={{ borderRadius: token.borderRadiusLG, overflow: 'visible' }}>
          <div style={{ padding: '24px 56px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
            <Steps current={current} items={steps.map((it) => ({ title: it.title }))} responsive />
          </div>
          {quota && !wide ? <div style={{ padding: '16px 24px 0', display: 'flex', justifyContent: 'flex-end' }}>{quota}</div> : null}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '24px 24px 32px', minHeight: 'calc(100vh - 360px)' }}>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>{children}</div>
            {quota && wide ? (
              <aside style={{ position: 'sticky', top: 80, flex: 'none', zIndex: 4, display: 'flex', justifyContent: 'flex-end' }}>
                {quota}
              </aside>
            ) : null}
          </div>
          <div
            className="instance-create-footer"
            style={{
              position: 'sticky',
              bottom: 0,
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              minHeight: 56,
              padding: '10px 24px',
              background: token.colorBgContainer,
              borderTop: `1px solid ${token.colorBorderSecondary}`,
              boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.06)',
              borderRadius: `0 0 ${token.borderRadiusLG}px ${token.borderRadiusLG}px`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', minHeight: 36, color: token.colorText, flex: '1 1 320px' }}>
              {footerLeft}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }} className="step-form-footer-btns">
              <Button onClick={onCancel}>{t('Cancel')}</Button>
              {current > 0 ? <Button onClick={onPrev}>{`${t('Previous')}: ${steps[current - 1].title}`}</Button> : null}
              {!isLast ? (
                <Button type="primary" onClick={onNext} disabled={disableNext}>
                  {`${t('Next')}: ${steps[current + 1].title}`}
                </Button>
              ) : (
                <Button type="primary" onClick={onOk} disabled={disableSubmit} loading={submitting}>
                  {t('OK')}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </Spin>
    </div>
  );
}

export const listCrumb = (to, title) => ({ title: <Link to={to}>{title}</Link> });
