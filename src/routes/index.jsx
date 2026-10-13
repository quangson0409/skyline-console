import React, { Suspense } from 'react';
import { Route } from 'react-router-dom';
import { Spin } from 'antd';

/**
 * Module route registry.
 * Every file in ./modules default-exports an array of { path, element | component }
 * (path relative to "/", e.g. 'storage/backup' or 'storage/backup/detail/:id').
 * Routes registered here are rendered before the legacy placeholders in App.jsx,
 * so a module page always wins over a ModulePlaceholder with the same path.
 */
const moduleFiles = import.meta.glob('./modules/*.jsx', { eager: true });

export const moduleRoutes = Object.keys(moduleFiles)
  .sort()
  .flatMap((key) => moduleFiles[key].default || []);

const Loader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <Spin size="large" />
  </div>
);

export const renderModuleRoutes = () =>
  moduleRoutes.map(({ path, component: Component, element }) => (
    <Route
      key={path}
      path={path}
      element={<Suspense fallback={<Loader />}>{element || <Component />}</Suspense>}
    />
  ));
