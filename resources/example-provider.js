// 音源脚本示例：演示 sandbox 支持的 API（可直接导入试跑）
// 可用全局对象：fetch / URL / URLSearchParams / TextEncoder / TextDecoder
//              setTimeout / clearTimeout / btoa / atob / crypto.randomUUID / console
// 导出：{ platform, search, getMediaSource, getLyric }

const API = 'https://music.163.com'

async function search(query, page) {
  const limit = 20
  const offset = ((page || 1) - 1) * limit
  const url =
    API +
    '/api/search/get/web?s=' +
    encodeURIComponent(query) +
    '&type=1&limit=' +
    limit +
    '&offset=' +
    offset
  const response = await fetch(url)
  const json = await response.json()
  const songs = (json.result && json.result.songs) || []
  return songs.map(function (song) {
    return {
      id: String(song.id),
      title: song.name,
      artist: song.artists.map(function (a) { return a.name }).join(' / '),
      album: song.album ? song.album.name : '',
      duration: song.duration,
      cover: song.album && song.album.picUrl ? song.album.picUrl : ''
    }
  })
}

async function getMediaSource(track) {
  const url = API + '/api/song/enhance/player/url?ids=%5B' + track.id + '%5D&br=320000'
  const response = await fetch(url)
  const json = await response.json()
  const first = json.data && json.data[0]
  return first && first.url ? { url: first.url } : null
}

async function getLyric(track) {
  const url = API + '/api/song/lyric?id=' + track.id + '&lv=1&kv=1&tv=-1'
  const response = await fetch(url)
  const json = await response.json()
  return { lrc: (json.lrc && json.lrc.lyric) || '' }
}

module.exports = {
  platform: '网易云（脚本示例）',
  search: search,
  getMediaSource: getMediaSource,
  getLyric: getLyric
}
