/**
 * E2E API harness startup script.
 *
 * Lifecycle:
 *  1. Tear down any previous volume (determinism).
 *  2. Start only the `db` service from infra/docker-compose.dev.yml.
 *  3. Wait for Postgres to accept connections (via docker-compose exec healthcheck).
 *  4. Spawn `dotnet run` (SDK 10 at the user-local path) with development settings.
 *  5. Forward Ctrl-C / SIGTERM to clean up both dotnet and the db container.
 *
 * The Playwright webServer entry sets `url: "http://localhost:5249/health/ready"` and
 * `reuseExistingServer: false`, so Playwright waits for that URL before tests start.
 */

import { spawn, execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const COMPOSE_FILE = path.join(REPO_ROOT, 'infra', 'docker-compose.dev.yml')
const API_PROJECT = path.join(REPO_ROOT, 'api', 'src', 'Taxi.Api')

// Dotnet SDK 10 is user-local — bare `dotnet` resolves to 9.0 and fails.
const DOTNET = process.platform === 'win32'
  ? 'C:\\Users\\alesm\\AppData\\Local\\Microsoft\\dotnet\\dotnet.exe'
  : '/usr/local/bin/dotnet'

function run(cmd, args = [], opts = {}) {
  console.log(`[harness] ${cmd} ${args.join(' ')}`)
  execSync(`${cmd} ${args.join(' ')}`, {
    stdio: 'inherit',
    cwd: opts.cwd ?? REPO_ROOT,
    ...opts,
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForDb(maxRetries = 30, delayMs = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      execSync(
        `docker compose -f "${COMPOSE_FILE}" exec -T db pg_isready -U taxi -d taxi`,
        { stdio: 'pipe', cwd: REPO_ROOT },
      )
      console.log('[harness] Postgres is ready')
      return
    } catch {
      console.log(`[harness] Waiting for Postgres... (${i + 1}/${maxRetries})`)
      await sleep(delayMs)
    }
  }
  throw new Error('[harness] Postgres did not become ready in time')
}

async function main() {
  // 1. Tear down previous volume for determinism.
  console.log('[harness] Tearing down previous docker volume...')
  try {
    run('docker', ['compose', '-f', `"${COMPOSE_FILE}"`, 'down', '-v', '--remove-orphans'])
  } catch {
    // Ignore — no previous state
  }

  // 2. Start db service only.
  console.log('[harness] Starting database...')
  run('docker', ['compose', '-f', `"${COMPOSE_FILE}"`, 'up', '-d', 'db'])

  // 3. Wait for Postgres.
  await waitForDb()

  // 4. Spawn dotnet run.
  console.log('[harness] Starting API (dotnet run)...')
  const dotnetProcess = spawn(DOTNET, ['run', '--project', API_PROJECT, '--no-launch-profile'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Development',
      ASPNETCORE_URLS: 'http://localhost:5249',
      'ConnectionStrings__Db': 'Host=localhost;Port=5432;Database=taxi;Username=taxi;Password=taxi_dev_password',
      Seed__Enabled: 'true',
    },
  })

  dotnetProcess.on('error', (err) => {
    console.error('[harness] dotnet run failed:', err)
    process.exit(1)
  })

  // 5. Forward signals to child.
  function cleanup(signal) {
    console.log(`[harness] ${signal} received — shutting down...`)
    dotnetProcess.kill(signal)
    try {
      run('docker', ['compose', '-f', `"${COMPOSE_FILE}"`, 'stop', 'db'])
    } catch {
      // Best effort
    }
  }

  process.on('SIGINT', () => cleanup('SIGINT'))
  process.on('SIGTERM', () => cleanup('SIGTERM'))
  process.on('exit', () => {
    try { dotnetProcess.kill() } catch { /* ignore */ }
  })

  // Wait for dotnet to exit (Playwright will kill this process after tests).
  await new Promise((resolve, reject) => {
    dotnetProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`dotnet exited with code ${code}`))
      } else {
        resolve()
      }
    })
  })
}

main().catch((err) => {
  console.error('[harness] Fatal:', err)
  process.exit(1)
})
