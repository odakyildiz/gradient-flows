#!/usr/bin/env python3
"""Export the public workshop programme from its editable LaTeX sources.

Run from any directory: python3 web/scripts/export-programme.py
Use --source-dir to point at another copy of the Overleaf programme project.
Both programme-data.json and the embedded data in index.html are regenerated,
so the website also works when index.html is opened directly from disk.
Only the public schedule and abstract macros are read; no participant records,
source comments, document metadata, or planning notes are exported.

The small TeX reader understands balanced arguments, comments, text formatting,
links, accents, and mathematics. Unknown text commands raise an error so a new
source construct cannot silently disappear from the published abstracts.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit


class ExportError(ValueError):
    """The source cannot be faithfully exported."""


def without_comments(source: str) -> str:
    lines = []
    for line in source.splitlines(keepends=True):
        for index, char in enumerate(line):
            if char != "%":
                continue
            preceding = len(line[:index]) - len(line[:index].rstrip("\\"))
            if preceding % 2 == 0:
                line = line[:index] + ("\n" if line.endswith("\n") else "")
                break
        lines.append(line)
    return "".join(lines)


def skip_space(source: str, position: int) -> int:
    while position < len(source) and source[position].isspace():
        position += 1
    return position


def argument(source: str, position: int, opener: str = "{") -> tuple[str, int]:
    position = skip_space(source, position)
    if position >= len(source) or source[position] != opener:
        raise ExportError(f"Expected {opener!r} near {source[position:position + 60]!r}")
    closer = "}" if opener == "{" else "]"
    start = position + 1
    position = start
    depth, brace_depth = 1, 0
    while position < len(source):
        char = source[position]
        if char == "\\":
            position += 2  # Escaped delimiters never end an argument.
            continue
        if opener == "[" and char in "{}":
            brace_depth += 1 if char == "{" else -1
        if not brace_depth:
            if char == opener:
                depth += 1
            elif char == closer:
                depth -= 1
                if not depth:
                    return source[start:position], position + 1
        position += 1
    raise ExportError(f"Unclosed {opener!r} argument near {source[start:start + 60]!r}")


def macro_calls(source: str, name: str, count: int):
    position = 0
    pattern = re.compile(r"\\" + re.escape(name) + r"\b")
    while match := pattern.search(source, position):
        position = match.end()
        values = []
        for _ in range(count):
            value, position = argument(source, position)
            values.append(value)
        yield values


class TextContent(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str):
        self.parts.append(data)

    def handle_starttag(self, tag: str, attrs):
        if tag in {"br", "p"}:
            self.parts.append(" ")

    def handle_endtag(self, tag: str):
        if tag == "p":
            self.parts.append(" ")


def plain_text(fragment: str) -> str:
    parser = TextContent()
    parser.feed(fragment)
    return re.sub(r"\s+", " ", "".join(parser.parts)).strip()


class TexHTML:
    ACCENTS = {"'": "\u0301", "`": "\u0300", '"': "\u0308", "^": "\u0302",
               "~": "\u0303", "=": "\u0304", ".": "\u0307", "u": "\u0306",
               "v": "\u030c", "H": "\u030b", "c": "\u0327", "k": "\u0328",
               "r": "\u030a"}
    SYMBOLS = {"L": "Ł", "l": "ł", "o": "ø", "O": "Ø", "ae": "æ", "AE": "Æ",
               "oe": "œ", "OE": "Œ", "ss": "ß", "i": "ı", "j": "ȷ", "dag": "†",
               "ddag": "‡", "textendash": "–", "textemdash": "—", "textasciitilde": "~",
               "textbackslash": "\\", "textasciicircum": "^"}
    FORMATTING = {"textbf": "strong", "emph": "em", "textit": "em",
                  "textsuperscript": "sup", "textsubscript": "sub", "texttt": "code"}
    LAYOUT = {"small", "footnotesize", "scriptsize", "normalsize", "medskip", "smallskip",
              "bigskip", "noindent", "ignorespaces", "unskip"}

    def __init__(self, macros: dict[str, str]):
        self.macros = macros

    @staticmethod
    def closing_math(source: str, position: int, closer: str) -> int:
        while position < len(source):
            if source.startswith(closer, position):
                return position
            if source[position] == "\\":
                position += 2
            else:
                position += 1
        raise ExportError(f"Unclosed mathematics; expected {closer!r}")

    def fragment(self, source: str, expansion_stack: tuple[str, ...] = ()) -> str:
        output: list[str] = []
        position = 0
        while position < len(source):
            char = source[position]
            if char == "$" or source.startswith((r"\(", r"\["), position):
                if source.startswith("$$", position):
                    opening, closing, display = "$$", "$$", True
                elif char == "$":
                    opening, closing, display = "$", "$", False
                elif source.startswith(r"\[", position):
                    opening, closing, display = r"\[", r"\]", True
                else:
                    opening, closing, display = r"\(", r"\)", False
                start = position + len(opening)
                end = self.closing_math(source, start, closing)
                formula = source[start:end].strip()
                output.append(html.escape((r"\[" if display else r"\(") + formula
                                          + (r"\]" if display else r"\)"), quote=False))
                position = end + len(closing)
                continue
            if char == "{":
                value, position = argument(source, position)
                output.append(self.fragment(value, expansion_stack))
                continue
            if char == "}":
                raise ExportError("Unexpected closing brace in text")
            if char != "\\":
                start = position
                while position < len(source) and source[position] not in "\\${}":
                    position += 1
                value = source[start:position]
                value = value.replace("---", "—").replace("--", "–")
                value = value.replace("``", "“").replace("''", "”").replace("`", "‘")
                output.append(html.escape(value.replace("~", "\u00a0"), quote=False))
                continue
            match = re.match(r"\\([A-Za-z]+|.)", source[position:], re.DOTALL)
            if not match:
                raise ExportError("Trailing backslash")
            command = match.group(1)
            position += match.end()
            if command.isalpha():
                position = skip_space(source, position)
            if command in self.macros:
                if command in expansion_stack:
                    raise ExportError(f"Recursive title macro: {command}")
                output.append(self.fragment(self.macros[command], expansion_stack + (command,)))
            elif command in self.FORMATTING:
                value, position = argument(source, position)
                tag = self.FORMATTING[command]
                output.append(f"<{tag}>{self.fragment(value, expansion_stack)}</{tag}>")
            elif command == "textcolor":
                _, position = argument(source, position)
                value, position = argument(source, position)
                output.append(self.fragment(value, expansion_stack))
            elif command in {"href", "url"}:
                url, position = argument(source, position)
                if urlsplit(url).scheme not in {"https", "http", "mailto"}:
                    raise ExportError(f"Unsupported link scheme: {url!r}")
                if command == "href":
                    label, position = argument(source, position)
                    label_html = self.fragment(label, expansion_stack)
                else:
                    label_html = html.escape(url)
                output.append(f'<a href="{html.escape(url, quote=True)}">{label_html}</a>')
            elif command == "hyperref":
                target, position = argument(source, position, "[")
                label, position = argument(source, position)
                if target == "poster:index":
                    output.append('<a href="#poster-abstracts">Poster abstracts</a>')
                elif target.startswith("abs:"):
                    output.append(self.fragment(label, expansion_stack))
                else:
                    raise ExportError(f"Unsupported internal reference: {target!r}")
            elif command in self.ACCENTS:
                if position < len(source) and source[position] == "{":
                    value, position = argument(source, position)
                    value = plain_text(self.fragment(value, expansion_stack))
                elif position < len(source):
                    value, position = source[position], position + 1
                else:
                    raise ExportError(f"Missing letter for accent {command!r}")
                if len(value) != 1:
                    raise ExportError(f"Accent requires one letter: {value!r}")
                output.append(html.escape(unicodedata.normalize("NFC", value + self.ACCENTS[command])))
            elif command in self.SYMBOLS:
                output.append(self.SYMBOLS[command])
            elif command == "par":
                output.append("\n\n")
            elif command == "\\" or command == "newline":
                output.append("<br>")
            elif command in {"quad", "qquad", " ", ",", ":", ";", "!"}:
                output.append(" ")
            elif command in self.LAYOUT:
                pass  # Font sizes and spacing do not change public text content.
            elif command in {"&", "%", "_", "#", "$", "{", "}"}:
                output.append(html.escape(command, quote=False))
            else:
                raise ExportError(f"Unsupported text command \\{command}; add an explicit conversion")
        return "".join(output)

    def inline(self, source: str) -> str:
        return re.sub(r"\s+", " ", self.fragment(source)).strip()

    def paragraphs(self, source: str) -> str:
        rendered = self.fragment(source).strip()
        paragraphs = [re.sub(r"\s+", " ", part).strip()
                      for part in re.split(r"\n\s*\n", rendered)]
        return "".join(f"<p>{part}</p>" for part in paragraphs if part)


def title_macros(source: str) -> dict[str, str]:
    macros = {}
    for match in re.finditer(r"\\newcommand\s*\{\\([A-Za-z]+title)\}", source):
        value, _ = argument(source, match.end())
        macros[match.group(1)] = value
    if len(macros) != 15:
        raise ExportError(f"Expected 15 invited title macros, found {len(macros)}")
    return macros


def schedule_days(source: str, renderer: TexHTML) -> list[dict]:
    days = []
    markers = list(re.finditer(r"\\label\{day:([a-z]+)\}", source))
    for number, marker in enumerate(markers):
        section = source[marker.end():markers[number + 1].start() if number + 1 < len(markers) else None]
        heading = next(macro_calls(section, "heading", 2))
        date_match = re.search(r"\b(\d{1,2} [A-Za-z]+ \d{4})\b", heading[0])
        if not date_match:
            raise ExportError(f"Missing calendar date for day {marker.group(1)}")
        date = datetime.strptime(date_match.group(1), "%d %B %Y")
        table = re.search(r"\\begin\{schedule\}(.*?)\\end\{schedule\}", section, re.DOTALL)
        if not table:
            raise ExportError("Missing schedule table")
        rows, position = [], 0
        while match := re.search(r"\\(session|event|talk)\b", table.group(1)[position:]):
            kind = match.group(1)
            position += match.end()
            arguments = []
            optional_title = None
            if kind == "talk" and table.group(1)[skip_space(table.group(1), position)] == "[":
                optional_title, position = argument(table.group(1), position, "[")
            for _ in range({"session": 1, "event": 3, "talk": 4}[kind]):
                value, position = argument(table.group(1), position)
                arguments.append(value)
            if kind == "session":
                rows.append({"kind": "session", "time": "", "title": plain_text(renderer.inline(arguments[0]))})
            elif kind == "event":
                time, title, detail = arguments
                # Private social arrangements do not belong in the public programme.
                if re.search(r"speakers?[’']?\s+dinner", title, re.IGNORECASE):
                    continue
                title_html = renderer.inline(title)
                rows.append({"kind": "event", "time": plain_text(renderer.inline(time)),
                             "title": plain_text(title_html), "titleHtml": title_html,
                             "detailHtml": renderer.inline(detail)})
            else:
                time, talk_label, speaker, affiliation = arguments
                talk_number = re.fullmatch(r"TALK\s+(\d{2})", talk_label)
                if not talk_number or optional_title is None:
                    raise ExportError(f"Missing ID or title in talk row {arguments!r}")
                talk_id = "T" + talk_number.group(1)
                reference = re.search(r"\\hyperref\[abs:(T\d{2})\]", optional_title)
                if not reference or reference.group(1) != talk_id:
                    raise ExportError(f"Talk title reference does not match {talk_id}")
                title_html = renderer.inline(optional_title)
                rows.append({"kind": "talk", "time": plain_text(renderer.inline(time)),
                             "title": plain_text(title_html), "titleHtml": title_html,
                             "speaker": plain_text(renderer.inline(speaker)), "talkId": talk_id,
                             "affiliationHtml": renderer.inline(affiliation)})
        days.append({"id": marker.group(1), "date": date.strftime("%Y-%m-%d"),
                     "label": f"{date.strftime('%A')} {date.day} {date.strftime('%B')}", "events": rows})
    if [day["id"] for day in days] != ["mon", "tue", "wed"]:
        raise ExportError("Expected the Monday, Tuesday, and Wednesday schedule")
    return days


def export(source_dir: Path) -> dict:
    sources = {name: without_comments((source_dir / name).read_text(encoding="utf-8"))
               for name in ("programme.tex", "schedule.tex", "speaker-abstracts.tex", "abstracts.tex")}
    renderer = TexHTML(title_macros(sources["programme.tex"]))
    days = schedule_days(sources["schedule.tex"], renderer)
    slots = {row["talkId"]: (day, row) for day in days for row in day["events"] if row["kind"] == "talk"}
    talks = []
    for talk_id, speaker, title, affiliation, date_time, body in macro_calls(sources["speaker-abstracts.tex"], "speakerabstract", 6):
        if talk_id not in slots:
            raise ExportError(f"Abstract {talk_id} is missing from the schedule")
        day, row = slots[talk_id]
        title_html = renderer.inline(title)
        speaker_text = plain_text(renderer.inline(speaker))
        affiliation_html = renderer.inline(affiliation)
        if (speaker_text, title_html, affiliation_html) != (row["speaker"], row["titleHtml"], row["affiliationHtml"]):
            raise ExportError(f"The schedule and abstract disagree for {talk_id}")
        expected_date_time = f"{day['label']} {row['time']}"
        if plain_text(renderer.inline(date_time)) != expected_date_time:
            raise ExportError(f"The date/time does not match for {talk_id}")
        talks.append({"id": talk_id, "speaker": speaker_text, "title": plain_text(title_html),
                      "titleHtml": title_html, "affiliationHtml": affiliation_html,
                      "abstractHtml": renderer.paragraphs(body), "date": day["date"], "time": row["time"]})
    posters = []
    for poster_id, presenter, title, authors, body in macro_calls(sources["abstracts.tex"], "posterabstract", 5):
        title_html = renderer.inline(title)
        posters.append({"id": poster_id, "presenter": plain_text(renderer.inline(presenter)),
                        "title": plain_text(title_html), "titleHtml": title_html,
                        "authorsHtml": renderer.inline(authors), "abstractHtml": renderer.paragraphs(body)})
    if [talk["id"] for talk in talks] != [f"T{index:02}" for index in range(1, 16)]:
        raise ExportError("Expected exactly T01–T15, in programme order")
    if len(slots) != len(talks):
        raise ExportError("The schedule contains a talk without an abstract")
    if [poster["id"] for poster in posters] != [f"P{index:02}" for index in range(1, 19)]:
        raise ExportError("Expected exactly the 18 accepted posters P01–P18")
    if any(not plain_text(item["abstractHtml"]) for item in talks + posters):
        raise ExportError("An abstract is empty")
    return {"talks": talks, "posters": posters, "days": days}


def embed_data(document: str, json_text: str) -> str:
    """Keep one generated JSON block in the head without altering the page."""
    start = "<!-- programme-data:start -->"
    end = "<!-- programme-data:end -->"
    # Script elements use raw-text parsing even with application/json. Escaping
    # '<' prevents any abstract text from prematurely closing the element.
    safe_json = json_text.rstrip().replace("<", r"\u003c")
    block = (f'    {start}\n    <script type="application/json" id="programme-data">\n'
             f'{safe_json}\n    </script>\n    {end}\n')
    if start in document or end in document:
        if document.count(start) != 1 or document.count(end) != 1:
            raise ExportError("Expected one complete generated programme-data block")
        pattern = re.compile(r"^[ \t]*" + re.escape(start) + r".*?^[ \t]*" + re.escape(end) + r"\n?",
                             re.MULTILINE | re.DOTALL)
        if not pattern.search(document):
            raise ExportError("Malformed programme-data block markers")
        return pattern.sub(lambda _: block, document, count=1)
    # Adopt an existing unmarked data element when upgrading an older page.
    existing = re.compile(r'^[ \t]*<script\b[^>]*\bid\s*=\s*([\'"])programme-data\1[^>]*>.*?</script>\s*\n?',
                          re.MULTILINE | re.DOTALL | re.IGNORECASE)
    matches = list(existing.finditer(document))
    if matches:
        if len(matches) != 1:
            raise ExportError("Multiple programme-data elements in the page")
        return existing.sub(lambda _: block, document, count=1)
    closing_head = re.compile(r"^[ \t]*</head>", re.MULTILINE | re.IGNORECASE)
    if len(closing_head.findall(document)) != 1:
        raise ExportError("Expected one closing </head> in the page")
    return closing_head.sub(lambda match: block + match.group(), document, count=1)


def main():
    web_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=web_dir.parent / "overleaf" / "programme")
    parser.add_argument("--output", type=Path, default=web_dir / "programme-data.json")
    parser.add_argument("--html-output", type=Path, default=web_dir / "index.html",
                        help="HTML page whose embedded programme data is refreshed")
    args = parser.parse_args()
    data = export(args.source_dir)
    json_text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    document = args.html_output.read_text(encoding="utf-8")
    embedded_document = embed_data(document, json_text)
    args.output.write_text(json_text, encoding="utf-8")
    if document != embedded_document:
        args.html_output.write_text(embedded_document, encoding="utf-8")
    print(f"Exported {len(data['talks'])} talks, {len(data['posters'])} posters, and {len(data['days'])} days to {args.output}")
    print(f"Refreshed embedded programme data in {args.html_output}")


if __name__ == "__main__":
    main()
