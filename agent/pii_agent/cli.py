"""pii-agent: run the pipeline on one task from files and write the plan and the cards.

pii-agent run --left left.txt [--right right.txt] [--file-name NAME] [--labels labels.json] [--out DIR]
pii-agent run --task-dir tests/fixtures --task bug6-git-logs
pii-agent version
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import get_settings
from .log import Logger
from .pipeline import Pipeline
from .task_source import FileTaskSource, task_from_files
from .tools import Toolbox


def _summary(result_plan_labels: int, questions: int, approve: int, cards: int, mode: str) -> str:
    return f"{mode}: {result_plan_labels} labels · {questions} questions · {cards} cards · approve-all {approve}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="pii-agent")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="annotate one task")
    r.add_argument("--left", type=Path)
    r.add_argument("--right", type=Path)
    r.add_argument("--labels", type=Path, help="JSON list of existing right labels [{label, start, end}]")
    r.add_argument("--file-name", default="")
    r.add_argument("--task-dir", type=Path, help="folder of task folders (left.*, right.*, meta.json)")
    r.add_argument("--task", help="task folder name inside --task-dir")
    r.add_argument("--out", type=Path, help="write plan.json and cards.json here (default: print the plan)")
    r.add_argument("--no-model", action="store_true", help="rules only")
    r.add_argument(
        "--llm", choices=["none", "local", "anthropic"], help="adjudicator (default: PII_AGENT_LLM_PROVIDER)"
    )
    sub.add_parser("version", help="print engine, model and rubric versions")
    args = ap.parse_args(argv)

    settings = get_settings()
    if getattr(args, "no_model", False):
        settings = settings.model_copy(update={"gliner": "off"})
    if getattr(args, "llm", None):
        settings = settings.model_copy(update={"llm_provider": args.llm})
    tools = Toolbox(FileTaskSource(args.task_dir) if getattr(args, "task_dir", None) else None, settings)
    try:
        if args.cmd == "version":
            print(json.dumps(tools.versions, indent=1))
            return 0
        pipe = Pipeline(tools, Logger(level=settings.log_level))
        if args.task_dir and args.task:
            result = pipe.run_id(args.task)
        elif args.left:
            result = pipe.run(task_from_files(args.left, args.right, args.file_name, args.labels))
        else:
            ap.error("give --left, or --task-dir and --task")
        plan_json = result.plan.model_dump_json(indent=1)
        if args.out:
            args.out.mkdir(parents=True, exist_ok=True)
            (args.out / "plan.json").write_text(plan_json + "\n", encoding="utf-8")
            (args.out / "cards.json").write_text(result.cards.model_dump_json(indent=1) + "\n", encoding="utf-8")
            print(
                _summary(
                    len(result.plan.labels),
                    len(result.plan.questions),
                    result.cards.approve_all.count,
                    len(result.cards.cards),
                    result.plan.mode,
                )
            )
        else:
            sys.stdout.write(plan_json + "\n")
        return 0
    finally:
        tools.close()


if __name__ == "__main__":
    raise SystemExit(main())
