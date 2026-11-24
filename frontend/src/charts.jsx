import React, { useEffect, useMemo, useRef } from 'react'
import Plotly from 'plotly.js-basic-dist-min'

const palette = ['#d393aa', '#b57dd4', '#e2ad7d', '#79b9a7', '#97a2d3', '#bd8f88']
const defaultLayout = {}
const severityLayout = { margin: { l: 16, r: 16, t: 12, b: 48 },
  legend: { orientation: 'h', x: .5, xanchor: 'center', y: -.12 } }
const timeLayout = { xaxis: { type: 'date' }, yaxis: { type: 'linear', rangemode: 'tozero' } }
const barLayout = { xaxis: { type: 'linear', rangemode: 'tozero' }, yaxis: { type: 'category', autorange: 'reversed' } }
export const counts = (items, key) => Object.entries(items.reduce((result, item) => {
  const label = key(item)
  result[label] = (result[label] || 0) + 1
  return result
}, Object.create(null))).sort((a, b) => b[1] - a[1])
export const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

function Chart({ title, hint, data, dark, extra = defaultLayout }) {
  const chart = useRef(null)
  useEffect(() => {
    if (!data.length) return
    const element = chart.current
    const grid = dark ? '#38303b' : '#eee3e9'
    const muted = dark ? '#c3b4c1' : '#695b68'
    const axis = { gridcolor: grid, zerolinecolor: grid, automargin: true }
    const { xaxis, yaxis, ...layout } = extra
    Plotly.react(element, data, {
      height: 245, margin: { l: 42, r: 20, t: 10, b: 42 },
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      font: { family: 'Plus Jakarta Sans, sans-serif', color: muted, size: 12 },
      xaxis: { ...axis, ...xaxis }, yaxis: { ...axis, ...yaxis }, legend: { orientation: 'h', y: -0.2 },
      colorway: palette, ...layout,
    }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['select2d', 'lasso2d'] })
    const resize = new ResizeObserver(() => { if (element._fullLayout) Plotly.Plots.resize(element).catch(() => {}) })
    resize.observe(element)
    return () => { resize.disconnect(); Plotly.purge(element) }
  }, [data, dark, extra])
  return <section className="panel chart-panel">
    <div className="panel-heading"><h2>{title}</h2><p>{hint}</p></div>
    {data.length ? <div className="chart" ref={chart} aria-label={title} /> : <div className="chart-empty">No data available</div>}
  </section>
}

function timeSeries(rows) {
  const dated = rows.filter(row => row.timestamp)
  if (!dated.length) return []
  const hour = 3600000
  const times = dated.map(row => Date.parse(row.timestamp))
  const start = Math.min(...times)
  const span = Math.max(...times) - start
  const size = span <= 2 * hour ? 300000 : span <= 72 * hour ? hour : span <= 60 * 24 * hour ? 24 * hour : 7 * 24 * hour
  const groups = new Map()
  dated.forEach((row, index) => {
    const key = Math.floor(times[index] / size) * size
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  })
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([time, items]) => [new Date(time).toISOString(), items])
}

function trace(data, name, value, color, type = 'scatter') {
  return { x: data.map(([time]) => time), y: data.map(([, items]) => value(items)), name, type,
    mode: 'lines+markers', line: { color, width: 2.5 }, marker: { color }, connectgaps: false }
}

export function Charts({ rows, incidents, dark }) {
  const charts = useMemo(() => {
    const incidentSeries = timeSeries(incidents)
    const logSeries = timeSeries(rows)
    const severity = counts(incidents, row => row.severity)
    const categories = counts(incidents, row => row.category)
    const serviceTimes = Object.create(null)
    rows.filter(row => row.latency != null).forEach(row => (serviceTimes[row.service] ??= []).push(row.latency))
    const services = Object.entries(serviceTimes).map(([service, values]) => [service, average(values)])
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
    const bar = entries => entries.length ? [{ type: 'bar', orientation: 'h',
      x: entries.map(([, value]) => value), y: entries.map(([label]) => label), marker: { color: palette[0] } }] : []
    return {
      trend: incidentSeries.length ? [{ ...trace(incidentSeries, 'Incidents', items => items.length, palette[0]), fill: 'tozeroy', fillcolor: '#d393aa25' }] : [],
      severity: severity.length ? [{ type: 'pie', hole: .69, sort: false, labels: severity.map(([label]) => label),
        values: severity.map(([, value]) => value), textinfo: 'none',
        marker: { colors: severity.map(([name]) => ({ Critical: '#e87892', High: '#e5a378', Medium: '#b58acd', Low: '#83bcb1' })[name]) } }] : [],
      categories: bar(categories), services: bar(services),
      errors: logSeries.length && rows.some(row => 'failure' in row) ?
        [trace(logSeries, 'Errors', items => items.filter(row => row.failure).length, palette[3], 'bar')] : [],
      metrics: logSeries.length && rows.some(row => row.cpu != null || row.memory != null) ?
        ['cpu', 'memory'].filter(key => rows.some(row => row[key] != null)).map((key, index) =>
          trace(logSeries, key === 'cpu' ? 'CPU' : 'Memory', items => average(items.map(row => row[key]).filter(value => value != null)), palette[index])) : [],
    }
  }, [rows, incidents])
  return <>
    <div className="chart-grid first-charts">
      <Chart title="Incident activity" hint="Detected incidents over time · UTC" data={charts.trend} dark={dark} extra={timeLayout} />
      <Chart title="Severity distribution" hint="Breakdown of detected incidents" data={charts.severity} dark={dark} extra={severityLayout} />
    </div>
    <div className="chart-grid">
      <Chart title="Incident categories" hint="Count by classification" data={charts.categories} dark={dark} extra={barLayout} />
      <Chart title="Service performance" hint="Mean response time by service · ms" data={charts.services} dark={dark} extra={barLayout} />
      <Chart title="Error frequency" hint="Failure events over time · UTC" data={charts.errors} dark={dark} extra={timeLayout} />
      <Chart title="Resource utilization" hint="Mean CPU and memory usage · %" data={charts.metrics} dark={dark} extra={timeLayout} />
    </div>
  </>
}
