//! Persistent SQLite storage for the Tauri app. Data is stored in app data dir
//! so it survives app updates and is never cleared by the system.

use rusqlite::{params, Connection};
use serde::Deserialize;
use std::path::PathBuf;

const DB_VERSION: u32 = 1;

pub struct AppDb {
    path: PathBuf,
}

impl AppDb {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn conn(&self) -> rusqlite::Result<Connection> {
        let conn = Connection::open(&self.path)?;
        Self::migrate(&conn)?;
        Ok(conn)
    }

    fn migrate(conn: &Connection) -> rusqlite::Result<()> {
        // Ensure meta table exists so we can read version (new DB has no tables yet)
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER);
             INSERT OR IGNORE INTO meta (key, value) VALUES ('version', 0);",
        )?;
        let version: u32 = conn
            .query_row("SELECT value FROM meta WHERE key = 'version'", [], |r| {
                r.get(0)
            })
            .unwrap_or(0);
        if version >= DB_VERSION {
            return Ok(());
        }
        if version == 0 {
            conn.execute_batch(
                r#"
                CREATE TABLE tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL, sync_status TEXT NOT NULL, data TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS tasks_user_id ON tasks(user_id);
                CREATE INDEX IF NOT EXISTS tasks_user_date ON tasks(user_id, date);
                CREATE INDEX IF NOT EXISTS tasks_sync_status ON tasks(sync_status);

                CREATE TABLE completions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, user_id TEXT NOT NULL, date TEXT NOT NULL, sync_status TEXT NOT NULL, data TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS comp_task_id ON completions(task_id);
                CREATE INDEX IF NOT EXISTS comp_user_date ON completions(user_id, date);

                CREATE TABLE notifications (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_at TEXT NOT NULL, data TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS notif_task_id ON notifications(task_id);
                CREATE INDEX IF NOT EXISTS notif_scheduled_at ON notifications(scheduled_at);

                CREATE TABLE users (id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE sessions (user_id TEXT PRIMARY KEY, data TEXT NOT NULL);

                CREATE TABLE sync_queue (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, data TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS sync_created_at ON sync_queue(created_at);
                "#,
            )?;
        }
        conn.execute(
            "UPDATE meta SET value = ?1 WHERE key = 'version'",
            [DB_VERSION],
        )?;
        Ok(())
    }
}

// ─── Command payloads (JSON from frontend) ────────────────────────────────────

#[derive(Deserialize)]
#[serde(tag = "method", rename_all = "camelCase")]
pub enum DbMethod {
    SaveTask {
        task: serde_json::Value,
    },
    GetTask {
        id: String,
    },
    #[serde(rename_all = "camelCase")]
    GetTasksByUserAndDate {
        user_id: String,
        date: String,
    },
    #[serde(rename_all = "camelCase")]
    GetAllTasksByUser {
        user_id: String,
    },
    #[serde(rename_all = "camelCase")]
    GetAllTasksByUserForSync {
        user_id: String,
    },
    DeleteTask {
        id: String,
    },
    #[serde(rename_all = "camelCase")]
    GetRepeatTasksByUser {
        user_id: String,
    },

    SaveCompletion {
        completion: serde_json::Value,
    },
    #[serde(rename_all = "camelCase")]
    GetCompletionsByUserAndDate {
        user_id: String,
        date: String,
    },
    #[serde(rename_all = "camelCase")]
    GetCompletionsByTask {
        task_id: String,
    },
    #[serde(rename_all = "camelCase")]
    GetAllCompletionsByUser {
        user_id: String,
    },
    DeleteCompletion {
        id: String,
    },
    #[serde(rename_all = "camelCase")]
    ReplaceTasksAndCompletionsFromServer {
        user_id: String,
        tasks: Vec<serde_json::Value>,
        completions: Vec<serde_json::Value>,
    },

    SaveNotification {
        notification: serde_json::Value,
    },
    GetPendingNotifications,
    MarkNotificationFired {
        id: String,
    },
    #[serde(rename_all = "camelCase")]
    DeleteNotificationsByTask {
        task_id: String,
    },

    SaveUser {
        user: serde_json::Value,
    },
    GetUser {
        id: String,
    },
    SaveSession {
        session: serde_json::Value,
    },
    #[serde(rename_all = "camelCase")]
    GetSession {
        user_id: String,
    },
    GetAnySession,
    #[serde(rename_all = "camelCase")]
    DeleteSession {
        user_id: String,
    },

    AddToSyncQueue {
        item: serde_json::Value,
    },
    GetSyncQueue,
    RemoveSyncQueueItem {
        id: String,
    },

    ClearAll,
}

fn task_row(value: &serde_json::Value) -> (String, String, String, String, String) {
    let user_id = value["userId"].as_str().unwrap_or("").to_string();
    let date = value["date"].as_str().unwrap_or("").to_string();
    let sync_status = value["syncStatus"].as_str().unwrap_or("synced").to_string();
    let data = serde_json::to_string(value).unwrap_or_default();
    let id = value["id"].as_str().unwrap_or("").to_string();
    (id, user_id, date, sync_status, data)
}

fn completion_row(value: &serde_json::Value) -> (String, String, String, String, String, String) {
    let id = value["id"].as_str().unwrap_or("").to_string();
    let task_id = value["taskId"].as_str().unwrap_or("").to_string();
    let user_id = value["userId"].as_str().unwrap_or("").to_string();
    let date = value["date"].as_str().unwrap_or("").to_string();
    let sync_status = value["syncStatus"].as_str().unwrap_or("synced").to_string();
    let data = serde_json::to_string(value).unwrap_or_default();
    (id, task_id, user_id, date, sync_status, data)
}

fn notification_row(value: &serde_json::Value) -> (String, String, String, String) {
    let id = value["id"].as_str().unwrap_or("").to_string();
    let task_id = value["taskId"].as_str().unwrap_or("").to_string();
    let scheduled_at = value["scheduledAt"].as_str().unwrap_or("").to_string();
    let data = serde_json::to_string(value).unwrap_or_default();
    (id, task_id, scheduled_at, data)
}

fn sync_queue_row(value: &serde_json::Value) -> (String, String, String) {
    let id = value["id"].as_str().unwrap_or("").to_string();
    let created_at = value["createdAt"].as_str().unwrap_or("").to_string();
    let data = serde_json::to_string(value).unwrap_or_default();
    (id, created_at, data)
}

pub fn db_exec(state: tauri::State<AppDb>, method: DbMethod) -> Result<serde_json::Value, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;

    match method {
        DbMethod::SaveTask { task } => {
            let (id, user_id, date, sync_status, data) = task_row(&task);
            conn.execute(
                "INSERT OR REPLACE INTO tasks (id, user_id, date, sync_status, data) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, user_id, date, sync_status, data],
            )
            .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }
        DbMethod::GetTask { id } => {
            let row: Option<String> = conn
                .query_row("SELECT data FROM tasks WHERE id = ?1", [&id], |r| r.get(0))
                .ok();
            Ok(row
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(serde_json::Value::Null))
        }
        DbMethod::GetTasksByUserAndDate { user_id, date } => {
            let mut stmt = conn
                .prepare("SELECT data FROM tasks WHERE user_id = ?1 AND date = ?2")
                .map_err(|e| e.to_string())?;
            let rows: Vec<String> = stmt
                .query_map(params![user_id, date], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect();
            let out: Vec<serde_json::Value> = rows
                .iter()
                .filter_map(|s| serde_json::from_str(s).ok())
                .filter(|v: &serde_json::Value| v["deletedAt"].is_null())
                .collect();
            Ok(serde_json::to_value(out).map_err(|e| e.to_string())?)
        }
        DbMethod::GetAllTasksByUser { user_id } => {
            let mut stmt = conn
                .prepare("SELECT data FROM tasks WHERE user_id = ?1")
                .map_err(|e| e.to_string())?;
            let rows: Vec<String> = stmt
                .query_map([&user_id], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect();
            let out: Vec<serde_json::Value> = rows
                .iter()
                .filter_map(|s| serde_json::from_str(s).ok())
                .filter(|v: &serde_json::Value| v["deletedAt"].is_null())
                .collect();
            Ok(serde_json::to_value(out).map_err(|e| e.to_string())?)
        }
        DbMethod::GetAllTasksByUserForSync { user_id } => {
            let mut stmt = conn
                .prepare("SELECT data FROM tasks WHERE user_id = ?1")
                .map_err(|e| e.to_string())?;
            let rows: Vec<String> = stmt
                .query_map([&user_id], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect();
            let out: Vec<serde_json::Value> = rows
                .iter()
                .filter_map(|s| serde_json::from_str(s).ok())
                .collect();
            Ok(serde_json::to_value(out).map_err(|e| e.to_string())?)
        }
        DbMethod::DeleteTask { id } => {
            let row: Option<String> = conn
                .query_row("SELECT data FROM tasks WHERE id = ?1", [&id], |r| r.get(0))
                .ok();
            if let Some(data) = row {
                let mut task: serde_json::Value =
                    serde_json::from_str(&data).map_err(|e| e.to_string())?;
                let now = chrono::Utc::now().to_rfc3339();
                task["deletedAt"] = serde_json::json!(now);
                task["updatedAt"] = serde_json::json!(now);
                task["syncStatus"] = serde_json::json!("pending");
                let (id, user_id, date, _, data) = task_row(&task);
                conn.execute(
                    "INSERT OR REPLACE INTO tasks (id, user_id, date, sync_status, data) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![id, user_id, date, "pending", data],
                )
                .map_err(|e| e.to_string())?;
            }
            Ok(serde_json::Value::Null)
        }
        DbMethod::GetRepeatTasksByUser { user_id } => {
            let mut stmt = conn
                .prepare("SELECT data FROM tasks WHERE user_id = ?1")
                .map_err(|e| e.to_string())?;
            let rows: Vec<String> = stmt
                .query_map([&user_id], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect();
            let out: Vec<serde_json::Value> = rows
                .iter()
                .filter_map(|s| serde_json::from_str(s).ok())
                .filter(|v: &serde_json::Value| {
                    v["isRepeating"].as_bool().unwrap_or(false) && v["deletedAt"].is_null()
                })
                .collect();
            Ok(serde_json::to_value(out).map_err(|e| e.to_string())?)
        }

        DbMethod::SaveCompletion { completion } => {
            let (id, task_id, user_id, date, sync_status, data) = completion_row(&completion);
            conn.execute(
                "INSERT OR REPLACE INTO completions (id, task_id, user_id, date, sync_status, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, task_id, user_id, date, sync_status, data],
            )
            .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }
        DbMethod::GetCompletionsByUserAndDate { user_id, date } => {
            let mut stmt = conn
                .prepare("SELECT data FROM completions WHERE user_id = ?1 AND date = ?2")
                .map_err(|e| e.to_string())?;
            let rows: Vec<String> = stmt
                .query_map(params![user_id, date], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect();
            let out: Vec<serde_json::Value> = rows
                .iter()
                .filter_map(|s| serde_json::from_str(s).ok())
                .collect();
            Ok(serde_json::to_value(out).map_err(|e| e.to_string())?)
        }
        DbMethod::GetCompletionsByTask { task_id } => {
            let mut stmt = conn
                .prepare("SELECT data FROM completions WHERE task_id = ?1")
                .map_err(|e| e.to_string())?;
            let rows: Vec<String> = stmt
                .query_map([&task_id], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect();
            let out: Vec<serde_json::Value> = rows
                .iter()
                .filter_map(|s| serde_json::from_str(s).ok())
                .collect();
            Ok(serde_json::to_value(out).map_err(|e| e.to_string())?)
        }
        DbMethod::GetAllCompletionsByUser { user_id } => {
            let mut stmt = conn
                .prepare("SELECT data FROM completions WHERE user_id = ?1")
                .map_err(|e| e.to_string())?;
            let rows: Vec<String> = stmt
                .query_map([&user_id], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect();
            let out: Vec<serde_json::Value> = rows
                .iter()
                .filter_map(|s| serde_json::from_str(s).ok())
                .collect();
            Ok(serde_json::to_value(out).map_err(|e| e.to_string())?)
        }
        DbMethod::DeleteCompletion { id } => {
            conn.execute("DELETE FROM completions WHERE id = ?1", [&id])
                .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }
        DbMethod::ReplaceTasksAndCompletionsFromServer {
            user_id,
            tasks,
            completions,
        } => {
            let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM tasks WHERE user_id = ?1", [&user_id])
                .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM completions WHERE user_id = ?1", [&user_id])
                .map_err(|e| e.to_string())?;
            for t in &tasks {
                let (id, uid, date, _, data) = task_row(t);
                let data_merged =
                    if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&data) {
                        v["syncStatus"] = serde_json::json!("synced");
                        serde_json::to_string(&v).unwrap_or(data)
                    } else {
                        data
                    };
                tx.execute(
                    "INSERT OR REPLACE INTO tasks (id, user_id, date, sync_status, data) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![id, uid, date, "synced", data_merged],
                )
                .map_err(|e| e.to_string())?;
            }
            for c in &completions {
                let (id, task_id, uid, date, _, data) = completion_row(c);
                let data_merged =
                    if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&data) {
                        v["syncStatus"] = serde_json::json!("synced");
                        serde_json::to_string(&v).unwrap_or(data)
                    } else {
                        data
                    };
                tx.execute(
                    "INSERT OR REPLACE INTO completions (id, task_id, user_id, date, sync_status, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![id, task_id, uid, date, "synced", data_merged],
                )
                .map_err(|e| e.to_string())?;
            }
            tx.commit().map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }

        DbMethod::SaveNotification { notification } => {
            let (id, task_id, scheduled_at, data) = notification_row(&notification);
            conn.execute(
                "INSERT OR REPLACE INTO notifications (id, task_id, scheduled_at, data) VALUES (?1, ?2, ?3, ?4)",
                params![id, task_id, scheduled_at, data],
            )
            .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }
        DbMethod::GetPendingNotifications => {
            let mut stmt = conn
                .prepare("SELECT data FROM notifications")
                .map_err(|e| e.to_string())?;
            let rows: Vec<String> = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect();
            let out: Vec<serde_json::Value> = rows
                .iter()
                .filter_map(|s| serde_json::from_str(s).ok())
                .filter(|v: &serde_json::Value| !v["fired"].as_bool().unwrap_or(true))
                .collect();
            Ok(serde_json::to_value(out).map_err(|e| e.to_string())?)
        }
        DbMethod::MarkNotificationFired { id } => {
            let row: Option<String> = conn
                .query_row("SELECT data FROM notifications WHERE id = ?1", [&id], |r| {
                    r.get(0)
                })
                .ok();
            if let Some(data) = row {
                let mut notif: serde_json::Value =
                    serde_json::from_str(&data).map_err(|e| e.to_string())?;
                notif["fired"] = serde_json::json!(true);
                let (id, task_id, scheduled_at, data) = notification_row(&notif);
                conn.execute(
                    "INSERT OR REPLACE INTO notifications (id, task_id, scheduled_at, data) VALUES (?1, ?2, ?3, ?4)",
                    params![id, task_id, scheduled_at, data],
                )
                .map_err(|e| e.to_string())?;
            }
            Ok(serde_json::Value::Null)
        }
        DbMethod::DeleteNotificationsByTask { task_id } => {
            conn.execute("DELETE FROM notifications WHERE task_id = ?1", [&task_id])
                .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }

        DbMethod::SaveUser { user } => {
            let id = user["id"].as_str().unwrap_or("").to_string();
            let data = serde_json::to_string(&user).unwrap_or_default();
            conn.execute(
                "INSERT OR REPLACE INTO users (id, data) VALUES (?1, ?2)",
                params![id, data],
            )
            .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }
        DbMethod::GetUser { id } => {
            let row: Option<String> = conn
                .query_row("SELECT data FROM users WHERE id = ?1", [&id], |r| r.get(0))
                .ok();
            Ok(row
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(serde_json::Value::Null))
        }
        DbMethod::SaveSession { session } => {
            let user_id = session["userId"].as_str().unwrap_or("").to_string();
            let data = serde_json::to_string(&session).unwrap_or_default();
            conn.execute(
                "INSERT OR REPLACE INTO sessions (user_id, data) VALUES (?1, ?2)",
                params![user_id, data],
            )
            .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }
        DbMethod::GetSession { user_id } => {
            let row: Option<String> = conn
                .query_row(
                    "SELECT data FROM sessions WHERE user_id = ?1",
                    [&user_id],
                    |r| r.get(0),
                )
                .ok();
            Ok(row
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(serde_json::Value::Null))
        }
        DbMethod::GetAnySession => {
            let row: Option<String> = conn
                .query_row("SELECT data FROM sessions LIMIT 1", [], |r| r.get(0))
                .ok();
            Ok(row
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(serde_json::Value::Null))
        }
        DbMethod::DeleteSession { user_id } => {
            conn.execute("DELETE FROM sessions WHERE user_id = ?1", [&user_id])
                .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }

        DbMethod::AddToSyncQueue { item } => {
            let (id, created_at, data) = sync_queue_row(&item);
            conn.execute(
                "INSERT OR REPLACE INTO sync_queue (id, created_at, data) VALUES (?1, ?2, ?3)",
                params![id, created_at, data],
            )
            .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }
        DbMethod::GetSyncQueue => {
            let mut stmt = conn
                .prepare("SELECT data FROM sync_queue ORDER BY created_at")
                .map_err(|e| e.to_string())?;
            let rows: Vec<String> = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .collect();
            let out: Vec<serde_json::Value> = rows
                .iter()
                .filter_map(|s| serde_json::from_str(s).ok())
                .collect();
            Ok(serde_json::to_value(out).map_err(|e| e.to_string())?)
        }
        DbMethod::RemoveSyncQueueItem { id } => {
            conn.execute("DELETE FROM sync_queue WHERE id = ?1", [&id])
                .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }
        DbMethod::ClearAll => {
            conn.execute_batch(
                "DELETE FROM tasks; DELETE FROM completions; DELETE FROM notifications; DELETE FROM users; DELETE FROM sessions; DELETE FROM sync_queue;",
            )
            .map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        }
    }
}
