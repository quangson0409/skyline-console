import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Breadcrumb, Popover, Row, Col, Skeleton, Space, message } from 'antd';
import { FolderOutlined, FileOutlined, RightOutlined } from '@ant-design/icons';
import { create } from 'zustand';
import { swiftApi, getPublicObjectUrl } from '@/api/swift';
import ResourcePage, { formatSize, formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { downloadBlob, copyToClipboard } from '../shared';
import FileInput from '@/components/form/FileInput';
import { swiftNameRule, timestampToStr, containerDetailPath } from './ContainerList';

/* ------------------------------------------------------------------ resources/swift/container */
export const isFile = (item) => item && item.type === 'file';
export const isFolder = (item) => item && item.type === 'folder';

const MAX_SIZE_GIB = 1;

/** legacy globalObjectStore copy/cut clipboard (shared between folders) */
const useClipboard = create((set) => ({
  files: [],
  isCopy: true,
  setFiles: (files, isCopy) => set({ files, isCopy }),
  clear: () => set({ files: [], isCopy: true }),
}));

const safeDecode = (v = '') => {
  if (!/%[0-9a-f]{2}/i.test(v)) return v;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

/** getRequestFolder: decoded folder with a trailing '/' */
const toPrefix = (folder) => {
  if (!folder) return '';
  const str = safeDecode(folder);
  return str.endsWith('/') ? str : `${str}/`;
};

const getShortName = (item, prefix) => {
  const full = item.subdir || item.name;
  return full.substring((prefix || '').length) || full;
};

/** stores/swift/object listFetchByClient + updateData */
const fetchObjects = async (container, prefix) => {
  const params = prefix ? { prefix } : {};
  const items = await swiftApi.listObjects(container, params);
  if (!items.length) return [];
  let isPublic = false;
  try {
    const headers = await swiftApi.showContainerMetadata(container);
    isPublic = !!headers['x-container-read'];
  } catch {
    isPublic = false;
  }
  return items
    .filter((it) => {
      if (!prefix) return true;
      const full = it.subdir || it.name;
      return full !== prefix && it.name !== prefix;
    })
    .map((it) => {
      const name = it.subdir || it.name;
      const type = it.subdir || name.slice(-1) === '/' ? 'folder' : 'file';
      return {
        ...it,
        id: name,
        name,
        container,
        folder: prefix,
        type,
        shortName: getShortName(it, prefix),
        isPublic,
        publicUrl: isPublic && type === 'file' ? getPublicObjectUrl(container, name) : null,
      };
    });
};

const checkObjectName = async (container, name) => {
  let exists = false;
  try {
    await swiftApi.showObjectMetadata(container, name);
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) throw new Error(t('An object with the same name already exists'));
};

const sizeRule = () => ({
  validator: (_, file) => {
    if (!file) return Promise.reject(new Error(t('Please select a file')));
    if (file.size <= MAX_SIZE_GIB * 1024 * 1024 * 1024) return Promise.resolve();
    return Promise.reject(
      new Error(
        t(
          'Please upload files smaller than { size } GiB on the page. It is recommended to upload files over { size } GiB using API.',
          { size: MAX_SIZE_GIB }
        )
      )
    );
  },
});

const uploadWithProgress = (container, name, file) => {
  const key = `upload-${name}`;
  const headers = {
    'X-Object-Meta-Orig-Filename': encodeURIComponent(file.name),
    'Content-Type': file.type || 'application/octet-stream',
  };
  return swiftApi
    .uploadObject(container, name, file, {
      headers,
      onUploadProgress: (e) => {
        if (!e.total) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        message.loading({ key, content: `${t('Upload File')}: ${file.name} ${pct}%`, duration: 0 });
      },
    })
    .finally(() => message.destroy(key));
};

/* ------------------------------------------------------------------ actions (Container/Detail/actions) */
const createFolderAction = (container, prefix) => ({
  id: 'create',
  type: 'modal',
  policy: { rules: ['admin', 'member'], every: false },
  title: t('Create Folder'),
  getDefaultValues: () => ({ container, dest_folder: prefix }),
  formItems: [
    { name: 'container', label: t('Container Name'), type: 'label' },
    { name: 'dest_folder', label: t('Dest Folder'), type: 'label', hidden: !prefix },
    { name: 'folder_name', label: t('Folder Name'), type: 'input', required: true, rules: [swiftNameRule()] },
  ],
  onSubmit: async ({ folder_name }) => {
    const name = `${prefix}${folder_name}/`;
    await checkObjectName(container, name);
    return swiftApi.createFolder(container, name);
  },
});

const uploadFileAction = (container, prefix) => ({
  id: 'upload-file',
  type: 'modal',
  policy: { rules: ['admin', 'member'], every: false },
  title: t('Upload File'),
  getDefaultValues: () => ({ container, dest_folder: prefix }),
  formItems: [
    { name: 'container', label: t('Container Name'), type: 'label' },
    { name: 'dest_folder', label: t('Dest Folder'), type: 'label', hidden: !prefix },
    { name: 'file', label: t('Select File'), required: true, rules: [sizeRule()], render: () => <FileInput /> },
  ],
  onSubmit: async ({ file }) => {
    const name = `${prefix}${file.name}`;
    await checkObjectName(container, name);
    return uploadWithProgress(container, name, file);
  },
});

const editFileAction = () => ({
  id: 'edit-file',
  type: 'modal',
  policy: { rules: ['admin', 'member'], every: false },
  title: t('Edit'),
  description: t('Editing only changes the content of the file, not the file name.'),
  allowed: (item) => isFile(item),
  getDefaultValues: (item) => ({ container: item.container, dest_folder: item.folder, shortName: item.shortName }),
  getFormItems: (item) => [
    { name: 'container', label: t('Container Name'), type: 'label' },
    { name: 'dest_folder', label: t('Folder Name'), type: 'label', hidden: !item.folder },
    { name: 'shortName', label: t('Filename'), type: 'label' },
    { name: 'file', label: t('Select File'), required: true, rules: [sizeRule()], render: () => <FileInput /> },
  ],
  onSubmit: ({ file }, item) => uploadWithProgress(item.container, item.name, file),
});

const downloadAction = () => ({
  id: 'download',
  type: 'confirm',
  policy: { rules: ['admin', 'member'], every: false },
  title: t('Download File'),
  actionName: t('Download File'),
  allowed: (item) => isFile(item),
  onSubmit: async (item) => {
    const blob = await swiftApi.downloadObject(item.container, item.name);
    downloadBlob(blob, item.shortName);
  },
});

const copyPublicUrlAction = () => ({
  id: 'copy-public-url',
  type: 'confirm',
  policy: { rules: ['admin', 'reader', 'member'], every: false },
  title: t('Copy Public URL'),
  actionName: t('copy public URL'),
  allowed: (item) => isFile(item) && !!item.isPublic,
  onSubmit: async (item) => {
    if (!item.container || !item.name) {
      throw new Error(t('Unable to generate public URL. Missing container or object name.'));
    }
    const ok = await copyToClipboard(item.publicUrl || getPublicObjectUrl(item.container, item.name));
    if (!ok) throw new Error(t('Operation failed'));
    message.success(t('Public URL for "{name}" copied to clipboard.', { name: item.shortName }));
  },
});

const clipAction = (isCopy) => ({
  id: isCopy ? 'CopyFile' : 'CutFile',
  type: 'confirm',
  policy: { rules: ['admin', 'member'], every: false },
  title: isCopy ? t('Copy File') : t('Cut File'),
  buttonText: isCopy ? t('Copy') : t('Cut'),
  actionName: isCopy ? t('Copy File') : t('Cut File'),
  description: isCopy
    ? t(
        'This will copy the selected file(s). Use the Paste action to create duplicates in another folder or container. The original file(s) will remain in their current location.'
      )
    : t(
        'This will move the selected file(s) to a new location. Use the Cut action to paste them into another folder or container. The original file(s) will be removed from their current location after pasting.'
      ),
  allowed: (item) => isFile(item),
  onSubmit: async (target) => {
    const list = (Array.isArray(target) ? target : [target]).map((it) => ({
      ...it,
      shortName: it.shortName,
    }));
    useClipboard.getState().setFiles(list, isCopy);
  },
});

/** PasteFile.checkFolder: cannot paste into the folder the files come from */
const canPasteInto = (container, folderName) => {
  const { files } = useClipboard.getState();
  if (!files.length) return false;
  const { container: fromContainer, folder: fromFolder = '' } = files[0];
  return container !== fromContainer || (folderName || '') !== (fromFolder || '');
};

const pasteFiles = async (toContainer, toFolder) => {
  const { files, isCopy, clear } = useClipboard.getState();
  if (!files.length) throw new Error(t('There is currently no file to paste.'));
  if (!canPasteInto(toContainer, toFolder)) throw new Error(t('Unable to paste into the same folder.'));
  await Promise.all(
    files.map((it) => swiftApi.copyObject(it.container, it.name, toContainer, `${toFolder || ''}${it.shortName}`))
  );
  if (!isCopy) {
    await Promise.all(files.map((it) => swiftApi.deleteObject(it.container, it.name)));
    clear();
  }
};

const pasteDescription = (target) => {
  const { files } = useClipboard.getState();
  const first = files[0] || {};
  const source = first.folder ? `${first.container}/${first.folder}` : first.container || '';
  return (
    <div>
      <p>{t('Paste File')}: {target || t('Root directory')}</p>
      <p>{t('Source Path: {path}', { path: source })}</p>
      <p>{t('Files: {names}', { names: files.map((f) => f.shortName).join(', ') })}</p>
      <p>{t('The file with the same name will be overwritten.')}</p>
    </div>
  );
};

/** Row paste (into a folder row) */
const pasteIntoFolderAction = () => ({
  id: 'PasteFile',
  type: 'confirm',
  policy: { rules: ['admin', 'member'], every: false },
  title: t('Paste File'),
  buttonText: t('Paste'),
  actionName: t('paste files to folder'),
  allowed: (item) => isFolder(item) && canPasteInto(item.container, item.name),
  get confirmText() {
    return pasteDescription();
  },
  onSubmit: (item) => pasteFiles(item.container, item.name),
});

/** Toolbar paste (into the current folder) */
const pasteHereAction = (container, prefix, disabled) => ({
  id: 'PasteFile',
  type: 'confirm',
  policy: { rules: ['admin', 'member'], every: false },
  title: t('Paste File'),
  buttonText: t('Paste'),
  actionName: t('paste files to folder'),
  disabled,
  confirmText: pasteDescription(prefix),
  onSubmit: () => pasteFiles(container, prefix),
});

const renameAction = () => ({
  id: 'rename',
  type: 'modal',
  policy: { rules: ['admin', 'member'], every: false },
  title: t('Rename'),
  description: t(
    'Rename is to copy the current file to the new file address and delete the current file, which will affect the creation time of the file.'
  ),
  allowed: (item) => isFile(item),
  getDefaultValues: (item) => ({ container: item.container, dest_folder: item.folder, shortName: item.shortName }),
  getFormItems: (item) => [
    { name: 'container', label: t('Container Name'), type: 'label' },
    { name: 'dest_folder', label: t('Folder Name'), type: 'label', hidden: !item.folder },
    { name: 'shortName', label: t('Filename'), type: 'label' },
    { name: 'newname', label: t('New Name'), type: 'input', required: true, rules: [swiftNameRule()] },
  ],
  onSubmit: async ({ newname }, item) => {
    const newName = `${item.folder || ''}${newname}`;
    await checkObjectName(item.container, newName);
    await swiftApi.copyObject(item.container, item.name, item.container, newName);
    return swiftApi.deleteObject(item.container, item.name);
  },
});

const deleteObjectAction = () => ({
  id: 'delete',
  type: 'confirm',
  policy: { rules: ['admin', 'member'], every: false },
  title: t('Delete'),
  actionName: t('Delete'),
  isDanger: true,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      if (isFolder(it)) {
        // eslint-disable-next-line no-await-in-loop
        const children = (await swiftApi.listObjects(it.container, { prefix: it.name })).filter(
          (c) => (c.subdir || c.name) !== it.name
        );
        if (children.length) {
          throw new Error(t('Cannot delete folder "{name}". The folder is not empty.', { name: it.shortName || it.name }));
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await swiftApi.deleteObject(it.container, it.name);
    }
  },
});

/* ------------------------------------------------------------------ detail popover */
function ObjectPopContent({ item }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    swiftApi
      .showObjectMetadata(item.container, item.name)
      .then(
        (h) =>
          alive &&
          setData({
            timestamp: h['x-timestamp'],
            contentType: h['content-type'],
            etag: h.etag,
            size: h['content-length'],
            originFileName: h['x-object-meta-orig-filename'],
          })
      )
      .catch(() => alive && setData({}));
    return () => {
      alive = false;
    };
  }, [item.container, item.name]);
  if (!data) return <Skeleton active paragraph={{ rows: 4 }} style={{ width: 300 }} />;
  let origin = data.originFileName;
  try {
    origin = origin ? decodeURIComponent(origin) : '-';
  } catch {
    // keep raw value
  }
  const rows = [
    [t('Name'), item.shortName],
    data.etag ? [t('Hash'), data.etag] : null,
    [t('Content Type'), data.contentType || '-'],
    [t('Created At'), timestampToStr(data.timestamp)],
    [t('Size'), formatSize(data.size || item.bytes)],
    !isFolder(item) ? [t('Origin File Name'), origin] : null,
  ].filter(Boolean);
  return (
    <div style={{ width: 320 }}>
      {rows.map(([label, value]) => (
        <Row key={label} style={{ marginBottom: 4 }}>
          <Col span={9} style={{ color: '#64748b' }}>
            {label}
          </Col>
          <Col span={15} style={{ wordBreak: 'break-all' }}>
            {value}
          </Col>
        </Row>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ page */
export default function ContainerDetail() {
  const params = useParams();
  const container = safeDecode(params.container || '');
  const prefix = toPrefix(params['*'] || params.folder || '');
  const clipboardFiles = useClipboard((s) => s.files);

  const folders = prefix.split('/').filter(Boolean);
  const pathLinks = [
    { key: container, label: container, to: containerDetailPath(container) },
    ...folders.map((f, idx) => {
      const path = `${folders.slice(0, idx + 1).join('/')}/`;
      return { key: path, label: f, to: containerDetailPath(container, path) };
    }),
  ];

  const pasteDisabled = !clipboardFiles.length || !canPasteInto(container, prefix);

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { title: t('Storage') },
          { title: <Link to="/storage/container">{t('Object Storage')}</Link> },
          { title: container },
        ]}
        style={{ marginBottom: 16, fontSize: 13 }}
      />
      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {container}
        </h1>
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <span style={{ color: '#64748b', marginRight: 8 }}>{t('Current Path:')}</span>
          <Space size={4} wrap>
            {pathLinks.map((it, idx) => (
              <span key={it.key}>
                <Link to={it.to}>{it.label}</Link>
                {idx < pathLinks.length - 1 ? <RightOutlined style={{ fontSize: 10, margin: '0 4px', color: '#94a3b8' }} /> : null}
              </span>
            ))}
          </Space>
        </div>
        {clipboardFiles.length ? (
          <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
            {useClipboard.getState().isCopy ? t('Copy File') : t('Cut File')}: {clipboardFiles.map((f) => f.shortName).join(', ')}
          </div>
        ) : null}
      </div>
      <ResourcePage
        embedded
        rowKey="name"
        deps={[container, prefix]}
        fetch={() => fetchObjects(container, prefix)}
        // legacy ableAutoFresh = false and getCheckboxProps: folders cannot be selected
        autoRefreshEnabled={false}
        getCheckboxProps={(record) => (isFolder(record) ? { disabled: true, name: record.shortName } : { name: record.shortName })}
        columns={[
          {
            title: t('Name'),
            dataIndex: 'shortName',
            key: 'shortName',
            sorter: (a, b) => String(a.shortName).localeCompare(String(b.shortName)),
            render: (v, r) =>
              isFolder(r) ? (
                <Space size={6}>
                  <FolderOutlined style={{ color: '#f59e0b' }} />
                  <Link to={containerDetailPath(container, r.name)} style={{ fontWeight: 600 }}>
                    {v}
                  </Link>
                </Space>
              ) : (
                <Space size={6}>
                  <FileOutlined style={{ color: '#64748b' }} />
                  <span>{v}</span>
                </Space>
              ),
          },
          {
            title: t('Size'),
            dataIndex: 'bytes',
            key: 'bytes',
            render: (v, r) => (isFolder(r) ? '-' : formatSize(v)),
          },
          { title: t('Last Updated'), dataIndex: 'last_modified', key: 'last_modified', render: (v) => formatTime(v) },
          {
            title: t('Detail'),
            key: 'detail',
            render: (_, r) => (
              <Popover content={<ObjectPopContent item={r} />} trigger="click" destroyOnHidden>
                <a>{t('Detail')}</a>
              </Popover>
            ),
          },
        ]}
        searchFields={['shortName']}
        filterParams={[{ name: 'shortName', label: t('Name') }]}
        primaryActions={({ isAdmin }) =>
          [
            !isAdmin && createFolderAction(container, prefix),
            !isAdmin && uploadFileAction(container, prefix),
            pasteHereAction(container, prefix, pasteDisabled),
          ].filter(Boolean)
        }
        batchActions={[
          { ...deleteObjectAction(), allowed: (it) => isFile(it) },
          clipAction(true),
          clipAction(false),
        ]}
        rowActions={{
          firstAction: deleteObjectAction(),
          moreActions: [
            { action: editFileAction() },
            { action: downloadAction() },
            { action: copyPublicUrlAction() },
            { action: clipAction(true) },
            { action: clipAction(false) },
            { action: pasteIntoFolderAction() },
            { action: renameAction() },
          ],
        }}
      />
    </div>
  );
}
