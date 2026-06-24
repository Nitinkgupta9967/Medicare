import React from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import {
  Activity,
  Clock3,
  MonitorUp,
  Plus,
  SkipForward,
  Stethoscope,
  TimerReset,
  UsersRound,
  Wifi,
  WifiOff
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const socket = io(API_URL, { autoConnect: true, transports: ['websocket', 'polling'] });

const emptyState = {
  currentToken: 0,
  lastTokenId: 0,
  avgConsultMin: 5,
  totalServed: 0,
  waitingTokens: [],
  servingToken: null,
  queueLength: 0
};

function useQueue() {
  const [state, setState] = React.useState(emptyState);
  const [connected, setConnected] = React.useState(socket.connected);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    fetch(`${API_URL}/api/queue`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Queue load failed')))
      .then((payload) => mounted && setState(payload))
      .catch((err) => mounted && setError(err.message));

    const onUpdated = (payload) => {
      setState(payload);
      setError('');
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => {
      setConnected(false);
      setError('Realtime connection is retrying');
    };

    socket.on('queue:updated', onUpdated);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      mounted = false;
      socket.off('queue:updated', onUpdated);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  const emitAction = React.useCallback((event, payload = {}) => {
    setBusy(true);
    setError('');
    return new Promise((resolve) => {
      socket.timeout(5000).emit(event, payload, (err, response) => {
        setBusy(false);
        if (err) {
          setError('No acknowledgement from server');
          resolve(false);
          return;
        }
        if (!response?.success) {
          setError(response?.error || 'Action failed');
          resolve(false);
          return;
        }
        setState(response.status);
        resolve(true);
      });
    });
  }, []);

  return { state, connected, error, busy, emitAction };
}

function App() {
  const queue = useQueue();
  const [route, setRoute] = React.useState(() => location.pathname === '/display' ? 'display' : 'reception');

  React.useEffect(() => {
    const onPop = () => setRoute(location.pathname === '/display' ? 'display' : 'reception');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (nextRoute) => {
    const path = nextRoute === 'display' ? '/display' : '/reception';
    history.pushState(null, '', path);
    setRoute(nextRoute);
  };

  return (
    <main className={route === 'display' ? 'app display-mode' : 'app'}>
      <TopBar route={route} onNavigate={navigate} connected={queue.connected} />
      {queue.error && <div className="banner">{queue.error}</div>}
      {route === 'display'
        ? <PatientDisplay queue={queue.state} connected={queue.connected} />
        : <ReceptionDesk queueState={queue.state} busy={queue.busy} emitAction={queue.emitAction} />}
    </main>
  );
}

function TopBar({ route, onNavigate, connected }) {
  return (
    <header className="topbar">
      <div className="brand"><Stethoscope size={22} /> MediQueue</div>
      <div className="nav-actions" role="tablist" aria-label="Views">
        <button className={route === 'reception' ? 'active' : ''} onClick={() => onNavigate('reception')} aria-label="Reception view">
          <UsersRound size={18} /> Reception
        </button>
        <button className={route === 'display' ? 'active' : ''} onClick={() => onNavigate('display')} aria-label="Patient display">
          <MonitorUp size={18} /> Display
        </button>
      </div>
      <div className={connected ? 'status live' : 'status'}>{connected ? <Wifi size={17} /> : <WifiOff size={17} />}{connected ? 'Live' : 'Offline'}</div>
    </header>
  );
}

function ReceptionDesk({ queueState, busy, emitAction }) {
  const [patientName, setPatientName] = React.useState('');
  const [avgTime, setAvgTime] = React.useState(queueState.avgConsultMin || 5);

  React.useEffect(() => setAvgTime(queueState.avgConsultMin || 5), [queueState.avgConsultMin]);

  const addPatient = async (event) => {
    event.preventDefault();
    const ok = await emitAction('addPatient', { patientName });
    if (ok) setPatientName('');
  };

  const saveAvg = (event) => {
    event.preventDefault();
    emitAction('setAvgTime', { avgConsultMin: Number(avgTime) });
  };

  return (
    <section className="reception-layout">
      <div className="command-panel">
        <div className="metric-row">
          <Metric icon={<Activity />} label="Now Serving" value={queueState.currentToken || '--'} />
          <Metric icon={<UsersRound />} label="Waiting" value={queueState.queueLength} />
          <Metric icon={<Clock3 />} label="Avg Min" value={queueState.avgConsultMin} />
        </div>

        <form className="control-strip" onSubmit={addPatient}>
          <input value={patientName} onChange={(event) => setPatientName(event.target.value)} placeholder="Patient name" aria-label="Patient name" />
          <button type="submit" disabled={busy || !patientName.trim()}><Plus size={18} /> Add</button>
        </form>

        <div className="action-grid">
          <button className="primary-action" disabled={busy} onClick={() => emitAction('callNext')}>
            <SkipForward size={22} /> Call Next
          </button>
          <form className="avg-form" onSubmit={saveAvg}>
            <label htmlFor="avgTime">Average consultation</label>
            <div>
              <input id="avgTime" type="number" min="0" step="0.5" value={avgTime} onChange={(event) => setAvgTime(event.target.value)} />
              <button type="submit" disabled={busy}><TimerReset size={18} /> Set</button>
            </div>
          </form>
        </div>
      </div>

      <QueueList queueState={queueState} />
    </section>
  );
}

function Metric({ icon, label, value }) {
  return <div className="metric"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function QueueList({ queueState }) {
  const tokens = [queueState.servingToken, ...queueState.waitingTokens].filter(Boolean);
  return (
    <aside className="queue-panel">
      <div className="panel-title"><UsersRound size={20} /> Queue</div>
      {tokens.length === 0 ? <div className="empty">No patients waiting</div> : tokens.map((token, index) => (
        <div className={token.status === 'serving' ? 'token-row serving' : 'token-row'} key={token.tokenId}>
          <div className="token-badge">{token.tokenId}</div>
          <div><strong>{token.patientName}</strong><small>{token.status === 'serving' ? 'In consultation' : `${index} ahead`}</small></div>
        </div>
      ))}
    </aside>
  );
}

function PatientDisplay({ queue, connected }) {
  const nextWaiting = queue.waitingTokens[0];
  const peopleAhead = nextWaiting ? Math.max(0, queue.waitingTokens.findIndex((token) => token.tokenId === nextWaiting.tokenId)) : 0;
  const estimate = nextWaiting ? Math.max(1, Math.round((peopleAhead + (queue.currentToken ? 1 : 0)) * queue.avgConsultMin)) : 0;

  return (
    <section className="display-board">
      <div className="serving-block">
        <span>Now Serving</span>
        <strong>{queue.currentToken || '--'}</strong>
        <small>{queue.servingToken?.patientName || 'Please wait for the next call'}</small>
      </div>
      <div className="display-stats">
        <Metric icon={<UsersRound />} label="Waiting" value={queue.queueLength} />
        <Metric icon={<Clock3 />} label="Next Est." value={estimate ? `${estimate}m` : '--'} />
        <Metric icon={connected ? <Wifi /> : <WifiOff />} label="Realtime" value={connected ? 'On' : 'Retry'} />
      </div>
      <div className="next-strip">
        <span>Next Token</span>
        <strong>{nextWaiting?.tokenId || '--'}</strong>
        <small>{nextWaiting?.patientName || 'Queue is clear'}</small>
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
