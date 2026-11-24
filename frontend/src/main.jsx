import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, Bell, ChartNoAxesCombined, CircleAlert, ClipboardList, Database, FileText, LayoutDashboard, Lightbulb, Menu, Moon, Plus, ScanSearch, Settings, Sun, Upload, X } from 'lucide-react'
import { Badge, Dashboard, Detail, IncidentTable, Investigation, LogTable, Reports, UploadView, incidentId } from './views'
import './style.css'

const sections = [
  ['Workspace', [
    ['dashboard', 'Dashboard', LayoutDashboard, 'Monitor system health and investigate incidents across your services.'],
    ['upload', 'Log Upload', Upload, 'Import and preview application logs, events, and system metrics.'],
    ['analysis', 'Log Analysis', ChartNoAxesCombined, 'Explore normalized records and Isolation Forest outlier scores.'],
  ]],
  ['Investigation', [
    ['detection', 'Incident Detection', CircleAlert, 'Review incidents detected from failures, abnormal metrics, and outliers.'],
    ['root-cause', 'Root Cause Analysis', ScanSearch, 'Review ranked hypotheses and the log evidence supporting each one.'],
    ['management', 'Incident Management', ClipboardList, 'Search incidents and update their resolution status.'],
    ['recommendations', 'Recommendations', Lightbulb, 'Find troubleshooting steps linked to observed incident evidence.'],
  ]],
  ['Resources', [
    ['reports', 'Reports', FileText, 'Summarize and export investigation results.'],
    ['settings', 'Settings', Settings, 'Manage dashboard appearance and critical incident alerts.'],
  ]],
]
const pages = sections.flatMap(([, items]) => items)
const route = () => window.location.hash.slice(1) || 'dashboard'
const go = name => { window.location.hash = name }

async function api(path, options) {
  const response = await fetch('/api' + path, options)
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null
  if (!response.ok || data === null) throw new Error(data?.error || 'Could not complete the request. Check that Flask is running.')
  return data
}

function App() {
  const [page, setPage] = useState(route)
  const [datasets, setDatasets] = useState([])
  const [selected, setSelected] = useState(() => Number(localStorage.getItem('lens-dataset')) || null)
  const [snapshot, setSnapshot] = useState({ dataset: null, rows: [], incidents: [] })
  const [detail, setDetail] = useState(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('lens-theme') !== 'light')
  const [alerts, setAlerts] = useState(() => localStorage.getItem('lens-alerts') !== 'off')
  const [notifications, setNotifications] = useState(false)
  const [mobile, setMobile] = useState(false)
  const id = /^incident\/(\d+)$/.exec(page)?.[1]
  const item = detail?.id === Number(id) ? detail : null
  const [, title, , description] = pages.find(([key]) => key === page) || pages[0]
  const dataset = datasets.find(row => row.id === selected)
  const rows = snapshot.dataset === selected ? snapshot.rows : []
  const incidents = snapshot.dataset === selected ? snapshot.incidents : []
  const critical = alerts ? incidents.filter(row => row.severity === 'Critical' && row.status !== 'Resolved') : []

  useEffect(() => {
    const change = () => { setPage(route()); setMobile(false); setNotifications(false); window.scrollTo(0, 0) }
    const close = event => {
      if (event.key === 'Escape') { setMobile(false); setNotifications(false) }
    }
    window.addEventListener('hashchange', change)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('hashchange', change)
      window.removeEventListener('keydown', close)
    }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem('lens-theme', dark ? 'dark' : 'light')
  }, [dark])
  useEffect(() => { localStorage.setItem('lens-alerts', alerts ? 'on' : 'off') }, [alerts])
  useEffect(() => {
    let live = true
    api('/datasets').then(list => {
      if (!live) return
      setDatasets(list)
      setSelected(current => list.some(row => row.id === current) ? current : list[0]?.id ?? null)
    }).catch(err => live && setError(err.message))
    return () => { live = false }
  }, [revision])
  useEffect(() => {
    if (!selected) return
    localStorage.setItem('lens-dataset', String(selected))
    let live = true
    Promise.all([api('/datasets/' + selected + '/logs'), api('/incidents?dataset=' + selected)])
      .then(([rows, incidents]) => live && setSnapshot({ dataset: selected, rows, incidents }))
      .catch(err => live && setError(err.message))
    return () => { live = false }
  }, [selected, revision])
  useEffect(() => {
    if (!id) return
    let live = true
    api('/incidents/' + id).then(result => {
      if (live) { setDetail(result); setSelected(result.dataset_id) }
    }).catch(err => live && setError(err.message))
    return () => { live = false }
  }, [id, revision])

  async function action(callback) {
    setBusy(true)
    setError('')
    try { await callback() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const refresh = () => setRevision(value => value + 1)
  const open = value => go('incident/' + value)
  const analyze = () => action(async () => {
    await api('/datasets/' + selected + '/analyze', { method: 'POST' })
    refresh()
    go('detection')
  })
  const sample = run => action(async () => {
    const result = await api('/sample', { method: 'POST' })
    if (run) await api('/datasets/' + result.id + '/analyze', { method: 'POST' })
    setSelected(result.id)
    refresh()
  })
  const upload = file => action(async () => {
    const body = new FormData()
    body.append('file', file)
    const result = await api('/datasets', { method: 'POST', body })
    setSelected(result.id)
    refresh()
  })
  const update = (id, status) => action(async () => {
    setDetail(await api('/incidents/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }) }))
    refresh()
  })
  const emptyActions = <div className="actions"><button onClick={() => go('upload')}>Upload logs</button>
    <button className="primary" disabled={busy} onClick={() => sample(true)}>Analyze sample</button></div>

  let view
  if (id) view = item ? <Detail item={item} update={update} busy={busy} /> : <div className="panel empty">{error ? 'Incident unavailable.' : 'Loading incident…'}</div>
  else if (page === 'upload') view = <UploadView submit={upload} sample={sample} dataset={dataset} rows={rows} analyze={analyze} busy={busy} />
  else if (page === 'analysis') view = <LogTable key={selected} rows={rows} />
  else if (page === 'detection' || page === 'management') view = <IncidentTable key={page + selected} incidents={incidents} open={open} detection={page === 'detection'} />
  else if (page === 'root-cause' || page === 'recommendations') view = <Investigation key={page + selected} incidents={incidents} open={open} recommendations={page === 'recommendations'} />
  else if (page === 'reports') view = <Reports incidents={incidents} dataset={dataset} />
  else if (page === 'settings') view = <section className="panel content preferences"><h2>Appearance and alerts</h2>
    <label>Color theme<select value={dark ? 'dark' : 'light'} onChange={event => setDark(event.target.value === 'dark')}><option value="dark">Dark</option><option value="light">Light</option></select></label>
    <label>Critical incident notifications<input type="checkbox" checked={alerts} onChange={event => setAlerts(event.target.checked)} /></label>
  </section>
  else view = <Dashboard rows={rows} incidents={incidents} dark={dark} open={open} analyzed={!!dataset?.analyzed_at} emptyActions={emptyActions} />

  return <div className="shell">
    {mobile && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside id="sidebar" className={mobile ? 'sidebar shown' : 'sidebar'}>
      <a href="#dashboard" className="brand"><span className="brand-icon"><Activity size={23} /></span>
        <div><strong>Incident Lens</strong><small>Software observability</small></div></a>
      <nav aria-label="Main navigation">
        {sections.map(([group, entries]) => <div className="nav-group" key={group}>
          <p>{group}</p>{entries.map(([key, name, Icon]) => <a href={'#' + key} key={key} aria-current={page === key ? 'page' : undefined}><Icon size={18} />{name}</a>)}
        </div>)}
      </nav>
      <div className="sidebar-foot"><Database size={16} /><span>Local workspace</span></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label={mobile ? 'Close navigation menu' : 'Open navigation'} aria-controls="sidebar" aria-expanded={mobile} onClick={() => setMobile(!mobile)}><Menu size={20} /></button>
        <span className="breadcrumb">Workspace <span>/</span> {id ? 'Incident detail' : title}</span>
        <div className="actions ml-auto">
          <select className="dataset-select" aria-label="Active dataset" value={selected ?? ''} disabled={busy} onChange={event => {
            setSelected(Number(event.target.value))
            if (id) go('management')
          }}>
            {!datasets.length && <option value="">No dataset</option>}
            {datasets.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <button className="icon-button" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="icon-button notification-button" aria-label={'Notifications, ' + critical.length + ' active critical incidents'} aria-expanded={notifications} onClick={() => setNotifications(!notifications)}>
            <Bell size={18} />{critical.length > 0 && <span className="indicator" />}
          </button>
        </div>
        {notifications && <section className="panel notifications">
          <div className="section-title"><h2>Notifications</h2><button className="icon-button" aria-label="Close notifications" onClick={() => setNotifications(false)}><X size={15} /></button></div>
          {!critical.length && <p>{alerts ? 'No active critical incidents.' : 'Critical incident notifications are off.'}</p>}
          {critical.slice(0, 8).map(row => <button className="notice" key={row.id} onClick={() => { setNotifications(false); open(row.id) }}><Badge>Critical</Badge><span>{row.service} · {incidentId(row.id)}</span></button>)}
          {critical.length > 8 && <button onClick={() => { setNotifications(false); go('management') }}>View incident management</button>}
        </section>}
      </header>
      <main>
        <div className="page-heading">
          <div>{id && <button className="inline" onClick={() => go('management')}>Incident management</button>}
            <h1>{id ? incidentId(id) : page === 'dashboard' ? 'Incident overview' : title}</h1>
            <p>{id ? 'Investigation evidence, timeline, and resolution status.' : description}</p></div>
          {page === 'dashboard' && <button className="primary" onClick={() => go('upload')}><Plus size={17} /> Upload logs</button>}
        </div>
        {error && <div role="alert" className="error"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        {busy && <p className="progress" role="status">Working…</p>}
        {view}
      </main>
    </div>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
