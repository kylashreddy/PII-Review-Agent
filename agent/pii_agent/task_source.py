"""load_task: where tasks come from. P1 reads files; the platform connector (P5) implements the same interface."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Protocol

from .models import RightLabel, Task


class TaskSource(Protocol):
    def load_task(self, task_id: str) -> Task: ...


class FileTaskSource:
    """A folder per task: left.<ext>, right.<ext> (optional: identify task), meta.json {fileName, rightLabels}.

    The tests/fixtures/<case>/ folders and ml/eval-data/*/<task>/ folders already have this shape.
    """

    def __init__(self, root: Path, file_names: dict[str, str] | None = None) -> None:
        self.root = Path(root)
        self.file_names = file_names or {}

    def load_task(self, task_id: str) -> Task:
        d = self.root / task_id
        if not d.is_dir() or d.resolve().parent != self.root.resolve():
            raise FileNotFoundError(f"no task folder {task_id}")
        meta_file = d / "meta.json"
        meta = json.loads(meta_file.read_text(encoding="utf-8")) if meta_file.exists() else {}

        def side(name: str) -> str | None:
            files = sorted(p for p in d.iterdir() if p.name.startswith(name + "."))
            # "{{}}" splits secret-shaped fixture values so the repository holds none (tests/fixture-pipeline.js).
            return files[0].read_text(encoding="utf-8").replace("{{}}", "") if files else None

        left = side("left")
        if left is None:
            raise FileNotFoundError(f"task {task_id} has no left document")
        right = side("right")
        labels = tuple(RightLabel.model_validate(x) for x in meta.get("rightLabels", []))
        return Task(
            id=task_id,
            file_name=self.file_names.get(task_id, meta.get("fileName", "")),
            left=left,
            right=left if right is None else right,
            right_labels=labels,
        )


def task_from_files(
    left: Path, right: Path | None = None, file_name: str = "", labels: Path | None = None, task_id: str | None = None
) -> Task:
    left_text = Path(left).read_text(encoding="utf-8")
    right_text = Path(right).read_text(encoding="utf-8") if right else left_text
    rl: tuple[RightLabel, ...] = ()
    if labels:
        rl = tuple(RightLabel.model_validate(x) for x in json.loads(Path(labels).read_text(encoding="utf-8")))
    return Task(
        id=task_id or Path(left).parent.name or "task",
        file_name=file_name,
        left=left_text,
        right=right_text,
        right_labels=rl,
    )
