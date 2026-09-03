'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const ICONS = {
  arrow_back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  ),
  trending_up: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 17" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
};

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'];

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('24h');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/maturation/analytics?range=${range}`);
        const data = await res.json();
        if (data.ok) {
          setAnalytics(data);
        }
      } catch (error) {
        console.error('Erro ao buscar analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [range]);

  if (loading) {
    return <div className="loading">Carregando gráficos...</div>;
  }

  if (!analytics) {
    return <div>Erro ao carregar dados</div>;
  }

  const s = analytics.summary;
  const hourly = analytics.hourly;
  const daily = analytics.daily;
  const successRate = analytics.successRateHourly;
  const bestHours = analytics.bestHours;

  return (
    <>
      <div className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <Link href="/admin/maturation" className="icon-btn">
            {ICONS.arrow_back}
          </Link>
          <div>
            <h1 className="page-title">Analytics & Relatórios</h1>
            <p className="page-subtitle">Análise detalhada de atividade</p>
          </div>
        </div>
        <div>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            <option value="24h">Últimas 24h</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </select>
        </div>
      </div>

      {/* Resumo */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '15px',
          marginBottom: '30px',
        }}
      >
        <div className="card">
          <div style={{ padding: '20px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Validações</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{s.total_validations}</div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
              ✅ {s.success_validations} • ❌ {s.failed_validations}
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: '20px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Taxa de Sucesso</div>
            <div
              style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: s.success_rate >= 80 ? '#10b981' : s.success_rate >= 50 ? '#f59e0b' : '#ef4444',
              }}
            >
              {s.success_rate}%
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: '20px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Mensagens</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{s.total_messages}</div>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: '20px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Sessões</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{s.total_sessions}</div>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="card" style={{ marginBottom: '30px' }}>
        <div className="card-head">
          <h2>Atividade por Hora</h2>
        </div>
        <div style={{ padding: '20px', background: '#fafafa', borderRadius: '8px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="messages" fill="#3b82f6" name="Mensagens" />
              <Bar dataKey="sessions" fill="#10b981" name="Sessões" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '30px' }}>
        <div className="card-head">
          <h2>Taxa de Sucesso por Hora</h2>
        </div>
        <div style={{ padding: '20px', background: '#fafafa', borderRadius: '8px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={successRate}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis domain={[0, 100]} />
              <Tooltip formatter={(value) => `${value}%`} />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Taxa de Sucesso (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '30px' }}>
        <div className="card-head">
          <h2>Atividade por Dia</h2>
        </div>
        <div style={{ padding: '20px', background: '#fafafa', borderRadius: '8px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="messages" stroke="#3b82f6" strokeWidth={2} name="Mensagens" />
              <Line type="monotone" dataKey="validations" stroke="#10b981" strokeWidth={2} name="Validações" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Melhores Horários */}
      {bestHours.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Melhores Horários</h2>
          </div>
          <div style={{ padding: '20px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '15px',
              }}
            >
              {bestHours.map((h, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '15px',
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#166534' }}>{h.hour}</div>
                  <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>
                    {h.count} evento{h.count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
