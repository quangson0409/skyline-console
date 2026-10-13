import React from 'react';
import { Button, theme } from 'antd';
import { MinusCircleFilled, PlusCircleFilled } from '@ant-design/icons';

/**
 * Port of legacy components/FormItem/AddSelect: list of item components with remove buttons and
 * an "Add ..." link. value = [{ value: itemValue }, ...] (legacy shape).
 */
export default function AddSelect({
  value = [],
  onChange,
  renderItem,
  defaultItemValue = {},
  minCount = 0,
  maxCount = Infinity,
  addText,
  tips,
}) {
  const { token } = theme.useToken();
  const items = Array.isArray(value) ? value : [];

  const update = (next) => onChange?.(next.map((it, index) => ({ ...it, index })));
  const onItemChange = (itemValue, index) => update(items.map((it, i) => (i === index ? { ...it, value: itemValue } : it)));
  const removeItem = (index) => update(items.filter((_, i) => i !== index));
  const addItem = () => {
    if (items.length >= maxCount) return;
    update([...items, { value: JSON.parse(JSON.stringify(defaultItemValue || {})) }]);
  };

  return (
    <div className="instance-create-add-select">
      {tips ? <div>{tips}</div> : null}
      {items.map((it, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={`add-select-item-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 8 }}>
          <Button
            type="link"
            onClick={() => removeItem(index)}
            disabled={index < minCount}
            icon={<MinusCircleFilled />}
            style={{ color: index < minCount ? undefined : token.colorError, flex: 'none' }}
          />
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>{renderItem(it.value, index, (v) => onItemChange(v, index))}</div>
        </div>
      ))}
      <Button type="link" icon={<PlusCircleFilled />} onClick={addItem} style={{ paddingLeft: 0 }} className="add-btn">
        {addText}
      </Button>
    </div>
  );
}
