from __future__ import annotations


class DomainError(Exception):
    code = "domain_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    code = "not_found"


class ConflictError(DomainError):
    code = "conflict"

    def __init__(self, message: str, task=None):
        super().__init__(message)
        self.task = task


class ReadOnlyColumnError(DomainError):
    code = "read_only_column"


class PromptRequiredError(DomainError):
    code = "prompt_required"

    def __init__(self, message: str, field: str, input_kind: str):
        super().__init__(message)
        self.field = field
        self.input_kind = input_kind


class ValidationError(DomainError):
    code = "validation_error"


class BackendError(DomainError):
    code = "taskwarrior_error"
