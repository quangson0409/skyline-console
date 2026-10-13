import React from 'react';
import { Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Skyline Console Error Boundary caught:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', padding: 24 }}>
          <Result
            status="error"
            title={t('Something went wrong while rendering this OpenStack module')}
            subTitle={this.state.error?.message || t('An error occurred while rendering the interface.')}
            extra={[
              <Button
                type="primary"
                key="reload"
                icon={<ReloadOutlined />}
                onClick={this.handleReload}
                style={{ backgroundColor: '#0068ff', borderRadius: 20 }}
              >
                {t('Reload page')}
              </Button>,
              <Button
                key="home"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/network/vpc';
                }}
              >
                {t('Go to default page')}
              </Button>,
            ]}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
