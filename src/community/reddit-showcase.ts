import type { RedditLinkSnapshot } from './reddit-link-analysis.js'

export interface SubredditIdeaCard {
  title: string
  summary: string
  targetMembers?: string
  rationale?: string
  buildPrompt?: string
}

export interface SubredditIdeasPayload {
  source: {
    requestedUrl: string
    redditUrl: string
    redditJsonUrl: string
    normalizedPath: string
    fetchedAt: string
  }
  subreddit: {
    name: string | null
    title?: string
    publicDescription?: string
    subscribers?: number
    activeUsers?: number
    over18?: boolean
    icon?: string
  }
  highlights: RedditLinkSnapshot['highlights']
  comunia: {
    signalSummary: string
    ideas: SubredditIdeaCard[]
    note?: string
  }
  redditJson: any
}

export function buildSubredditIdeasPayload(input: {
  snapshot: RedditLinkSnapshot
  analysis: { signalSummary: string; ideas: SubredditIdeaCard[] } | null
  requestedUrl: string
}): SubredditIdeasPayload {
  return {
    source: {
      requestedUrl: input.requestedUrl,
      redditUrl: input.snapshot.redditUrl,
      redditJsonUrl: input.snapshot.redditJsonUrl,
      normalizedPath: input.snapshot.normalizedPath,
      fetchedAt: new Date().toISOString(),
    },
    subreddit: input.snapshot.about ? {
      name: input.snapshot.subreddit,
      title: input.snapshot.about.title || '',
      publicDescription: input.snapshot.about.public_description || '',
      subscribers: Number(input.snapshot.about.subscribers || 0),
      activeUsers: Number(input.snapshot.about.active_user_count || 0),
      over18: input.snapshot.about.over18 === true,
      icon: input.snapshot.about.community_icon || input.snapshot.about.icon_img || '',
    } : {
      name: input.snapshot.subreddit,
    },
    highlights: input.snapshot.highlights,
    comunia: input.analysis ? {
      signalSummary: input.analysis.signalSummary,
      ideas: input.analysis.ideas,
    } : {
      signalSummary: input.snapshot.signalSummary,
      ideas: [],
      note: 'Product idea analysis is unavailable in this runtime.',
    },
    redditJson: input.snapshot.redditJson,
  }
}

export function renderSubredditIdeasPage(payload: SubredditIdeasPayload) {
  const title = payload.subreddit.title || (payload.subreddit.name ? `r/${payload.subreddit.name}` : 'Reddit community')
  const description = payload.subreddit.publicDescription || 'Comunia read this subreddit and translated the strongest signals into product ideas.'
  const pageTitle = `${title} | Comunia`
  const communityName = payload.subreddit.name ? `r/${payload.subreddit.name}` : title

  const ideaCards = payload.comunia.ideas.length
    ? payload.comunia.ideas.map((idea, index) => `
      <article class="idea-feed-card">
        <div class="idea-rank">${index + 1}</div>
        <div class="idea-main">
          <div class="idea-meta-row">
            <span class="idea-subreddit">${escapeHtml(communityName)}</span>
            <span class="idea-separator">•</span>
            <span>potential product idea</span>
          </div>
          <h2>${escapeHtml(idea.title)}</h2>
          <p class="idea-summary">${escapeHtml(idea.summary)}</p>
          ${idea.targetMembers ? `<p class="idea-detail"><strong>Who it helps:</strong> ${escapeHtml(idea.targetMembers)}</p>` : ''}
          ${idea.rationale ? `<p class="idea-detail"><strong>Why it could work:</strong> ${escapeHtml(idea.rationale)}</p>` : ''}
        </div>
        <div class="idea-actions">
          <a class="idea-link" href="${escapeAttribute(payload.source.normalizedPath)}.json">JSON</a>
          <a class="idea-link idea-link--primary" href="${escapeAttribute(payload.source.redditUrl)}" target="_blank" rel="noreferrer">Open subreddit</a>
        </div>
      </article>
    `).join('')
    : `<div class="empty-state">${escapeHtml(payload.comunia.note || 'No product ideas were generated for this request.')}</div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeAttribute(description)}">
  <link rel="stylesheet" href="/subreddit-ideas.css">
</head>
<body>
  <div class="reddit-shell">
    <header class="reddit-topbar">
      <div class="reddit-brand">comunia.chat</div>
      <div class="reddit-top-actions">
        <a href="${escapeAttribute(payload.source.redditUrl)}" target="_blank" rel="noreferrer">Open on Reddit</a>
        <a href="${escapeAttribute(payload.source.normalizedPath)}.json">JSON</a>
      </div>
    </header>

    <main class="reddit-layout">
      <section class="reddit-feed">
        <header class="reddit-feed-header">
          <div class="feed-title-row">
            <div class="feed-avatar">${escapeHtml((payload.subreddit.name || 'r').slice(0, 1).toUpperCase())}</div>
            <div>
              <p class="feed-kicker">${escapeHtml(communityName)}</p>
              <h1>10 potential product ideas this community would enjoy</h1>
            </div>
          </div>
          <p class="feed-description">${escapeHtml(description)}</p>
        </header>
        <div class="idea-feed">${ideaCards}</div>
      </section>

      <aside class="reddit-sidebar">
        <section class="sidebar-card">
          <p class="sidebar-label">Community</p>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
          <dl class="sidebar-stats">
            <div><dt>Subscribers</dt><dd>${formatNumber(payload.subreddit.subscribers)}</dd></div>
            <div><dt>Active now</dt><dd>${formatNumber(payload.subreddit.activeUsers)}</dd></div>
            <div><dt>Ideas shown</dt><dd>${payload.comunia.ideas.length}</dd></div>
          </dl>
        </section>
      </aside>
    </main>
  </div>
</body>
</html>`
}

export function renderSubredditErrorPage(input: {
  requestedPath: string
  message: string
  status: number
}) {
  const title = `Comunia | Reddit route unavailable`
  const safeMessage = escapeHtml(input.message)
  const subredditLabel = escapeHtml(input.requestedPath.replace(/\.json$/, '') || '/r/...')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="Comunia could not fetch the Reddit JSON for this route right now.">
  <link rel="stylesheet" href="/subreddit-ideas.css">
</head>
<body>
  <div class="subreddit-shell">
    <header class="subreddit-hero">
      <div class="hero-copy">
        <p class="hero-kicker">Comunia subreddit read</p>
        <h1>We could not fetch this subreddit right now</h1>
        <p class="hero-description">The local app is running, but Reddit did not give this server the JSON payload needed to build the page for ${subredditLabel}.</p>
      </div>
      <div class="hero-stats">
        <div class="stat-chip">
          <span>Status</span>
          <strong>${input.status}</strong>
        </div>
        <div class="stat-chip">
          <span>Route</span>
          <strong>${subredditLabel}</strong>
        </div>
        <div class="stat-chip">
          <span>What happened</span>
          <strong>Upstream blocked</strong>
        </div>
      </div>
      <div class="hero-actions">
        <a class="hero-link" href="/">Back to dashboard</a>
      </div>
    </header>

    <main class="subreddit-grid">
      <section class="panel panel-ideas">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">Error details</p>
            <h2>Why the page is unavailable</h2>
          </div>
          <p class="panel-note">This is a fail-fast page so the route does not hang when Reddit stalls or denies access.</p>
        </div>
        <div class="idea-list">
          <article class="idea-card">
            <div class="idea-kicker">Upstream response</div>
            <h3>Reddit request failed</h3>
            <p class="idea-summary">${safeMessage}</p>
            <p class="idea-detail"><strong>Next step:</strong> retry later, add a proxy layer, or switch this feature to Reddit's authenticated API.</p>
          </article>
        </div>
      </section>

      <section class="panel panel-signals">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">Suggested fixes</p>
            <h2>Ways to make this reliable</h2>
          </div>
        </div>
        <pre class="signal-summary">1. Retry from a different IP or environment.
2. Add a dedicated proxy or cached fetch layer.
3. Move from unauthenticated .json scraping to Reddit's authenticated API.
4. Keep this HTML error state so the route stays responsive.</pre>
      </section>
    </main>
  </div>
</body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttribute(value: string) {
  return escapeHtml(value)
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a'
  return new Intl.NumberFormat('en-US').format(value)
}
