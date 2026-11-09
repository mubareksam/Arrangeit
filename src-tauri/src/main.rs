// Prevent a console window from flashing up alongside the GUI on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    arrangeit_lib::run()
}
