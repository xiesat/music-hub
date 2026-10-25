
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const Database = require('D:/System Default/Documents/code/music-hub/node_modules/better-sqlite3')
for (const p of ['provider-script_netease', 'provider-script_qq']) {
  const db = new Database(path.join(os.tmpdir(), p + '.db'), { readonly: true })
  const rows = db.prepare('SELECT name, host_key, length(value) AS vlen, length(encrypted_value) AS elen FROM cookies').all()
  console.log('==', p, 'total', rows.length)
  for (const r of rows) {
    if (['MUSIC_U', 'uin', 'qqmusic_key', 'qm_keyst', '__csrf'].includes(r.name)) {
      console.log('  ', r.name, r.host_key, 'plain=' + r.vlen, 'enc=' + r.elen)
    }
  }
  db.close()
}
