from __future__ import annotations

import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/v1", tags=["events"])


@router.get("/events")
async def events(request: Request, generation: int = -1):
    coordinator = request.app.state.sync_coordinator

    async def stream():
        async for current in coordinator.events(generation):
            if await request.is_disconnected():
                break
            if current == generation:
                yield ": keepalive\n\n"
                continue
            payload = json.dumps({"type": "tasks.changed", "generation": current})
            yield f"data: {payload}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
