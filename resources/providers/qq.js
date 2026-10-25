// QQ 音乐音源（外部脚本）
// 说明：歌单结构可免登录读取；播放地址需要登录态（vkey 返回 104009），这里只做歌单导入
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function search() {
  throw new Error('QQ 音乐搜索需要签名，暂未支持；可用「全部音源」搜索其它平台')
}

async function getMediaSource() {
  // 需要登录 cookie 才能拿 vkey
  return null
}

async function getLyric() {
  return { lrc: '' }
}

async function getUserPlaylists(uin) {
  var url =
    'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?hostuin=' +
    encodeURIComponent(uin) +
    '&format=json&inCharset=utf8&outCharset=utf-8'
  var response = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' } })
  var json = await response.json()
  var list = (json.data && json.data.disslist) || []
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
}

async function getPlaylistTracks(id) {
  var url =
    'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1' +
    '&disstid=' + encodeURIComponent(id) + '&format=json'
  var response = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' } })
  var json = await response.json()
  var cd = json.cdlist && json.cdlist[0]
  if (!cd) throw new Error('歌单不存在或不可访问')

  var tracks = (cd.songlist || [])
    .filter(function (song) { return song.mid })
    .map(function (song) {
      var albumMid = song.album && song.album.mid
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

module.exports = {
  platform: 'QQ 音乐',
  capabilities: ['playlist'],
  search: search,
  getMediaSource: getMediaSource,
  getLyric: getLyric,
  getUserPlaylists: getUserPlaylists,
  getPlaylistTracks: getPlaylistTracks
}
