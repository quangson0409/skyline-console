import React from 'react';
import { Result, Button } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from '@/core/i18n';

/** Legacy pages/base/containers/404 */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Result
      status="404"
      title="404"
      subTitle={t('Sorry, the page you visited does not exist.')}
      extra={
        <Link to="/base/overview">
          <Button type="primary">{t('Back to Home')}</Button>
        </Link>
      }
    />
  );
}
