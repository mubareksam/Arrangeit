//! Folder styling through `desktop.ini`.
//!
//! Getting Windows to actually show a custom folder icon needs four things, and
//! skipping any one of them is why "folder styles" usually fails in the wild:
//!
//!   1. a real multi-size **DIB** `.ico` (PNG-compressed icons are only honoured
//!      at 256×256, so 16/32/48 px must be bitmap entries),
//!   2. `desktop.ini` **inside** the folder with a *quoted* `IconResource`,
//!   3. the ini marked `+s +h` **and** the folder marked `+r`,
//!   4. the shell icon cache flushed (`ie4uinit.exe -show`).
//!
//! Re-applying a style also has to clear the old `+s +h` attributes first —
//! otherwise the write fails with "access denied", which was the original bug.

use crate::model::{FolderStyle, StyleStep, UndoRecord};
use image::{ImageFormat, Rgba, RgbaImage};
use serde::Serialize;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

const MASTER: u32 = 256;
const ICON_SIZES: [u32; 3] = [16, 32, 48];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleOutcome {
    pub steps: Vec<StyleStep>,
    pub undo: Option<UndoRecord>,
    /// Absolute path of the `.ico` that was written.
    pub icon_path: String,
}

/* ------------------------------------------------------------------ */
/* Icon rendering                                                      */
/* ------------------------------------------------------------------ */

fn parse_hex(color: &str) -> (u8, u8, u8) {
    let hex = color.trim_start_matches('#');
    if hex.len() >= 6 {
        if let (Ok(r), Ok(g), Ok(b)) = (
            u8::from_str_radix(&hex[0..2], 16),
            u8::from_str_radix(&hex[2..4], 16),
            u8::from_str_radix(&hex[4..6], 16),
        ) {
            return (r, g, b);
        }
    }
    (240, 160, 60)
}

fn in_rounded_rect(px: f32, py: f32, x0: f32, y0: f32, x1: f32, y1: f32, r: f32) -> bool {
    if px < x0 || px > x1 || py < y0 || py > y1 {
        return false;
    }
    let cx = px.clamp(x0 + r, x1 - r);
    let cy = py.clamp(y0 + r, y1 - r);
    (px - cx).powi(2) + (py - cy).powi(2) <= r * r
}

fn in_circle(px: f32, py: f32, cx: f32, cy: f32, r: f32) -> bool {
    (px - cx).powi(2) + (py - cy).powi(2) <= r * r
}

fn in_polygon(px: f32, py: f32, points: &[(f32, f32)]) -> bool {
    let mut inside = false;
    let n = points.len();
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = points[i];
        let (xj, yj) = points[j];
        if ((yi > py) != (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    inside
}


fn in_rect(x: f32, y: f32, x0: f32, y0: f32, x1: f32, y1: f32) -> bool {
    x >= x0 && x <= x1 && y >= y0 && y <= y1
}

fn in_ring(x: f32, y: f32, cx: f32, cy: f32, outer: f32, inner: f32) -> bool {
    in_circle(x, y, cx, cy, outer) && !in_circle(x, y, cx, cy, inner)
}

fn near_segment(x: f32, y: f32, ax: f32, ay: f32, bx: f32, by: f32, width: f32) -> bool {
    let dx = bx - ax;
    let dy = by - ay;
    let length_sq = dx * dx + dy * dy;
    let t = if length_sq == 0.0 {
        0.0
    } else {
        (((x - ax) * dx + (y - ay) * dy) / length_sq).clamp(0.0, 1.0)
    };
    let px = ax + t * dx;
    let py = ay + t * dy;
    (x - px).powi(2) + (y - py).powi(2) <= width * width
}

fn star_points(cx: f32, cy: f32, outer: f32, inner: f32) -> Vec<(f32, f32)> {
    (0..10)
        .map(|i| {
            let radius = if i % 2 == 0 { outer } else { inner };
            let angle = -std::f32::consts::FRAC_PI_2 + (i as f32) * std::f32::consts::PI / 5.0;
            (cx + radius * angle.cos(), cy + radius * angle.sin())
        })
        .collect()
}

fn glyph_hit(glyph: &str, x: f32, y: f32) -> bool {
    let star = star_points(32.0, 36.0, 14.5, 6.0);
    match glyph {
        "star" => in_polygon(x, y, &star),
        "film" => in_polygon(x, y, &[(25.0, 26.0), (25.0, 47.0), (42.0, 36.5)]),
        "book" => in_rounded_rect(x, y, 23.0, 25.0, 30.5, 48.0, 1.5) || in_rounded_rect(x, y, 33.5, 25.0, 41.0, 48.0, 1.5),
        "music" => {
            in_circle(x, y, 24.0, 45.0, 4.8)
                || in_circle(x, y, 38.0, 41.5, 4.8)
                || near_segment(x, y, 27.0, 45.0, 27.0, 28.0, 1.8)
                || near_segment(x, y, 41.0, 41.5, 41.0, 25.0, 1.8)
                || in_rect(x, y, 27.0, 25.0, 41.0, 29.0)
        }
        "camera" => {
            (in_ring(x, y, 32.0, 37.0, 9.5, 4.6)) || in_rounded_rect(x, y, 26.0, 21.5, 38.0, 26.0, 2.0)
        }
        "briefcase" => {
            in_rounded_rect(x, y, 21.0, 27.0, 43.0, 46.0, 3.0) || in_rounded_rect(x, y, 28.0, 22.5, 36.0, 28.5, 2.0)
        }
        "flask" => in_polygon(x, y, &[(27.0, 24.0), (37.0, 24.0), (44.0, 47.0), (20.0, 47.0)]),
        "heart" => {
            in_circle(x, y, 27.0, 32.0, 5.4) || in_circle(x, y, 37.0, 32.0, 5.4)
                || in_polygon(x, y, &[(21.0, 33.0), (43.0, 33.0), (32.0, 47.0)])
        }
        "bolt" => in_polygon(x, y, &[(35.0, 21.0), (26.0, 35.0), (32.0, 35.0), (29.0, 50.0), (41.0, 32.0), (34.0, 32.0)]),
        "cloud" => {
            in_circle(x, y, 25.0, 36.0, 6.0) || in_circle(x, y, 33.0, 32.0, 8.0) || in_circle(x, y, 41.0, 36.5, 6.0)
                || in_rect(x, y, 24.0, 35.0, 42.0, 42.0)
        }
        "shield" => in_polygon(x, y, &[(32.0, 20.0), (43.0, 25.0), (43.0, 35.0), (32.0, 49.0), (21.0, 35.0), (21.0, 25.0)]),
        "gear" => {
            (in_ring(x, y, 32.0, 36.0, 13.0, 7.0) && !in_circle(x, y, 32.0, 36.0, 4.0))
                || in_rect(x, y, 29.5, 20.0, 34.5, 25.0)
                || in_rect(x, y, 29.5, 47.0, 34.5, 52.0)
                || in_rect(x, y, 16.0, 33.5, 21.0, 38.5)
                || in_rect(x, y, 43.0, 33.5, 48.0, 38.5)
        }
        "leaf" => {
            in_polygon(x, y, &[(25.0, 45.0), (24.0, 33.0), (33.0, 25.0), (43.0, 28.0), (41.0, 38.0), (31.0, 46.0)])
                || near_segment(x, y, 25.0, 45.0, 20.0, 51.0, 1.6)
        }
        "flame" => in_polygon(x, y, &[(32.0, 21.0), (38.0, 31.0), (36.0, 33.0), (40.0, 37.0), (39.0, 44.0), (32.0, 50.0), (25.0, 45.0), (26.0, 37.0), (30.0, 33.0), (28.0, 29.0)]),
        "moon" => in_circle(x, y, 32.0, 36.0, 12.0) && !in_circle(x, y, 38.5, 31.5, 10.5),
        "sun" => {
            in_ring(x, y, 32.0, 36.0, 8.0, 5.0)
                || (0..8).any(|i| {
                    let angle = i as f32 * std::f32::consts::PI / 4.0;
                    let (sin, cos) = angle.sin_cos();
                    near_segment(x, y, 32.0 + 10.0 * cos, 36.0 + 10.0 * sin, 32.0 + 15.0 * cos, 36.0 + 15.0 * sin, 1.5)
                })
        }
        "plane" => in_polygon(x, y, &[(19.0, 41.0), (44.0, 23.0), (44.0, 29.5), (34.0, 37.5), (38.0, 47.0), (32.0, 45.0), (27.0, 40.0)]),
        "cart" => {
            in_rounded_rect(x, y, 22.0, 29.0, 38.0, 41.0, 2.0)
                || in_circle(x, y, 26.0, 46.0, 3.0)
                || in_circle(x, y, 36.0, 46.0, 3.0)
                || near_segment(x, y, 22.0, 29.0, 17.0, 24.0, 1.7)
        }
        "home" => {
            in_polygon(x, y, &[(32.0, 22.0), (45.0, 34.0), (19.0, 34.0)])
                || in_rect(x, y, 24.0, 34.0, 40.0, 48.0)
                || in_rect(x, y, 29.0, 40.0, 35.0, 48.0)
        }
        "key" => {
            in_ring(x, y, 25.0, 38.0, 7.0, 3.2)
                || in_rect(x, y, 30.0, 36.4, 45.0, 39.6)
                || in_rect(x, y, 40.0, 39.6, 43.0, 44.0)
                || in_rect(x, y, 35.0, 39.6, 37.0, 43.0)
        }
        "clock" => {
            in_ring(x, y, 32.0, 36.0, 12.0, 9.6)
                || near_segment(x, y, 32.0, 36.0, 32.0, 28.5, 1.5)
                || near_segment(x, y, 32.0, 36.0, 38.0, 39.0, 1.5)
        }
        "layers" => {
            in_polygon(x, y, &[(32.0, 22.0), (44.0, 29.0), (32.0, 36.0), (20.0, 29.0)])
                || in_polygon(x, y, &[(32.0, 28.0), (44.0, 35.0), (32.0, 42.0), (20.0, 35.0)])
                || in_polygon(x, y, &[(32.0, 34.0), (44.0, 41.0), (32.0, 48.0), (20.0, 41.0)])
        }
        "terminal" => {
            in_rounded_rect(x, y, 19.0, 25.0, 45.0, 47.0, 3.0)
                && !in_rounded_rect(x, y, 22.0, 28.0, 42.0, 44.0, 2.0)
                || in_polygon(x, y, &[(26.0, 31.0), (33.0, 36.0), (26.0, 41.0)])
                || in_rect(x, y, 35.0, 39.0, 41.0, 41.0)
        }
        "gamepad" => {
            in_rounded_rect(x, y, 19.0, 30.0, 45.0, 45.0, 6.0)
                || in_circle(x, y, 26.0, 37.5, 3.2)
                || in_circle(x, y, 38.0, 37.5, 3.2)
        }
        _ => false,
    }
}

/// Renders at 256 px in "64-unit" design space, then downsamples — this keeps
/// small sizes smooth instead of jagged.
fn render_master(color: &str, glyph: &str) -> RgbaImage {
    let (r, g, b) = parse_hex(color);
    let mut img = RgbaImage::new(MASTER, MASTER);
    let scale = MASTER as f32 / 64.0;

    for py in 0..MASTER {
        for px in 0..MASTER {
            let x = px as f32 / scale;
            let y = py as f32 / scale;

            let tab = in_rounded_rect(x, y, 8.0, 12.0, 30.0, 22.0, 3.0);
            let body = in_rounded_rect(x, y, 8.0, 18.0, 56.0, 52.0, 7.0);

            if !tab && !body {
                img.put_pixel(px, py, Rgba([0, 0, 0, 0]));
                continue;
            }

            // Tab is a touch lighter, the lower body a touch darker → depth.
            let factor = if y < 20.0 {
                1.16
            } else if y > 44.0 {
                0.82
            } else {
                1.0
            };
            let rr = (r as f32 * factor).min(255.0) as u8;
            let gg = (g as f32 * factor).min(255.0) as u8;
            let bb = (b as f32 * factor).min(255.0) as u8;

            let pixel = if body && glyph_hit(glyph, x, y) {
                Rgba([255, 255, 255, 245])
            } else {
                Rgba([rr, gg, bb, 255])
            };
            img.put_pixel(px, py, pixel);
        }
    }
    img
}

fn downsample(src: &RgbaImage, size: u32) -> RgbaImage {
    let mut out = RgbaImage::new(size, size);
    let ratio = src.width() as f32 / size as f32;
    for y in 0..size {
        for x in 0..size {
            let x0 = (x as f32 * ratio).floor() as u32;
            let y0 = (y as f32 * ratio).floor() as u32;
            let x1 = (((x + 1) as f32 * ratio).ceil() as u32).min(src.width());
            let y1 = (((y + 1) as f32 * ratio).ceil() as u32).min(src.height());
            let mut acc = [0f32; 4];
            let mut count = 0f32;
            for sy in y0..y1 {
                for sx in x0..x1 {
                    let p = src.get_pixel(sx, sy).0;
                    let alpha = p[3] as f32 / 255.0;
                    acc[0] += p[0] as f32 * alpha;
                    acc[1] += p[1] as f32 * alpha;
                    acc[2] += p[2] as f32 * alpha;
                    acc[3] += p[3] as f32;
                    count += 1.0;
                }
            }
            if count == 0.0 {
                continue;
            }
            let alpha = acc[3] / count;
            let unpremul = if alpha > 0.0 { 255.0 / alpha } else { 0.0 };
            out.put_pixel(
                x,
                y,
                Rgba([
                    (acc[0] / count * unpremul).min(255.0) as u8,
                    (acc[1] / count * unpremul).min(255.0) as u8,
                    (acc[2] / count * unpremul).min(255.0) as u8,
                    alpha as u8,
                ]),
            );
        }
    }
    out
}

/// BITMAPINFOHEADER + 32-bit BGRA (bottom-up) + 1bpp AND mask = a valid DIB icon.
fn dib_for(img: &RgbaImage) -> Vec<u8> {
    let size = img.width();
    let mask_row = ((size + 31) / 32) * 4;
    let xor_len = (size * size * 4) as usize;
    let and_len = (mask_row * size) as usize;
    let mut out = Vec::with_capacity(40 + xor_len + and_len);

    out.extend_from_slice(&40u32.to_le_bytes()); // biSize
    out.extend_from_slice(&(size as i32).to_le_bytes()); // biWidth
    out.extend_from_slice(&((size as i32) * 2).to_le_bytes()); // biHeight (XOR + AND)
    out.extend_from_slice(&1u16.to_le_bytes()); // biPlanes
    out.extend_from_slice(&32u16.to_le_bytes()); // biBitCount
    out.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
    out.extend_from_slice(&(xor_len as u32).to_le_bytes());
    out.extend_from_slice(&[0u8; 16]); // ppm + colours

    for y in (0..size).rev() {
        for x in 0..size {
            let p = img.get_pixel(x, y).0;
            out.extend_from_slice(&[p[2], p[1], p[0], p[3]]);
        }
    }
    out.resize(out.len() + and_len, 0);
    out
}

fn png_for(img: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut png = Vec::new();
    img.write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {e}"))?;
    Ok(png)
}

fn ico_bytes(entries: &[(u32, Vec<u8>)]) -> Vec<u8> {
    let mut ico = Vec::new();
    ico.extend_from_slice(&[0, 0]); // reserved
    ico.extend_from_slice(&[1, 0]); // type: icon
    ico.extend_from_slice(&(entries.len() as u16).to_le_bytes());

    let mut offset = 6 + 16 * entries.len() as u32;
    for (size, data) in entries {
        ico.push(if *size >= 256 { 0 } else { *size as u8 });
        ico.push(if *size >= 256 { 0 } else { *size as u8 });
        ico.push(0); // palette
        ico.push(0); // reserved
        ico.extend_from_slice(&1u16.to_le_bytes()); // planes
        ico.extend_from_slice(&32u16.to_le_bytes()); // bpp
        ico.extend_from_slice(&(data.len() as u32).to_le_bytes());
        ico.extend_from_slice(&offset.to_le_bytes());
        offset += data.len() as u32;
    }
    for (_, data) in entries {
        ico.extend_from_slice(data);
    }
    ico
}

/// Builds a 16/32/48/256 icon. Small sizes are DIB, 256 is PNG (allowed by Windows).
fn build_ico(color: &str, glyph: &str) -> Result<Vec<u8>, String> {
    let master = render_master(color, glyph);
    let mut entries: Vec<(u32, Vec<u8>)> = Vec::new();
    for size in ICON_SIZES {
        entries.push((size, dib_for(&downsample(&master, size))));
    }
    entries.push((256, png_for(&master)?));
    Ok(ico_bytes(&entries))
}

/* ------------------------------------------------------------------ */
/* Filesystem + shell helpers                                          */
/* ------------------------------------------------------------------ */

fn icon_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ArrangeIt")
        .join("icons")
}

fn desktop_ini(style: &FolderStyle, icon: &Path) -> String {
    let tooltip = if style.tooltip.is_empty() {
        format!("ArrangeIt · {}", style.folder)
    } else {
        style.tooltip.clone()
    };
    let icon = icon.to_string_lossy();
    format!(
        "[.ShellClassInfo]\r\n\
         ConfirmFileOp=0\r\n\
         NoSharing=1\r\n\
         IconFile={icon}\r\n\
         IconIndex=0\r\n\
         InfoTip={tooltip}\r\n\
         IconResource=\"{icon}\",0\r\n\
         \r\n\
         [ViewState]\r\n\
         Mode=\r\n\
         Vid=\r\n\
         FolderType=Documents\r\n"
    )
}

fn attrib(args: &[&str]) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("attrib")
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        let _ = args;
        true
    }
}

fn set_attributes(flags: &[&str], path: &Path) -> bool {
    let owned = path.to_string_lossy().to_string();
    let mut args: Vec<&str> = flags.to_vec();
    args.push(owned.as_str());
    attrib(&args)
}

pub fn refresh_icon_cache() -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("ie4uinit.exe")
            .arg("-show")
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        true
    }
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

#[tauri::command]
pub async fn apply_folder_style(style: FolderStyle, root: String, dry_run: bool) -> Result<StyleOutcome, String> {
    let folder = match style.path.as_deref() {
        Some(path) if !path.is_empty() => PathBuf::from(path),
        _ => Path::new(&root).join(&style.folder),
    };
    if !folder.is_dir() {
        return Err(format!("Folder not found: {}", folder.display()));
    }

    let mut steps: Vec<StyleStep> = Vec::new();

    // 1 — the icon itself.
    let icon_path = match &style.icon_path {
        Some(custom) if Path::new(custom).is_file() => PathBuf::from(custom),
        _ => {
            let dir = icon_dir();
            let file = dir.join(format!("{}-{}.ico", style.glyph, style.color.trim_start_matches('#')));
            if !dry_run {
                fs::create_dir_all(&dir).map_err(|e| format!("Cannot create icon cache: {e}"))?;
                fs::write(&file, build_ico(&style.color, &style.glyph)?)
                    .map_err(|e| format!("Cannot write icon: {e}"))?;
            }
            file
        }
    };
    steps.push(StyleStep {
        command: format!("icon → {}", icon_path.display()),
        ok: true,
        detail: format!("16/32/48/256 px {} glyph in {}", style.glyph, style.color),
    });

    // 2 — clear stale attributes, then write desktop.ini. This is the step that
    // used to fail with "access denied" on a second apply.
    let ini = folder.join("desktop.ini");
    if !dry_run {
        if ini.exists() {
            set_attributes(&["-s", "-h", "-r"], &ini);
        }
        fs::write(&ini, desktop_ini(&style, &icon_path))
            .map_err(|e| format!("Cannot write desktop.ini: {e}"))?;
    }
    let written = dry_run || fs::read_to_string(&ini).map(|t| t.contains("IconResource")).unwrap_or(false);
    steps.push(StyleStep {
        command: format!("write {}", ini.display()),
        ok: written,
        detail: if written {
            String::from("IconResource verified in desktop.ini")
        } else {
            String::from("desktop.ini was written but could not be read back")
        },
    });

    // 3 — folder read-only, ini hidden + system.
    let folder_ok = dry_run || set_attributes(&["+r"], &folder);
    steps.push(StyleStep {
        command: format!("attrib +r \"{}\"", folder.display()),
        ok: folder_ok,
        detail: String::from("Required for the shell to honour folder metadata"),
    });

    let ini_ok = if !style.hide_system_files {
        true
    } else if dry_run {
        true
    } else {
        set_attributes(&["+s"], &ini) && set_attributes(&["+h"], &ini)
    };
    steps.push(StyleStep {
        command: format!("attrib +s +h \"{}\"", ini.display()),
        ok: ini_ok,
        detail: if style.hide_system_files {
            String::from("desktop.ini hidden + system")
        } else {
            String::from("Skipped — hide desktop.ini is off")
        },
    });

    // 4 — cache flush.
    let refreshed = if dry_run { true } else { refresh_icon_cache() };
    steps.push(StyleStep {
        command: String::from("ie4uinit.exe -show"),
        ok: refreshed,
        detail: String::from("Flush the shell icon cache (no reboot needed)"),
    });

    let undo = if dry_run {
        None
    } else {
        Some(UndoRecord {
            id: format!("undo-{}", chrono::Utc::now().timestamp_millis()),
            kind: String::from("style"),
            label: format!("Styled {}", style.folder),
            entries: vec![
                format!("remove {}", ini.display()),
                format!("attrib -r \"{}\"", folder.display()),
            ],
            ops: Vec::new(),
        })
    };

    Ok(StyleOutcome { steps, undo, icon_path: icon_path.to_string_lossy().to_string() })
}

/// Removes a custom folder icon and restores Windows' default folder look.
#[tauri::command]
pub async fn reset_folder_style(root: String, folder: String, path: Option<String>) -> Result<Vec<StyleStep>, String> {
    let target = match path.as_deref() {
        Some(value) if !value.is_empty() => PathBuf::from(value),
        _ => Path::new(&root).join(&folder),
    };
    if !target.is_dir() {
        return Err(format!("Folder not found: {}", target.display()));
    }
    let ini = target.join("desktop.ini");
    let mut steps = Vec::new();

    if ini.exists() {
        set_attributes(&["-s", "-h", "-r"], &ini);
        fs::remove_file(&ini).map_err(|e| format!("Cannot remove desktop.ini: {e}"))?;
        steps.push(StyleStep {
            command: format!("remove {}", ini.display()),
            ok: true,
            detail: String::from("desktop.ini deleted"),
        });
    } else {
        steps.push(StyleStep {
            command: String::from("desktop.ini"),
            ok: true,
            detail: String::from("No desktop.ini — folder already looked default"),
        });
    }

    let ok = set_attributes(&["-r"], &target);
    steps.push(StyleStep {
        command: format!("attrib -r \"{}\"", target.display()),
        ok,
        detail: String::from("Folder no longer read-only"),
    });

    let refreshed = refresh_icon_cache();
    steps.push(StyleStep {
        command: String::from("ie4uinit.exe -show"),
        ok: refreshed,
        detail: String::from("Icon cache flushed"),
    });

    Ok(steps)
}
