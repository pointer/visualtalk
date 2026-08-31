use serde::{Deserialize, Serialize};

/// Represents a media device (microphone or camera)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MediaDevice {
    pub id: String,
    pub label: String,
    pub kind: DeviceKind,
    pub group_id: Option<String>,
}

/// Type of media device
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum DeviceKind {
    #[serde(rename = "audioinput")]
    AudioInput,
    #[serde(rename = "audiooutput")]
    AudioOutput,
    #[serde(rename = "videoinput")]
    VideoInput,
}

/// Device preferences for a user
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DevicePreferences {
    pub preferred_mic_id: Option<String>,
    pub preferred_camera_id: Option<String>,
    pub preferred_speaker_id: Option<String>,
}

/// Manages media devices and preferences
pub struct DeviceManager {
    devices: Vec<MediaDevice>,
    preferences: DevicePreferences,
}

impl DeviceManager {
    /// Create a new device manager
    pub fn new() -> Self {
        DeviceManager {
            devices: Vec::new(),
            preferences: DevicePreferences {
                preferred_mic_id: None,
                preferred_camera_id: None,
                preferred_speaker_id: None,
            },
        }
    }

    /// Set the devices list (called after enumerating devices from frontend)
    pub fn set_devices(&mut self, devices: Vec<MediaDevice>) {
        self.devices = devices;
    }

    /// Set device preferences
    pub fn set_preferences(&mut self, preferences: DevicePreferences) {
        self.preferences = preferences;
    }

    /// Get all audio input devices
    pub fn get_audio_inputs(&self) -> Vec<MediaDevice> {
        self.devices
            .iter()
            .filter(|d| d.kind == DeviceKind::AudioInput)
            .cloned()
            .collect()
    }

    /// Get all video input devices
    pub fn get_video_inputs(&self) -> Vec<MediaDevice> {
        self.devices
            .iter()
            .filter(|d| d.kind == DeviceKind::VideoInput)
            .cloned()
            .collect()
    }

    /// Get all audio output devices
    pub fn get_audio_outputs(&self) -> Vec<MediaDevice> {
        self.devices
            .iter()
            .filter(|d| d.kind == DeviceKind::AudioOutput)
            .cloned()
            .collect()
    }

    /// Get preferred microphone, fallback to first available
    pub fn get_preferred_mic(&self) -> Option<MediaDevice> {
        if let Some(id) = &self.preferences.preferred_mic_id {
            if let Some(device) = self.devices.iter().find(|d| &d.id == id) {
                return Some(device.clone());
            }
        }
        self.get_audio_inputs().first().cloned()
    }

    /// Get preferred camera, fallback to first available
    pub fn get_preferred_camera(&self) -> Option<MediaDevice> {
        if let Some(id) = &self.preferences.preferred_camera_id {
            if let Some(device) = self.devices.iter().find(|d| &d.id == id) {
                return Some(device.clone());
            }
        }
        self.get_video_inputs().first().cloned()
    }

    /// Get preferred speaker, fallback to first available
    pub fn get_preferred_speaker(&self) -> Option<MediaDevice> {
        if let Some(id) = &self.preferences.preferred_speaker_id {
            if let Some(device) = self.devices.iter().find(|d| &d.id == id) {
                return Some(device.clone());
            }
        }
        self.get_audio_outputs().first().cloned()
    }

    /// Validate if a device ID exists for a given kind
    pub fn validate_device(&self, device_id: &str, kind: DeviceKind) -> bool {
        self.devices.iter().any(|d| d.id == device_id && d.kind == kind)
    }

    /// Get device by ID
    pub fn get_device(&self, device_id: &str) -> Option<MediaDevice> {
        self.devices.iter().find(|d| d.id == device_id).cloned()
    }

    /// Get all devices
    pub fn get_all_devices(&self) -> Vec<MediaDevice> {
        self.devices.clone()
    }

    /// Get device grouping (related audio input/output pairs)
    pub fn get_device_groups(&self) -> Vec<DeviceGroup> {
        let mut groups: std::collections::HashMap<Option<String>, DeviceGroup> = std::collections::HashMap::new();

        for device in &self.devices {
            let group = groups
                .entry(device.group_id.clone())
                .or_insert_with(|| DeviceGroup {
                    group_id: device.group_id.clone(),
                    audio_input: None,
                    audio_output: None,
                    video_input: None,
                });

            match device.kind {
                DeviceKind::AudioInput => group.audio_input = Some(device.clone()),
                DeviceKind::AudioOutput => group.audio_output = Some(device.clone()),
                DeviceKind::VideoInput => group.video_input = Some(device.clone()),
            }
        }

        groups.into_values().collect()
    }
}

/// Represents a group of related devices (e.g., mic and speaker from same physical device)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeviceGroup {
    pub group_id: Option<String>,
    pub audio_input: Option<MediaDevice>,
    pub audio_output: Option<MediaDevice>,
    pub video_input: Option<MediaDevice>,
}

impl Default for DeviceManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_filtering() {
        let mut manager = DeviceManager::new();
        let devices = vec![
            MediaDevice {
                id: "mic1".to_string(),
                label: "Microphone".to_string(),
                kind: DeviceKind::AudioInput,
                group_id: Some("group1".to_string()),
            },
            MediaDevice {
                id: "cam1".to_string(),
                label: "Camera".to_string(),
                kind: DeviceKind::VideoInput,
                group_id: Some("group1".to_string()),
            },
        ];
        manager.set_devices(devices);

        assert_eq!(manager.get_audio_inputs().len(), 1);
        assert_eq!(manager.get_video_inputs().len(), 1);
    }

    #[test]
    fn test_preferred_device_fallback() {
        let mut manager = DeviceManager::new();
        let devices = vec![
            MediaDevice {
                id: "mic1".to_string(),
                label: "Microphone".to_string(),
                kind: DeviceKind::AudioInput,
                group_id: None,
            },
        ];
        manager.set_devices(devices);

        // When no preference is set, should return first device
        assert!(manager.get_preferred_mic().is_some());
    }

    #[test]
    fn test_set_device_preferences() {
        let mut manager = DeviceManager::new();
        let devices = vec![
            MediaDevice {
                id: "mic1".to_string(),
                label: "Microphone".to_string(),
                kind: DeviceKind::AudioInput,
                group_id: None,
            },
        ];
        manager.set_devices(devices);
        
        let prefs = DevicePreferences {
            preferred_mic_id: Some("mic1".to_string()),
            preferred_camera_id: None,
            preferred_speaker_id: None,
        };
        manager.set_preferences(prefs);
        
        let preferred = manager.get_preferred_mic().unwrap();
        assert_eq!(preferred.id, "mic1");
    }

    #[test]
    fn test_get_device_by_id() {
        let mut manager = DeviceManager::new();
        let device = MediaDevice {
            id: "cam1".to_string(),
            label: "Camera".to_string(),
            kind: DeviceKind::VideoInput,
            group_id: None,
        };
        manager.set_devices(vec![device.clone()]);
        
        let found = manager.get_device("cam1").unwrap();
        assert_eq!(found.id, "cam1");
        assert_eq!(found.label, "Camera");
    }

    #[test]
    fn test_get_all_devices() {
        let mut manager = DeviceManager::new();
        let devices = vec![
            MediaDevice {
                id: "mic1".to_string(),
                label: "Microphone".to_string(),
                kind: DeviceKind::AudioInput,
                group_id: None,
            },
            MediaDevice {
                id: "cam1".to_string(),
                label: "Camera".to_string(),
                kind: DeviceKind::VideoInput,
                group_id: None,
            },
        ];
        manager.set_devices(devices);
        
        let all = manager.get_all_devices();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_validate_device() {
        let mut manager = DeviceManager::new();
        let device = MediaDevice {
            id: "mic1".to_string(),
            label: "Microphone".to_string(),
            kind: DeviceKind::AudioInput,
            group_id: None,
        };
        manager.set_devices(vec![device]);
        
        assert!(manager.validate_device("mic1", DeviceKind::AudioInput));
        assert!(!manager.validate_device("mic1", DeviceKind::VideoInput));
        assert!(!manager.validate_device("nonexistent", DeviceKind::AudioInput));
    }

    #[test]
    fn test_audio_output_devices() {
        let mut manager = DeviceManager::new();
        let devices = vec![
            MediaDevice {
                id: "speaker1".to_string(),
                label: "Speaker".to_string(),
                kind: DeviceKind::AudioOutput,
                group_id: None,
            },
        ];
        manager.set_devices(devices);
        
        assert_eq!(manager.get_audio_outputs().len(), 1);
        let speaker = manager.get_preferred_speaker().unwrap();
        assert_eq!(speaker.id, "speaker1");
    }
}
