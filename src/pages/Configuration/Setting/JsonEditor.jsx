import React, { useMemo, useRef } from 'react';
import { Button, Input, Space, Typography, theme } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, FormatPainterOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

const MONO = "'JetBrains Mono', 'Fira Code', Menlo, Consolas, 'Liberation Mono', monospace";

const parseJson = (text) => {
  if (text === undefined || text === null || String(text).trim() === '') return { ok: false, empty: true };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

/**
 * Lightweight stand-in for the legacy CodeEditor (mode json) of Setting/Edit:
 * monospace editor with line numbers, live JSON validation and a Format button.
 * The value is the JSON text (validated by jsonRule on the Form.Item).
 */
export default function JsonEditor({ value = '', onChange, rows = 16, id }) {
  const { token } = theme.useToken();
  const gutterRef = useRef(null);
  const state = useMemo(() => parseJson(value), [value]);
  const lineCount = Math.max(String(value || '').split('\n').length, rows);

  const format = () => {
    if (state.ok) onChange?.(JSON.stringify(state.value, null, 2));
  };

  const onKeyDown = (e) => {
    // Tab inserts two spaces like a code editor
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const el = e.target;
      const { selectionStart, selectionEnd } = el;
      const text = String(value || '');
      const next = `${text.slice(0, selectionStart)}  ${text.slice(selectionEnd)}`;
      onChange?.(next);
      requestAnimationFrame(() => {
        el.selectionStart = selectionStart + 2;
        el.selectionEnd = selectionStart + 2;
      });
    }
  };

  const lineHeight = 20;
  return (
    <div className="json-code-editor">
      <Space style={{ marginBottom: 6, width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          JSON
        </Typography.Text>
        <Space size={12}>
          {state.ok ? (
            <Typography.Text type="success" style={{ fontSize: 12 }}>
              <CheckCircleFilled /> {t('Valid JSON')}
            </Typography.Text>
          ) : (
            !state.empty && (
              <Typography.Text type="danger" style={{ fontSize: 12 }} title={state.error}>
                <CloseCircleFilled /> {t('Invalid JSON')}
              </Typography.Text>
            )
          )}
          <Button size="small" icon={<FormatPainterOutlined />} disabled={!state.ok} onClick={format}>
            {t('Format')}
          </Button>
        </Space>
      </Space>
      <div
        style={{
          display: 'flex',
          border: `1px solid ${state.ok || state.empty ? token.colorBorder : token.colorError}`,
          borderRadius: token.borderRadius,
          overflow: 'hidden',
          background: token.colorFillQuaternary,
        }}
      >
        <div
          ref={gutterRef}
          aria-hidden
          style={{
            fontFamily: MONO,
            fontSize: 12.5,
            lineHeight: `${lineHeight}px`,
            padding: '4px 8px',
            textAlign: 'right',
            color: token.colorTextQuaternary,
            userSelect: 'none',
            overflow: 'hidden',
            height: rows * lineHeight + 10,
            minWidth: 36,
            borderRight: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <Input.TextArea
          id={id}
          value={value}
          spellCheck={false}
          variant="borderless"
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop;
          }}
          style={{
            fontFamily: MONO,
            fontSize: 12.5,
            lineHeight: `${lineHeight}px`,
            height: rows * lineHeight + 10,
            resize: 'none',
            padding: '4px 10px',
            whiteSpace: 'pre',
            overflow: 'auto',
            background: token.colorBgContainer,
          }}
        />
      </div>
    </div>
  );
}
