// 迁移脚本：只允许追加，永不修改已发布的条目（用 PRAGMA user_version 记录进度）

export const migrations: string[] = [
  `
  -- v1: 曲库 / 歌单 / 音源 / 下载 / 设置
  CREATE TABLE IF NOT EXISTS tracks (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL DEFAULT 'local',
    title        TEXT NOT NULL,
    artist       TEXT,
    album        TEXT,
    album_artist TEXT,
    duration_ms  INTEGER,
    track_no     INTEGER,
    disc_no      INTEGER,
    year         INTEGER,
    genre        TEXT,
    path         TEXT,
    format       TEXT,
    bitrate      INTEGER,
    sample_rate  INTEGER,
    channels     INTEGER,
    size         INTEGER,
    file_mtime   INTEGER,
    provider     TEXT,
    provider_key TEXT,
    cover_path   TEXT,
    lyric        TEXT,
    favorite     INTEGER NOT NULL DEFAULT 0,
    play_count   INTEGER NOT NULL DEFAULT 0,
    last_played  INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_track_path ON tracks(path) WHERE path IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_track_remote ON tracks(provider, provider_key) WHERE provider_key IS NOT NULL;
  CREATE INDEX IF NOT EXISTS ix_track_search ON tracks(title, artist, album);

  CREATE TABLE IF NOT EXISTS playlists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    cover_path  TEXT,
    is_system   INTEGER NOT NULL DEFAULT 0,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlist_items (
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position    REAL NOT NULL,
    added_at    INTEGER,
    PRIMARY KEY (playlist_id, track_id)
  );
  CREATE INDEX IF NOT EXISTS ix_items_order ON playlist_items(playlist_id, position);

  CREATE TABLE IF NOT EXISTS providers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    version     TEXT,
    source_type TEXT NOT NULL DEFAULT 'builtin',
    script_path TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    capabilities TEXT,
    last_ok_at  INTEGER,
    fail_count  INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT
  );

  CREATE TABLE IF NOT EXISTS downloads (
    id          TEXT PRIMARY KEY,
    track_id    TEXT,
    url         TEXT,
    target_path TEXT,
    status      TEXT NOT NULL DEFAULT 'queued',
    bytes_total INTEGER,
    bytes_done  INTEGER,
    quality     TEXT,
    error       TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  `,

  `
  -- v2: 曲库查询索引
  CREATE INDEX IF NOT EXISTS ix_track_created ON tracks(created_at DESC);
  CREATE INDEX IF NOT EXISTS ix_track_artist ON tracks(artist);
  CREATE INDEX IF NOT EXISTS ix_track_album ON tracks(album);
  `,

  `
  -- v3: path 改为普通唯一索引（部分索引无法被 ON CONFLICT(path) 命中）
  DROP INDEX IF EXISTS ux_track_path;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_track_path ON tracks(path);
  `
]