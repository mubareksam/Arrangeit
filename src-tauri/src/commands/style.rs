//! Folder styling through `desktop.ini`.
//!
//! Windows only renders a custom folder icon when three things line up:
//!   1. `desktop.ini` exists inside the folder,
//!   2. that file is marked hidden + system (`attrib +s +h`),
//!   3. the folder itself is read-only/system so the shell keeps the metadata.
//! Finally `ie4uinit.exe -show` flushes the icon cache, otherwise Explorer keeps
//! showing the old folder until the next reboot.
//!
//! The `.ico` is generated on the fly (folder silhouette + glyph) so users never
//! have to hunt for an icon file.

use crate::model::{FolderStyle, StyleStep, UndoRecord};
use image::{ImageFormat, Rgba, RgbaImage};
use serde::Serialize;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleOutcome {
    pub steps: Vec<StyleStep>,
    pub undo: Option<UndoRecord>,
}

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

fn in_rounded_rect(x: i32, y: i32, x0: i32, y0: i32, x1: i32, y1: i32, r: i32) -> bool {
    if x < x0 || x > x1 || y < y0 || y > y1 {
        return false;
    }
    let cx = if x < x0 + r { x0 + r } else if x > x1 - r { x1 - r } else { x };
    let cy = if y < y0 + r { y0 + r } else if y > y1 - r { y1 - r } else { y };
    let dx = (x - cx) as f32;
    let dy = (y - cy) as f32;
    dx * dx + dy * dy <= (r * r) as f32
}

fn in_circle(x: f32, y: f32, cx: f32, cy: f32, r: f32) -> bool {
    (x - cx).powi(2) + (y - cy).powi(2) <= r * r
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

fn star_points(cx: f32, cy: f32, outer: f32, inner: f32) -> Vec<(f32, f32)> {
    let mut points = Vec::with_capacity(10);
    for i in 0..10 {
        let radius = if i % 2 == 0 { outer } else { inner };
        let angle = -std::f32::consts::FRAC_PI_2 + (i as f32) * std::f32::consts::PI / 5.0;
        points.push((cx + radius * angle.cos(), cy + radius * angle.sin()));
    }
    points
}

/// 64×64 RGBA folder icon tinted with the folder accent colour.
fn render_icon(color: &str, glyph: &str) -> RgbaImage {
    let (r, g, b) = parse_hex(color);
    let mut img = RgbaImage::from_pixel(64, 64, Rgba([0, 0, 0, 0]));

    // Folder body + tab.
    for y in 0..64i32 {
        for x in 0..64i32 {
            let tab = in_rounded_rect(x, y, 8, 12, 30, 22, 3);
            let body = in_rounded_rect(x, y, 8, 18, 56, 52, 7);
            if tab || body {
                let shade = if y < 20 { 1.14 } else { 1.0 };
                let (rr, gg, bb) = if y > 44 {
                    ((r as f32 * 0.82) as u8, (g as f32 * 0.82) as u8, (b as f32 * 0.82) as u8)
                } else {
                    (
                        ((r as f32 * shade).min(255.0)) as u8,
                        ((g as f32 * shade).min(255.0)) as u8,
                        ((b as f32 * shade).min(255.0)) as u8,
                    )
                };
                img.put_pixel(x as u32, y as u32, Rgba([rr, gg, bb, 255]));
            }
        }
    }

    // Glyph, drawn in white on the body.
    let white = Rgba([255, 255, 255, 235]);
    let cx = 32.0f32;
    let cy = 36.0f32;
    let star = star_points(cx, cy, 15.0, 6.2);
    let triangle = [(24.0f32, 26.0f32), (24.0, 48.0), (42.0, 37.0)];

    for y in 0..64 {
        for x in 0..64 {
            let fx = x as f32;
            let fy = y as f32;
            let body = in_rounded_rect(x as i32, y as i32, 8, 18, 56, 52, 7);
            if !body {
                continue;
            }
            let hit = match glyph {
                "star" => in_polygon(fx, fy, &star),
                "film" => in_polygon(fx, fy, &triangle),
                "book" => in_rounded_rect(x as i32, y as i32, 24, 26, 31, 48, 1) || in_rounded_rect(x as i32, y as i32, 33, 26, 40, 48, 1),
                "music" => {
                    in_circle(fx, fy, 24.0, 45.0, 5.0)
                        || in_circle(fx, fy, 38.0, 41.0, 5.0)
                        || in_rounded_rect(x as i32, y as i32, 37, 24, 41, 42, 1)
                        || in_rounded_rect(x as i32, y as i32, 23, 28, 27, 46, 1)
                        || in_rounded_rect(x as i32, y as i32, 25, 25, 41, 30, 2)
                }
                "camera" => {
                    (in_circle(fx, fy, cx, cy + 1.0, 9.0) && !in_circle(fx, fy, cx, cy + 1.0, 4.2))
                        || in_rounded_rect(x as i32, y as i32, 26, 22, 38, 27, 2)
                }
                "briefcase" => {
                    in_rounded_rect(x as i32, y as i32, 22, 28, 42, 46, 3)
                        || in_rounded_rect(x as i32, y as i32, 28, 23, 36, 29, 2)
                }
                "flask" => in_polygon(fx, fy, &[(27.0, 25.0), (37.0, 25.0), (44.0, 48.0), (20.0, 48.0)]),
                _ => false,
            };
            if hit {
                img.put_pixel(x, y, white);
            }
        }
    }

    img
}

fn ico_bytes(img: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut png = Vec::new();
    img.write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {e}"))?;

    let mut ico = Vec::with_capacity(png.len() + 22);
    ico.extend_from_slice(&[0, 0]); // reserved
    ico.extend_from_slice(&[1, 0]); // type: icon
    ico.extend_from_slice(&[1, 0]); // image count
    ico.push(64); // width
    ico.push(64); // height
    ico.push(0); // palette size
    ico.push(0); // reserved
    ico.extend_from_slice(&[1, 0]); // colour planes
    ico.extend_from_slice(&[32, 0]); // bits per pixel
    ico.extend_from_slice(&(png.len() as u32).to_le_bytes());
    ico.extend_from_slice(&22u32.to_le_bytes()); // data offset
    ico.extend_from_slice(&png);
    Ok(ico)
}

fn icon_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ArrangeIt")
        .join("icons")
}

fn desktop_ini(style: &FolderStyle, icon: &Path) -> String {
    let tooltip = if style.tooltip.is_empty() { format!("ArrangeIt · {}", style.folder) } else { style.tooltip.clone() };
    let icon = icon.to_string_lossy();
    format!(
        "[.ShellClassInfo]\r\nInfoTip={tooltip}\r\nIconResource={icon},0\r\nIconFile={icon}\r\nIconIndex=0\r\nConfirmFileOp=0\r\n\r\n[ViewState]\r\nMode=\r\nVid=\r\nFolderType=Documents\r\n"
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

fn refresh_icon_cache() -> bool {
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

#[tauri::command]
pub async fn apply_folder_style(style: FolderStyle, root: String, dry_run: bool) -> Result<StyleOutcome, String> {
    let folder = Path::new(&root).join(&style.folder);
    if !folder.exists() {
        return Err(format!("Folder not found: {}", folder.display()));
    }

    let mut steps: Vec<StyleStep> = Vec::new();

    // 1. Materialise the .ico.
    let icon_path = match &style.icon_path {
        Some(custom) if Path::new(custom).exists() => PathBuf::from(custom),
        _ => {
            let dir = icon_dir();
            let file = dir.join(format!("{}-{}.ico", style.glyph, style.color.trim_start_matches('#')));
            if !dry_run {
                fs::create_dir_all(&dir).map_err(|e| format!("Cannot create icon cache: {e}"))?;
                let image = render_icon(&style.color, &style.glyph);
                let bytes = ico_bytes(&image)?;
                fs::write(&file, bytes).map_err(|e| format!("Cannot write icon: {e}"))?;
            }
            file
        }
    };
    steps.push(StyleStep {
        command: format!("icon → {}", icon_path.display()),
        ok: true,
        detail: format!("64×64 {} glyph in {}", style.glyph, style.color),
    });

    // 2. desktop.ini.
    let ini = folder.join("desktop.ini");
    if !dry_run {
        fs::write(&ini, desktop_ini(&style, &icon_path)).map_err(|e| format!("Cannot write desktop.ini: {e}"))?;
    }
    steps.push(StyleStep {
        command: format!("write {}", ini.display()),
        ok: true,
        detail: String::from("InfoTip + IconResource + ViewState"),
    });

    // 3. Attributes: folder read-only, ini hidden + system.
    let folder_owned = folder.to_string_lossy().to_string();
    let folder_attr = attrib(&["+r", folder_owned.as_str()]);
    steps.push(StyleStep {
        command: format!("attrib +r \"{}\"", folder.display()),
        ok: folder_attr,
        detail: String::from("Lets the shell honour the folder metadata"),
    });

    let ini_owned = ini.to_string_lossy().to_string();
    let ini_ok = if !style.hide_system_files {
        true
    } else if dry_run {
        true
    } else {
        attrib(&["+s", ini_owned.as_str()]) && attrib(&["+h", ini_owned.as_str()])
    };
    steps.push(StyleStep {
        command: format!("attrib +s +h \"{}\"", ini.display()),
        ok: ini_ok,
        detail: if style.hide_system_files {
            String::from("desktop.ini hidden + system, so Explorer stays tidy")
        } else {
            String::from("Skipped — hide desktop.ini is off")
        },
    });

    // 4. Icon cache flush.
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
        })
    };

    Ok(StyleOutcome { steps, undo })
}

#[tauri::command]
pub async fn reveal_in_explorer(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", target.display()))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").args(["-R", &path]).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = target.parent().unwrap_or(Path::new(".")).to_path_buf();
        std::process::Command::new("xdg-open").arg(dir).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}
