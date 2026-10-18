//! Read-only diagnostic using the same repository service as the desktop application.
use std::{env, path::PathBuf, process::ExitCode};

use testoritto_desktop::services::repository::RepositoryService;

fn main() -> ExitCode {
    let mut args = env::args_os().skip(1);
    let Some(selected) = args.next().map(PathBuf::from) else {
        eprintln!("Usage: repo_probe <absolute-repository-path>");
        return ExitCode::from(2);
    };
    if args.next().is_some() || !selected.is_absolute() {
        eprintln!("Expected exactly one absolute repository path.");
        return ExitCode::from(2);
    }
    match RepositoryService::default().open(selected) {
        Ok(opened) => {
            println!("{opened:#?}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error:#?}");
            ExitCode::FAILURE
        }
    }
}
