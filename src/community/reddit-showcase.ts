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
  const postCards = payload.highlights.posts.length
    ? payload.highlights.posts.slice(0, 6).map((post) => `
      <article class="reddit-post-card">
        <div class="post-meta">
          <span>score ${formatNumber(post.score)}</span>
          <span>comments ${formatNumber(post.comments)}</span>
          ${post.flair ? `<span>${escapeHtml(String(post.flair))}</span>` : ''}
        </div>
        <h3>${escapeHtml(String(post.title || 'Untitled post'))}</h3>
        ${post.selftext ? `<p>${escapeHtml(String(post.selftext))}</p>` : ''}
        <a href="${escapeAttribute(String(post.permalink || post.url || payload.source.redditUrl))}" target="_blank" rel="noreferrer">Open thread</a>
      </article>
    `).join('')
    : `<div class="empty-state">No top posts were extracted from the Reddit payload.</div>`

  const commentCards = payload.highlights.comments.length
    ? payload.highlights.comments.slice(0, 4).map((comment) => `
      <article class="comment-card">
        <p>${escapeHtml(String(comment.body || ''))}</p>
        <span>${escapeHtml(String(comment.author || 'unknown'))} · score ${formatNumber(comment.score)}</span>
      </article>
    `).join('')
    : `<div class="empty-state">No comment highlights were extracted for this request.</div>`

  const ideaCards = payload.comunia.ideas.length
    ? payload.comunia.ideas.map((idea, index) => `
      <article class="idea-card">
        <div class="idea-kicker">Idea ${index + 1}</div>
        <h3>${escapeHtml(idea.title)}</h3>
        <p class="idea-summary">${escapeHtml(idea.summary)}</p>
        ${idea.targetMembers ? `<p class="idea-detail"><strong>For:</strong> ${escapeHtml(idea.targetMembers)}</p>` : ''}
        ${idea.rationale ? `<p class="idea-detail"><strong>Why:</strong> ${escapeHtml(idea.rationale)}</p>` : ''}
        ${idea.buildPrompt ? `<details class="idea-prompt"><summary>Build prompt</summary><pre>${escapeHtml(idea.buildPrompt)}</pre></details>` : ''}
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
  <div class="subreddit-shell">
    <header class="subreddit-hero">
      <div class="hero-copy">
        <p class="hero-kicker">Comunia community read</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="hero-description">${escapeHtml(description)}</p>
      </div>
      <div class="hero-stats">
        <div class="stat-chip">
          <span>Subscribers</span>
          <strong>${formatNumber(payload.subreddit.subscribers)}</strong>
        </div>
        <div class="stat-chip">
          <span>Active now</span>
          <strong>${formatNumber(payload.subreddit.activeUsers)}</strong>
        </div>
        <div class="stat-chip">
          <span>Top posts read</span>
          <strong>${payload.highlights.posts.length}</strong>
        </div>
      </div>
      <div class="hero-actions">
        <a class="hero-link primary-link" href="${escapeAttribute(payload.source.redditUrl)}" target="_blank" rel="noreferrer">Open on Reddit</a>
        <a class="hero-link" href="${escapeAttribute(payload.source.normalizedPath)}.json">See Comunia JSON</a>
      </div>
    </header>

    <main class="subreddit-grid">
      <section class="panel panel-ideas">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">Recommended builds</p>
            <h2>Products this community might actually want</h2>
          </div>
          <p class="panel-note">Generated from the live Reddit JSON for this subreddit, not a cached editorial stub.</p>
        </div>
        <div class="idea-list">${ideaCards}</div>
      </section>

      <section class="panel panel-signals">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">Signal trace</p>
            <h2>Why these ideas</h2>
          </div>
        </div>
        <pre class="signal-summary">${escapeHtml(payload.comunia.signalSummary)}</pre>
      </section>

      <section class="panel panel-posts">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">Top threads</p>
            <h2>What people are already reacting to</h2>
          </div>
        </div>
        <div class="post-list">${postCards}</div>
      </section>

      <section class="panel panel-comments">
        <div class="panel-heading">
          <div>
            <p class="panel-kicker">Comment texture</p>
            <h2>High-signal replies</h2>
          </div>
        </div>
        <div class="comment-list">${commentCards}</div>
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
