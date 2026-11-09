pub mod arrange;
pub mod duplicates;
pub mod rename;
pub mod scan;
pub mod style;

pub use arrange::{execute_arrange, revert_files, ArrangeItem, ArrangeOutcome, RevertOutcome};
pub use duplicates::{delete_duplicates, DeleteOutcome};
pub use rename::{rename_files, RenameOutcome, RenamePair};
pub use scan::{scan_folder, ScanResult};
pub use style::{apply_folder_style, reveal_in_explorer, StyleOutcome};
