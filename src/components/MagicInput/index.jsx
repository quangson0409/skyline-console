import React, { useState, useRef, useEffect } from 'react';
import { Tag, Dropdown, Input, Button, Space } from 'antd';
import { SearchOutlined, CloseCircleFilled, FilterOutlined } from '@ant-design/icons';
import { useTranslation } from '@/core/i18n';

/**
 * OpenStack Skyline MagicInput Filter
 * Recreates the signature tag-based multi-criteria search bar from legacy skyline-console.
 */
export default function MagicInput({
  filterParams = [],
  value = {},
  onChange,
  placeholder,
  style = {},
}) {
  const { t } = useTranslation();
  const [activeTags, setActiveTags] = useState([]);
  const [currentFilter, setCurrentFilter] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Sync external value to activeTags if provided
  useEffect(() => {
    if (!value || Object.keys(value).length === 0) {
      if (activeTags.length > 0 && !Object.keys(value || {}).length) {
        setActiveTags([]);
      }
      return;
    }
    const tags = [];
    Object.entries(value).forEach(([key, val]) => {
      if (!val) return;
      const param = filterParams.find((p) => p.name === key);
      if (param) {
        tags.push({
          filter: param,
          value: val,
        });
      }
    });
    setActiveTags(tags);
  }, [value, filterParams]);

  const notifyChange = (newTags) => {
    const filterObj = {};
    newTags.forEach((t) => {
      filterObj[t.filter.name] = t.value;
    });
    onChange?.(filterObj);
  };

  const addTag = (filter, val) => {
    if (!val || !val.trim()) return;
    const existingIndex = activeTags.findIndex((t) => t.filter.name === filter.name);
    let nextTags = [];
    if (existingIndex >= 0) {
      nextTags = activeTags.map((t, idx) =>
        idx === existingIndex ? { filter, value: val.trim() } : t
      );
    } else {
      nextTags = [...activeTags, { filter, value: val.trim() }];
    }
    setActiveTags(nextTags);
    setCurrentFilter(null);
    setInputValue('');
    setDropdownOpen(false);
    notifyChange(nextTags);
    inputRef.current?.focus();
  };

  const removeTag = (filterName) => {
    const nextTags = activeTags.filter((t) => t.filter.name !== filterName);
    setActiveTags(nextTags);
    notifyChange(nextTags);
  };

  const clearAll = () => {
    setActiveTags([]);
    setCurrentFilter(null);
    setInputValue('');
    setDropdownOpen(false);
    notifyChange([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' && !inputValue && !currentFilter && activeTags.length > 0) {
      // Remove last tag
      const nextTags = activeTags.slice(0, -1);
      setActiveTags(nextTags);
      notifyChange(nextTags);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputValue && inputValue.trim()) {
        const filterToUse = currentFilter || filterParams[0] || { name: 'keyword', label: t('Search') };
        addTag(filterToUse, inputValue);
      }
    }

    if (e.key === 'Escape') {
      setCurrentFilter(null);
      setInputValue('');
      setDropdownOpen(false);
    }
  };

  // Build Dropdown Menu
  const menuItems = (() => {
    // Stage 2: Selected a filter with options (e.g., Status -> ACTIVE, SHUTOFF)
    if (currentFilter && currentFilter.options && currentFilter.options.length > 0) {
      return currentFilter.options.map((opt) => ({
        key: opt.key || opt.value,
        label: (
          <div style={{ padding: '4px 8px', fontWeight: 500 }}>
            <span style={{ color: '#0068ff', fontWeight: 600 }}>{currentFilter.label}: </span>
            <span>{opt.label || opt.key}</span>
          </div>
        ),
        onClick: () => addTag(currentFilter, opt.key || opt.value),
      }));
    }

    // Stage 1: Showing available criteria
    const unusedParams = filterParams.filter(
      (p) => !activeTags.some((tag) => tag.filter.name === p.name)
    );

    return unusedParams.map((param) => ({
      key: param.name,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px' }}>
          <FilterOutlined style={{ color: '#0068ff', fontSize: 12 }} />
          <span style={{ fontWeight: 600 }}>{param.label}</span>
        </div>
      ),
      onClick: () => {
        setCurrentFilter(param);
        setInputValue('');
        setDropdownOpen(Boolean(param.options && param.options.length > 0));
        inputRef.current?.focus();
      },
    }));
  })();

  return (
    <div
      ref={containerRef}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        padding: '3px 10px',
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        minWidth: 340,
        maxWidth: 680,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        transition: 'all 0.2s ease',
        ...style,
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <SearchOutlined style={{ color: '#94a3b8', fontSize: 14 }} />

      {/* Rendered Filter Tags */}
      {activeTags.map((item) => (
        <Tag
          key={item.filter.name}
          closable
          onClose={(e) => {
            e.stopPropagation();
            removeTag(item.filter.name);
          }}
          style={{
            margin: 0,
            background: 'rgba(0, 104, 255, 0.08)',
            border: '1px solid rgba(0, 104, 255, 0.25)',
            color: '#0068ff',
            borderRadius: 6,
            fontWeight: 500,
            fontSize: 12,
            padding: '1px 8px',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 600, color: '#334155', marginRight: 4 }}>
            {item.filter.label}:
          </span>
          <span>{item.value}</span>
        </Tag>
      ))}

      {/* Current Pending Filter Prefix */}
      {currentFilter && (
        <Tag
          closable
          onClose={() => setCurrentFilter(null)}
          style={{
            margin: 0,
            background: '#e0f2fe',
            border: '1px solid #7dd3fc',
            color: '#0284c7',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          {currentFilter.label}:
        </Tag>
      )}

      {/* Input element with Criteria Dropdown */}
      <Dropdown
        menu={{ items: menuItems }}
        open={dropdownOpen && menuItems.length > 0}
        onOpenChange={(op) => setDropdownOpen(op)}
        trigger={['click']}
      >
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (!currentFilter && !dropdownOpen) {
              setDropdownOpen(true);
            }
          }}
          onFocus={() => {
            if (!currentFilter || (currentFilter.options && currentFilter.options.length > 0)) {
              setDropdownOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            activeTags.length === 0 && !currentFilter
              ? placeholder || t('Click here for filters (or search by Name, IP)...')
              : currentFilter
              ? currentFilter.options
                ? t('Select option...')
                : `${t('Type')} ${currentFilter.label} & Enter...`
              : ''
          }
          variant="borderless"
          style={{
            flex: 1,
            minWidth: 160,
            padding: 0,
            boxShadow: 'none',
            fontSize: 13,
          }}
        />
      </Dropdown>

      {/* Clear all button */}
      {(activeTags.length > 0 || currentFilter || inputValue) && (
        <CloseCircleFilled
          style={{
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 14,
            marginLeft: 'auto',
          }}
          onClick={(e) => {
            e.stopPropagation();
            clearAll();
          }}
        />
      )}
    </div>
  );
}
