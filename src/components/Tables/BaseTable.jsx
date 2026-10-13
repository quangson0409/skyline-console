import React, { useState, useMemo } from 'react';
import { Table, Input, Button, Space, Card, Dropdown, Tooltip, Typography, Switch } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { t } from '@/core/i18n';
import ResourceEmptyState from '@/components/Common/ResourceEmptyState';
import MagicInput from '@/components/MagicInput';
import ItemActionButtons from '@/components/Action/ItemActionButtons';
import { useThemeStore, THEMES } from '@/store/themeStore';

const { Text } = Typography;

export default function BaseTable({
  columns = [],
  dataSource = [],
  loading = false,
  rowKey = 'id',
  searchPlaceholder,
  searchFields = ['name', 'id'],
  filterParams, // Legacy Skyline MagicInput params
  filters = {},
  onFilterChange,
  onRefresh,
  primaryAction,
  primaryActions = [],
  batchActions = [],
  rowActions,
  extraActions,
  selectedRowKeys = [],
  onSelectChange,
  pagination = { pageSize: 10 },
  style = {},
  isAdmin = false,
  onActionClick,
  getCheckboxProps,
  autoRefresh,
  onAutoRefreshChange,
}) {
  const [searchText, setSearchText] = useState('');
  const [internalFilters, setInternalFilters] = useState(filters);
  const { currentTheme } = useThemeStore();
  const isDark = currentTheme === THEMES.DARK_OPS;

  // Handle filter change for MagicInput
  const handleFilterChange = (newFilters) => {
    setInternalFilters(newFilters);
    if (onFilterChange) {
      onFilterChange(newFilters);
    }
  };

  // Search and multi-criteria filtering
  const filteredData = useMemo(() => {
    let result = dataSource;

    // 1. If using MagicInput filterParams
    if (filterParams && filterParams.length > 0) {
      const activeFilterEntries = Object.entries(internalFilters).filter(([_, v]) => Boolean(v));
      if (activeFilterEntries.length > 0) {
        result = result.filter((item) => {
          for (const [key, val] of activeFilterEntries) {
            const q = String(val).toLowerCase().trim();
            if (key === 'name') {
              const match =
                (item.name && item.name.toLowerCase().includes(q)) ||
                (item.id && item.id.toLowerCase().includes(q));
              if (!match) return false;
            } else if (key === 'status') {
              if (item.status && item.status.toUpperCase() !== q.toUpperCase()) return false;
            } else if (key === 'keyword') {
              const matchAny = searchFields.some((field) => {
                const fVal = item[field];
                return fVal && String(fVal).toLowerCase().includes(q);
              });
              if (!matchAny) return false;
            } else {
              const itemVal = item[key];
              if (itemVal === undefined || itemVal === null) return false;
              if (!String(itemVal).toLowerCase().includes(q)) return false;
            }
          }
          return true;
        });
      }
    } else if (searchText.trim()) {
      // 2. Simple search fallback
      const query = searchText.toLowerCase().trim();
      result = result.filter((item) =>
        searchFields.some((field) => {
          const val = item[field];
          return val && String(val).toLowerCase().includes(query);
        })
      );
    }

    return result;
  }, [dataSource, searchText, internalFilters, filterParams, searchFields]);

  // Combine columns with rowActions if provided and not already present
  const finalColumns = useMemo(() => {
    if (!rowActions) return columns;
    const hasActionCol = columns.some((c) => c.key === 'action' || c.dataIndex === 'action');
    if (hasActionCol) return columns;

    const actionColumn = {
      title: t('Action'),
      key: 'action',
      fixed: 'right',
      align: 'left',
      render: (_, record) => (
        <ItemActionButtons
          firstAction={rowActions.firstAction}
          moreActions={rowActions.moreActions}
          item={record}
          isAdmin={isAdmin}
          onActionClick={onActionClick}
        />
      ),
    };
    return [...columns, actionColumn];
  }, [columns, rowActions, isAdmin, onActionClick]);

  // Row selection configuration
  const rowSelection = onSelectChange
    ? {
        selectedRowKeys,
        onChange: onSelectChange,
        getCheckboxProps,
      }
    : undefined;

  // Primary action list
  const allPrimaryActions = useMemo(() => {
    const list = [...primaryActions];
    if (primaryAction && !list.some((a) => a.id === primaryAction.id || a.label === primaryAction.label)) {
      list.unshift(primaryAction);
    }
    return list;
  }, [primaryAction, primaryActions]);

  return (
    <div style={{ ...style }}>
      {/* Table Action Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {/* Left: Search / MagicInput & Refresh & Batch Actions */}
        <Space wrap size={12}>
          {filterParams && filterParams.length > 0 ? (
            <MagicInput
              filterParams={filterParams}
              value={internalFilters}
              onChange={handleFilterChange}
              placeholder={searchPlaceholder || t('Filter by tags or type keyword...')}
              style={{ width: 360 }}
            />
          ) : (
            <Input
              placeholder={searchPlaceholder || t('Search')}
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 280, borderRadius: 6 }}
              allowClear
            />
          )}

          {onRefresh && (
            <Tooltip title={t('Refresh')}>
              <Button icon={<ReloadOutlined />} onClick={onRefresh} style={{ borderRadius: 6 }} />
            </Tooltip>
          )}

          {onAutoRefreshChange && (
            <Tooltip title={autoRefresh ? t('Stop auto refreshing data') : t('Start auto refreshing data')}>
              <Space size={6} style={{ fontSize: 12, color: '#64748b' }}>
                <Switch size="small" checked={Boolean(autoRefresh)} onChange={onAutoRefreshChange} />
                <span>{t('Auto Refresh')}</span>
              </Space>
            </Tooltip>
          )}

          {/* Batch Actions when rows are selected */}
          {selectedRowKeys.length > 0 && batchActions.length > 0 && (
            <Space>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {t('Selected')} <b>{selectedRowKeys.length}</b> {t('items')}:
              </Text>
              {batchActions.map((action, idx) => (
                <Button
                  key={action.id || idx}
                  danger={Boolean(action.danger || action.isDanger)}
                  type={['primary', 'dashed', 'link', 'text'].includes(action.type) ? action.type : 'default'}
                  icon={action.icon}
                  onClick={() => action.onClick ? action.onClick(selectedRowKeys) : onActionClick && onActionClick(action, selectedRowKeys)}
                  style={{ borderRadius: 6 }}
                >
                  {action.title || action.label || action.buttonText}
                </Button>
              ))}
            </Space>
          )}
        </Space>

        {/* Right: Primary Action button & Extra Actions */}
        <Space wrap>
          {extraActions}
          {allPrimaryActions.map((act, idx) => (
            <Button
              key={act.id || idx}
              type={idx === 0 ? 'primary' : 'default'}
              icon={act.icon || <PlusOutlined />}
              onClick={act.onClick ? act.onClick : () => onActionClick && onActionClick(act)}
              disabled={act.disabled}
              style={{
                borderRadius: 6,
                fontWeight: 600,
                ...(idx === 0 ? { background: '#0068ff' } : {}),
              }}
            >
              {act.title || act.label || act.buttonText || t('Create')}
            </Button>
          ))}
        </Space>
      </div>

      {/* Main Table Card (Ant Design 5 tokens) */}
      <Card
        variant="borderless"
        style={{
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          borderRadius: 8,
          background: isDark ? '#141c2b' : '#ffffff',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={finalColumns}
          dataSource={filteredData}
          loading={loading}
          rowKey={rowKey}
          rowSelection={rowSelection}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `${t('Total')}: ${total}`,
            ...pagination,
          }}
          locale={{
            emptyText: (
              <ResourceEmptyState
                resourceName={t('data')}
                description={t('No matching data found')}
                onAction={allPrimaryActions[0] ? allPrimaryActions[0].onClick : undefined}
                actionText={allPrimaryActions[0] ? (allPrimaryActions[0].title || allPrimaryActions[0].label) : undefined}
              />
            ),
          }}
          size="middle"
          // wide tables scroll horizontally instead of squeezing/wrapping columns (legacy behaviour)
          scroll={{ x: 'max-content' }}
          tableLayout="auto"
        />
      </Card>
    </div>
  );
}
