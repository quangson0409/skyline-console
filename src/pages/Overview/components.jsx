import React from 'react';
import { Card, Progress, Tooltip, theme } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

export const NO_VALUE = '-';

export const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

/** Card with the console look (theme tokens -> works in every theme incl. dark) */
export function OverviewCard({ children, style, styles: cardStyles, ...rest }) {
  const { token } = theme.useToken();
  return (
    <Card
      variant="borderless"
      style={{
        borderRadius: 12,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        height: '100%',
        ...style,
      }}
      styles={cardStyles}
      {...rest}
    >
      {children}
    </Card>
  );
}

/** Legacy QuotaOverview colors: >=90% full, >=80% danger, else normal */
export const useQuotaColors = () => {
  const { token } = theme.useToken();
  return {
    normal: token.colorPrimary,
    danger: token.colorWarning,
    full: token.colorError,
  };
};

/** Legacy ResourceCircle colors: >90 danger, >70 warn, else info */
export const useUsageColors = () => {
  const { token } = theme.useToken();
  return { info: token.colorPrimary, warn: token.colorWarning, danger: token.colorError };
};

export const LabelWithTip = ({ label, tip }) => (
  <span>
    {label}
    <Tooltip title={tip}>
      <QuestionCircleOutlined style={{ marginLeft: 4 }} />
    </Tooltip>
  </span>
);

/**
 * One quota bar - port of legacy QuotaOverview.getItemInfo.
 * data[key] = { used, limit, reserved, left } (limit -1 = unlimited). Missing -> '-'.
 */
export function QuotaItem({ data, item, t, compact = false }) {
  const { token } = theme.useToken();
  const colors = useQuotaColors();
  const q = data?.[item.key];
  const hasUsed = q && isNum(q.used);
  const unlimited = q && q.limit === -1;

  let percent = 0;
  if (hasUsed && isNum(q.limit) && !unlimited) {
    if (q.limit > 0) percent = (q.used / q.limit) * 100;
    else if (q.used > 0) percent = 100;
  }
  const strokeColor = (percent >= 90 && colors.full) || (percent >= 80 && colors.danger) || colors.normal;

  const limitText = unlimited ? t('Unlimit') : isNum(q?.limit) ? q.limit : NO_VALUE;
  const usedText = hasUsed ? `${q.used} / ${limitText}` : NO_VALUE;
  let availableText = NO_VALUE;
  if (hasUsed && unlimited) availableText = t('Unlimit');
  else if (hasUsed && isNum(q.left)) availableText = Math.max(0, parseFloat(Number(q.left).toFixed(2)));

  let extra = null;
  const members = data?.server_group_members;
  if (item.key === 'server_groups' && members && isNum(members.limit)) {
    extra = ` (${t('Members of Each Group')}: ${members.limit === -1 ? t('Unlimit') : members.limit})`;
  }

  return (
    <div className="ov-quota-item" data-quota-key={item.key} style={{ padding: compact ? '4px 0' : '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
        <span style={{ color: token.colorText, fontWeight: 500 }}>
          {item.text}
          {extra ? <span style={{ color: token.colorTextSecondary, fontWeight: 400 }}>{extra}</span> : null}
        </span>
        <span className="ov-quota-value" style={{ fontWeight: 600, color: token.colorText, whiteSpace: 'nowrap' }}>
          {usedText}
        </span>
      </div>
      <Tooltip title={`${typeof item.text === 'string' ? item.text : ''} : ${usedText}`} placement="top">
        <Progress percent={percent} showInfo={false} strokeColor={strokeColor} size="small" style={{ margin: '4px 0 0' }} />
      </Tooltip>
      <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
        {t('Remaining')}: <span className="ov-quota-left">{availableText}</span>
        {item.hint ? <span> &middot; {item.hint(q)}</span> : null}
      </div>
    </div>
  );
}

/** Circle usage gauge - port of legacy AdminOverview ResourceCircle.renderCircle */
export function UsageCircle({ label, used, total, t }) {
  const { token } = theme.useToken();
  const colors = useUsageColors();
  const valid = isNum(used) && isNum(total) && total > 0;
  const percent = valid ? parseFloat(((used / total) * 100).toFixed(2)) : 0;
  const unused = valid ? parseFloat((total - used).toFixed(2)) : undefined;
  let color = colors.info;
  if (percent > 70) color = colors.warn;
  if (percent > 90) color = colors.danger;
  const fmt = (v) => (isNum(v) ? parseFloat(Number(v).toFixed(2)) : NO_VALUE);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontWeight: 600, marginBottom: 12, color: token.colorText }}>{label}</div>
      <Progress
        type="circle"
        size={140}
        percent={percent}
        strokeColor={color}
        format={() => (valid ? `${percent}%` : NO_VALUE)}
      />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, fontSize: 13, flexWrap: 'wrap' }}>
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color, marginRight: 6 }} />
          {t('Used')}: {fmt(used)}
        </span>
        <span>
          <span
            style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: token.colorFillSecondary, marginRight: 6 }}
          />
          {t('Unused')}: {valid ? (unused > 0 ? unused : 0) : NO_VALUE}
        </span>
      </div>
      <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>
        {t('Total')}: {fmt(total)}
      </div>
    </div>
  );
}
