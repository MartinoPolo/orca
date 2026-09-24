const { createRequire } = require('node:module')
const path = require('node:path')
const { buildSync } = require('esbuild')

// Keep fork tooling on the same process runner as the app without maintaining a copied bundle.
const { outputFiles } = buildSync({
  entryPoints: [path.resolve(__dirname, '../../src/shared/child-process/run-process.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  write: false,
  logLevel: 'silent'
})
const bundledModule = { exports: {} }
new Function('require', 'module', 'exports', outputFiles[0].text)(
  createRequire(__filename),
  bundledModule,
  bundledModule.exports
)
module.exports = bundledModule.exports
