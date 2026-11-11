"""Build docs/runbook.html, the self-contained build book, from docs/capture-log.md.

Usage: python3 tools/build_runbook.py "<milestone title>"
The book has no external dependencies. Timeline times are shown in US Eastern.
"""

from __future__ import annotations

import html
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
EASTERN = ZoneInfo("America/New_York")

CSS = """
:root{--bg:#050a18;--panel:#0b1530;--line:#1c2c58;--text:#eaf6ff;--muted:#9db4d6;--blue:#2d7bff;--cyan:#3fe0ff;--indigo:#8f8ff5;--amber:#ffb020;--magenta:#ff5ae0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px 64px}h1{font-size:2rem;margin:0 0 4px}
h2{font-size:1.2rem;margin:40px 0 12px;color:var(--cyan);border-bottom:1px solid var(--line);padding-bottom:6px}
p.lead{color:var(--muted);margin:0 0 16px}.wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;background:var(--panel);border-radius:8px}
th,td{text-align:left;vertical-align:top;padding:8px 12px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600;font-size:.85rem;text-transform:uppercase;letter-spacing:.05em}tr:last-child td{border-bottom:0}
code{font-family:ui-monospace,Menlo,monospace;font-size:.9em;color:var(--cyan)}strong{color:var(--amber)}
ul.check,ul.open{list-style:none;padding:0;margin:0}
ul.check li,ul.open li{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 12px 10px 44px;margin:6px 0;position:relative}
ul.check li::before,ul.open li::before{position:absolute;left:12px;top:10px;width:22px;height:22px;border-radius:5px;border:2px solid var(--blue);content:"";display:grid;place-items:center;font-weight:700;font-size:14px;line-height:1}
ul.check li.done::before{content:"\\2713";background:var(--blue);color:var(--bg)}
ul.check li.wait,ul.open li{border-color:var(--amber)}ul.check li.wait::before,ul.open li::before{content:"\\2026";border-color:var(--amber);color:var(--amber)}
ul.check li span{display:block;color:var(--muted);font-size:.92rem}
"""


STAMP = re.compile(r"(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?Z")


def local_time(found: re.Match[str]) -> str:
    """One UTC timestamp as US Eastern with the weekday, e.g. "Tue Nov 10, 6:05 PM EST"."""
    day, hh, mm, ss = found.groups()
    moment = (
        datetime.fromisoformat(f"{day}T{hh}:{mm}:{ss or '00'}")
        .replace(tzinfo=UTC)
        .astimezone(EASTERN)
    )
    return f"{moment.strftime('%a %b')} {moment.day}, {moment.strftime('%I:%M %p %Z').lstrip('0')}"


def inline(text: str) -> str:
    out = html.escape(text.strip())
    # The log keeps UTC. The book is read by the owner, so a full timestamp in running
    # text is shown in US Eastern. Anything in code formatting stays as written, because
    # it quotes a file or a command.
    parts = re.split(r"(`[^`]+`)", out)
    out = "".join(
        part if part.startswith("`") else STAMP.sub(local_time, part) for part in parts
    )
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    return re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)


def eastern(cell: str) -> str:
    """Rewrites a leading UTC timestamp as US Eastern with the weekday; leaves other text alone."""
    found = STAMP.match(cell.strip())
    if not found:
        return eastern_approx(cell)
    return local_time(found) + cell.strip()[found.end() :]


def eastern_approx(cell: str) -> str:
    """Rewrites "YYYY-MM-DD, about HH:MM", "... before HH:MM" or "...HH:MM–HH:MM" (UTC) as US Eastern; leaves other text alone."""
    found = re.match(
        r"(\d{4}-\d{2}-\d{2}), (about|before) (\d{2}:\d{2})(?:–(\d{2}:\d{2}))?$",
        cell.strip(),
    )
    if not found:
        return cell
    day, word, start, end = found.groups()

    def local(clock: str) -> datetime:
        return (
            datetime.fromisoformat(f"{day}T{clock}:00")
            .replace(tzinfo=UTC)
            .astimezone(EASTERN)
        )

    first = local(start)
    text = f"{first.strftime('%a %b')} {first.day}, {word} {first.strftime('%I:%M %p').lstrip('0')}"
    if end:
        text += f"–{local(end).strftime('%I:%M %p').lstrip('0')}"
    return f"{text} {first.strftime('%Z')}"


def sections(markdown: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    name = ""
    for line in markdown.splitlines():
        if line.startswith("## "):
            name = line[3:].strip()
            out[name] = []
        elif name:
            out[name].append(line)
    return out


def rows(lines: list[str]) -> list[list[str]]:
    table = [line for line in lines if line.startswith("|")]
    return [
        [c.strip() for c in line.strip().strip("|").split("|")] for line in table[2:]
    ]


def header(lines: list[str]) -> list[str]:
    first = next(line for line in lines if line.startswith("|"))
    return [c.strip() for c in first.strip().strip("|").split("|")]


def table(lines: list[str], convert_time: bool = False) -> str:
    names = header(lines)
    if convert_time:
        # The log keeps UTC; the book shows the converted times, so its heading says so.
        names[0] = "Time (US Eastern)"
    head = "".join(f"<th>{inline(h)}</th>" for h in names)
    body = ""
    for row in rows(lines):
        cells = [eastern(row[0]) if convert_time else row[0], *row[1:]]
        body += "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>"
    return f'<div class="wrap"><table><tr>{head}</tr>{body}</table></div>'


def main() -> int:
    title = sys.argv[1] if len(sys.argv) > 1 else "Build book"
    log = sections((ROOT / "docs" / "capture-log.md").read_text())
    steps = ""
    for _, step, result in rows(log["Steps and results"]):
        # A step shows as waiting only when its result states that in bold, as in
        # "**Not run.**". Matching the words anywhere marked finished steps that
        # merely said "opened" or "open items".
        waiting = (
            re.search(
                r"\*\*[^*]*\b(not done|not run|waiting)\b[^*]*\*\*",
                result,
                re.IGNORECASE,
            )
            is not None
        )
        steps += f'<li class="{"wait" if waiting else "done"}">{inline(step)}<span>{inline(result)}</span></li>'
    open_items = "".join(
        f"<li>{inline(line[2:])}</li>"
        for line in log["Open items"]
        if line.startswith("- ")
    )
    stamp = datetime.now(EASTERN)
    made = f"{stamp.strftime('%a %b')} {stamp.day}, {stamp.strftime('%I:%M %p %Z').lstrip('0')}"
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Backbone build book</title><style>{CSS}</style></head><body><main>
<h1>Backbone build book</h1>
<p class="lead">{html.escape(title)}. Generated from <code>docs/capture-log.md</code> on {made}.</p>
<h2>Steps</h2><ul class="check">{steps}</ul>
<h2>Open items</h2><ul class="open">{open_items}</ul>
<h2>Gotchas</h2>{table(log["Gotchas"])}
<h2>Questions and answers</h2>{table(log["Questions and answers"])}
<h2>Timeline (US Eastern)</h2>{table(log["Timeline"], convert_time=True)}
<p class="lead" style="margin-top:32px">Checks and their results are in the verification table of <code>README.md</code>
and, step by step, in <code>PROVENANCE.md</code>.</p>
</main></body></html>
"""
    (ROOT / "docs" / "runbook.html").write_text(page)
    print(f"wrote docs/runbook.html ({len(page)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
