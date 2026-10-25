// QQ 音乐音源（v2 协议）
// 搜索：c.y.qq.com/soso/fcgi-bin/search_for_qq_cp（免签名）
// 歌单：u6.y.qq.com/cgi-bin/musics.fcg + sign（签名包在 lib/qq-sign）
// 播放：vkey.GetVkeyServer（登录后有会员态可拿 VIP 地址）
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
var REFERER = 'https://y.qq.com/'

function hash33(value) {
  var hash = 5381
  for (var i = 0; i < value.length; i++) hash += (hash << 5) + value.charCodeAt(i)
  return hash & 0x7fffffff
}

function gtk(ctx) {
  var key =
    ctx.auth.get('qqmusic_key') ||
    ctx.auth.get('qm_keyst') ||
    ctx.auth.get('skey') ||
    ctx.auth.get('p_skey')
  return key ? hash33(String(key)) : 5381
}

function coverOf(albumMid) {
  if (!albumMid) return ''
  return 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + albumMid + '.jpg'
}

// 签名请求：musics.fcg
async function signedCall(ctx, req, uin) {
  ctx.loadScript('./lib/qq-sign/sign.js')
  var getsign = ctx.global('getsign')
  if (typeof getsign !== 'function') throw ctx.error('FAILED', '签名算法加载失败')

  var me = ctx.auth.me
  var payload = {
    comm: {
      cv: 4747474,
      ct: 24,
      format: 'json',
      inCharset: 'utf-8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 1,
      uin: String(uin || (me && me.uid) || '0')
    },
    req_1: req
  }
  var body = JSON.stringify(payload)
  var sign = getsign(body)
  var url = 'https://u6.y.qq.com/cgi-bin/musics.fcg?sign=' + sign + '&_=' + Date.now()
  var json = await ctx.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: REFERER,
      Origin: 'https://y.qq.com',
      'User-Agent': UA
    },
    body: body
  })
  return json && json.req_1 ? json.req_1 : json
}

module.exports = {
  apiVersion: 2,
  platform: { id: 'qq', name: 'QQ 音乐' },
  capabilities: ['search', 'stream', 'lyric', 'playlist', 'auth'],

  login: {
    type: 'webview',
    url: 'https://y.qq.com/',
    cookies: ['uin', 'qqmusic_key|qm_keyst'],
    warmup: 'https://y.qq.com/n/ryqq/profile'
  },

  async me(ctx) {
    var uin = ctx.auth.get('uin')
    if (!uin) return null
    var uid = String(uin).replace(/^o/, '').replace(/^0+/, '')
    var nickname = ''
    try {
      var info = await ctx.get(
        'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss',
        { hostuin: uid, g_tk: gtk(ctx), format: 'json', inCharset: 'utf8', outCharset: 'utf-8' },
        { referer: REFERER }
      )
      nickname = (info.data && info.data.hostname) || ''
    } catch (e) {}
    return { uid: uid, nickname: nickname }
  },

  async search(ctx, query, page) {
    var json = await ctx.get(
      'https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp',
      { w: query, p: page || 1, n: 20, format: 'json' },
      { referer: REFERER }
    )
    var songs = (json.data && json.data.song && json.data.song.list) || []
    return songs.map(function (song) {
      return {
        id: song.songmid,
        title: song.songname,
        artist: (song.singer || []).map(function (s) { return s.name }).join(' / '),
        album: song.albumname || '',
        duration: song.interval ? song.interval * 1000 : null,
        cover: coverOf(song.albummid)
      }
    })
  },

  async getMediaSource(ctx, track) {
    var me = ctx.auth.me
    var uin = me ? me.uid : '0'
    try {
      var info = await signedCall(ctx, {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: { guid: '10000', songmid: [String(track.id)], songtype: [0], uin: uin, loginflag: 1, platform: '20' }
      })
      var list = info && info.data && info.data.midurlinfo
      var purl = list && list[0] && list[0].purl
      if (purl) return { url: 'https://dl.stream.qqmusic.qq.com/' + purl }
    } catch (e) {}

    // 兜底：老的 fcg 接口
    try {
      var json = await ctx.get(
        'https://u.y.qq.com/cgi-bin/musicu.fcg',
        { format: 'json', data: JSON.stringify({ req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: '10000', songmid: [String(track.id)], songtype: [0], uin: uin, loginflag: 1, platform: '20' } } }) },
        { referer: REFERER }
      )
      var purl2 = json && json.req_0 && json.req_0.data && json.req_0.data.midurlinfo && json.req_0.data.midurlinfo[0].purl
      if (purl2) return { url: 'https://dl.stream.qqmusic.qq.com/' + purl2 }
    } catch (e) {}
    return null
  },

  async getLyric(ctx, track) {
    try {
      var json = await ctx.get(
        'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg',
        { songmid: track.id, format: 'json', nobase64: 1, g_tk: gtk(ctx) },
        { referer: REFERER }
      )
      return { lrc: (json && json.lyric) || '' }
    } catch (e) {
      return { lrc: '' }
    }
  },

  // 用户歌单：签名接口（含「我喜欢」）
  async getUserPlaylists(ctx, uid) {
    var me = ctx.auth.me
    var target = String(uid || (me && me.uid) || '')
    if (!target) throw ctx.error('NEED_LOGIN', '请先登录 QQ 音乐')

    var info = await signedCall(
      ctx,
      { module: 'music.musicasset.PlaylistBaseRead', method: 'GetPlaylistByUin', param: { uin: target } },
      target
    )
    if (info && info.code !== 0 && info.code !== undefined) {
      if (info.code === 10006) throw ctx.error('NEED_LOGIN', '登录态失效，请重新登录 QQ 音乐')
      throw ctx.error('FAILED', '歌单查询失败 code ' + info.code)
    }

    var data = (info && info.data) || {}
    var v = data.v_playlist || data.playlist || []
    var list = []
    for (var i = 0; i < v.length; i++) {
      var item = v[i]
      // tid 才是可直接取歌的歌单 ID；dirId=201 是「我喜欢」
      list.push({
        id: String(item.tid || item.dissid || item.dirId || ''),
        name: item.dirName || item.diss_name || item.title || '未命名歌单',
        trackCount: item.songNum || item.song_cnt || 0,
        coverUrl: item.picUrl || item.bigpicUrl || item.diss_cover || null
      })
    }
    return list.filter(function (item) { return item.id })
  },

  async getPlaylistTracks(ctx, id) {
    var me = ctx.auth.me
    var attempts = [
      { disstid: Number(id), encrypt_uin: 0, tag: 1, userinfo: 1, song_begin: 0, song_num: 1000, onlysonglist: 0 },
      { disstid: String(id), encrypt_uin: '0', tag: 1, userinfo: 1, song_begin: 0, song_num: 1000, onlysonglist: 0 },
      { disstid: Number(id), dirid: 0, tag: 1, song_begin: 0, song_num: 1000, userinfo: 1 }
    ]
    var info = null
    for (var ai = 0; ai < attempts.length; ai++) {
      var tried = await signedCall(
        ctx,
        { module: 'music.srfDissInfo.aiDissInfo', method: 'uniform_get_Dissinfo', param: attempts[ai] },
        me && me.uid
      )
        if (tried && tried.code === 0) { info = tried; break }
    }

    if (!info || info.code !== 0) {
      // 兜底：老的 fcg 接口（只支持自建歌单）
      var legacy = await ctx.get(
        'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg',
        { type: 1, json: 1, utf8: 1, onlysong: 0, new_format: 1, disstid: id, g_tk: gtk(ctx), format: 'json' },
        { referer: REFERER }
      )
      var cd = legacy.cdlist && legacy.cdlist[0]
      if (!cd) throw ctx.error('FAILED', '歌单不存在或不可访问')
      return { name: cd.dissname, tracks: mapSongs(cd.songlist || [], true) }
    }

    var data = info.data || {}
    var detail = data.dirinfo || data.dissinfo || {}
    var songs = data.songlist || data.song || []

    return { name: detail.title || detail.diss_name || 'QQ 歌单', tracks: mapSongs(songs, false) }
  }
}

function mapSongs(list, legacy) {
  var out = []
  for (var i = 0; i < list.length; i++) {
    var song = list[i]
    var mid = legacy ? song.mid : song.mid || song.songmid
    if (!mid) continue
    var albumMid = legacy
      ? (song.album && song.album.mid)
      : (song.album && (song.album.mid || song.album.pmid))
    var artists = legacy
      ? (song.singer || []).map(function (s) { return s.name })
      : (song.singer || []).map(function (s) { return s.name })
    out.push({
      id: mid,
      title: (legacy ? song.name || song.title : song.name || song.title) || '未知标题',
      artist: artists.join(' / '),
      album: legacy ? (song.album && song.album.name) || '' : (song.album && song.album.name) || '',
      duration: legacy
        ? song.interval ? song.interval * 1000 : null
        : song.interval ? song.interval * 1000 : null,
      cover: coverOf(albumMid)
    })
  }
  return out
}