import React, { useEffect, useMemo, useRef, useState } from 'react'

/* ------------------------------ config ------------------------------ */
const CATS = [
  { id: 'all', label: 'All', emoji: '✨', re: null },
  { id: 'museum', label: 'Museums', emoji: '🏛️', re: /museum|galler/ },
  { id: 'temple', label: 'Temples', emoji: '🛕', re: /temple|shrine|mosque|church|cathedral|gurdwara|monaster/ },
  { id: 'fort', label: 'Forts', emoji: '🏰', re: /\bforts?\b|castle|palace/ },
  { id: 'monument', label: 'Monuments', emoji: '🗿', re: /monument|memorial|statue/ },
  { id: 'viewpoint', label: 'Viewpoints', emoji: '🌄', re: /viewpoint|view point|lookout/ },
  { id: 'park', label: 'Parks', emoji: '🌳', re: /\bparks?\b|garden/ },
  { id: 'historic', label: 'Historic', emoji: '📜', re: /histor|heritage|ruins|archaeolog/ }
]


function typeOf(p) {
  const s = `${(p.categories || []).join(' ')} ${p.kind}`.toLowerCase()
  if (/zoo|aquarium|theme_park|amusement|playground/.test(s)) return 'fun'
  if (/museum|galler/.test(s)) return 'museum'
  if (/worship|temple|church|mosque|shrine/.test(s)) return 'temple'
  if (/fort|castle|palace/.test(s)) return 'fort'
  if (/viewpoint|tower/.test(s)) return 'viewpoint'
  if (/park|garden|natural|beach/.test(s)) return 'park'
  if (/monument|memorial|archaeolog|ruins|historic|heritage/.test(s)) return 'monument'
  return 'other'
}

// re-rank for an audience; nothing is removed
function rankFor(places, aud, radius) {
  if (aud.id === 'any') return places
  return places
    .map(p => {
      const t = typeOf(p)
      const fit = aud.w[t] ?? 1
      const bonus = aud.wheel && p.wheelchair === true ? 1 : 0
      return { ...p, fit, why: aud.why?.[t], aScore: p.score + fit - aud.pen * (p.distanceM / radius) + bonus }
    })
    .sort((a, b) => b.aScore - a.aScore)
}
const detectCategory = (q = '') => {
  const s = q.toLowerCase()
  return CATS.find(c => c.re && c.re.test(s))?.id || 'all'
}

/* ------------------------------ helpers ------------------------------ */
const rad = d => (d * Math.PI) / 180
function hav(a, b) {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}
const fmtDist = m => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`)

// searchData can be an array or a single object, and the entity can be nested or top-level
function normalise(raw) {
  const sd = Array.isArray(raw) ? raw[0] : raw
  if (!sd) return null
  const ents = Array.isArray(sd.entities) ? sd.entities : [sd]
  const ent = ents.find(e => e?.entityInfo?.geo?.lat != null)
  const coords = sd.userLocation?.position?.coords
  const base = {
    query: sd.query || '',
    user: coords ? { lat: coords.latitude, lon: coords.longitude } : null,
    loc: null
  }
  if (!ent) return base
  const g = ent.entityInfo.geo
  base.loc = {
    lat: Number(g.lat),
    lon: Number(g.long),
    name: g.city || ent.word || 'this place',
    region: [g.state, g.country].filter(Boolean).join(', '),
    wide: !g.city // country / state level, so search a bigger area
  }
  return base
}

function weatherInfo(code) {
  if (code === 0) return ['☀️', 'Clear']
  if (code <= 3) return ['⛅', 'Partly cloudy']
  if (code <= 48) return ['🌫️', 'Foggy']
  if (code <= 57) return ['🌦️', 'Drizzle']
  if (code <= 67) return ['🌧️', 'Rain']
  if (code <= 77) return ['❄️', 'Snow']
  if (code <= 82) return ['🌧️', 'Showers']
  if (code <= 86) return ['🌨️', 'Snow showers']
  return ['⛈️', 'Thunderstorm']
}

function verdict(d) {
  if (!d) return ''
  if (d.code >= 95) return 'Storms expected. Stick to indoor spots.'
  if (d.rain >= 50 || (d.code >= 51 && d.code <= 86)) return 'Carry an umbrella, or favour museums.'
  if (d.max >= 38) return 'Very hot. Go early, keep midday for indoor places.'
  if (d.max <= 2) return 'Freezing. Dress warm.'
  return 'Good day to be outside.'
}

// greedy nearest-neighbour route starting from the city centre, split into 3 parts of the day
function buildPlan(places, center, limit = 9) {
  const left = places.slice(0, limit)
  const ordered = []
  let cur = center
  while (left.length) {
    let bi = 0
    let bd = Infinity
    left.forEach((p, i) => {
      const d = hav(cur, p)
      if (d < bd) { bd = d; bi = i }
    })
    const [next] = left.splice(bi, 1)
    ordered.push({ ...next, hop: bd })
    cur = next
  }
  const names = ['Morning', 'Afternoon', 'Evening']
  const size = Math.max(1, Math.ceil(ordered.length / 3))
  const slots = []
  for (let i = 0; i < ordered.length; i += size) {
    slots.push({ label: names[slots.length], items: ordered.slice(i, i + size) })
  }
  return { ordered, slots }
}

// Wikipedia summary (descriptions), cached for the session
const wikiCache = new Map()
async function getSummary(p) {
  if (wikiCache.has(p.id)) return wikiCache.get(p.id)
  let lang = 'en'
  let title = p.name
  const tagged = p.wiki && p.wiki.includes(':')
  if (tagged) {
    const [l, ...rest] = p.wiki.split(':')
    lang = l
    title = rest.join(':')
  }
  let result = null
  try {
    const r = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
    )
    if (r.ok) {
      const j = await r.json()
      // name-based guesses must be real articles, not disambiguation pages
      if (j.extract && (tagged || j.type === 'standard')) {
        const text = j.extract.length > 320 ? j.extract.slice(0, 320).replace(/\s+\S*$/, '') + '…' : j.extract
        result = { text, thumb: j.thumbnail?.source, url: j.content_urls?.desktop?.page }
      }
    }
  } catch { /* description is optional */ }
  wikiCache.set(p.id, result)
  return result
}

/* ------------------------------ small map (SVG, no tiles) ------------------------------ */
function MiniMap({ center, places, selectedId, onSelect, route }) {
  const W = 300
  const pad = 26
  const cos = Math.cos(rad(center.lat))
  const pts = places.map(p => ({ p, x: (p.lon - center.lon) * cos, y: -(p.lat - center.lat) }))
  const maxR = Math.max(1e-9, ...pts.map(q => Math.hypot(q.x, q.y)))
  const maxM = Math.max(1, ...places.map(p => p.distanceM))
  const s = (W / 2 - pad) / maxR
  const X = q => W / 2 + q.x * s
  const Y = q => W / 2 + q.y * s
  const byId = Object.fromEntries(pts.map(q => [q.p.id, q]))
  const routePts = (route || []).map(p => byId[p.id]).filter(Boolean)

  return (
    <svg viewBox={`0 0 ${W} ${W}`} className="te-map" role="img" aria-label="Map of places around the centre">
      {[0.5, 1].map(f => (
        <g key={f}>
          <circle cx={W / 2} cy={W / 2} r={(W / 2 - pad) * f} className="te-ring" />
          <text x={W / 2 + 4} y={W / 2 - (W / 2 - pad) * f - 3} className="te-ringlabel">{fmtDist(maxM * f)}</text>
        </g>
      ))}
      {routePts.length > 1 && (
        <polyline
          points={[[W / 2, W / 2], ...routePts.map(q => [X(q), Y(q)])].map(a => a.join(',')).join(' ')}
          className="te-route"
        />
      )}
      <circle cx={W / 2} cy={W / 2} r="6" className="te-centre" />
      {pts.map((q, i) => {
        const sel = q.p.id === selectedId
        const label = route ? route.findIndex(r => r.id === q.p.id) + 1 || '' : i + 1
        return (
          <g key={q.p.id} onClick={() => onSelect(q.p.id)} className="te-pin" tabIndex={0}
             onKeyDown={e => e.key === 'Enter' && onSelect(q.p.id)}>
            <circle cx={X(q)} cy={Y(q)} r={sel ? 12 : 9} className={sel ? 'te-dot te-dot-sel' : 'te-dot'} />
            <text x={X(q)} y={Y(q) + 3.5} textAnchor="middle" className="te-dotnum">{label}</text>
            <title>{q.p.name}</title>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------ place card ------------------------------ */
function PlaceCard({ p, rank, selected, onSelect, userDist }) {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState(undefined)

  useEffect(() => {
    if (!open || info !== undefined) return
    let live = true
    getSummary(p).then(r => live && setInfo(r))
    return () => { live = false }
  }, [open])

  const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`
  return (
    <li className={`te-card ${selected ? 'te-card-sel' : ''}`} onClick={() => onSelect?.(p.id)}>
      <button className="te-cardhead" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="te-rank">{rank}</span>
        <span className="te-cardmain">
          <span className="te-name">{p.name}</span>
          <span className="te-meta">
            {p.kind} · {fmtDist(p.distanceM)} from centre
            {userDist != null && ` · ${fmtDist(userDist)} from you`}
          </span>
        </span>
        {p.wiki && <span className="te-badge" title="Has a Wikipedia article">Notable</span>}
        <span className="te-chev">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="te-body">
          {info === undefined && <p className="te-muted">Loading description…</p>}
          {info && (
            <div className="te-desc">
              {info.thumb && <img src={info.thumb} alt="" loading="lazy" />}
              <p>
                {info.text}{' '}
                {info.url && <a href={info.url} target="_blank" rel="noreferrer">Wikipedia</a>}
              </p>
            </div>
          )}
          {info === null && <p className="te-muted">No description available for this place.</p>}
          {p.address && <p className="te-addr">📍 {p.address}</p>}
          {p.openingHours && <p className="te-addr">🕒 {p.openingHours}</p>}
          {p.why && <p className="te-addr">👍 {p.why}</p>}
{p.wheelchair === true && <p className="te-addr">♿ Wheelchair accessible</p>}
{p.wheelchair === false && <p className="te-addr">⚠️ Limited wheelchair access</p>}
          <div className="te-actions">
            <a href={dirUrl} target="_blank" rel="noreferrer">Directions</a>
            {p.website && <a href={p.website} target="_blank" rel="noreferrer">Website</a>}
          </div>
        </div>
      )}
    </li>
  )
}

/* ------------------------------ main component ------------------------------ */
function NewComponent(props) {
  const API_URL =
    process.env.NODE_ENV === 'production'
      ? props.deployedBackendURL || ''
      : import.meta.env.VITE_API_URL

  const sd = useMemo(() => normalise(props.searchData), [props.searchData])
  const loc = sd?.loc

  const [cat, setCat] = useState(() => detectCategory(sd?.query))
  const [radius, setRadius] = useState(loc?.wide ? 25000 : 8000)
  const [view, setView] = useState('list')
  const [selected, setSelected] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ status: 'loading', places: [] })
  const [weather, setWeather] = useState(null)
  const [day, setDay] = useState(0)
  const [compact, setCompact] = useState(props.suggestedPlace === 'sidebar')
  const rootRef = useRef(null)

// kids/family also need zoos and playgrounds, which the "all" query doesn't include

  // new query -> reset category/radius
  useEffect(() => {
    setCat(detectCategory(sd?.query))
    setRadius(loc?.wide ? 25000 : 8000)
    setSelected(null)
    setView('list')
  }, [sd?.query, loc?.lat, loc?.lon])

  // sidebar-friendly: react to the real width, not just a prop
  useEffect(() => {
    if (!rootRef.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setCompact(e.contentRect.width < 460))
    ro.observe(rootRef.current)
    return () => ro.disconnect()
  }, [])

  // places
  useEffect(() => {
    if (!loc) return
    const ac = new AbortController()
    setState(s => ({ ...s, status: 'loading' }))
    fetch(`${API_URL}/api/places?lat=${loc.lat}&lon=${loc.lon}&category=${cat}&radius=${radius}`, { signal: ac.signal })
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`)
        return j
      })
      .then(j => setState({ status: j.places.length ? 'ok' : 'empty', places: j.places }))
      .catch(e => {
        if (e.name !== 'AbortError') setState({ status: 'error', places: [], message: e.message })
      })
    return () => ac.abort()
  }, [loc?.lat, loc?.lon, cat, radius, attempt])

  // weather (fails silently, it's a bonus)
  useEffect(() => {
    if (!loc) return
    const ac = new AbortController()
    setWeather(null)
    fetch(`${API_URL}/api/weather?lat=${loc.lat}&lon=${loc.lon}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(j => j && setWeather(j.days))
      .catch(() => {})
    return () => ac.abort()
  }, [loc?.lat, loc?.lon])

  const { places, status } = state
  const ranked = places
  const plan = useMemo(
    () => (loc && ranked.length ? buildPlan(ranked, loc, 9) : null),
    [ranked, loc]
  )
  // "from you" only makes sense if the user is actually near the place
  const userNear = sd?.user && loc && hav(sd.user, loc) < 100000

  const catMeta = CATS.find(c => c.id === cat)
  const selPlace = places.find(p => p.id === selected)

  if (!loc) {
    return (
      <div className="te" ref={rootRef}>
        <style>{css}</style>
        <p className="te-empty">I couldn't work out which place you meant. Try “things to do in Paris”.</p>
      </div>
    )
  }

  const today = weather?.[day]
  const dayName = i => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(weather[i].date).toLocaleDateString(undefined, { weekday: 'short' }))

  return (
    <div className="te" ref={rootRef} data-compact={compact}>
      <style>{css}</style>

      <header className="te-head">
        <h2>{cat === 'all' ? 'Worth seeing in' : catMeta.label + ' in'} {loc.name}</h2>
        <p className="te-muted">
          {loc.region}
          {status === 'ok' && ` · ${places.length} places within ${fmtDist(radius)}`}
        </p>
      </header>

      <div className="te-chips" role="tablist" aria-label="Category">
        {CATS.map(c => (
          <button key={c.id} className={`te-chip ${c.id === cat ? 'on' : ''}`} onClick={() => setCat(c.id)}>
            <span aria-hidden>{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>

       
      {weather && (
        <div className="te-weather">
          <div className="te-days">
            {weather.map((d, i) => (
              <button key={d.date} className={`te-day ${i === day ? 'on' : ''}`} onClick={() => setDay(i)}>
                <span>{dayName(i)}</span>
                <span>{weatherInfo(d.code)[0]} {d.max}°/{d.min}°</span>
              </button>
            ))}
          </div>
          <p className="te-verdict">{verdict(today)} {today?.rain != null && <span className="te-muted">({today.rain}% rain)</span>}</p>
        </div>
      )}

      {status === 'ok' && (
        <div className="te-tabs" role="tablist">
          {[['list', 'List'], ['map', 'Map'], ['plan', 'Day plan']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {status === 'loading' && (
        <ul className="te-list" aria-busy="true">
          {[0, 1, 2, 3].map(i => <li key={i} className="te-skel" />)}
        </ul>
      )}

      {status === 'error' && (
        <div className="te-empty">
          <p>Couldn't load places ({state.message}).</p>
          <button className="te-btn" onClick={() => setAttempt(a => a + 1)}>Try again</button>
        </div>
      )}

      {status === 'empty' && (
        <div className="te-empty">
          <p>No {cat === 'all' ? 'sights' : catMeta.label.toLowerCase()} found within {fmtDist(radius)} of {loc.name}.</p>
          <div className="te-actions">
            {radius < 25000 && <button className="te-btn" onClick={() => setRadius(25000)}>Search wider</button>}
            {cat !== 'all' && <button className="te-btn" onClick={() => setCat('all')}>Show all sights</button>}
          </div>
        </div>
      )}

      {status === 'ok' && view === 'list' && (
        <ul className="te-list">
          {places.map((p, i) => (
            <PlaceCard key={p.id} p={p} rank={i + 1} selected={p.id === selected} onSelect={setSelected}
              userDist={userNear ? hav(sd.user, p) : null} />
          ))}
        </ul>
      )}

      {status === 'ok' && view === 'map' && (
        <>
          <MiniMap center={loc} places={places} selectedId={selected} onSelect={setSelected} />
          {selPlace
            ? <ul className="te-list"><PlaceCard p={selPlace} rank={places.indexOf(selPlace) + 1} selected /></ul>
            : <p className="te-muted te-center">Tap a pin to see details. The centre dot is {loc.name}.</p>}
        </>
      )}

      {status === 'ok' && view === 'plan' && plan && (
        <>
          <MiniMap center={loc} places={plan.ordered} selectedId={selected} onSelect={setSelected} route={plan.ordered} />
          {plan.slots.map(slot => (
            <section key={slot.label} className="te-slot">
              <h3>{slot.label}</h3>
              <ul className="te-list">
                {slot.items.map(p => (
                  <div key={p.id}>
                    <p className="te-hop">↳ {fmtDist(p.hop)} {plan.ordered[0] === p ? 'from centre' : 'from previous stop'}</p>
                    <PlaceCard p={p} rank={plan.ordered.indexOf(p) + 1} selected={p.id === selected} onSelect={setSelected} />
                  </div>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <footer className="te-foot">Places: Geoapify / OpenStreetMap · Descriptions: Wikipedia · Weather: Open-Meteo</footer>
    </div>
  )
}

/* ------------------------------ styles (light + dark, mainline + sidebar) ------------------------------ */
const css = `
.te {
  color-scheme: light;
  --bg: #fbf8f2;
  --fg: #1d2433;
  --mut: #667085;
  --card: #ffffff;
  --line: #e8dfd0;
  --acc: #0e7c66;
  --accfg: #ffffff;
  --warn: #b54708;
  --r: 14px;

  font: 14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  color: var(--fg);
  background: var(--bg);
  max-width: 720px;
  margin: 0 auto;
  padding: 12px;
  box-sizing: border-box;
}

.te * {
  box-sizing: border-box;
}
.te h2{margin:0;font-size:20px;line-height:1.2;letter-spacing:-.01em}
.te h3{margin:16px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--acc)}
.te button{font:inherit;color:inherit;cursor:pointer}
.te-muted{color:var(--mut);margin:2px 0;font-size:12.5px}
.te-center{text-align:center}

.te-hero{padding:16px 14px;border-radius:var(--r);margin-bottom:6px;
  background:linear-gradient(135deg,color-mix(in srgb,var(--acc) 20%,var(--card)),var(--card));
  border:1px solid color-mix(in srgb,var(--acc) 25%,var(--line))}
.te-eyebrow{margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--acc);font-weight:700}
.te-sub{margin:6px 0 0;color:var(--mut);font-size:12.5px}

.te-label{margin:10px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);font-weight:600}
.te-chips{display:flex;gap:6px;overflow-x:auto;padding:6px 0;scrollbar-width:none}
.te-chips::-webkit-scrollbar{display:none}
.te-chip{flex:none;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:5px 12px;transition:all .15s}
.te-chip:hover{border-color:var(--acc)}
.te-chip.on{background:var(--acc);color:var(--accfg);border-color:var(--acc);font-weight:600}
.te-chip-aud{background:transparent;border-style:dashed;padding:4px 10px;font-size:13px}
.te-chip-aud.on{border-style:solid}

.te-weather{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:8px;margin:8px 0}
.te-days{display:flex;gap:6px}
.te-day{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;border:1px solid transparent;background:transparent;border-radius:10px;padding:5px 2px;font-size:12px;transition:all .15s}
.te-day.on{background:var(--bg);border-color:var(--acc);box-shadow:0 1px 6px rgba(0,0,0,.08)}
.te-verdict{margin:8px 4px 2px;font-weight:600;font-size:13px}

.te-tabs{display:flex;gap:2px;margin:10px 0;padding:3px;background:var(--card);border:1px solid var(--line);border-radius:999px}
.te-tabs button{flex:1;background:none;border:0;border-radius:999px;padding:6px 10px;transition:all .15s}
.te-tabs button.on{background:var(--acc);color:var(--accfg);font-weight:600}

.te-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.te-card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:var(--r);overflow:hidden;transition:transform .15s,box-shadow .15s,border-color .15s}
.te-card:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.08)}
.te-card-sel{border-color:var(--acc);border-left-color:var(--acc)}
.te-cardhead{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;padding:11px 12px;text-align:left}
.te-rank{flex:none;width:26px;height:26px;border-radius:8px;background:var(--acc);color:var(--accfg);display:grid;place-items:center;font-size:12px;font-weight:700}
.te-cardmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.te-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.te-meta{color:var(--mut);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.te-badge{font-size:10.5px;background:color-mix(in srgb,var(--acc) 16%,transparent);color:var(--acc);border-radius:6px;padding:1px 6px;font-weight:600}
.te[data-compact="true"] .te-badge{display:none}
.te-chev{color:var(--mut);font-size:12px}
.te-body{padding:0 14px 14px;animation:te-in .2s ease}
@keyframes te-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.te-desc{display:flex;gap:10px;align-items:flex-start}
.te-desc img{width:80px;height:80px;object-fit:cover;border-radius:10px;flex:none}
.te[data-compact="true"] .te-desc{flex-direction:column}
.te-desc p,.te-addr{margin:5px 0}
.te-body a{color:var(--acc)}
.te-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.te-actions a{border:1px solid var(--acc);color:var(--acc);border-radius:999px;padding:4px 12px;text-decoration:none;font-size:13px}
.te-actions a:first-child{background:var(--acc);color:var(--accfg)}
.te-btn{border:1px solid var(--acc);background:none;color:var(--acc);border-radius:999px;padding:6px 14px}

.te-empty{text-align:center;padding:28px 10px;background:var(--card);border:1px dashed var(--line);border-radius:var(--r)}
.te-skel{height:56px;border-radius:var(--r);background:linear-gradient(90deg,var(--card),var(--line),var(--card));background-size:200% 100%;animation:te-sh 1.2s infinite}
@keyframes te-sh{to{background-position:-200% 0}}

.te-map{width:100%;max-height:360px;background:var(--card);border:1px solid var(--line);border-radius:var(--r);display:block;margin-bottom:10px}
.te-ring{fill:none;stroke:var(--line);stroke-dasharray:3 4}
.te-ringlabel{fill:var(--mut);font-size:8px}
.te-route{fill:none;stroke:var(--acc);stroke-width:1.5;stroke-dasharray:4 3;opacity:.7}
.te-centre{fill:var(--fg)}
.te-dot{fill:var(--acc);stroke:var(--bg);stroke-width:1.5}
.te-dot-sel{fill:var(--warn)}
.te-dotnum{fill:var(--accfg);font-size:9px;font-weight:700;pointer-events:none}
.te-pin{cursor:pointer;outline:none}
.te-hop{margin:6px 0 4px 8px;font-size:12px;color:var(--mut)}
.te-foot{margin-top:16px;font-size:11px;color:var(--mut);text-align:center}
`


export default NewComponent