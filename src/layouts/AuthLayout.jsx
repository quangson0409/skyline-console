import React from 'react';
import { Outlet } from 'react-router-dom';
import SelectLang from '@/components/SelectLang';
import { useTranslation } from '@/core/i18n';

export default function AuthLayout() {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#ffffff',
        overflow: 'hidden',
      }}
    >
      {/* Left side: Form container */}
      <div
        style={{
          width: '100%',
          maxWidth: 580,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '36px 48px',
          boxSizing: 'border-box',
          position: 'relative',
          backgroundColor: '#ffffff',
          zIndex: 10,
          boxShadow: '4px 0 24px rgba(0,0,0,0.03)',
        }}
      >
        {/* Top bar: Language switcher */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <SelectLang />
        </div>

        {/* Center: Dynamic Auth Page (Login) */}
        <div style={{ margin: 'auto 0', width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <Outlet />
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', paddingTop: 20 }}>
          <span>© 2026 OpenStack Skyline Console. {t('All rights reserved.')}</span>
        </div>
      </div>

      {/* Right side: Futuristic Cloud Hero Banner */}
      <div
        style={{
          flex: 1,
          background: 'radial-gradient(ellipse at 80% 20%, #1e3a8a 0%, #0f172a 60%, #030712 100%)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '60px',
          color: '#ffffff',
          overflow: 'hidden',
        }}
      >
        {/* Subtle grid background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), radial-gradient(rgba(0,104,255,0.12) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            backgroundPosition: '0 0, 16px 16px',
            opacity: 0.6,
          }}
        />

        {/* Glowing atmospheric orb */}
        <div
          style={{
            position: 'absolute',
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,104,255,0.25) 0%, transparent 70%)',
            filter: 'blur(40px)',
            top: '15%',
            right: '10%',
          }}
        />

        <div style={{ maxWidth: 620, zIndex: 1, textAlign: 'left' }}>
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 16px',
              borderRadius: 20,
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              marginBottom: 28,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 10px #10b981',
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', letterSpacing: 0.3 }}>
              {t('OpenStack Yoga / 2024.1 Ready')}
            </span>
          </div>

          <h1
            style={{
              fontSize: 42,
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#ffffff',
              margin: '0 0 20px',
              letterSpacing: -0.8,
            }}
          >
            {t('Cloud Computing Platform for')}{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #60a5fa, #38bdf8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t('Enterprises')}
            </span>
          </h1>

          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: '#cbd5e1',
              margin: '0 0 36px',
            }}
          >
            {t('A next-generation control panel for OpenStack IaaS infrastructure. Optimized performance, multi-layer security, and centralized management of compute, storage and virtual network resources.')}
          </p>

          {/* Infrastructure Feature Badges */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { title: 'Nova & Ironic', desc: t('KVM instances & dedicated bare metal') },
              { title: 'Neutron SDN', desc: t('Virtual VPC, OVN routers & floating IPs') },
              { title: 'Cinder & Ceph', desc: t('Ultra-low-latency distributed block storage') },
              { title: 'Keystone v3', desc: t('Multi-level domain authentication & authorization') },
            ].map((f, i) => (
              <div
                key={i}
                style={{
                  padding: '14px 18px',
                  borderRadius: 12,
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: '#60a5fa' }}>{f.title}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
