const EXA_SEARCH_URL = 'https://api.exa.ai/search'

export interface ExaSearchResult {
  title: string
  url: string
  publishedDate?: string
  author?: string
  text?: string
  summary?: string
  highlights?: string[]
}

interface ExaSearchResponse {
  results?: ExaSearchResult[]
}

interface ExaSearchParams {
  query: string
  numResults?: number
  startPublishedDate?: string
  type?: 'auto' | 'fast' | 'deep' | 'deep-reasoning' | 'instant' | 'neural'
  category?: 'news' | 'company' | 'people' | 'research paper' | 'personal site' | 'financial report'
}

export class ExaClient {
  constructor(private apiKey?: string) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  async search(params: ExaSearchParams): Promise<ExaSearchResult[]> {
    if (!this.apiKey) {
      throw new Error('EXA_API_KEY is not configured')
    }

    const body: Record<string, unknown> = {
      query: params.query,
      numResults: params.numResults || 8,
      type: params.type || 'auto',
      contents: {
        highlights: {
          maxCharacters: 1200,
        },
      },
    }

    if (params.startPublishedDate) body.startPublishedDate = params.startPublishedDate
    if (params.category) body.category = params.category

    const response = await fetch(EXA_SEARCH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Exa search failed (${response.status}): ${text}`)
    }

    const data = await response.json() as ExaSearchResponse
    return Array.isArray(data.results) ? data.results : []
  }
}
