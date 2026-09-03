'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const ICONS = {
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

export default function MaturationPage() {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNumbers, setSelectedNumbers] = useState([]);
  const [action, setAction] = useState('start');
  const [mode, setMode] = useState('normal');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleData, setScheduleData] = useState({
    start: '',
    end: '',
    duration: '30',
  });

  // Buscar status em tempo real
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/admin/maturation/status');
        const data = await res.json();
        if (data.ok) {
          setStatus(data);
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro ao buscar status:', error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // atualizar a cada 5s
    return () => clearInterval(interval);
  }, []);

  // Buscar logs
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/admin/maturation/logs?limit=50');
        const data = await res.json();
        if (data.ok) {
          setLogs(data.logs);
        }
      } catch (error) {
        console.error('Erro ao buscar logs:', error);
      }
    };

    fetchLogs();
  }, []);

  // Buscar agendamentos
  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const res = await fetch('/api/admin/maturation/schedule?status=pending');
        const data = await res.json();
        if (data.ok) {
          setSchedules(data.schedules);
        }
      } catch (error) {
        console.error('Erro ao buscar agendamentos:', error);
      }
    };

    fetchSchedules();
  }, []);

  const handleSchedule = async () => {
    if (selectedNumbers.length === 0) {
      alert('Selecione pelo menos um número');
      return;
    }

    if (!scheduleData.start) {
      alert('Defina data e hora de início');
      return;
    }

    try {
      const res = await fetch('/api/admin/maturation/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_numbers: selectedNumbers,
          scheduled_start_at: new Date(scheduleData.start).toISOString(),
          scheduled_end_at: scheduleData.end ? new Date(scheduleData.end).toISOString() : null,
          mode,
          duration_minutes: mode === 'time' ? parseInt(scheduleData.duration) : null,
          duration_cycles: mode === 'cycles' ? parseInt(scheduleData.duration) : null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`${data.summary.scheduled} agendamento(s) criado(s)`);
        setShowScheduleForm(false);
        setSelectedNumbers([]);
        setScheduleData({ start: '', end: '', duration: '30' });
      }
    } catch (error) {
      alert('Erro ao agendar');
    }
  };

  const handleControlAction = async () => {
    if (selectedNumbers.length === 0) {
      alert('Selecione pelo menos um número');
      return;
    }

    try {
      const res = await fetch('/api/admin/maturation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          phone_numbers: selectedNumbers,
          mode,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        alert(`${data.summary.succeeded} número(s) ${action === 'start' ? 'iniciado(s)' : 'parado(s)'}`);
        setSelectedNumbers([]);
      }
    } catch (error) {
      alert('Erro ao executar ação');
    }
  };

  if (loading) {
    return <div className="loading">Carregando...</div>;
  }

  const stats = status?.stats || {};

  return (
    <>
      <div className="admin-header">
        <div>
          <h1 className="page-title">Maturação</h1>
          <p className="page-subtitle">Controle em tempo real dos disparos</p>
        </div>
      </div>

      {/* Cards de Status */}
      <div className="dashboard-stats">
        <div className="stat-card">
          <span className="stat-icon" style={{ color: '#10b981' }}>{ICONS.bolt}</span>
          <span className="label">Números Ativos</span>
          <div className="value success">{stats.numbers_active || 0}</div>
          <div className="stat-complement">maturando agora</div>
        </div>

        <div className="stat-card">
          <span className="stat-icon" style={{ color: '#3b82f6' }}>{ICONS.link}</span>
          <span className="label">Pares Conectados</span>
          <div className="value">{stats.pairs_active || 0}</div>
          <div className="stat-complement">pareados no momento</div>
        </div>

        <div className="stat-card">
          <span className="stat-icon" style={{ color: '#8b5cf6' }}>{ICONS.users}</span>
          <span className="label">Mensagens Hoje</span>
          <div className="value">{stats.messages_today || 0}</div>
          <div className="stat-complement">trocadas entre pares</div>
        </div>

        <div className="stat-card">
          <span className="stat-icon" style={{ color: '#f59e0b' }}>{ICONS.check}</span>
          <span className="label">Validações Hoje</span>
          <div className="value">{stats.validations_today || 0}</div>
          <div className="stat-complement">autorizadas</div>
        </div>
      </div>

      {/* Controle de Maturação */}
      <div className="card">
        <div className="card-head">
          <h2>Controle de Maturação</h2>
        </div>
        <div style={{ padding: '20px', display: 'grid', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Números</label>
            <input
              type="text"
              placeholder="5511999999999 (separados por vírgula)"
              onChange={(e) =>
                setSelectedNumbers(e.target.value.split(',').map(n => n.trim()).filter(Boolean))
              }
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontFamily: 'monospace',
              }}
            />
            {selectedNumbers.length > 0 && (
              <div style={{ marginTop: '10px', fontSize: '12px' }}>
                {selectedNumbers.map((num, idx) => (
                  <Link
                    key={idx}
                    href={`/admin/maturation/health/${num}`}
                    style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      margin: '4px 4px 4px 0',
                      background: '#f0f0f0',
                      borderRadius: '4px',
                      textDecoration: 'none',
                      color: '#0066cc',
                      fontSize: '11px',
                    }}
                  >
                    📊 {num}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Ação</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                }}
              >
                <option value="start">Iniciar</option>
                <option value="stop">Parar</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Modo</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                }}
              >
                <option value="normal">Normal</option>
                <option value="time">Por Tempo</option>
                <option value="cycles">Por Ciclos</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px' }}>
            <button
              onClick={handleControlAction}
              className="btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {action === 'start' ? ICONS.play : ICONS.pause}
              {action === 'start' ? 'Iniciar' : 'Parar'}
            </button>
            <div style={{ fontSize: '13px', color: '#666', display: 'flex', alignItems: 'center' }}>
              {selectedNumbers.length > 0 ? `${selectedNumbers.length} número(s) selecionado(s)` : 'Nenhum número selecionado'}
            </div>
          </div>
        </div>
      </div>

      {/* Agendamento */}
      <div className="card">
        <div className="card-head">
          <h2>Agendar Maturação</h2>
          <button
            onClick={() => setShowScheduleForm(!showScheduleForm)}
            className="btn btn-sm"
            style={{ marginLeft: 'auto' }}
          >
            {showScheduleForm ? 'Cancelar' : '+ Novo Agendamento'}
          </button>
        </div>

        {showScheduleForm && (
          <div style={{ padding: '20px', display: 'grid', gap: '15px', borderTop: '1px solid #eee' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Início</label>
                <input
                  type="datetime-local"
                  value={scheduleData.start}
                  onChange={(e) => setScheduleData({ ...scheduleData, start: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Fim (opcional)</label>
                <input
                  type="datetime-local"
                  value={scheduleData.end}
                  onChange={(e) => setScheduleData({ ...scheduleData, end: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Modo</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                  }}
                >
                  <option value="normal">Normal</option>
                  <option value="time">Por Tempo (min)</option>
                  <option value="cycles">Por Ciclos</option>
                </select>
              </div>

              {(mode === 'time' || mode === 'cycles') && (
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    {mode === 'time' ? 'Minutos' : 'Ciclos'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={scheduleData.duration}
                    onChange={(e) => setScheduleData({ ...scheduleData, duration: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                    }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleSchedule}
              className="btn"
              style={{ background: '#10b981' }}
            >
              {ICONS.check} Agendar
            </button>
          </div>
        )}

        {schedules.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Modo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {schedules.slice(0, 5).map((schedule) => (
                  <tr key={schedule.id}>
                    <td>{new Date(schedule.scheduled_start_at).toLocaleString('pt-BR')}</td>
                    <td>{schedule.scheduled_end_at ? new Date(schedule.scheduled_end_at).toLocaleString('pt-BR') : '—'}</td>
                    <td><span className="badge">{schedule.mode}</span></td>
                    <td>
                      <span className={`badge ${schedule.status === 'pending' ? 'warning' : schedule.status === 'active' ? 'success' : 'default'}`}>
                        {schedule.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pares Ativos */}
      <div className="card">
        <div className="card-head">
          <h2>Pares Conectados</h2>
          <button
            onClick={() => window.location.reload()}
            className="icon-btn"
            title="Atualizar"
          >
            {ICONS.refresh}
          </button>
        </div>

        {status?.recent_pairs && status.recent_pairs.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Número 1</th>
                  <th>Número 2</th>
                  <th>Mensagens</th>
                  <th>Status</th>
                  <th>Início</th>
                </tr>
              </thead>
              <tbody>
                {status.recent_pairs.slice(0, 10).map((pair) => (
                  <tr key={pair.id}>
                    <td className="mono">{pair.phone_1}</td>
                    <td className="mono">{pair.phone_2}</td>
                    <td>{pair.messages_sent}/{pair.messages_total}</td>
                    <td>
                      <span
                        className={`badge ${pair.status === 'active' ? 'success' : 'default'}`}
                      >
                        {pair.status === 'active' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>{new Date(pair.created_at).toLocaleTimeString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Nenhum par conectado no momento</div>
        )}
      </div>

      {/* Logs */}
      <div className="card">
        <div className="card-head">
          <h2>Últimos Eventos</h2>
          <Link href="/admin/logs" className="card-link">
            Ver todos os logs
          </Link>
        </div>

        {logs.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Evento</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(0, 20).map((log) => (
                  <tr key={log.id}>
                    <td className="mono">{new Date(log.created_at).toLocaleTimeString('pt-BR')}</td>
                    <td>
                      <span className="badge">
                        {log.event_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: '#666' }}>
                      {log.metadata?.phone_number || log.metadata?.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Nenhum evento registrado</div>
        )}
      </div>
    </>
  );
}
