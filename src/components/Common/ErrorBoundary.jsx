import React from 'react';
import { Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

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
            title="Đã xảy ra sự cố hiển thị phân hệ OpenStack"
            subTitle={this.state.error?.message || 'Có lỗi xảy ra trong quá trình kết xuất giao diện.'}
            extra={[
              <Button
                type="primary"
                key="reload"
                icon={<ReloadOutlined />}
                onClick={this.handleReload}
                style={{ backgroundColor: '#0068ff', borderRadius: 20 }}
              >
                Tải lại trang (Reload)
              </Button>,
              <Button
                key="home"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/network/vpc';
                }}
              >
                Về trang mặc định
              </Button>,
            ]}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
