import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3001'
const passcode = process.env.PASSCODE
const outputDir = process.env.OUTPUT_DIR || path.join(rootDir, 'share', 'sideprojects-showcase-demo')

if (!passcode) {
  console.error('PASSCODE is required')
  process.exit(1)
}

const headers = {
  'x-community-code': passcode,
}

const snapshotResponse = await fetch(`${baseUrl}/community-api/bootstrap`, { headers })

if (!snapshotResponse.ok) {
  throw new Error(`Failed to fetch snapshot: ${snapshotResponse.status}`)
}

const snapshot = await snapshotResponse.json()
const plan = await fetchPlanWithRetry(baseUrl, headers)
const payload = JSON.stringify({ snapshot, plan })
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(String(plan.hero?.title || snapshot.community?.name || 'Comunia Showcase'))}</title>
  <meta name="description" content="${escapeHtml(String(plan.hero?.subtitle || 'Generated community showcase'))}">
  <link rel="stylesheet" href="/community-json.css">
</head>
<body>
  <div id="community-json-root"></div>
  <script>window.COMUNIA_SHOWCASE_DEMO = ${payload};</script>
  <script src="/community-json.js"></script>
</body>
</html>
`

fs.rmSync(outputDir, { recursive: true, force: true })
fs.mkdirSync(outputDir, { recursive: true })
fs.copyFileSync(path.join(rootDir, 'src', 'dashboard', 'public', 'community-json.css'), path.join(outputDir, 'community-json.css'))
fs.copyFileSync(path.join(rootDir, 'src', 'dashboard', 'public', 'community-json.js'), path.join(outputDir, 'community-json.js'))
fs.writeFileSync(path.join(outputDir, 'index.html'), html)
fs.writeFileSync(path.join(outputDir, 'vercel.json'), JSON.stringify({
  $schema: 'https://openapi.vercel.sh/vercel.json',
  cleanUrls: true,
  trailingSlash: false,
}, null, 2))

console.log(`Exported showcase demo to ${outputDir}`)

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function fetchPlanWithRetry(url, requestHeaders) {
  let lastPlan = null

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const refresh = attempt > 0 ? '?refresh=1' : ''
    const response = await fetch(`${url}/community-api/showcase-plan${refresh}`, { headers: requestHeaders })
    if (!response.ok) {
      throw new Error(`Failed to fetch showcase plan: ${response.status}`)
    }

    const plan = await response.json()
    lastPlan = plan
    if (plan.mode === 'ai') {
      return plan
    }
  }

  return lastPlan
}
