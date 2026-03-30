import React, { startTransition, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { defineCatalog, type Spec } from '@json-render/core'
import { JSONUIProvider, Renderer, defineRegistry } from '@json-render/react'
import { schema } from '@json-render/react/schema'
import { z } from 'zod'

interface CommunitySnapshot {
  community: {
    name?: string
    type?: string
    location?: string
    botUrl?: string
  }
  members?: Array<{
    id?: string
    name?: string
    status?: string
    joinedAt?: string
  }>
  upcomingEvents?: Array<{
    id?: string
    title?: string
    date?: string
    location?: string
  }>
  ideas?: Array<{
    id?: string
    title?: string
    description?: string
    rationale?: string
    format?: string
    upvotes?: number
    downvotes?: number
  }>
}

type ShowcaseKind = 'showcase' | 'ideas' | 'members' | 'events' | 'signals'

interface ShowcaseItem {
  id: string
  title: string
  description: string
  label?: string
  meta?: string
  href?: string
  ideaId?: string
  upvotes?: number
  downvotes?: number
}

interface CommunityShowcasePlan {
  mode: 'ai' | 'fallback'
  generatedAt: string
  rationale: string
  hero: {
    eyebrow: string
    title: string
    subtitle: string
    note: string
  }
  stats: Array<{
    id: string
    label: string
    value: string
  }>
  sections: Array<{
    id: string
    kicker: string
    title: string
    note: string
    kind: ShowcaseKind
    items: ShowcaseItem[]
  }>
}

interface EmbeddedShowcaseDemo {
  snapshot: CommunitySnapshot
  plan: CommunityShowcasePlan
}

declare global {
  interface Window {
    COMUNIA_SHOWCASE_DEMO?: EmbeddedShowcaseDemo
  }
}

const PASSCODE_KEY = 'comunia_public_code'
const VOTER_KEY = 'comunia_public_voter_id'

const showcaseItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  label: z.string().optional(),
  meta: z.string().optional(),
  href: z.string().optional(),
  ideaId: z.string().optional(),
  upvotes: z.number().optional(),
  downvotes: z.number().optional(),
})

const portalRuntime = {
  voteIdea: async (_ideaId: string, _value: number) => {},
}

const catalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        direction: z.enum(['vertical', 'horizontal']).optional(),
        gap: z.number().optional(),
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'A flexible stack layout for arranging child elements.',
    },
    Grid: {
      props: z.object({
        variant: z.enum(['stats']).optional(),
        className: z.string().optional(),
      }),
      slots: ['default'],
      description: 'A responsive grid layout.',
    },
    HeroCard: {
      props: z.object({
        eyebrow: z.string(),
        title: z.string(),
        subtitle: z.string(),
        note: z.string(),
      }),
      slots: [],
      description: 'A large editorial hero card.',
    },
    RationaleCard: {
      props: z.object({
        label: z.string(),
        content: z.string(),
      }),
      slots: [],
      description: 'A compact explanation of the generated direction.',
    },
    StatChip: {
      props: z.object({
        label: z.string(),
        value: z.string(),
      }),
      slots: [],
      description: 'A compact metric chip.',
    },
    Button: {
      props: z.object({
        label: z.string(),
        tone: z.enum(['primary', 'secondary']).optional(),
      }),
      slots: [],
      description: "A button that emits a 'press' event.",
    },
    LinkButton: {
      props: z.object({
        label: z.string(),
        href: z.string(),
      }),
      slots: [],
      description: 'A styled anchor button.',
    },
    ShowcaseSection: {
      props: z.object({
        kicker: z.string(),
        title: z.string(),
        note: z.string(),
        kind: z.enum(['showcase', 'ideas', 'members', 'events', 'signals']),
        items: z.array(showcaseItemSchema),
      }),
      slots: [],
      description: 'A generated editorial section for the community homepage.',
    },
    EmptyState: {
      props: z.object({
        title: z.string(),
        detail: z.string(),
      }),
      slots: [],
      description: 'Fallback message when data is unavailable.',
    },
  },
  actions: {
    refreshPortal: {
      params: z.object({}),
      description: 'Reload the latest community snapshot.',
    },
    regenerateShowcase: {
      params: z.object({}),
      description: 'Force a fresh AI showcase generation.',
    },
    logoutPortal: {
      params: z.object({}),
      description: 'Forget the local passcode and lock the portal.',
    },
  },
})

const { registry } = defineRegistry(catalog, {
  components: {
    Stack: ({ props, children }) => (
      <div
        className={['jr-stack', props.className || ''].filter(Boolean).join(' ')}
        style={{
          display: 'flex',
          flexDirection: props.direction === 'horizontal' ? 'row' : 'column',
          gap: `${props.gap ?? 16}px`,
        }}
      >
        {children}
      </div>
    ),
    Grid: ({ props, children }) => (
      <div className={['jr-grid', `jr-grid--${props.variant || 'stats'}`, props.className || ''].filter(Boolean).join(' ')}>
        {children}
      </div>
    ),
    HeroCard: ({ props }) => (
      <section className="jr-hero-card">
        <div className="jr-hero-copy">
          <p className="jr-eyebrow">{props.eyebrow}</p>
          <h1>{props.title}</h1>
          <p className="jr-subtitle">{props.subtitle}</p>
          <p className="jr-note">{props.note}</p>
        </div>
      </section>
    ),
    RationaleCard: ({ props }) => (
      <section className="jr-rationale-card">
        <p className="jr-eyebrow">{props.label}</p>
        <p>{props.content}</p>
      </section>
    ),
    StatChip: ({ props }) => (
      <article className="jr-stat-chip">
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </article>
    ),
    Button: ({ props, emit }) => (
      <button className={['jr-button', `jr-button--${props.tone || 'secondary'}`].join(' ')} onClick={() => emit('press')}>
        {props.label}
      </button>
    ),
    LinkButton: ({ props }) => (
      <a className="jr-button jr-button--ghost" href={props.href} target="_blank" rel="noreferrer">
        {props.label}
      </a>
    ),
    ShowcaseSection: ({ props }) => (
      <section className="jr-section-card jr-showcase-section">
        <div className="jr-section-heading">
          <div>
            <p className="jr-eyebrow">{props.kicker}</p>
            <h2>{props.title}</h2>
          </div>
          <p className="jr-section-note">{props.note}</p>
        </div>
        <div className="jr-showcase-list">
          {props.items.map((item) => renderItem(props.kind, item))}
        </div>
      </section>
    ),
    EmptyState: ({ props }) => (
      <div className="jr-empty-state">
        <strong>{props.title}</strong>
        <p>{props.detail}</p>
      </div>
    ),
  },
})

function renderItem(kind: ShowcaseKind, item: ShowcaseItem) {
  if (kind === 'ideas') {
    return (
      <article key={item.id} className="jr-idea-card jr-showcase-item">
        <div className="jr-idea-topline">
          <p className="jr-card-label">{item.label || 'Idea'}</p>
          <span className="jr-format-pill">{item.meta || 'community idea'}</span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <div className="jr-idea-footer">
          <div className="jr-vote-count">
            <strong>{item.upvotes || 0}</strong>
            <span>up</span>
            <strong>{item.downvotes || 0}</strong>
            <span>down</span>
          </div>
          <div className="jr-actions">
            <button className="jr-button jr-button--primary" onClick={() => void portalRuntime.voteIdea(item.ideaId || item.id, 1)}>Upvote</button>
            <button className="jr-button jr-button--secondary" onClick={() => void portalRuntime.voteIdea(item.ideaId || item.id, -1)}>Downvote</button>
          </div>
        </div>
      </article>
    )
  }

  const content = (
    <article key={item.id} className="jr-showcase-item">
      {item.label ? <p className="jr-card-label">{item.label}</p> : null}
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      {item.meta ? <p className="jr-item-meta">{item.meta}</p> : null}
      {item.href ? <span className="jr-link-mark">Open link</span> : null}
    </article>
  )

  if (item.href) {
    return (
      <a key={item.id} className="jr-showcase-link" href={item.href} target="_blank" rel="noreferrer">
        {content}
      </a>
    )
  }

  return content
}

function getPasscode() {
  return window.localStorage.getItem(PASSCODE_KEY)
}

function setPasscode(value: string) {
  window.localStorage.setItem(PASSCODE_KEY, value)
}

function clearPasscode() {
  window.localStorage.removeItem(PASSCODE_KEY)
}

function getVoterId() {
  const existing = window.localStorage.getItem(VOTER_KEY)
  if (existing) return existing
  const created = `browser_${Math.random().toString(36).slice(2, 12)}`
  window.localStorage.setItem(VOTER_KEY, created)
  return created
}

function api(path: string, opts: RequestInit = {}, passcodeOverride?: string) {
  return window.fetch(`/community-api${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      'x-community-code': passcodeOverride || getPasscode() || '',
    },
  })
}

function formatDate(value?: string) {
  if (!value) return 'Date TBD'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatJoinedAt(value?: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function buildSpec(snapshot: CommunitySnapshot, plan: CommunityShowcasePlan, options: { demo?: boolean } = {}): Spec {
  const elements: Spec['elements'] = {
    root: {
      type: 'Stack',
      props: { gap: 18, className: 'jr-page' },
      children: ['hero-card', 'rationale-card', 'stats-grid', 'action-row', 'sections-list'],
    },
    'hero-card': {
      type: 'HeroCard',
      props: plan.hero,
    },
    'rationale-card': {
      type: 'RationaleCard',
      props: {
        label: plan.mode === 'ai' ? 'Why this showcase' : 'Fallback direction',
        content: plan.rationale,
      },
    },
    'stats-grid': {
      type: 'Grid',
      props: { variant: 'stats' },
      repeat: { statePath: '/stats', key: 'id' },
      children: ['stat-chip'],
    },
    'stat-chip': {
      type: 'StatChip',
      props: {
        label: { $item: 'label' },
        value: { $item: 'value' },
      },
    },
    'action-row': {
      type: 'Stack',
      props: { direction: 'horizontal', gap: 12, className: 'jr-actions' },
      children: ['refresh-button', 'regenerate-button', 'lock-button'],
    },
    'refresh-button': {
      type: 'Button',
      props: { label: 'Refresh data', tone: 'secondary' },
      on: { press: { action: 'refreshPortal' } },
    },
    'regenerate-button': {
      type: 'Button',
      props: { label: 'Regenerate showcase', tone: 'primary' },
      on: { press: { action: 'regenerateShowcase' } },
    },
    'lock-button': {
      type: 'Button',
      props: { label: 'Lock portal', tone: 'secondary' },
      on: { press: { action: 'logoutPortal' } },
    },
    'sections-list': {
      type: 'Stack',
      props: { gap: 16 },
      repeat: { statePath: '/sections', key: 'id' },
      children: ['section-template'],
    },
    'section-template': {
      type: 'ShowcaseSection',
      props: {
        kicker: { $item: 'kicker' },
        title: { $item: 'title' },
        note: { $item: 'note' },
        kind: { $item: 'kind' },
        items: { $item: 'items' },
      },
    },
  }

  if (options.demo) {
    elements.root.children = ['hero-card', 'rationale-card', 'stats-grid', 'sections-list']
  }

  if (snapshot.community?.botUrl) {
    elements['action-row'].children = ['refresh-button', 'regenerate-button', 'bot-link', 'lock-button']
    elements['bot-link'] = {
      type: 'LinkButton',
      props: {
        label: 'Talk to the bot',
        href: snapshot.community.botUrl,
      },
    }
  }

  return {
    root: 'root',
    state: {
      stats: plan.stats,
      sections: plan.sections,
    },
    elements,
  }
}

function buildLocalFallback(snapshot: CommunitySnapshot): CommunityShowcasePlan {
  const events = (snapshot.upcomingEvents || []).slice(0, 3).map((event, index) => ({
    id: event.id || `event-${index}`,
    title: event.title || 'Untitled event',
    description: event.location || 'Location TBD',
    label: 'Upcoming event',
    meta: formatDate(event.date),
  }))
  const members = (snapshot.members || []).slice(0, 4).map((member, index) => ({
    id: member.id || `member-${index}`,
    title: member.name || 'Anonymous member',
    description: `Status: ${member.status || 'active'}`,
    label: 'Member',
    meta: formatJoinedAt(member.joinedAt) ? `Joined ${formatJoinedAt(member.joinedAt)}` : 'Active now',
  }))
  const ideas = (snapshot.ideas || []).slice(0, 4).map((idea, index) => ({
    id: idea.id || `idea-${index}`,
    title: idea.title || 'Untitled idea',
    description: idea.description || 'Potential next move for the group.',
    label: idea.format || 'idea',
    meta: idea.rationale || 'Community signal',
    ideaId: idea.id || `idea-${index}`,
    upvotes: Number(idea.upvotes || 0),
    downvotes: Number(idea.downvotes || 0),
  }))

  return {
    mode: 'fallback',
    generatedAt: new Date().toISOString(),
    rationale: 'The generated endpoint was unavailable, so the page fell back to a direct reading of the current snapshot.',
    hero: {
      eyebrow: 'snapshot fallback',
      title: snapshot.community?.name || 'Comunia',
      subtitle: [snapshot.community?.type, snapshot.community?.location].filter(Boolean).join(' · '),
      note: 'This fallback still uses json-render, but without an AI-curated editorial angle.',
    },
    stats: [
      { id: 'members', label: 'Visible members', value: String(snapshot.members?.length || 0) },
      { id: 'events', label: 'Upcoming moments', value: String(snapshot.upcomingEvents?.length || 0) },
      { id: 'ideas', label: 'Ideas on deck', value: String(snapshot.ideas?.length || 0) },
    ],
    sections: [
      ...(ideas.length ? [{
        id: 'ideas',
        kicker: 'Agent stream',
        title: 'Potential ideas for the group',
        note: 'The same vote endpoint remains active.',
        kind: 'ideas' as ShowcaseKind,
        items: ideas,
      }] : []),
      ...(members.length ? [{
        id: 'members',
        kicker: 'People',
        title: 'Visible builders',
        note: 'A lightweight roster for who is currently active.',
        kind: 'members' as ShowcaseKind,
        items: members,
      }] : []),
      ...(events.length ? [{
        id: 'events',
        kicker: 'Upcoming',
        title: 'Next events',
        note: 'What is currently on the calendar.',
        kind: 'events' as ShowcaseKind,
        items: events,
      }] : []),
    ],
  }
}

function hydratePlan(plan: CommunityShowcasePlan, snapshot: CommunitySnapshot): CommunityShowcasePlan {
  const ideasById = new Map((snapshot.ideas || []).map((idea) => [idea.id || '', idea]))

  return {
    ...plan,
    sections: plan.sections.map((section) => {
      if (section.kind !== 'ideas') return section
      return {
        ...section,
        items: section.items.map((item) => {
          const latest = ideasById.get(item.ideaId || item.id)
          if (!latest) return item
          return {
            ...item,
            upvotes: Number(latest.upvotes || 0),
            downvotes: Number(latest.downvotes || 0),
          }
        }),
      }
    }),
  }
}

function LoginCard({ onUnlock, busy, error }: { onUnlock: (value: string) => Promise<void>, busy: boolean, error: string }) {
  const [passcode, setValue] = useState('')

  return (
    <div className="jr-login-shell">
      <div className="jr-login-card">
        <p className="jr-eyebrow">Generated community portal</p>
        <h1>Enter the passcode</h1>
        <p>This version asks the backend to choose what the group should see first, then renders that plan through `json-render`.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void onUnlock(passcode.trim())
          }}
        >
          <input
            type="password"
            value={passcode}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Community passcode"
            required
          />
          <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Unlock'}</button>
        </form>
        {error ? <p className="jr-error">{error}</p> : null}
      </div>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="jr-login-shell">
      <div className="jr-login-card jr-loading-card">
        <p className="jr-eyebrow">Loading</p>
        <h1>{label}</h1>
        <p>Pulling the community snapshot and asking Comunia what deserves the lead story.</p>
      </div>
    </div>
  )
}

function PortalApp() {
  const [snapshot, setSnapshot] = useState<CommunitySnapshot | null>(null)
  const [plan, setPlan] = useState<CommunityShowcasePlan | null>(null)
  const [passcode, setPasscodeState] = useState(() => getPasscode())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const loadPortal = async (options: { passcodeOverride?: string; refreshPlan?: boolean } = {}) => {
    setBusy(true)
    setError('')
    try {
      const snapshotResponse = await api('/bootstrap', {}, options.passcodeOverride)
      if (snapshotResponse.status === 401) {
        clearPasscode()
        setPasscodeState('')
        setSnapshot(null)
        setPlan(null)
        throw new Error('Wrong passcode. Try again.')
      }
      if (!snapshotResponse.ok) {
        throw new Error('Could not load the community snapshot.')
      }

      const snapshotData = await snapshotResponse.json()
      const planResponse = await api(`/showcase-plan${options.refreshPlan ? '?refresh=1' : ''}`, {}, options.passcodeOverride)
      const rawPlan = planResponse.ok
        ? await planResponse.json()
        : buildLocalFallback(snapshotData)

      const hydrated = hydratePlan(rawPlan, snapshotData)

      startTransition(() => {
        setSnapshot(snapshotData)
        setPlan(hydrated)
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unknown error.')
      throw reason
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!passcode) return
    void loadPortal({ passcodeOverride: passcode }).catch(() => {})
  }, [passcode])

  const handlers = useMemo(() => ({
    refreshPortal: async () => {
      await loadPortal()
    },
    regenerateShowcase: async () => {
      await loadPortal({ refreshPlan: true })
    },
    logoutPortal: async () => {
      clearPasscode()
      setPasscodeState('')
      startTransition(() => {
        setSnapshot(null)
        setPlan(null)
      })
    },
  }), [passcode])

  portalRuntime.voteIdea = async (ideaId: string, value: number) => {
    const response = await api(`/ideas/${encodeURIComponent(ideaId)}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voterId: getVoterId(),
        value,
      }),
    })

    if (!response.ok) {
      throw new Error('Vote failed.')
    }

    await loadPortal()
  }

  if (!passcode) {
    return (
      <LoginCard
        busy={busy}
        error={error}
        onUnlock={async (value) => {
          setBusy(true)
          setError('')
          try {
            const response = await window.fetch('/community-api/unlock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ passcode: value }),
            })
            if (!response.ok) throw new Error('Wrong passcode. Try again.')
            setPasscode(value)
            setPasscodeState(value)
            await loadPortal({ passcodeOverride: value })
          } catch (reason) {
            clearPasscode()
            setPasscodeState('')
            setError(reason instanceof Error ? reason.message : 'Unknown error.')
          } finally {
            setBusy(false)
          }
        }}
      />
    )
  }

  if (!snapshot || !plan) {
    return <LoadingState label="Generating the group front page" />
  }

  const spec = buildSpec(snapshot, plan)

  return (
    <JSONUIProvider key={plan.generatedAt} registry={registry} initialState={spec.state || {}} handlers={handlers}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  )
}

function DemoPortalApp({ demo }: { demo: EmbeddedShowcaseDemo }) {
  portalRuntime.voteIdea = async () => {}
  const plan = hydratePlan(demo.plan, demo.snapshot)
  const spec = buildSpec(demo.snapshot, plan, { demo: true })

  return (
    <JSONUIProvider registry={registry} initialState={spec.state || {}} handlers={{}}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  )
}

const root = document.getElementById('community-json-root')
if (root) {
  const demo = window.COMUNIA_SHOWCASE_DEMO
  createRoot(root).render(demo ? <DemoPortalApp demo={demo} /> : <PortalApp />)
}
