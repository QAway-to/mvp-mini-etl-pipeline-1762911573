import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import etlFallback from '../src/mock-data/etl.json';
import { loadUsers, buildMetrics } from '../src/lib/randomuser';

const container = {
  fontFamily: 'Inter, sans-serif',
  padding: '24px 32px',
  background: '#0b1120',
  color: '#f8fafc',
  minHeight: '100vh'
};

const card = {
  background: '#111c33',
  borderRadius: 16,
  padding: 24,
  marginBottom: 24,
  border: '1px solid rgba(56,189,248,0.25)',
  boxShadow: '0 20px 28px rgba(8, 47, 73, 0.45)'
};

export default function MiniETL({
  initialMetrics,
  initialUsers,
  sourceUrl: initialSource,
  fallbackUsed: initialFallback,
  fetchedAt: initialFetchedAt
}) {
  const steps = useMemo(() => etlFallback.pipeline, []);
  const [users, setUsers] = useState(Array.isArray(initialUsers) ? initialUsers : []);
  const [metrics, setMetrics] = useState(initialMetrics || {
    rows_in: 0,
    rows_out: 0,
    dedup_removed: 0,
    countries: 0,
    duration_sec: 0,
    lastUser: 'N/A'
  });
  const [sourceUrl, setSourceUrl] = useState(initialSource || '');
  const [fallbackUsed, setFallbackUsed] = useState(initialFallback || false);
  const [fetchedAt, setFetchedAt] = useState(initialFetchedAt || new Date().toISOString());
  const [stepStatuses, setStepStatuses] = useState(() => steps.map(() => 'pending'));
  const [logLines, setLogLines] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [animationStarted, setAnimationStarted] = useState(false);

  const startAnimation = () => {
    if (animationStarted) return;
    setAnimationStarted(true);
    const statuses = steps.map(() => 'pending');
    const logs = [
      `Extract ▸ Получено ${users.length} пользователей (${fallbackUsed ? 'демо-данные' : extractDomain(sourceUrl)})`,
      `Transform ▸ Оставлено ${metrics.rows_out} валидных записей, удалено ${metrics.dedup_removed}`,
      `Load ▸ Данные готовы. Последний пользователь: ${metrics.lastUser || 'n/a'}`
    ];
    const timers = [];

    setStepStatuses(statuses);
    setLogLines([]);

    timers.push(setTimeout(() => {
      setStepStatuses((prev) => prev.map((_, idx) => (idx === 0 ? 'active' : idx > 0 ? 'pending' : _)));
      setLogLines([logs[0]]);
    }, 200));

    timers.push(setTimeout(() => {
      setStepStatuses((prev) => prev.map((_, idx) => (idx === 0 ? 'done' : idx === 1 ? 'active' : 'pending')));
      setLogLines(logs.slice(0, 2));
    }, 1200));

    timers.push(setTimeout(() => {
      setStepStatuses((prev) => prev.map((_, idx) => (idx < 2 ? 'done' : 'active')));
      setLogLines(logs);
    }, 2200));

    timers.push(setTimeout(() => {
      setStepStatuses((prev) => prev.map(() => 'done'));
    }, 3200));
  };

  const handleRestart = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setAnimationStarted(false);
    try {
      const response = await fetch('/api/etl/restart');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      setUsers(payload.users);
      setMetrics(payload.metrics);
      setSourceUrl(payload.sourceUrl);
      setFallbackUsed(payload.fallbackUsed);
      setFetchedAt(payload.fetchedAt);
      setLogLines((prev) => [...prev, '🔁 Конвейер перезапущен']);
      setTimeout(() => startAnimation(), 100);
    } catch (error) {
      setLogLines((prev) => [...prev, `⚠️ Ошибка перезапуска: ${error}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    const headers = ['id', 'name_first', 'name_last', 'email', 'phone', 'country', 'city', 'registered_date'];
    const csvRows = [headers.join(',')];
    users.forEach((user) => {
      const row = [
        formatCsvValue(user.id?.value || user.login?.uuid || ''),
        formatCsvValue(user.name?.first || ''),
        formatCsvValue(user.name?.last || ''),
        formatCsvValue(user.email || ''),
        formatCsvValue(user.phone || ''),
        formatCsvValue(user.location?.country || ''),
        formatCsvValue(user.location?.city || ''),
        formatCsvValue(user.registered?.date ? new Date(user.registered.date).toISOString() : '')
      ].join(',');
      csvRows.push(row);
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `mini-etl-users-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    setLogLines((prev) => [...prev, `📤 Экспортировано ${users.length} строк в CSV`]);
  };

  const isLive = !fallbackUsed;

  return (
    <main style={container}>
      <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 36, margin: 0 }}>🔄 Mini‑ETL Pipeline</h1>
          <p style={{ color: '#94a3b8', marginTop: 8 }}>
            Proof-of-Concept: вытягиваем реальные данные из Random User API, прогоняем через шаги Extract → Transform → Load и показываем метрики.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <StatusBadge live={isLive} />
            <span style={{ color: '#64748b', fontSize: 14 }}>
              Источник: {extractDomain(sourceUrl)} · Обновлено: {new Date(fetchedAt).toLocaleString()}
            </span>
          </div>
        </div>
        <button
          onClick={handleRestart}
          disabled={isProcessing}
          style={{
            padding: '10px 18px',
            borderRadius: 12,
            background: isProcessing ? '#0f172a' : 'linear-gradient(135deg,#38bdf8,#0ea5e9)',
            border: 'none',
            color: isProcessing ? '#475569' : '#0b1120',
            fontWeight: 700,
            cursor: isProcessing ? 'wait' : 'pointer',
            minWidth: 180
          }}
        >
          {isProcessing ? 'Перезапуск...' : 'Перезапустить конвейер'}
        </button>
      </header>

      <section style={{ ...card, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {steps.map((step, idx) => (
          <PipelinePill key={step} step={step} index={idx} status={stepStatuses[idx]} />
        ))}
      </section>

      <section style={{ ...card }}>
        <h2 style={{ marginTop: 0 }}>📊 Metrics</h2>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <Metric label="Rows in (users fetched)" value={metrics.rows_in} />
          <Metric label="Rows out (valid)" value={metrics.rows_out} />
          <Metric label="Removed (invalid)" value={metrics.dedup_removed} />
          <Metric label="Countries" value={metrics.countries || 0} />
        </div>
      </section>

      <section style={{ ...card }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ marginTop: 0 }}>📝 Live Log</h2>
          {!animationStarted && (
            <button
              onClick={startAnimation}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: '#1d293a',
                border: '1px solid rgba(56,189,248,0.3)',
                color: '#e2e8f0',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              ▶ Запустить анимацию
            </button>
          )}
        </div>
        <div style={{ background: '#0f172a', borderRadius: 12, padding: 16, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, minHeight: 96 }}>
          {logLines.map((line, idx) => (
            <div key={idx} style={{ color: '#cbd5f5' }}>
              {line}
            </div>
          ))}
          {!logLines.length && <span style={{ color: '#475569' }}>Нажмите "Запустить анимацию" для просмотра процесса ETL.</span>}
        </div>
        <p style={{ color: '#94a3b8', marginTop: 12 }}>
          Данные обрабатываются в реальном времени через ETL pipeline.
        </p>
      </section>

      <section style={{ ...card, marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>👥 Пользователи</h2>
        <p style={{ color: '#94a3b8' }}>
          Тянем данные напрямую с публичного Random User API. Показано {users.length} записей.
        </p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', marginTop: 16 }}>
          {users.slice(0, 20).map((user, idx) => (
            <div key={user.id?.value || user.login?.uuid || idx} style={{ background: '#0f172a', borderRadius: 12, padding: 16, border: '1px solid rgba(56,189,248,0.2)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <img src={user.picture?.thumbnail || 'https://via.placeholder.com/48'} alt="" style={{ width: 48, height: 48, borderRadius: '50%' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>{user.name?.first} {user.name?.last}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{user.email}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#cbd5f5', marginTop: 8 }}>
                <div>📍 {user.location?.city}, {user.location?.country}</div>
                <div>📞 {user.phone}</div>
              </div>
            </div>
          ))}
        </div>
        {users.length > 20 && (
          <p style={{ color: '#94a3b8', marginTop: 16, textAlign: 'center' }}>
            ... и ещё {users.length - 20} записей
          </p>
        )}
      </section>

      <section style={{ ...card, marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>⚙️ Управление</h2>
        <p style={{ color: '#94a3b8' }}>
          Кнопки ниже демонстрируют перезапуск/откат. В проде интеграция с Airflow, Prefect, dbt Cloud.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <SecondaryButton onClick={() => setShowSourceModal(true)}>Посмотреть исходный файл</SecondaryButton>
          <SecondaryButton onClick={handleExport}>Экспортировать отчёт (CSV)</SecondaryButton>
        </div>
      </section>

      {showSourceModal && (
        <Modal onClose={() => setShowSourceModal(false)} title="Raw JSON payload">
          <pre style={{ maxHeight: 320, overflow: 'auto', margin: 0 }}>{JSON.stringify(users.slice(0, 10), null, 2)}</pre>
        </Modal>
      )}
    </main>
  );
}

export async function getServerSideProps() {
  try {
    const meta = await loadUsers(true);
    const users = Array.isArray(meta.users) ? meta.users : [];
    const metrics = users.length ? buildMetrics(users) : {
      ...etlFallback.metrics,
      countries: typeof etlFallback.metrics.countries === 'number' ? etlFallback.metrics.countries : 0,
      lastUser: etlFallback.metrics.lastUser || 'N/A'
    };
    
    // Убедиться, что countries - это число
    if (typeof metrics.countries !== 'number') {
      metrics.countries = 0;
    }

    return {
      props: {
        initialMetrics: metrics,
        initialUsers: users,
        sourceUrl: meta.sourceUrl || '',
        fallbackUsed: meta.fallbackUsed || false,
        fetchedAt: meta.fetchedAt || new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('[MiniETL] getServerSideProps error:', error);
    return {
      props: {
        initialMetrics: {
          rows_in: 0,
          rows_out: 0,
          dedup_removed: 0,
          countries: 0,
          duration_sec: 0,
          lastUser: 'N/A'
        },
        initialUsers: [],
        sourceUrl: '',
        fallbackUsed: true,
        fetchedAt: new Date().toISOString()
      }
    };
  }
}

function Metric({ label, value }) {
  return (
    <div style={{ background: '#0f172a', borderRadius: 12, padding: 16 }}>
      <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function PipelinePill({ step, index, status }) {
  const palette = {
    pending: { background: '#1f2a44', color: '#64748b', border: '1px solid rgba(148,163,184,0.3)' },
    active: { background: 'linear-gradient(135deg,#38bdf8,#0ea5e9)', color: '#0b1120', border: 'none' },
    done: { background: 'linear-gradient(135deg,#22d3ee,#14b8a6)', color: '#022c22', border: 'none' }
  };

  return (
    <div
      style={{
        padding: '10px 18px',
        borderRadius: 12,
        fontWeight: 700,
        transition: 'all 0.3s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        ...palette[status]
      }}
    >
      <span style={{ opacity: 0.7 }}>{index + 1}.</span> {step.toUpperCase()}
    </div>
  );
}

function StatusBadge({ live }) {
  const color = live ? '#22c55e' : '#f97316';
  const label = live ? 'LIVE API' : 'DEMO DATA';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: 999,
        background: `${color}1A`,
        color
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}

function SecondaryButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 18px',
        borderRadius: 12,
        background: '#1d293a',
        border: '1px solid rgba(56,189,248,0.3)',
        color: '#e2e8f0',
        fontWeight: 600,
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  );
}

function Modal({ children, title, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 50
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: '#111c33',
          borderRadius: 16,
          padding: 24,
          maxWidth: 720,
          width: '100%',
          color: '#f8fafc',
          boxShadow: '0 25px 60px rgba(8,47,73,0.6)'
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: 24,
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}

function formatCsvValue(value) {
  if (value === undefined || value === null) return '';
  const stringValue = String(value).replace(/"/g, '""');
  return `"${stringValue}"`;
}

