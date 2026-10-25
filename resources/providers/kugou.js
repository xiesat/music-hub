// 酷狗音乐音源（外部脚本，仅搜索）
// 注意：mobilecdn.kugou.com 的证书与主机名不匹配，这里用 songsearch.kugou.com
// 播放地址需要 signature 签名与设备 id，暂不提供
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, '').trim()
}

async function search(query, page) {
  var pagesize = 20
  var url =
    'https://songsearch.kugou.com/song_search_v2?keyword=' +
    encodeURIComponent(query) +
    '&page=' +
    (page || 1) +
    '&pagesize=' +
    pagesize +
    '&platform=WebFilter&tag=em&filter=2&iscorrection=1&privilege_filter=0'
  var response = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' } })
  var json = await response.json()
  var lists = (json.data && json.data.lists) || []
  return lists.map(function (song) {
    return {
      id: song.FileHash || song.hash || '',
      title: stripTags(song.SongName || song.songname) || '未知标题',
      artist: stripTags(song.SingerName || song.singername),
      album: song.AlbumName || song.album_name || '',
      duration: song.Duration ? song.Duration * 1000 : song.duration ? song.duration * 1000 : null,
      cover: ''
    }
  }).filter(function (item) { return item.id })
}

async function getMediaSource() {
  return null
}

async function getLyric() {
  return { lrc: '' }
}

module.exports = {
  platform: '酷狗音乐',
  capabilities: ['search'],
  search: search,
  getMediaSource: getMediaSource,
  getLyric: getLyric
}