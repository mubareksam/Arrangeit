pub mod arrange;
pub mod duplicates;
pub mod rename;
pub mod scan;
pub mod shell;
pub mod style;

pub use arrange::{execute_arrange, revert_files, ArrangeItem, ArrangeOutcome, RevertOutcome};
pub use duplicates::{delete_duplicates, DeleteOutcome};
pub use rename::{rename_files, RenameOutcome, RenamePair};
pub use scan::{list_folders, scan_folder, FolderEntry, ScanResult};
pub use shell::{refresh_shell, reveal_in_explorer, write_text_file};
pub use style::{apply_folder_style, reset_folder_style, StyleOutcome};
