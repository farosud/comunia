import { build } from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

await build({
  entryPoints: [path.join(rootDir, 'frontend-src/community-json.tsx')],
  outfile: path.join(rootDir, 'src/dashboard/public/community-json.js'),
  bundle: true,
  format: 'iife',
  globalName: 'ComuniaCommunityJson',
  target: ['es2022'],
  platform: 'browser',
  jsx: 'automatic',
  sourcemap: false,
  minify: true,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
})
