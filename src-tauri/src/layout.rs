use serde::{Deserialize, Serialize};

/// Layout configuration for the video grid
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LayoutConfig {
    pub layout_type: LayoutType,
    pub columns: usize,
    pub rows: usize,
    pub featured_participant_id: Option<String>,
    pub filmstrip_position: FilmstripPosition,
}

/// Type of layout for video grid
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum LayoutType {
    #[serde(rename = "gallery")]
    Gallery,
    #[serde(rename = "speaker")]
    Speaker,
    #[serde(rename = "filmstrip")]
    Filmstrip,
    #[serde(rename = "spotlight")]
    Spotlight,
}

/// Position of participant filmstrip
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum FilmstripPosition {
    #[serde(rename = "right")]
    Right,
    #[serde(rename = "left")]
    Left,
    #[serde(rename = "top")]
    Top,
    #[serde(rename = "bottom")]
    Bottom,
    #[serde(rename = "hide")]
    Hide,
}

impl Default for FilmstripPosition {
    fn default() -> Self {
        FilmstripPosition::Right
    }
}

/// Calculates optimal video grid layouts
pub struct LayoutCalculator;

impl LayoutCalculator {
    /// Calculate optimal grid dimensions for N participants
    /// Returns (columns, rows) tuple
    pub fn calculate_grid_dimensions(participant_count: usize) -> (usize, usize) {
        match participant_count {
            0 => (1, 1),
            1 => (1, 1),
            2 => (2, 1),
            3 => (2, 2),
            4 => (2, 2),
            5 => (3, 2),
            6 => (3, 2),
            7 => (3, 3),
            8 => (3, 3),
            9 => (3, 3),
            10..=12 => (4, 3),
            13..=16 => (4, 4),
            17..=20 => (5, 4),
            21..=25 => (5, 5),
            _ => {
                let sqrt = (participant_count as f64).sqrt().ceil() as usize;
                (sqrt, (participant_count + sqrt - 1) / sqrt)
            }
        }
    }

    /// Determine optimal layout type based on participants and screen state
    pub fn calculate_optimal_layout(
        participant_count: usize,
        has_active_screen_share: bool,
        pinned_participant_id: Option<String>,
    ) -> LayoutConfig {
        let (layout_type, featured_id) = if pinned_participant_id.is_some() {
            (LayoutType::Spotlight, pinned_participant_id)
        } else if has_active_screen_share {
            (LayoutType::Speaker, None)
        } else {
            (LayoutType::Gallery, None)
        };

        let (columns, rows) = Self::calculate_grid_dimensions(participant_count);

        LayoutConfig {
            layout_type,
            columns,
            rows,
            featured_participant_id: featured_id,
            filmstrip_position: FilmstripPosition::default(),
        }
    }

    /// Calculate tile dimensions for a specific position in grid
    pub fn calculate_tile_size(
        container_width: u32,
        container_height: u32,
        grid_width: usize,
        grid_height: usize,
        padding: u32,
    ) -> TileSize {
        let total_padding_width = padding * (grid_width.saturating_sub(1)) as u32;
        let total_padding_height = padding * (grid_height.saturating_sub(1)) as u32;

        let available_width = container_width.saturating_sub(total_padding_width);
        let available_height = container_height.saturating_sub(total_padding_height);

        let tile_width = available_width / grid_width.max(1) as u32;
        let tile_height = available_height / grid_height.max(1) as u32;

        TileSize {
            width: tile_width,
            height: tile_height,
        }
    }

    /// Determine if layout should switch to featured view
    pub fn should_use_featured_layout(
        participant_count: usize,
        has_active_screen_share: bool,
    ) -> bool {
        has_active_screen_share || participant_count > 6
    }

    /// Calculate optimal aspect ratio for video stream
    pub fn calculate_aspect_ratio(width: u32, height: u32) -> f64 {
        if height == 0 {
            16.0 / 9.0
        } else {
            width as f64 / height as f64
        }
    }

    /// Determine if screen share should be shown in featured position
    pub fn should_feature_screen_share(
        active_screen_shares: usize,
        has_pinned_participant: bool,
    ) -> bool {
        active_screen_shares > 0 && !has_pinned_participant
    }

    /// Calculate filmstrip dimensions
    pub fn calculate_filmstrip_dimensions(
        container_width: u32,
        container_height: u32,
        position: &FilmstripPosition,
        filmstrip_width_ratio: f32,
    ) -> FilmstripDimensions {
        let filmstrip_width = (container_width as f32 * filmstrip_width_ratio) as u32;
        let available_width = container_width.saturating_sub(filmstrip_width);

        match position {
            FilmstripPosition::Right | FilmstripPosition::Left => FilmstripDimensions {
                filmstrip_width,
                filmstrip_height: container_height,
                feature_width: available_width,
                feature_height: container_height,
                is_horizontal: false,
            },
            FilmstripPosition::Top | FilmstripPosition::Bottom => {
                let filmstrip_height = (container_height as f32 * filmstrip_width_ratio) as u32;
                let available_height = container_height.saturating_sub(filmstrip_height);
                FilmstripDimensions {
                    filmstrip_width: container_width,
                    filmstrip_height,
                    feature_width: container_width,
                    feature_height: available_height,
                    is_horizontal: true,
                }
            }
            FilmstripPosition::Hide => FilmstripDimensions {
                filmstrip_width: 0,
                filmstrip_height: 0,
                feature_width: container_width,
                feature_height: container_height,
                is_horizontal: false,
            },
        }
    }

    /// Get grid class name for Tailwind CSS
    pub fn get_grid_class(columns: usize) -> String {
        match columns {
            1 => "grid-cols-1".to_string(),
            2 => "grid-cols-2 md:grid-cols-2".to_string(),
            3 => "grid-cols-3".to_string(),
            4 => "grid-cols-4".to_string(),
            5 => "grid-cols-5".to_string(),
            _ => "grid-cols-3".to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TileSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FilmstripDimensions {
    pub filmstrip_width: u32,
    pub filmstrip_height: u32,
    pub feature_width: u32,
    pub feature_height: u32,
    pub is_horizontal: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_grid_dimensions() {
        assert_eq!(LayoutCalculator::calculate_grid_dimensions(1), (1, 1));
        assert_eq!(LayoutCalculator::calculate_grid_dimensions(2), (2, 1));
        assert_eq!(LayoutCalculator::calculate_grid_dimensions(4), (2, 2));
        assert_eq!(LayoutCalculator::calculate_grid_dimensions(9), (3, 3));
    }

    #[test]
    fn test_optimal_layout_gallery() {
        let layout = LayoutCalculator::calculate_optimal_layout(3, false, None);
        assert_eq!(layout.layout_type, LayoutType::Gallery);
    }

    #[test]
    fn test_optimal_layout_speaker() {
        let layout = LayoutCalculator::calculate_optimal_layout(5, true, None);
        assert_eq!(layout.layout_type, LayoutType::Speaker);
    }

    #[test]
    fn test_optimal_layout_spotlight() {
        let layout = LayoutCalculator::calculate_optimal_layout(4, false, Some("user1".to_string()));
        assert_eq!(layout.layout_type, LayoutType::Spotlight);
    }

    #[test]
    fn test_tile_size_calculation() {
        let tile_size = LayoutCalculator::calculate_tile_size(1920, 1080, 2, 2, 10);
        assert!(tile_size.width > 0);
        assert!(tile_size.height > 0);
    }

    #[test]
    fn test_aspect_ratio() {
        let ratio = LayoutCalculator::calculate_aspect_ratio(1920, 1080);
        assert!((ratio - 1.777).abs() < 0.01); // 16:9
    }
}
