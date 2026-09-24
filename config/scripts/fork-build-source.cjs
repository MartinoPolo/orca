const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

function compiledFiles(outDirectory, proofPath) {
  const files = {}
  function visit(directory, relativeDirectory = '') {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const filePath = path.join(directory, entry.name)
      if (filePath === proofPath) {
        continue
      }
      if (entry.isDirectory()) {
        visit(filePath, relativePath)
      } else if (entry.isFile()) {
        files[relativePath] = createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
      } else {
        throw new Error(`Unsupported compiled output entry: ${relativePath}`)
      }
    }
  }
  if (!fs.lstatSync(outDirectory).isDirectory()) {
    throw new Error('Missing compiled out directory')
  }
  visit(outDirectory)
  if (!files['main/index.js'] || !files['package.json']) {
    throw new Error('Missing required compiled output')
  }
  return files
}

function writeForkBuildSource({ cwd, proofPath, source, version }) {
  const files = compiledFiles(path.join(cwd, 'out'), proofPath)
  fs.writeFileSync(proofPath, `${JSON.stringify({ source, version, files }, null, 2)}\n`)
}

function assertForkBuildSource({ cwd, proofPath, source, version }) {
  if (!fs.existsSync(proofPath)) {
    throw new Error('Fork build proof is missing; run build:fork')
  }
  if (!fs.lstatSync(proofPath).isFile()) {
    throw new Error('Fork build proof must be a regular file')
  }
  const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'))
  if (JSON.stringify(proof.source) !== JSON.stringify(source)) {
    throw new Error('Fork build proof source does not match published main')
  }
  if (proof.version !== version) {
    throw new Error('Fork build proof version does not match')
  }
  if (
    JSON.stringify(proof.files) !== JSON.stringify(compiledFiles(path.join(cwd, 'out'), proofPath))
  ) {
    throw new Error('Fork build proof compiled output changed')
  }
}

module.exports = { writeForkBuildSource, assertForkBuildSource }
