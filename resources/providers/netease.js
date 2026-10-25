// 网易云音乐音源（外部脚本）
// 导出：{ platform, search, getMediaSource, getLyric, getUserPlaylists, getPlaylistTracks }
// 可用全局：fetch（自动管理 cookie）、URL、URLSearchParams、TextEncoder/Decoder、setTimeout、crypto.randomUUID、console

var BASE = 'https://music.163.com'
var cookieReadyAt = 0

function cover(url) {
  if (!url) return ''
  return url.replace(/^http:/, 'https:') + '?param=200y200'
}

// 先访问首页拿游客 cookie，之后取播放地址才有效
async function ensureCookies() {
  if (Date.now() - cookieReadyAt < 20 * 60 * 1000) return
  try {
    await fetch(BASE + '/', { headers: { Referer: BASE + '/' } })
  } catch (e) {}
  cookieReadyAt = Date.now()
}

async function search(query, page) {
  var limit = 30
  var offset = ((page || 1) - 1) * limit
  var body =
    's=' + encodeURIComponent(query) + '&type=1&limit=' + limit + '&offset=' + offset + '&total=true'
  var response = await fetch(BASE + '/api/cloudsearch/pc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: BASE + '/' },
    body: body
  })
  var json = await response.json()
  if (json.code && json.code !== 200) throw new Error('搜索失败 code ' + json.code)
  var songs = (json.result && json.result.songs) || []
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
}

async function getMediaSource(track) {
  await ensureCookies()
  var urls = [
    BASE + '/api/song/enhance/player/url/v1?ids=%5B' + track.id + '%5D&level=standard&encodeType=mp3',
    BASE + '/api/song/enhance/player/url?ids=%5B' + track.id + '%5D&br=320000'
  ]
  for (var i = 0; i < urls.length; i++) {
    try {
      var response = await fetch(urls[i], { headers: { Referer: BASE + '/' } })
      var json = await response.json()
      var first = json.data && json.data[0]
      if (first && first.url) return { url: first.url }
    } catch (e) {}
  }
  return null
}

async function getLyric(track) {
  var response = await fetch(BASE + '/api/song/lyric?id=' + track.id + '&lv=1&kv=1&tv=-1', {
    headers: { Referer: BASE + '/' }
  })
  var json = await response.json()
  return { lrc: (json.lrc && json.lrc.lyric) || '' }
}

async function getUserPlaylists(uid) {
  var response = await fetch(BASE + '/api/user/playlist?uid=' + encodeURIComponent(uid) + '&limit=100&offset=0', {
    headers: { Referer: BASE + '/' }
  })
  var json = await response.json()
  if (json.code !== 200) throw new Error('查询失败 code ' + json.code)
  return (json.playlist || []).map(function (item) {
    return {
      id: String(item.id),
      name: item.name,
      trackCount: item.trackCount || 0,
      coverUrl: cover(item.coverImgUrl)
    }
  })
}

async function getPlaylistTracks(id) {
  var response = await fetch(BASE + '/api/v6/playlist/detail?id=' + encodeURIComponent(id) + '&n=1000&s=0', {
    headers: { Referer: BASE + '/' }
  })
  var json = await response.json()
  if (json.code !== 200 || !json.playlist) throw new Error('歌单不存在或不可访问')
  var tracks = (json.playlist.tracks || []).map(function (song) {
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

module.exports = {
  platform: '网易云音乐',
  capabilities: ['search', 'stream', 'lyric', 'playlist'],
  search: search,
  getMediaSource: getMediaSource,
  getLyric: getLyric,
  getUserPlaylists: getUserPlaylists,
  getPlaylistTracks: getPlaylistTracks
}
