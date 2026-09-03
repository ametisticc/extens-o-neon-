'use client';

import { useState } from 'react';
import Link from 'next/link';

const ICONS = {
  arrow_back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  alert_circle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  check_circle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  trending_up: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 17" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
};

export default function HealthMonitorPage({ params }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const phoneNumber = params.phoneNumber;

  React.useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch(`/api/admin/maturation/health/${phoneNumber}`);
        const data = await res.json();
        if (data.ok) {
          setHealth(data);
        } else {
          setError(data.message || 'Erro ao carregar dados');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
  }, [phoneNumber]);

  if (loading) {
    return <div className="loading">Carregando análise...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Erro ao carregar</h2>
        <p>{error}</p>
        <Link href="/admin/maturation" className="btn" style={{ marginTop: '20px' }}>
          Voltar
        </Link>
      </div>
    );
  }

  if (!health) {
    return <div>Nenhum dado disponível</div>;
  }

  const h = health.health;
  const m = health.metrics;

  return (
    <>
      <div className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <Link href="/admin/maturation" className="icon-btn">
            {ICONS.arrow_back}
          </Link>
          <div>
            <h1 className="page-title">Monitor de Saúde</h1>
            <p className="page-subtitle">{phoneNumber}</p>
          </div>
        </div>
      </div>

      {/* Status Principal */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ padding: '30px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>{h.status_emoji}</div>
          <h2 style={{ fontSize: '28px', marginBottom: '5px' }}>{h.status}</h2>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
            Score: <strong>{h.score}/100</strong> • Fase: <strong>{h.phase}</strong>
          </p>

          {/* Score Bar */}
          <div
            style={{
              height: '8px',
              borderRadius: '99px',
              background: '#e5e7eb',
              overflow: 'hidden',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${h.score}%`,
                background:
                  h.score >= 70 ? '#10b981' : h.score >= 50 ? '#f59e0b' : '#ef4444',
                transition: 'width 0.3s',
              }}
            />
          </div>

          <p style={{ fontSize: '12px', color: '#999' }}>
            {health.number.days_old} dia(s) • Criado em {new Date(health.number.created_at).toLocaleDateString('pt-BR')}
          </p>
        </div>
      </div>

      {/* Métricas */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px',
          marginBottom: '20px',
        }}
      >
        <div className="card">
          <div style={{ padding: '20px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Mensagens (24h)</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{m.messages_last_24h}</div>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: '20px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Taxa de Sucesso</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: m.success_rate >= 80 ? '#10b981' : m.success_rate >= 50 ? '#f59e0b' : '#ef4444' }}>
              {m.success_rate}%
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: '20px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Taxa de Resposta</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: m.response_rate >= 80 ? '#10b981' : m.response_rate >= 50 ? '#f59e0b' : '#ef4444' }}>
              {m.response_rate}%
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: '20px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Pares (7 dias)</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{m.pairs_total}</div>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {health.alerts.length > 0 && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-head">
            <h2>Alertas</h2>
          </div>
          <div style={{ padding: '0' }}>
            {health.alerts.map((alert, idx) => (
              <div
                key={idx}
                style={{
                  padding: '15px 20px',
                  borderBottom: idx < health.alerts.length - 1 ? '1px solid #eee' : 'none',
                  borderLeft: `4px solid ${
                    alert.severity === 'high' ? '#ef4444' : alert.severity === 'medium' ? '#f59e0b' : '#3b82f6'
                  }`,
                  background: idx % 2 === 0 ? '#fafafa' : 'transparent',
                }}
              >
                <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                  <span style={{ marginRight: '8px' }}>{alert.emoji}</span>
                  <strong>{alert.title}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>{alert.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recomendações */}
      {health.recommendations.length > 0 && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-head">
            <h2>Recomendações</h2>
          </div>
          <div style={{ padding: '20px' }}>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {health.recommendations.map((rec, idx) => (
                <li key={idx} style={{ marginBottom: '10px', color: '#333', lineHeight: '1.6' }}>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Histórico de Pares */}
      {health.pair_history.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Últimos Pares (7 dias)</h2>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Par</th>
                  <th>Mensagens</th>
                  <th>Status</th>
                  <th>Horário</th>
                </tr>
              </thead>
              <tbody>
                {health.pair_history.map((pair, idx) => (
                  <tr key={idx}>
                    <td className="mono">{pair.pair}</td>
                    <td>{pair.messages}</td>
                    <td>
                      <span className={`badge ${pair.status === 'active' ? 'success' : 'default'}`}>
                        {pair.status}
                      </span>
                    </td>
                    <td className="mono">{pair.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
