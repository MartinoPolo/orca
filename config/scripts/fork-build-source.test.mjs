import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { writeForkBuildSource, assertForkBuildSource } = require('./fork-build-source.cjs')
const directories = []
const source = {
  repository: 'MartinoPolo/orca',
  branch: 'main',
  commit: 'a'.repeat(40),
  publishedCommit: 'a'.repeat(40),
  priorCommit: null,
  auditedRefs: []
}
const version = '1.4.197-local.20260924100739.gaaaaaaaa'

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'fork-build-source-'))
  directories.push(cwd)
  mkdirSync(join(cwd, 'out', 'main'), { recursive: true })
  writeFileSync(join(cwd, 'out', 'main', 'index.js'), 'current build')
  writeFileSync(join(cwd, 'out', 'package.json'), '{}')
  return { cwd, proofPath: join(cwd, 'out', 'fork-build-source.json') }
}

afterEach(() => {
  for (const cwd of directories.splice(0)) {
    rmSync(cwd, { recursive: true, force: true })
  }
})

it('rejects direct packaging without build proof', () => {
  const { cwd, proofPath } = fixture()
  expect(() => assertForkBuildSource({ cwd, proofPath, source, version })).toThrow(/proof/)
})

it('accepts a verified build and rejects changed, added, or deleted outputs', () => {
  const { cwd, proofPath } = fixture()
  writeForkBuildSource({ cwd, proofPath, source, version })
  expect(() => assertForkBuildSource({ cwd, proofPath, source, version })).not.toThrow()
  writeFileSync(join(cwd, 'out', 'main', 'index.js'), 'old build')
  expect(() => assertForkBuildSource({ cwd, proofPath, source, version })).toThrow(/output/)
  writeFileSync(join(cwd, 'out', 'main', 'index.js'), 'current build')
  writeFileSync(join(cwd, 'out', 'main', 'extra.js'), 'unexpected')
  expect(() => assertForkBuildSource({ cwd, proofPath, source, version })).toThrow(/output/)
  rmSync(join(cwd, 'out', 'main', 'extra.js'))
  rmSync(join(cwd, 'out', 'main', 'index.js'))
  expect(() => assertForkBuildSource({ cwd, proofPath, source, version })).toThrow(/output/)
})

it('rejects mismatched source and version and incomplete proof', () => {
  const { cwd, proofPath } = fixture()
  writeForkBuildSource({ cwd, proofPath, source, version })
  expect(() =>
    assertForkBuildSource({
      cwd,
      proofPath,
      source: { ...source, commit: 'b'.repeat(40) },
      version
    })
  ).toThrow(/source/)
  expect(() =>
    assertForkBuildSource({ cwd, proofPath, source, version: `${version}.other` })
  ).toThrow(/version/)
  writeFileSync(
    proofPath,
    JSON.stringify({ ...JSON.parse(readFileSync(proofPath, 'utf8')), files: {} })
  )
  expect(() => assertForkBuildSource({ cwd, proofPath, source, version })).toThrow(/output/)
})
