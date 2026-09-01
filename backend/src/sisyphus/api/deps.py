from __future__ import annotations

from fastapi import Request

from ..application.board_service import BoardService
from ..application.task_service import TaskService


def board_service(request: Request) -> BoardService:
    return request.app.state.board_service


def task_service(request: Request) -> TaskService:
    return request.app.state.task_service
