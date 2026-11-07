//! Pure video-grid geometry exposed to the frontend.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use crate::layout::{LayoutCalculator, LayoutConfig};

#[tauri::command]
pub fn calculate_grid_dimensions(participant_count: usize) -> Result<(usize, usize), String> {
    Ok(LayoutCalculator::calculate_grid_dimensions(
        participant_count,
    ))
}

#[tauri::command]
pub fn calculate_optimal_layout(
    participant_count: usize,
    has_active_screen_share: bool,
    pinned_participant_id: Option<String>,
) -> Result<LayoutConfig, String> {
    Ok(LayoutCalculator::calculate_optimal_layout(
        participant_count,
        has_active_screen_share,
        pinned_participant_id,
    ))
}

#[tauri::command]
pub fn get_grid_class(columns: usize) -> Result<String, String> {
    Ok(LayoutCalculator::get_grid_class(columns))
}

#[tauri::command]
pub fn should_use_featured_layout(
    participant_count: usize,
    has_active_screen_share: bool,
) -> Result<bool, String> {
    Ok(LayoutCalculator::should_use_featured_layout(
        participant_count,
        has_active_screen_share,
    ))
}

#[tauri::command]
pub fn calculate_aspect_ratio(width: u32, height: u32) -> Result<f64, String> {
    Ok(LayoutCalculator::calculate_aspect_ratio(width, height))
}

#[tauri::command]
pub fn calculate_tile_size(
    container_width: u32,
    container_height: u32,
    grid_width: usize,
    grid_height: usize,
    padding: u32,
) -> Result<crate::layout::TileSize, String> {
    Ok(LayoutCalculator::calculate_tile_size(
        container_width,
        container_height,
        grid_width,
        grid_height,
        padding,
    ))
}

#[tauri::command]
pub fn should_feature_screen_share(
    active_screen_shares: usize,
    has_pinned_participant: bool,
) -> Result<bool, String> {
    Ok(LayoutCalculator::should_feature_screen_share(
        active_screen_shares,
        has_pinned_participant,
    ))
}

#[tauri::command]
pub fn calculate_filmstrip_dimensions(
    container_width: u32,
    container_height: u32,
    position: crate::layout::FilmstripPosition,
    filmstrip_width_ratio: f32,
) -> Result<crate::layout::FilmstripDimensions, String> {
    Ok(LayoutCalculator::calculate_filmstrip_dimensions(
        container_width,
        container_height,
        &position,
        filmstrip_width_ratio,
    ))
}
