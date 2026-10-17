import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { configProblems, loadConfig } from '../src/config.js'

const run = promisify(execFile)
const SERVER = path.resolve(import.meta.dirname, '../src/server.js')

describe('loadConfig', () => {
  it('allows the local frontend by default in development', () => {
    expect(loadConfig({}).corsOrigins).toEqual(['http://localhost:5173'])
    expect(loadConfig({}).production).toBe(false)
  })

  it('has no default CORS origin in production', () => {
    const config = loadConfig({ NODE_ENV: 'production' })
    expect(config.production).toBe(true)
    expect(config.corsOrigins).toEqual([])
  })

  it('reads several origins and drops trailing slashes', () => {
    const config = loadConfig({ CORS_ORIGINS: 'https://dictator.vercel.app/, https://preview.example.com ' })
    expect(config.corsOrigins).toEqual(['https://dictator.vercel.app', 'https://preview.example.com'])
  })
})

describe('configProblems', () => {
  it('accepts a complete production configuration', () => {
    const config = loadConfig({ NODE_ENV: 'production', OPENAI_API_KEY: 'sk-test', CORS_ORIGINS: 'https://dictator.vercel.app' })
    expect(configProblems(config)).toEqual([])
  })

  it('requires the API key and CORS origins in production', () => {
    const problems = configProblems(loadConfig({ NODE_ENV: 'production' }))
    expect(problems).toHaveLength(2)
    expect(problems.join(' ')).toMatch(/OPENAI_API_KEY/)
    expect(problems.join(' ')).toMatch(/CORS_ORIGINS/)
  })

  it('does not require them in development', () => {
    expect(configProblems(loadConfig({}))).toEqual([])
  })

  it('rejects origins with a path or that are not URLs', () => {
    const problems = configProblems(loadConfig({ CORS_ORIGINS: 'https://dictator.vercel.app/app,dictator.vercel.app' }))
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/origin only/)
    expect(problems[1]).toMatch(/not a URL/)
  })

  it('requires https origins in production, except localhost', () => {
    const base = { NODE_ENV: 'production', OPENAI_API_KEY: 'sk-test' }
    expect(configProblems(loadConfig({ ...base, CORS_ORIGINS: 'http://dictator.example.com' }))[0]).toMatch(/https/)
    expect(configProblems(loadConfig({ ...base, CORS_ORIGINS: 'http://localhost:4173' }))).toEqual([])
  })
})

describe('server start-up', () => {
  it('refuses to start in production without the required settings', async () => {
    // Run outside the backend folder so a local .env file is not loaded.
    const env = { PATH: process.env.PATH, NODE_ENV: 'production', PORT: '0' }
    const error = await run(process.execPath, [SERVER], { cwd: os.tmpdir(), env, timeout: 10_000 }).catch((err) => err)
    expect(error.code).toBe(1)
    expect(error.stderr).toMatch(/Configuration error: OPENAI_API_KEY is not set/)
    expect(error.stderr).toMatch(/Configuration error: CORS_ORIGINS is not set/)
  })
})
