from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import suppress

from ..repositories.port import SyncResult, TaskRepository

log = logging.getLogger("sisyphus.sync")


class SyncCoordinator:
    def __init__(self, repo: TaskRepository, interval_seconds: float = 30.0):
        self.repo = repo
        self.interval_seconds = interval_seconds
        self._loop: asyncio.AbstractEventLoop | None = None
        self._wake: asyncio.Event | None = None
        self._changed = asyncio.Condition()
        self._task: asyncio.Task[None] | None = None
        self._sync_lock = asyncio.Lock()

    async def start(self) -> None:
        if self._task is not None:
            return
        self._loop = asyncio.get_running_loop()
        self._wake = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="sisyphus-sync")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    def request_sync(self, changed: bool = False) -> None:
        if self._loop is None or self._wake is None:
            return
        self._loop.call_soon_threadsafe(self._wake.set)
        if changed:
            asyncio.run_coroutine_threadsafe(self._notify_changed(), self._loop)

    async def sync_now(self) -> SyncResult:
        async with self._sync_lock:
            before = self.repo.generation
            result = await asyncio.to_thread(self.repo.sync)
            if self.repo.generation != before:
                await self._notify_changed()
            return result

    async def events(self, after: int) -> AsyncIterator[int]:
        generation = after
        while True:
            current = self.repo.generation
            if current != generation:
                generation = current
                yield generation
                continue
            try:
                async with self._changed:
                    await asyncio.wait_for(self._changed.wait(), timeout=15)
            except TimeoutError:
                yield generation

    async def _run(self) -> None:
        while True:
            assert self._wake is not None
            self._wake.clear()
            await self.sync_now()
            with suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=self.interval_seconds)

    async def _notify_changed(self) -> None:
        async with self._changed:
            self._changed.notify_all()


class NotifyingTaskRepository:
    def __init__(self, repo: TaskRepository):
        self._repo = repo
        self._coordinator: SyncCoordinator | None = None

    def attach(self, coordinator: SyncCoordinator) -> None:
        self._coordinator = coordinator

    @property
    def generation(self) -> int:
        return self._repo.generation

    @property
    def last_sync(self):
        return getattr(self._repo, "last_sync", None)

    @property
    def sync_detail(self):
        return getattr(self._repo, "sync_detail", None)

    def sync(self) -> SyncResult:
        return self._repo.sync()

    def query(self, filter):
        return self._repo.query(filter)

    def get(self, uuid):
        return self._repo.get(uuid)

    def create(self, command):
        task = self._repo.create(command)
        self._changed()
        return task

    def apply(self, uuid, mutations):
        task = self._repo.apply(uuid, mutations)
        self._changed()
        return task

    def delete(self, uuid):
        self._repo.delete(uuid)
        self._changed()

    def _changed(self) -> None:
        if self._coordinator is not None:
            self._coordinator.request_sync(changed=True)
