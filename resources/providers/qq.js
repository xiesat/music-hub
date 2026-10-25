// QQ 音乐音源（v2 协议，支持登录）
// 登录后可读私人歌单；会员账号能拿到 vkey → 可播放
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function search() {
  throw new Error('QQ 音乐搜索需要签名，暂未支持；可用「全部音源」搜索其它平台')
}

module.exports = {
  apiVersion: 2,
  platform: { id: 'qq', name: 'QQ 音乐' },
  capabilities: ['playlist', 'stream', 'auth'],

  login: {
    type: 'webview',
    url: 'https://y.qq.com/',
    cookies: ['uin', 'skey'],
    warmup: 'https://y.qq.com/n/ryqq/profile'
  },

  async me(ctx) {
    const uin = ctx.auth.get('uin')
    if (!uin) return null
    // QQ 的 uin cookie 形如 o0123456789，去掉前导字母和 0
    const uid = String(uin).replace(/^o/, '').replace(/^0+/, '')
    return { uid: uid, nickname: '' }
  },

  search: search,

  async getMediaSource(ctx, track) {
    const me = ctx.auth.me
    const uin = me ? me.uid : '0'
    const payload = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid: '10000',
          songmid: [String(track.id)],
          songtype: [0],
          uin: uin,
          loginflag: 1,
          platform: '20'
        }
      }
    }
    try {
      const url =
        'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' +
        encodeURIComponent(JSON.stringify(payload))
      const json = await ctx.get(url, {}, { referer: 'https://y.qq.com/' })
      const info = json && json.req_0 && json.req_0.data && json.req_0.data.midurlinfo
      const purl = info && info[0] && info[0].purl
      if (!purl) return null
      return { url: 'https://dl.stream.qqmusic.qq.com/' + purl }
    } catch (e) {
      return null
    }
  },

  async getLyric(ctx, track) {
    try {
      const json = await ctx.get(
        'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg',
        { songmid: track.id, format: 'json', nobase64: 1, g_tk: 5381 },
        { referer: 'https://y.qq.com/' }
      )
      return { lrc: (json && json.lyric) || '' }
    } catch (e) {
      return { lrc: '' }
    }
  },

  async getUserPlaylists(ctx, uid) {
    const target = uid || (ctx.auth.me && ctx.auth.me.uid)
    if (!target) throw ctx.error('NEED_LOGIN', '请先登录 QQ 音乐')
    const json = await ctx.get(
      'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss',
      { hostuin: target, format: 'json', inCharset: 'utf8', outCharset: 'utf-8' },
      { referer: 'https://y.qq.com/' }
    )
    const list = (json.data && json.data.disslist) || []
    return list
      .map(function (item) {
        return {
          id: String(item.disstid || item.dissid || ''),
          name: item.dissname || '未命名歌单',
          trackCount: item.songnum || 0,
          coverUrl: item.imgurl || null
        }
      })
      .filter(function (item) { return item.id })
  },

  async getPlaylistTracks(ctx, id) {
    const json = await ctx.get(
      'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg',
      { type: 1, json: 1, utf8: 1, onlysong: 0, new_format: 1, disstid: id, format: 'json' },
      { referer: 'https://y.qq.com/' }
    )
    const cd = json.cdlist && json.cdlist[0]
    if (!cd) throw ctx.error('FAILED', '歌单不存在或不可访问')
    const tracks = (cd.songlist || [])
      .filter(function (song) { return song.mid })
      .map(function (song) {
        const albumMid = song.album && song.album.mid
        return {
          id: song.mid,
          title: song.name || song.title || '未知标题',
          artist: (song.singer || []).map(function (s) { return s.name }).join(' / '),
          album: song.album ? song.album.name : '',
          duration: song.interval ? song.interval * 1000 : null,
          cover: albumMid ? 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + albumMid + '.jpg' : ''
        }
      })
    return { name: cd.dissname, tracks: tracks }
  }
}
