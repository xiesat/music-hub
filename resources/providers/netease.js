// 网易云音乐音源（v2 协议，支持登录）
// v2：方法第一个参数是 ctx，提供 request / crypto / auth / 日志
var BASE = 'https://music.163.com'

function cover(url) {
  if (!url) return ''
  return String(url).replace(/^http:/, 'https:') + '?param=200y200'
}

module.exports = {
  apiVersion: 2,
  platform: { id: 'netease', name: '网易云音乐' },
  capabilities: ['search', 'stream', 'lyric', 'playlist', 'auth'],

  // 宿主会打开这个页面让用户登录（账密 / 验证码 / 扫码都在官方页面里完成）
  login: {
    type: 'webview',
    url: 'https://music.163.com/#/login',
    cookies: ['MUSIC_U'],
    // 注：网易云网页登录只写 MUSIC_U（HttpOnly）
    warmup: 'https://music.163.com/#/my/'
  },

  // 登录后问宿主用的：返回 uid 和昵称，歌单导入直接用
  async me(ctx) {
    try {
      const json = await ctx.get(BASE + '/api/nuser/account/get', {}, { referer: BASE + '/' })
      const profile = json && json.profile
      if (!profile) return null
      return { uid: String(profile.userId || ''), nickname: profile.nickname || '' }
    } catch (e) {
      return null
    }
  },

  async search(ctx, query, page) {
    const limit = 30
    const offset = ((page || 1) - 1) * limit
    const json = await ctx.post(
      BASE + '/api/cloudsearch/pc',
      { s: query, type: 1, limit: limit, offset: offset, total: 'true' },
      { referer: BASE + '/' }
    )
    if (json.code && json.code !== 200) {
      if (json.code === 405 || json.code === -460) throw ctx.error('RATE_LIMITED', '请求过于频繁')
      throw ctx.error('FAILED', '搜索失败 code ' + json.code)
    }
    const songs = (json.result && json.result.songs) || []
    return songs.map(function (song) {
      return {
        id: String(song.id),
        title: song.name,
        artist: (song.ar || []).map(function (a) { return a.name }).join(' / '),
        album: song.al ? song.al.name : '',
        duration: song.dt,
        cover: song.al ? cover(song.al.picUrl) : ''
      }
    })
  },

  async getMediaSource(ctx, track) {
    // 有登录态时先试高音质（会员账号才会真的给）
    const levels = ctx.auth.loggedIn ? ['lossless', 'exhigh', 'standard'] : ['standard']
    for (let i = 0; i < levels.length; i++) {
      try {
        const json = await ctx.get(
          BASE + '/api/song/enhance/player/url/v1',
          { ids: '%5B' + track.id + '%5D', level: levels[i], encodeType: 'flac' },
          { referer: BASE + '/' }
        )
        const first = json && json.data && json.data[0]
        if (first && first.url) return { url: first.url }
      } catch (e) {}
    }
    return null
  },

  async getLyric(ctx, track) {
    const json = await ctx.get(
      BASE + '/api/song/lyric',
      { id: track.id, lv: 1, kv: 1, tv: -1 },
      { referer: BASE + '/' }
    )
    return { lrc: (json.lrc && json.lrc.lyric) || '' }
  },

  async getUserPlaylists(ctx, uid) {
    const target = uid || (ctx.auth.me && ctx.auth.me.uid)
    if (!target) throw ctx.error('NEED_LOGIN', '请先登录网易云账号')
    const json = await ctx.get(
      BASE + '/api/user/playlist',
      { uid: target, limit: 100, offset: 0 },
      { referer: BASE + '/' }
    )
    if (json.code !== 200) throw ctx.error('FAILED', '查询失败 code ' + json.code)
    return (json.playlist || []).map(function (item) {
      return {
        id: String(item.id),
        name: item.name,
        trackCount: item.trackCount || 0,
        coverUrl: cover(item.coverImgUrl)
      }
    })
  },

  async getPlaylistTracks(ctx, id) {
    const json = await ctx.get(
      BASE + '/api/v6/playlist/detail',
      { id: id, n: 1000, s: 0 },
      { referer: BASE + '/' }
    )
    if (json.code !== 200 || !json.playlist) throw ctx.error('FAILED', '歌单不存在或不可访问')
    const tracks = (json.playlist.tracks || []).map(function (song) {
      return {
        id: String(song.id),
        title: song.name,
        artist: (song.ar || []).map(function (a) { return a.name }).join(' / '),
        album: song.al ? song.al.name : '',
        duration: song.dt,
        cover: song.al ? cover(song.al.picUrl) : ''
      }
    })
    return { name: json.playlist.name, tracks: tracks }
  }
}