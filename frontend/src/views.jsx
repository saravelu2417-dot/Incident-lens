import React, { useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, Download, FileText, Gauge, Radio, Search, UploadCloud, Zap } from 'lucide-react'
import { average, Charts, counts } from './charts'

export const statuses = ['Open', 'Investigating', 'Resolved']
const severities = ['Critical', 'High', 'Medium', 'Low']
export const incidentId = id => 'INC-' + String(id).padStart(4, '0')
export const utc = value => value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : '—'
const percent = value => value == null ? '—' : Math.round(value * 100) + '%'
const score = value => value == null ? '—' : value.toFixed(3)

export function Badge({ children }) {
  return <span className={'badge ' + String(children).toLowerCase()}>{children}</span>
}

function Select({ label, value, set, options, all = true, disabled = false }) {
  return <select aria-label={label} value={value} disabled={disabled} onChange={event => set(event.target.value)}>
    {all && <option value="">All {label.toLowerCase()}</option>}
    {options.map(option => <option key={option}>{option}</option>)}
  </select>
}

function Pager({ page, total, set, size }) {
  const last = Math.max(0, Math.ceil(total / size) - 1)
  return <div className="pager">
    <span>{total ? page * size + 1 : 0}–{Math.min((page + 1) * size, total)} of {total}</span>
    <button disabled={page === 0} onClick={() => set(page - 1)}>Previous</button>
    <button disabled={page === last} onClick={() => set(page + 1)}>Next</button>
  </div>
}

function SearchBox({ value, set, placeholder }) {
  return <label className="search"><Search size={16} /><input aria-label={placeholder} value={value} onChange={event => set(event.target.value)} placeholder={placeholder} /></label>
}

export function IncidentTable({ incidents, open, compact = false, detection = false }) {
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('Time · newest first')
  const [page, setPage] = useState(0)
  const reset = setter => value => { setter(value); setPage(0) }
  const visible = incidents.filter(item => (!severity || item.severity === severity) &&
    (!status || item.status === status) && (!category || item.category === category) &&
    [incidentId(item.id), item.message, item.service, item.category, item.causes[0].title].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  const time = (a, b) => (b.timestamp || '').localeCompare(a.timestamp || '') || b.id - a.id
  visible.sort((a, b) => {
    if (sort === 'Severity') return severities.indexOf(a.severity) - severities.indexOf(b.severity) || time(a, b)
    if (sort === 'Service') return a.service.localeCompare(b.service) || time(a, b)
    if (sort === 'Time · oldest first') return -time(a, b)
    return time(a, b)
  })
  const size = compact ? 5 : 12
  const current = Math.min(page, Math.max(0, Math.ceil(visible.length / size) - 1))
  return <section className="panel">
    {compact ? <div className="panel-heading"><h2>Recent incidents</h2><p>Latest detections in the selected dataset</p></div> :
      <div className="toolbar">
        <SearchBox value={query} set={reset(setQuery)} placeholder="Search incidents" />
        <Select label="Severities" value={severity} set={reset(setSeverity)} options={severities} />
        <Select label="Categories" value={category} set={reset(setCategory)} options={[...new Set(incidents.map(item => item.category))].sort()} />
        <Select label="Statuses" value={status} set={reset(setStatus)} options={statuses} />
        <Select label="Sort incidents" value={sort} set={reset(setSort)} options={['Time · newest first', 'Time · oldest first', 'Severity', 'Service']} all={false} />
      </div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Incident</th><th>Timestamp · UTC</th><th>Category</th><th>Severity</th><th>Service</th>
        {detection ? <><th>Detection signal</th><th>Model vote</th></> : <th>Probable cause</th>}
        <th>Status</th><th>Action</th></tr></thead>
      <tbody>{visible.slice(current * size, (current + 1) * size).map(item => <tr key={item.id}>
        <td className="mono">{incidentId(item.id)}</td><td className="mono nowrap">{utc(item.timestamp)}</td>
        <td>{item.category}</td><td><Badge>{item.severity}</Badge></td><td>{item.service}</td>
        {detection ? <><td>{item.anomaly ? <Badge>Outlier</Badge> : 'Log or metric'}</td>
          <td className="mono">{percent(item.classification_score)}</td></> : <td>{item.causes[0].title}</td>}
        <td><Badge>{item.status}</Badge></td>
        <td><button className="small" onClick={() => open(item.id)}>View</button></td>
      </tr>)}</tbody>
    </table></div>
    {!visible.length && <div className="empty">No matching incidents.</div>}
    {!compact && <Pager page={current} set={setPage} total={visible.length} size={size} />}
  </section>
}

export function LogTable({ rows, preview = false }) {
  const [query, setQuery] = useState('')
  const [onlyAnomalies, setOnlyAnomalies] = useState(false)
  const [page, setPage] = useState(0)
  const size = preview ? 6 : 15
  const filtered = rows.filter(row => (!onlyAnomalies || row.anomaly) &&
    [row.message, row.service, row.level, row.timestamp].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  const current = Math.min(page, Math.max(0, Math.ceil(filtered.length / size) - 1))
  return <section className="panel">
    {preview ? <div className="panel-heading"><h2>Log preview</h2><p>First {Math.min(size, rows.length)} normalized records</p></div> :
      <div className="toolbar"><SearchBox value={query} set={value => { setQuery(value); setPage(0) }} placeholder="Search logs" />
        <label className="checkbox"><input type="checkbox" checked={onlyAnomalies} onChange={event => { setOnlyAnomalies(event.target.checked); setPage(0) }} /> Anomalies only</label></div>}
    <div className="table-wrap"><table>
      <thead><tr><th>Timestamp · UTC</th><th>Service</th><th>Level</th><th>Message</th><th>Response · ms</th><th>CPU %</th><th>Memory %</th>{!preview && <th>Anomaly score</th>}</tr></thead>
      <tbody>{filtered.slice(current * size, (current + 1) * size).map(row => <tr key={row.id}>
        <td className="mono nowrap">{utc(row.timestamp)}</td><td>{row.service}</td><td className="mono">{row.level}</td>
        <td className="mono message">{row.message || '—'}</td><td>{row.latency ?? '—'}</td><td>{row.cpu ?? '—'}</td><td>{row.memory ?? '—'}</td>
        {!preview && <td>{row.anomaly && <Badge>Outlier</Badge>} <span className="mono">{score(row.anomaly_score)}</span></td>}
      </tr>)}</tbody>
    </table></div>
    {!filtered.length && <div className="empty">No matching logs.</div>}
    {!preview && <Pager page={current} total={filtered.length} set={setPage} size={size} />}
  </section>
}

export function Dashboard({ rows, incidents, dark, open, analyzed, emptyActions }) {
  const anomalies = rows.filter(row => row.anomaly).length
  const latency = average(rows.map(row => row.latency).filter(value => value != null))
  const resolved = incidents.filter(row => row.status === 'Resolved').length
  const health = rows.length && analyzed ? 100 * (1 - incidents.length / rows.length) : null
  const items = [
    ['Total incidents', incidents.length, Activity], ['Critical incidents', incidents.filter(row => row.severity === 'Critical').length, AlertTriangle],
    ['Active incidents', incidents.length - resolved, Radio], ['Resolved incidents', resolved, CheckCircle2],
    ['Detected anomalies', anomalies, Zap], ['Avg. response time', latency == null ? '—' : Math.round(latency) + ' ms', Clock3],
    ['Health score', health == null ? '—' : Math.round(health) + '%', Gauge],
  ]
  return <>
    {!analyzed && <div className="panel onboarding"><Database size={25} /><div><h2>Analyze your first dataset</h2><p>Upload logs or run the included sample to populate this dashboard.</p></div>{emptyActions}</div>}
    <div className="stats">{items.map(([name, value, Icon], index) =>
      <section className="panel stat" key={name}><Icon size={18} /><span>{name}</span><strong>{analyzed || index === 5 ? value : '—'}</strong></section>)}</div>
    <div className="chart-grid-container"><Charts rows={rows} incidents={incidents} dark={dark} /></div>
    <IncidentTable incidents={incidents} open={open} compact />
  </>
}

export function UploadView({ submit, sample, dataset, rows, analyze, busy }) {
  const [file, setFile] = useState(null)
  return <>
    <div className="split">
      <form className="panel content upload" onSubmit={event => { event.preventDefault(); if (file) submit(file) }}>
        <UploadCloud size={26} /><h2>Upload log file</h2><p>CSV, TXT, or JSON · Up to 5 MB and 20,000 records</p>
        <input aria-label="Log file" type="file" accept=".csv,.txt,.json" onChange={event => setFile(event.target.files[0] || null)} />
        <button className="primary" disabled={!file || busy}>Upload and preview</button>
      </form>
      <section className="panel content upload"><Database size={26} /><h2>Sample dataset</h2>
        <p>Explore 168 logs from six services, including a mix of normal requests and seven recurring incident scenarios.</p>
        <button disabled={busy} onClick={() => sample(false)}>Load sample preview</button>
      </section>
    </div>
    {dataset && <>
      <section className="panel onboarding"><FileText size={22} /><div><h2>{dataset.name}</h2>
        <p>{dataset.records} records · {(dataset.bytes / 1024).toFixed(1)} KB · Uploaded {dataset.uploaded_at} UTC</p></div>
        <button className="primary" onClick={analyze} disabled={busy || !!dataset.analyzed_at}>{dataset.analyzed_at ? 'Analysis complete' : 'Run analysis'}</button>
      </section>
      <LogTable rows={rows} preview />
    </>}
  </>
}

function Causes({ item }) {
  return item.causes.map(cause => <div className="cause" key={cause.key}>
    <div className="section-title"><h3>{cause.title}</h3><span className="mono">{cause.confidence == null ? '—' : percent(cause.confidence) + ' evidence score'}</span></div>
    <ul>{cause.evidence.map((line, index) => <li key={index}>{line}</li>)}</ul>
  </div>)
}

export function Detail({ item, update, busy }) {
  return <>
    <section className="panel content">
      <div className="section-title"><div><h2>{item.category}</h2><p>{item.service} · {utc(item.timestamp)} UTC</p></div><Badge>{item.severity}</Badge></div>
      <p className="message mono">{item.message || 'No error message recorded.'}</p>
      <dl className="facts">
        <div><dt>Detection</dt><dd>{item.anomaly ? 'Isolation Forest outlier' : 'Log or metric signal'}</dd></div>
        <div><dt>Outlier score</dt><dd>{score(item.anomaly_score)}</dd></div>
        <div><dt>Classification</dt><dd>{item.classification_method} · {percent(item.classification_score)} model vote</dd></div>
        <div><dt>Matching failure logs</dt><dd>{item.recurrences}</dd></div>
      </dl>
      <div className="toolbar flush"><Select label="Resolution status" value={item.status} set={status => update(item.id, status)} options={statuses} all={false} disabled={busy} />
        <a className="button" href={'/api/reports/pdf?incident=' + item.id}><Download size={16} /> Incident PDF</a></div>
    </section>
    <div className="split">
      <section className="panel content"><h2>Probable root causes</h2><Causes item={item} /></section>
      <section className="panel content"><h2>Recommendations</h2><ol>{item.recommendations.map(step => <li key={step}>{step}</li>)}</ol></section>
    </div>
    <section className="panel content"><h2>Incident timeline</h2>
      <ol className="timeline">{item.timeline.map(event => <li className={event.id === item.log_id ? 'trigger' : ''} key={event.id}>
        <div><time className="mono">{utc(event.timestamp)}</time> · {event.service} · {event.level}{event.id === item.log_id && ' · Trigger'}</div>
        <div className="mono message">{event.message || 'No message'}</div>
      </li>)}</ol>
    </section>
  </>
}

export function Investigation({ incidents, open, recommendations }) {
  const [page, setPage] = useState(0)
  const current = Math.min(page, Math.max(0, Math.ceil(incidents.length / 8) - 1))
  if (!incidents.length) return <div className="panel empty">Analyze a dataset to start investigating incidents.</div>
  return <>
    <div className="split">{incidents.slice(current * 8, (current + 1) * 8).map(item =>
      <section className="panel content" key={item.id}>
        <div className="section-title"><div><button className="inline mono" onClick={() => open(item.id)}>{incidentId(item.id)}</button><h2>{item.service}</h2></div><Badge>{item.severity}</Badge></div>
        {recommendations ? <><p>{item.causes[0].title}</p><ol>{item.recommendations.map(step => <li key={step}>{step}</li>)}</ol></> : <Causes item={item} />}
      </section>)}</div>
    <Pager page={current} set={setPage} total={incidents.length} size={8} />
  </>
}

export function Reports({ incidents, dataset }) {
  if (!dataset) return <div className="panel empty">Select a dataset to export reports.</div>
  const exports = dataset.analyzed_at
    ? [['pdf', 'Investigation PDF'], ['incidents', 'Incidents CSV'], ['logs', 'Logs CSV']]
    : [['logs', 'Logs CSV']]
  return <>
    <section className="panel content"><h2>Investigation exports</h2><p>{dataset.name} · {incidents.length} incidents · {dataset.records} logs</p>
      {!dataset.analyzed_at && <p>Run analysis to enable incident exports.</p>}
      <div className="toolbar flush">{exports.map(([path, label]) =>
        <a key={path} className="button" href={'/api/reports/' + path + '?dataset=' + dataset.id}><Download size={16} />{label}</a>)}</div>
    </section>
    <div className="split">{[['Severity summary', row => row.severity], ['Probable cause summary', row => row.causes[0].title]].map(([title, group]) =>
      <section className="panel content" key={title}><h2>{title}</h2>
        {counts(incidents, group).map(([name, count]) => <div className="report-row" key={name}><span>{name}</span><strong>{count}</strong></div>)}
        {!incidents.length && <p>No incidents recorded.</p>}
      </section>)}</div>
  </>
}
