use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents a single participant in a meeting
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Participant {
    pub id: String,
    pub name: String,
    pub is_local: bool,
    pub is_screen: bool,
    pub is_muted: bool,
    pub video_enabled: bool,
    pub audio_enabled: bool,
}

/// Manages participants in a meeting session
pub struct ParticipantManager {
    participants: HashMap<String, Participant>,
}

impl ParticipantManager {
    /// Create a new participant manager
    pub fn new() -> Self {
        ParticipantManager {
            participants: HashMap::new(),
        }
    }

    /// Add or update a participant
    pub fn add_participant(&mut self, participant: Participant) -> bool {
        self.participants.insert(participant.id.clone(), participant).is_none()
    }

    /// Remove a participant
    pub fn remove_participant(&mut self, participant_id: &str) -> bool {
        self.participants.remove(participant_id).is_some()
    }

    /// Get all participants
    pub fn get_all(&self) -> Vec<Participant> {
        self.participants.values().cloned().collect()
    }

    /// Get a specific participant
    pub fn get_participant(&self, participant_id: &str) -> Option<Participant> {
        self.participants.get(participant_id).cloned()
    }

    /// Update participant's audio status
    pub fn set_participant_muted(&mut self, participant_id: &str, muted: bool) -> bool {
        if let Some(participant) = self.participants.get_mut(participant_id) {
            participant.is_muted = muted;
            true
        } else {
            false
        }
    }

    /// Update participant's video status
    pub fn set_participant_video_enabled(&mut self, participant_id: &str, enabled: bool) -> bool {
        if let Some(participant) = self.participants.get_mut(participant_id) {
            participant.video_enabled = enabled;
            true
        } else {
            false
        }
    }

    /// Get all remote participants (non-local)
    pub fn get_remote_participants(&self) -> Vec<Participant> {
        self.participants
            .values()
            .filter(|p| !p.is_local)
            .cloned()
            .collect()
    }

    /// Get all screen shares
    pub fn get_screen_shares(&self) -> Vec<Participant> {
        self.participants
            .values()
            .filter(|p| p.is_screen)
            .cloned()
            .collect()
    }

    /// Get the active screen share (first one found)
    pub fn get_active_screen_share(&self) -> Option<Participant> {
        self.participants
            .values()
            .find(|p| p.is_screen)
            .cloned()
    }

    /// Get participant count
    pub fn count(&self) -> usize {
        self.participants.len()
    }

    /// Clear all participants
    pub fn clear(&mut self) {
        self.participants.clear();
    }

    /// Remove screen share publications
    pub fn remove_screen_share(&mut self, participant_id: &str) {
        let screen_id = format!("{}-screen", participant_id);
        self.participants.remove(&screen_id);
    }

    /// Check if participant exists
    pub fn exists(&self, participant_id: &str) -> bool {
        self.participants.contains_key(participant_id)
    }

    /// Get participants sorted by join time (most recent first)
    pub fn get_sorted(&self) -> Vec<Participant> {
        let mut participants = self.get_all();
        // Local participant always comes first
        participants.sort_by(|a, b| {
            if a.is_local {
                std::cmp::Ordering::Less
            } else if b.is_local {
                std::cmp::Ordering::Greater
            } else {
                a.id.cmp(&b.id)
            }
        });
        participants
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_participant() {
        let mut manager = ParticipantManager::new();
        let participant = Participant {
            id: "user1".to_string(),
            name: "Alice".to_string(),
            is_local: true,
            is_screen: false,
            is_muted: false,
            video_enabled: true,
            audio_enabled: true,
        };
        assert!(manager.add_participant(participant));
        assert_eq!(manager.count(), 1);
    }

    #[test]
    fn test_screen_share_management() {
        let mut manager = ParticipantManager::new();
        let screen = Participant {
            id: "user1-screen".to_string(),
            name: "Alice's Screen".to_string(),
            is_local: false,
            is_screen: true,
            is_muted: false,
            video_enabled: true,
            audio_enabled: false,
        };
        manager.add_participant(screen);
        assert!(manager.get_active_screen_share().is_some());
        
        manager.remove_screen_share("user1");
        assert!(manager.get_active_screen_share().is_none());
    }

    #[test]
    fn test_remove_participant() {
        let mut manager = ParticipantManager::new();
        let participant = Participant {
            id: "user1".to_string(),
            name: "Alice".to_string(),
            is_local: true,
            is_screen: false,
            is_muted: false,
            video_enabled: true,
            audio_enabled: true,
        };
        manager.add_participant(participant);
        assert!(manager.remove_participant("user1"));
        assert_eq!(manager.count(), 0);
        assert!(!manager.remove_participant("nonexistent"));
    }

    #[test]
    fn test_mute_participant() {
        let mut manager = ParticipantManager::new();
        let participant = Participant {
            id: "user1".to_string(),
            name: "Alice".to_string(),
            is_local: false,
            is_screen: false,
            is_muted: false,
            video_enabled: true,
            audio_enabled: true,
        };
        manager.add_participant(participant);
        
        assert!(manager.set_participant_muted("user1", true));
        let muted_participant = manager.get_participant("user1").unwrap();
        assert!(muted_participant.is_muted);
        
        assert!(manager.set_participant_muted("user1", false));
        let unmuted_participant = manager.get_participant("user1").unwrap();
        assert!(!unmuted_participant.is_muted);
    }

    #[test]
    fn test_video_enabled_toggle() {
        let mut manager = ParticipantManager::new();
        let participant = Participant {
            id: "user1".to_string(),
            name: "Alice".to_string(),
            is_local: false,
            is_screen: false,
            is_muted: false,
            video_enabled: true,
            audio_enabled: true,
        };
        manager.add_participant(participant);
        
        assert!(manager.set_participant_video_enabled("user1", false));
        let participant = manager.get_participant("user1").unwrap();
        assert!(!participant.video_enabled);
    }

    #[test]
    fn test_get_remote_participants() {
        let mut manager = ParticipantManager::new();
        
        let local = Participant {
            id: "me".to_string(),
            name: "Me".to_string(),
            is_local: true,
            is_screen: false,
            is_muted: false,
            video_enabled: true,
            audio_enabled: true,
        };
        
        let remote = Participant {
            id: "user1".to_string(),
            name: "Alice".to_string(),
            is_local: false,
            is_screen: false,
            is_muted: false,
            video_enabled: true,
            audio_enabled: true,
        };
        
        manager.add_participant(local);
        manager.add_participant(remote);
        
        let remotes = manager.get_remote_participants();
        assert_eq!(remotes.len(), 1);
        assert_eq!(remotes[0].id, "user1");
    }

    #[test]
    fn test_clear_participants() {
        let mut manager = ParticipantManager::new();
        for i in 0..5 {
            let participant = Participant {
                id: format!("user{}", i),
                name: format!("User {}", i),
                is_local: false,
                is_screen: false,
                is_muted: false,
                video_enabled: true,
                audio_enabled: true,
            };
            manager.add_participant(participant);
        }
        assert_eq!(manager.count(), 5);
        manager.clear();
        assert_eq!(manager.count(), 0);
    }

    #[test]
    fn test_get_sorted_participants() {
        let mut manager = ParticipantManager::new();
        
        let remote1 = Participant {
            id: "b".to_string(),
            name: "Bob".to_string(),
            is_local: false,
            is_screen: false,
            is_muted: false,
            video_enabled: true,
            audio_enabled: true,
        };
        
        let remote2 = Participant {
            id: "a".to_string(),
            name: "Alice".to_string(),
            is_local: false,
            is_screen: false,
            is_muted: false,
            video_enabled: true,
            audio_enabled: true,
        };
        
        let local = Participant {
            id: "me".to_string(),
            name: "Me".to_string(),
            is_local: true,
            is_screen: false,
            is_muted: false,
            video_enabled: true,
            audio_enabled: true,
        };
        
        manager.add_participant(remote1);
        manager.add_participant(remote2);
        manager.add_participant(local);
        
        let sorted = manager.get_sorted();
        // Local participant should be first
        assert!(sorted[0].is_local);
        assert_eq!(sorted.len(), 3);
    }
}
