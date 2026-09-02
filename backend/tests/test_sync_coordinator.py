import asyncio

import pytest

from sisyphus.domain import commands as cmd
from sisyphus.repositories.fake import FakeTaskRepository
from sisyphus.runtime.sync import NotifyingTaskRepository, SyncCoordinator


@pytest.mark.anyio
async def test_local_mutation_publishes_generation_and_requests_sync():
    inner = FakeTaskRepository(seed=False)
    repo = NotifyingTaskRepository(inner)
    coordinator = SyncCoordinator(repo, interval_seconds=60)
    repo.attach(coordinator)
    await coordinator.start()
    try:
        events = coordinator.events(repo.generation)
        next_event = asyncio.create_task(anext(events))
        repo.create(cmd.CreateTask(description="changed"))
        assert await asyncio.wait_for(next_event, timeout=1) == repo.generation
        await asyncio.sleep(0)
        assert repo.last_sync is not None
    finally:
        await coordinator.stop()


@pytest.mark.anyio
async def test_sync_import_publishes_generation():
    inner = FakeTaskRepository(seed=False)
    repo = NotifyingTaskRepository(inner)
    coordinator = SyncCoordinator(repo)
    repo.attach(coordinator)

    original_sync = inner.sync

    def imported_sync():
        inner.generation += 1
        return original_sync()

    inner.sync = imported_sync
    events = coordinator.events(repo.generation)
    next_event = asyncio.create_task(anext(events))
    await coordinator.sync_now()
    assert await asyncio.wait_for(next_event, timeout=1) == repo.generation
