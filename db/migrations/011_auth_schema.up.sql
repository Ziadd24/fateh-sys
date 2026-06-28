-- =============================================================
-- Migration 011: Auth Schema — Users and Sessions
-- Target: SQLite
-- =============================================================

-- ─────────────────────────────────────────────
-- 1. USERS
-- ─────────────────────────────────────────────
CREATE TABLE user (
    user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'admin',
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_username ON user (username);

-- ─────────────────────────────────────────────
-- 2. SESSIONS
-- ─────────────────────────────────────────────
CREATE TABLE session (
    session_id   TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES user(user_id) ON DELETE CASCADE,
    expires_at   TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session_expires ON session (expires_at);
