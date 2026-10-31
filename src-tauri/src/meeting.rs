use crate::persistence;
use chrono::Utc;
use serde::{Deserialize, Serialize};
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

impl MeetingStore {
    pub fn load_or_default(config_dir: &PathBuf) -> Self {
        persistence::load_json::<MeetingStore>(config_dir, "meetings.json").unwrap_or_default()
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
        let meeting = ScheduledMeeting {
            id: format!("sched-{}", Utc::now().timestamp_millis()),
            title,
            room_id,
            invite_link,
            start_time,
            duration_minutes,
            created_at: Utc::now().to_rfc3339(),
        };
        self.scheduled.push(meeting.clone());
        self.save(config_dir)?;
        Ok(meeting)
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
}
