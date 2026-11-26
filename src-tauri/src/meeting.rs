use crate::persistence;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledMeeting {
    pub id: String,
    pub title: String,
    pub room_id: String,
    #[serde(default)]
    pub invite_link: String,
    pub start_time: String,
    pub duration_minutes: u32,
    pub created_at: String,
    #[serde(default)]
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingRecord {
    pub id: String,
    pub room_id: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MeetingStore {
    pub scheduled: Vec<ScheduledMeeting>,
    pub history: Vec<MeetingRecord>,
}

/// Parse an RFC-3339 timestamp to unix seconds, `i64::MAX` on failure so a
/// malformed date sorts after every valid one instead of poisoning the sort.
fn start_ts(rfc3339: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(rfc3339)
        .map(|d| d.timestamp())
        .unwrap_or(i64::MAX)
}

/// Canonical meeting order: upcoming (`start_time >= now`) ascending by start
/// time — soonest first — then past meetings descending (most recent past first).
fn compare_chronological(a: &ScheduledMeeting, b: &ScheduledMeeting, now: i64) -> Ordering {
    let (ta, tb) = (start_ts(&a.start_time), start_ts(&b.start_time));
    match (ta < now, tb < now) {
        (false, false) => ta.cmp(&tb),
        (true, true) => tb.cmp(&ta),
        (false, true) => Ordering::Less,
        (true, false) => Ordering::Greater,
    }
}

impl MeetingStore {
    pub fn load_or_default(config_dir: &PathBuf) -> Self {
        let mut store =
            persistence::load_json::<MeetingStore>(config_dir, "meetings.json").unwrap_or_default();
        store.migrate(config_dir);
        store
    }

    pub fn save(&self, config_dir: &PathBuf) -> Result<(), String> {
        persistence::save_json(config_dir, "meetings.json", self)
    }

    pub fn add_scheduled(
        &mut self,
        title: String,
        room_id: String,
        invite_link: String,
        start_time: String,
        duration_minutes: u32,
        config_dir: &PathBuf,
    ) -> Result<ScheduledMeeting, String> {
        let id = format!("sched-{}", Utc::now().timestamp_millis());
        let meeting = ScheduledMeeting {
            id: id.clone(),
            title,
            room_id,
            invite_link,
            start_time,
            duration_minutes,
            created_at: Utc::now().to_rfc3339(),
            position: 0,
        };
        self.scheduled.push(meeting);
        self.apply_chronological_order();
        self.save(config_dir)?;
        // The sort above renumbered positions; return the stored copy so the
        // caller (and the matching push event) carries the canonical position.
        self.scheduled
            .iter()
            .find(|m| m.id == id)
            .cloned()
            .ok_or_else(|| "Scheduled meeting disappeared after insert.".to_string())
    }

    pub fn remove_scheduled(&mut self, id: &str, config_dir: &PathBuf) -> Result<bool, String> {
        let original_len = self.scheduled.len();
        self.scheduled.retain(|m| m.id != id);
        let removed = self.scheduled.len() != original_len;
        if removed {
            self.save(config_dir)?;
        }
        Ok(removed)
    }

    pub fn add_history(&mut self, room_id: String, config_dir: &PathBuf) -> Result<(), String> {
        let record = MeetingRecord {
            id: format!("rec-{}", Utc::now().timestamp_millis()),
            room_id,
            timestamp: Utc::now().to_rfc3339(),
        };
        self.history.push(record);
        if self.history.len() > 50 {
            self.history.remove(0);
        }
        self.save(config_dir)?;
        Ok(())
    }

    /// Reorder `scheduled` into the canonical upcoming-first order and renumber
    /// each meeting's persisted `position` to match its new index.
    pub fn apply_chronological_order(&mut self) {
        let now = Utc::now().timestamp();
        self.scheduled.sort_by(|a, b| compare_chronological(a, b, now));
        self.renumber();
    }

    /// Set `position` to each meeting's current index in `scheduled`.
    fn renumber(&mut self) {
        for (i, m) in self.scheduled.iter_mut().enumerate() {
            m.position = i as i64;
        }
    }

    /// Apply a user-specified order — a permuted list of meeting ids — and
    /// persist it. Ids the caller lists first take the given order; any id not
    /// listed keeps its relative order and sinks to the end.
    pub fn reorder(&mut self, ordered_ids: &[String], config_dir: &PathBuf) -> Result<(), String> {
        if ordered_ids.is_empty() {
            return Ok(());
        }
        let mut wanted: HashMap<&str, usize> = HashMap::with_capacity(ordered_ids.len());
        for (i, id) in ordered_ids.iter().enumerate() {
            wanted.insert(id.as_str(), i);
        }
        self.scheduled.sort_by(|a, b| {
            match (wanted.get(a.id.as_str()), wanted.get(b.id.as_str())) {
                (Some(x), Some(y)) => x.cmp(y),
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                (None, None) => Ordering::Equal,
            }
        });
        self.renumber();
        self.save(config_dir)
    }

    /// Update a meeting's title/time/duration in place, re-apply the canonical
    /// order (a changed `start_time` can move its slot), and persist.
    pub fn edit_scheduled(
        &mut self,
        id: &str,
        title: String,
        start_time: String,
        duration_minutes: u32,
        config_dir: &PathBuf,
    ) -> Result<ScheduledMeeting, String> {
        {
            let meeting = self
                .scheduled
                .iter_mut()
                .find(|m| m.id == id)
                .ok_or_else(|| "Meeting not found.".to_string())?;
            meeting.title = title;
            meeting.start_time = start_time;
            meeting.duration_minutes = duration_minutes;
        }
        self.apply_chronological_order();
        self.save(config_dir)?;
        self.scheduled
            .iter()
            .find(|m| m.id == id)
            .cloned()
            .ok_or_else(|| "Meeting disappeared after edit.".to_string())
    }

    /// One-time upgrade for stores written before `position` existed: give the
    /// list a real chronological order so read-time sorting is meaningful.
    fn migrate(&mut self, config_dir: &PathBuf) {
        if self.scheduled.len() > 1 && self.scheduled.iter().all(|m| m.position == 0) {
            self.apply_chronological_order();
            // Best-effort: a read-only store should still load.
            let _ = self.save(config_dir);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meeting(id: &str, title: &str, start: &str, position: i64) -> ScheduledMeeting {
        ScheduledMeeting {
            id: id.to_string(),
            title: title.to_string(),
            room_id: format!("room-{id}"),
            invite_link: String::new(),
            start_time: start.to_string(),
            duration_minutes: 30,
            created_at: String::new(),
            position,
        }
    }

    #[test]
    fn chronological_order_puts_upcoming_first_then_past_newest_first() {
        let mut store = MeetingStore {
            scheduled: vec![
                meeting("a", "old-past", "2000-01-02T10:00:00Z", 0),
                meeting("b", "later-upcoming", "2999-01-02T10:00:00Z", 0),
                meeting("c", "new-past", "2000-01-03T10:00:00Z", 0),
                meeting("d", "sooner-upcoming", "2999-01-01T10:00:00Z", 0),
            ],
            history: vec![],
        };

        store.apply_chronological_order();

        let order: Vec<&str> = store.scheduled.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(order, vec!["d", "b", "c", "a"]);
        for (i, m) in store.scheduled.iter().enumerate() {
            assert_eq!(m.position, i as i64);
        }
    }

    #[test]
    fn reorder_applies_the_requested_id_order_and_persists() {
        let dir = std::env::temp_dir().join(format!("vt-meetings-reorder-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::create_dir_all(&dir);
        let path = std::path::PathBuf::from(&dir);

        let mut store = MeetingStore {
            scheduled: vec![
                meeting("a", "A", "2999-01-01T10:00:00Z", 0),
                meeting("b", "B", "2999-01-02T10:00:00Z", 1),
                meeting("c", "C", "2999-01-03T10:00:00Z", 2),
            ],
            history: vec![],
        };

        store
            .reorder(&["c".to_string(), "a".to_string(), "b".to_string()], &path)
            .unwrap();

        let order: Vec<&str> = store.scheduled.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(order, vec!["c", "a", "b"]);
        for (i, m) in store.scheduled.iter().enumerate() {
            assert_eq!(m.position, i as i64);
        }

        // Reload from disk to confirm the order is persisted, not just in memory.
        let reloaded = MeetingStore::load_or_default(&path);
        let order2: Vec<&str> = reloaded.scheduled.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(order2, vec!["c", "a", "b"]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn edit_updates_fields_and_reorders_on_time_change() {
        let dir = std::env::temp_dir().join(format!("vt-meetings-edit-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::create_dir_all(&dir);
        let path = std::path::PathBuf::from(&dir);

        let mut store = MeetingStore {
            scheduled: vec![
                meeting("a", "A", "2999-01-02T10:00:00Z", 0),
                meeting("b", "B", "2999-01-01T10:00:00Z", 1),
            ],
            history: vec![],
        };
        store.save(&path).unwrap();

        let edited = store
            .edit_scheduled(
                "a",
                "A renamed".to_string(),
                "2999-01-01T09:00:00Z".to_string(),
                45,
                &path,
            )
            .unwrap();
        assert_eq!(edited.title, "A renamed");
        assert_eq!(edited.duration_minutes, 45);

        // "a" now starts before "b", so the upcoming-first order swaps them.
        let order: Vec<&str> = store.scheduled.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(order, vec!["a", "b"]);

        // Unknown id is an error, not a panic.
        assert!(store
            .edit_scheduled("nope", "X".into(), "2999-01-01T00:00:00Z".into(), 1, &path)
            .is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
