//! Admission happens before blocking dispatch; only the head occupies a blocking worker.
use crate::ipc::{IpcError, IpcErrorCode};
use std::{
    collections::{HashMap, VecDeque},
    future::Future,
    pin::Pin,
    sync::{
        Arc, Mutex, Weak,
        atomic::{AtomicU8, Ordering},
    },
    task::{Context, Poll, Waker},
};
const MAX_PENDING: usize = 128;
#[derive(Default)]
pub(crate) struct MutationQueues(Mutex<HashMap<String, Weak<Queue>>>);
#[derive(Default)]
struct Queue(Mutex<VecDeque<Entry>>);
struct Entry {
    outcome: Arc<AtomicU8>,
    waker: Option<Waker>,
}
pub(crate) struct Ticket {
    queue: Arc<Queue>,
    outcome: Arc<AtomicU8>,
    dependencies: Vec<Arc<AtomicU8>>,
}
impl MutationQueues {
    pub(crate) fn admit(&self, session: &str, barrier: bool) -> Result<Ticket, IpcError> {
        let mut queues = self.0.lock().map_err(|_| IpcError::internal())?;
        queues.retain(|_, queue| queue.strong_count() > 0);
        let queue = queues
            .get(session)
            .and_then(Weak::upgrade)
            .unwrap_or_else(|| {
                let queue = Arc::new(Queue::default());
                queues.insert(session.into(), Arc::downgrade(&queue));
                queue
            });
        let mut pending = queue.0.lock().map_err(|_| IpcError::internal())?;
        if pending.len() >= MAX_PENDING {
            return Err(IpcError::new(
                IpcErrorCode::WriteQueueFull,
                "Очередь операций заполнена. Дождитесь завершения записи.",
            ));
        }
        let dependencies = if barrier {
            pending
                .iter()
                .map(|entry| Arc::clone(&entry.outcome))
                .collect()
        } else {
            Vec::new()
        };
        let outcome = Arc::new(AtomicU8::new(0));
        pending.push_back(Entry {
            outcome: Arc::clone(&outcome),
            waker: None,
        });
        drop(pending);
        Ok(Ticket {
            queue,
            outcome,
            dependencies,
        })
    }
}
impl Ticket {
    pub(crate) fn complete(&self, success: bool) {
        self.outcome
            .store(if success { 1 } else { 2 }, Ordering::Release);
    }
}
impl Future for Ticket {
    type Output = Result<Self, IpcError>;
    fn poll(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Self::Output> {
        let ticket = self.get_mut();
        let Ok(mut pending) = ticket.queue.0.lock() else {
            return Poll::Ready(Err(IpcError::internal()));
        };
        let is_head = pending
            .front()
            .is_some_and(|entry| Arc::ptr_eq(&entry.outcome, &ticket.outcome));
        if !is_head {
            if let Some(entry) = pending
                .iter_mut()
                .find(|entry| Arc::ptr_eq(&entry.outcome, &ticket.outcome))
            {
                entry.waker = Some(context.waker().clone());
            }
            return Poll::Pending;
        }
        if ticket
            .dependencies
            .iter()
            .any(|outcome| outcome.load(Ordering::Acquire) != 1)
        {
            return Poll::Ready(Err(IpcError::new(
                IpcErrorCode::WriteFlushFailed,
                "Предыдущая запись не завершилась успешно. Проверьте черновик и повторите действие.",
            )));
        }
        // The returned owned lease stays in the queue until the blocking operation completes.
        let lease = Self {
            queue: Arc::clone(&ticket.queue),
            outcome: Arc::clone(&ticket.outcome),
            dependencies: Vec::new(),
        };
        ticket.dependencies.clear();
        // Prevent the future's Drop from removing the transferred entry.
        ticket.outcome = Arc::new(AtomicU8::new(1));
        Poll::Ready(Ok(lease))
    }
}
impl Drop for Ticket {
    fn drop(&mut self) {
        let next = if let Ok(mut pending) = self.queue.0.lock() {
            if let Some(index) = pending
                .iter()
                .position(|entry| Arc::ptr_eq(&entry.outcome, &self.outcome))
            {
                self.outcome
                    .compare_exchange(0, 2, Ordering::AcqRel, Ordering::Acquire)
                    .ok();
                pending.remove(index);
                pending.front_mut().and_then(|entry| entry.waker.take())
            } else {
                None
            }
        } else {
            None
        };
        if let Some(waker) = next {
            waker.wake();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn poll(ticket: &mut Ticket) -> Poll<Result<Ticket, IpcError>> {
        let waker = Waker::noop();
        Pin::new(ticket).poll(&mut Context::from_waker(waker))
    }
    fn ready(ticket: &mut Ticket) -> Ticket {
        match poll(ticket) {
            Poll::Ready(Ok(lease)) => lease,
            _ => panic!("head must be ready"),
        }
    }
    #[test]
    fn fifo_reentrant_admission_and_isolated_sessions() {
        let queues = MutationQueues::default();
        let mut first = queues.admit("a", false).unwrap();
        let mut second = queues.admit("a", false).unwrap();
        let mut other = queues.admit("b", true).unwrap();
        assert!(poll(&mut second).is_pending());
        let lease = ready(&mut first);
        let mut nested = queues.admit("a", false).unwrap();
        assert!(poll(&mut nested).is_pending());
        let other_lease = ready(&mut other);
        other_lease.complete(true);
        drop(other_lease);
        lease.complete(true);
        drop(lease);
        let lease = ready(&mut second);
        lease.complete(true);
        drop(lease);
        let lease = ready(&mut nested);
        lease.complete(true);
    }
    #[test]
    fn failed_pending_write_blocks_all_waiting_barriers_but_not_later_retry() {
        let queues = MutationQueues::default();
        let mut save = queues.admit("a", false).unwrap();
        let mut flush = queues.admit("a", true).unwrap();
        let mut git = queues.admit("a", true).unwrap();
        let lease = ready(&mut save);
        lease.complete(false);
        drop(lease);
        assert!(matches!(
            poll(&mut flush),
            Poll::Ready(Err(IpcError {
                code: IpcErrorCode::WriteFlushFailed,
                ..
            }))
        ));
        drop(flush);
        assert!(matches!(
            poll(&mut git),
            Poll::Ready(Err(IpcError {
                code: IpcErrorCode::WriteFlushFailed,
                ..
            }))
        ));
        drop(git);
        let mut retry = queues.admit("a", true).unwrap();
        ready(&mut retry).complete(true);
    }
    #[test]
    fn cancellation_releases_ticket_and_marks_dependency_failed() {
        let queues = MutationQueues::default();
        let mut first = queues.admit("a", false).unwrap();
        let cancelled = queues.admit("a", false).unwrap();
        let mut barrier = queues.admit("a", true).unwrap();
        drop(cancelled);
        let lease = ready(&mut first);
        lease.complete(true);
        drop(lease);
        assert!(matches!(poll(&mut barrier), Poll::Ready(Err(_))));
        drop(barrier);
        drop(first);
        assert!(
            queues
                .0
                .lock()
                .unwrap()
                .values()
                .all(|queue| queue.upgrade().is_none())
        );
    }
    #[test]
    fn bounded_admission_releases_capacity_without_blocking_worker() {
        let queues = MutationQueues::default();
        let mut tickets: Vec<_> = (0..MAX_PENDING)
            .map(|_| queues.admit("a", false).unwrap())
            .collect();
        assert!(matches!(
            queues.admit("a", false),
            Err(IpcError {
                code: IpcErrorCode::WriteQueueFull,
                ..
            })
        ));
        tickets.pop();
        assert!(queues.admit("a", false).is_ok());
    }
}
