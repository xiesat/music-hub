// 把音源插件同步到 resources/providers
// 顺序：环境变量指定目录 → lock 文件里的 git 仓库 → 同级仓库目录 → 报错
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'resources', 'providers')
const lockFile = path.join(root, 'providers.lock.json')

function log(message) {
  console.log('[providers] ' + message)
}

function copyDir(from) {
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  fs.cpSync(from, target, { recursive: true })
  const count = fs.readdirSync(target).filter((name) => name.endsWith('.js')).length
  log('已同步 ' + count + ' 个插件 ← ' + from)
}

function existsDir(candidate) {
  return Boolean(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
}

function fromGit(repo, ref) {
  const cache = path.join(root, '.providers-cache')
  if (!fs.existsSync(cache)) {
    log('克隆插件仓库 ' + repo)
    execFileSync('git', ['clone', '--quiet', repo, cache], { stdio: 'inherit' })
  } else {
    log('更新插件仓库')
    execFileSync('git', ['-C', cache, 'fetch', '--quiet', '--all', '--tags'], { stdio: 'inherit' })
  }
  if (ref) execFileSync('git', ['-C', cache, 'checkout', '--quiet', ref], { stdio: 'inherit' })
  return path.join(cache, 'providers')
}

// 1) 环境变量
const fromEnv = process.env.MUSIC_HUB_PROVIDERS_DIR
if (existsDir(fromEnv)) {
  copyDir(fromEnv)
  process.exit(0)
}

// 2) lock 文件里的 git 仓库
let lock = {}
if (fs.existsSync(lockFile)) {
  try {
    lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
  } catch {
    log('providers.lock.json 解析失败，忽略')
  }
}
if (lock.repo) {
  try {
    copyDir(fromGit(lock.repo, lock.ref))
    process.exit(0)
  } catch (error) {
    log('从 git 拉取失败：' + error.message)
  }
}

// 3) 同级仓库（本地开发）
const sibling = lock.local ? path.resolve(root, lock.local) : path.resolve(root, '..', 'music-hub-providers', 'providers')
if (existsDir(sibling)) {
  copyDir(sibling)
  process.exit(0)
}

// 4) 已有内容就保留
if (existsDir(target) && fs.readdirSync(target).some((name) => name.endsWith('.js'))) {
  log('使用已有的 resources/providers')
  process.exit(0)
}

console.error('')
console.error('找不到音源插件。三选一：')
console.error('  1. 设置环境变量 MUSIC_HUB_PROVIDERS_DIR 指向插件目录')
console.error('  2. 在 providers.lock.json 里填 repo / ref（指向 music-hub-providers 仓库）')
console.error('  3. 把插件仓库 clone 到 ' + path.resolve(root, '..', 'music-hub-providers'))
console.error('')
process.exit(1)
