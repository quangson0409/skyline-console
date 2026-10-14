/**
 * antd does not export NoFormStyle publicly; keep the single deep import here so pages never
 * reach into antd internals (used to embed form controls inside another Form.Item without
 * inheriting its status / layout styles).
 */
export { NoFormStyle } from 'antd/es/form/context';
