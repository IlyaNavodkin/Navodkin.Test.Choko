//! Локальное исполнение после явного доверия; открытие не запускает код.
pub mod contracts;
mod runner;
mod store;
#[cfg(test)]
mod tests;
pub use runner::Start;
use serde::{Deserialize, Serialize};
pub use store::*;
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Code {
    AutomationUntrusted,
    AutomationUnavailable,
    InvalidReport,
    StaleProfile,
    Busy,
    Cancelled,
    Io,
    InvalidRequest,
    InvalidSession,
    UnauthorizedWebview,
    StaleResource,
    Internal,
}
#[derive(Debug, Clone, Serialize)]
pub struct Error {
    pub code: Code,
    pub message: &'static str,
}
impl Error {
    pub const fn new(code: Code) -> Self {
        Self {
            code,
            message: match code {
                Code::AutomationUntrusted => {
                    "Явно разрешите выполнение локального кода этого профиля."
                }
                Code::AutomationUnavailable => {
                    "Node или установленный Playwright недоступен. Проверьте локальную настройку профиля."
                }
                Code::InvalidReport => {
                    "Формат отчёта, идентификаторы или лимиты не соответствуют контракту."
                }
                Code::StaleProfile => {
                    "Профиль, runtime или конфигурация изменились. Обновите discovery и доверие."
                }
                Code::Busy => "В этой сессии уже выполняется discovery или запуск.",
                Code::Cancelled => "Выполнение остановлено.",
                Code::Io => "Не удалось безопасно прочитать или сохранить данные автоматизации.",
                Code::InvalidRequest => "Недопустимые параметры запроса автоматизации.",
                Code::InvalidSession => "Сессия репозитория закрыта или неизвестна.",
                Code::UnauthorizedWebview => "Источник IPC не разрешён.",
                Code::StaleResource => {
                    "Данные изменились. Обновите просмотр перед повторным применением."
                }
                Code::Internal => "Внутренняя ошибка службы автоматизации.",
            },
        }
    }
}
pub type Result<T> = std::result::Result<T, Error>;
impl From<crate::ipc::IpcError> for Error {
    fn from(e: crate::ipc::IpcError) -> Self {
        Self::new(match e.code {
            crate::ipc::IpcErrorCode::UnauthorizedWebview => Code::UnauthorizedWebview,
            crate::ipc::IpcErrorCode::InvalidSession => Code::InvalidSession,
            _ => Code::InvalidRequest,
        })
    }
}
