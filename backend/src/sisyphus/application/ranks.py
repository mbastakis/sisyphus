"""Sparse gapped integer ranks stored as zero-padded strings in a rank UDA.

Ordinary inserts write one task; when a gap closes the whole column is
rebalanced under the repository lock (rare with a 1024 gap).
"""

from __future__ import annotations

GAP = 1024
WIDTH = 12


def format_rank(value: int) -> str:
    return f"{value:0{WIDTH}d}"


def parse_rank(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def rank_between(before: int | None, after: int | None) -> int | None:
    """Rank strictly between neighbors, or None when a rebalance is needed."""
    if before is None and after is None:
        return GAP
    if before is None:
        assert after is not None
        if after <= 1:
            return None
        return after // 2
    if after is None:
        return before + GAP
    if after - before <= 1:
        return None
    return before + (after - before) // 2


def rebalanced(count: int) -> list[int]:
    return [(i + 1) * GAP for i in range(count)]
