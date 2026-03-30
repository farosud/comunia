const REDDIT_USER_AGENT = 'comunia/0.1.4 (+https://comunia.chat)'

interface RedditThing {
  kind?: string
  data?: Record<string, any>
}

interface RedditListing {
  data?: {
    children?: RedditThing[]
  }
}

export interface RedditLinkSnapshot {
  requestedPath: string
  normalizedPath: string
  redditUrl: string
  redditJsonUrl: string
  subreddit: string | null
  about: Record<string, any> | null
  redditJson: any
  highlights: {
    posts: Array<Record<string, any>>
    comments: Array<Record<string, any>>
  }
  signalSummary: string
}

export async function fetchRedditLinkSnapshot(requestPath: string): Promise<RedditLinkSnapshot> {
  const requestedUrl = new URL(requestPath, 'https://comunia.chat')
  const normalizedPath = normalizeRedditPath(requestedUrl.pathname)
  if (!normalizedPath.startsWith('/r/')) {
    throw new Error('Only Reddit subreddit paths are supported.')
  }

  const subreddit = extractSubreddit(normalizedPath)
  const redditUrl = buildRedditUrl(normalizedPath, requestedUrl.searchParams)
  const redditJsonUrl = buildRedditJsonUrl(normalizedPath, requestedUrl.searchParams)
  const aboutUrl = subreddit ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/about.json?raw_json=1` : null

  const [redditJsonResponse, aboutResponse] = await Promise.all([
    fetch(redditJsonUrl, { headers: { 'User-Agent': REDDIT_USER_AGENT } }),
    aboutUrl ? fetch(aboutUrl, { headers: { 'User-Agent': REDDIT_USER_AGENT } }).catch(() => null) : Promise.resolve(null),
  ])

  if (!redditJsonResponse.ok) {
    throw new Error(`Reddit JSON request failed with status ${redditJsonResponse.status}.`)
  }

  const redditJson = await redditJsonResponse.json()
  const aboutPayload = aboutResponse && aboutResponse.ok ? await aboutResponse.json() : null
  const about = aboutPayload?.data || null
  const highlights = extractHighlights(redditJson)

  return {
    requestedPath: requestPath,
    normalizedPath,
    redditUrl,
    redditJsonUrl,
    subreddit,
    about,
    redditJson,
    highlights,
    signalSummary: buildSignalSummary({ subreddit, about, highlights }),
  }
}

function normalizeRedditPath(pathname: string) {
  const withoutJson = pathname.endsWith('.json') ? pathname.slice(0, -5) : pathname
  if (!withoutJson || withoutJson === '/') return '/'
  return withoutJson.replace(/\/+$/, '') || '/'
}

function extractSubreddit(pathname: string) {
  const match = pathname.match(/^\/r\/([^/]+)/i)
  return match ? decodeURIComponent(match[1]) : null
}

function buildRedditUrl(pathname: string, originalParams: URLSearchParams) {
  const url = new URL(`https://www.reddit.com${pathname}`)
  for (const [key, value] of originalParams.entries()) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

function buildRedditJsonUrl(pathname: string, originalParams: URLSearchParams) {
  const url = new URL(`https://www.reddit.com${pathname}.json`)
  for (const [key, value] of originalParams.entries()) {
    url.searchParams.set(key, value)
  }
  url.searchParams.set('raw_json', '1')
  return url.toString()
}

function extractHighlights(payload: any) {
  const posts = new Map<string, Record<string, any>>()
  const comments = new Map<string, Record<string, any>>()
  visitRedditPayload(payload, (thing) => {
    const data = thing.data || {}
    if (thing.kind === 't3') {
      posts.set(String(data.id || data.name || posts.size), {
        id: data.id || null,
        title: data.title || '',
        author: data.author || 'unknown',
        score: Number(data.score || data.ups || 0),
        comments: Number(data.num_comments || 0),
        flair: data.link_flair_text || '',
        url: data.url || '',
        permalink: data.permalink ? `https://www.reddit.com${data.permalink}` : '',
        selftext: truncateText(data.selftext || '', 320),
      })
    }

    if (thing.kind === 't1') {
      comments.set(String(data.id || data.name || comments.size), {
        id: data.id || null,
        author: data.author || 'unknown',
        score: Number(data.score || 0),
        body: truncateText(data.body || '', 220),
        permalink: data.permalink ? `https://www.reddit.com${data.permalink}` : '',
      })
    }
  })

  return {
    posts: Array.from(posts.values())
      .sort((a, b) => (b.score + b.comments) - (a.score + a.comments))
      .slice(0, 8),
    comments: Array.from(comments.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 8),
  }
}

function visitRedditPayload(payload: any, visitor: (thing: RedditThing) => void) {
  if (Array.isArray(payload)) {
    for (const item of payload) visitRedditPayload(item, visitor)
    return
  }

  if (!payload || typeof payload !== 'object') return

  if (typeof payload.kind === 'string' && payload.data && typeof payload.data === 'object') {
    visitor(payload as RedditThing)
  }

  const listing = payload as RedditListing
  if (Array.isArray(listing.data?.children)) {
    for (const child of listing.data.children) {
      visitRedditPayload(child, visitor)
      const replies = child?.data?.replies
      if (replies && typeof replies === 'object') {
        visitRedditPayload(replies, visitor)
      }
    }
  }
}

function buildSignalSummary(input: {
  subreddit: string | null
  about: Record<string, any> | null
  highlights: {
    posts: Array<Record<string, any>>
    comments: Array<Record<string, any>>
  }
}) {
  const lines: string[] = []

  if (input.subreddit) lines.push(`Subreddit: r/${input.subreddit}`)
  if (input.about?.title) lines.push(`Title: ${input.about.title}`)
  if (input.about?.public_description) lines.push(`Public description: ${input.about.public_description}`)
  if (input.about?.subscribers) lines.push(`Subscribers: ${input.about.subscribers}`)
  if (input.about?.active_user_count) lines.push(`Active users: ${input.about.active_user_count}`)

  if (input.highlights.posts.length) {
    lines.push('Top posts:')
    for (const post of input.highlights.posts.slice(0, 6)) {
      lines.push(
        `- ${post.title} | score ${post.score} | comments ${post.comments}`
        + `${post.flair ? ` | flair ${post.flair}` : ''}`
        + `${post.selftext ? ` | text ${post.selftext}` : ''}`,
      )
    }
  }

  if (input.highlights.comments.length) {
    lines.push('Top comments:')
    for (const comment of input.highlights.comments.slice(0, 6)) {
      lines.push(`- ${comment.author} | score ${comment.score} | ${comment.body}`)
    }
  }

  return lines.join('\n').trim()
}

function truncateText(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact
}
