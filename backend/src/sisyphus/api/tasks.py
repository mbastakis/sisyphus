from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..application.task_service import TaskService
from .deps import task_service

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])


class PatchBody(BaseModel):
    expected_modified: str
    set: dict


class LifecycleBody(BaseModel):
    expected_modified: str


class ActionBody(LifecycleBody):
    action: str
    date: str | None = None
    blocker: str | None = None


@router.post("/{uuid}/action")
def action(uuid: str, body: ActionBody, svc: TaskService = Depends(task_service)):
    return {"task": svc.detail(svc.action(uuid, **body.model_dump()))}


class AnnotateBody(BaseModel):
    description: str


class DeleteBody(BaseModel):
    expected_modified: str


@router.get("/{uuid}")
def get_task(uuid: str, svc: TaskService = Depends(task_service)):
    return {"task": svc.detail(svc.get(uuid))}


@router.patch("/{uuid}")
def patch_task(uuid: str, body: PatchBody, svc: TaskService = Depends(task_service)):
    return {"task": svc.detail(svc.patch(uuid, body.expected_modified, body.set))}


@router.post("/{uuid}/complete")
def complete(uuid: str, body: LifecycleBody, svc: TaskService = Depends(task_service)):
    return {"task": svc.detail(svc.lifecycle(uuid, body.expected_modified, "complete"))}


@router.post("/{uuid}/reopen")
def reopen(uuid: str, body: LifecycleBody, svc: TaskService = Depends(task_service)):
    return {"task": svc.detail(svc.lifecycle(uuid, body.expected_modified, "reopen"))}


@router.post("/{uuid}/start")
def start(uuid: str, body: LifecycleBody, svc: TaskService = Depends(task_service)):
    return {"task": svc.detail(svc.lifecycle(uuid, body.expected_modified, "start"))}


@router.post("/{uuid}/stop")
def stop(uuid: str, body: LifecycleBody, svc: TaskService = Depends(task_service)):
    return {"task": svc.detail(svc.lifecycle(uuid, body.expected_modified, "stop"))}


@router.post("/{uuid}/annotations", status_code=201)
def annotate(uuid: str, body: AnnotateBody, svc: TaskService = Depends(task_service)):
    return {"task": svc.detail(svc.annotate(uuid, body.description))}


@router.post("/{uuid}/delete")
def delete_task(uuid: str, body: DeleteBody, svc: TaskService = Depends(task_service)):
    svc.delete(uuid, body.expected_modified)
    return {"ok": True}
