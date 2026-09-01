from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..application.board_service import BoardService, _card
from .deps import board_service

router = APIRouter(prefix="/api/v1/boards", tags=["boards"])


class CreateTaskBody(BaseModel):
    description: str
    project: str | None = None
    tags: list[str] = Field(default_factory=list)
    priority: str | None = None
    due: str | None = None
    column_id: str | None = None
    prompt_value: str | None = None


class MoveBody(BaseModel):
    to_column: str
    expected_modified: str
    prompt_value: str | None = None
    index: int | None = None


class ReorderBody(BaseModel):
    index: int
    expected_modified: str


@router.get("")
def list_boards(svc: BoardService = Depends(board_service)):
    return svc.list_boards()


@router.get("/{board_id}")
def board_projection(board_id: str, svc: BoardService = Depends(board_service)):
    return svc.projection(board_id)


@router.post("/{board_id}/tasks", status_code=201)
def create_task(
    board_id: str, body: CreateTaskBody, svc: BoardService = Depends(board_service)
):
    task = svc.create_task(board_id, body.model_dump())
    board = svc.config.board(board_id)
    return {"task": _card(task, board, {task.uuid: task})}


@router.post("/{board_id}/tasks/{uuid}/move")
def move_task(
    board_id: str, uuid: str, body: MoveBody, svc: BoardService = Depends(board_service)
):
    task = svc.move_task(
        board_id,
        uuid,
        to_column=body.to_column,
        expected_modified=body.expected_modified,
        prompt_value=body.prompt_value,
        index=body.index,
    )
    board = svc.config.board(board_id)
    return {"task": _card(task, board, {task.uuid: task})}


@router.post("/{board_id}/tasks/{uuid}/reorder")
def reorder_task(
    board_id: str, uuid: str, body: ReorderBody, svc: BoardService = Depends(board_service)
):
    task = svc.reorder_task(board_id, uuid, body.index, body.expected_modified)
    board = svc.config.board(board_id)
    return {"task": _card(task, board, {task.uuid: task})}
