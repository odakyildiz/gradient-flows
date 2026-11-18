# Gradient Flows workshop webpage

Static website served from this directory. The 2023 and 2025 editions are retained
in their own subdirectories.

## Programme and abstracts

The public programme is sourced from `../overleaf/programme/`. After changing its
schedule, titles or abstracts, regenerate the website data:

```sh
python3 scripts/export-programme.py
```

The exporter updates both `programme-data.json` and the embedded programme data
in `index.html`, keeping the published page and the local file preview in sync.
It validates all 15 talks and 18 posters and preserves author lists,
references and LaTeX mathematics. It reads only the public programme sources.
`programme.js` displays the timetable, day tabs and a single open abstract at a
time across talks and posters. `programme.css` extends the existing website style.
Mathematics uses the locally bundled KaTeX runtime and fonts in `vendor/katex/`.

Compile `programme.tex` from the public programme project into a temporary build
directory. After reviewing the PDF, copy it to
`programme/gradient-flows-2026-programme.pdf`; the PDF link uses this path and
opens in a new browser tab without forcing a download.
The PDF is intentionally included in this website repository for participants.
Generated TeX build files and ZIP archives do not belong in the Overleaf project.

## Local review

Open `index.html` directly in your browser, then select Programme. The timetable,
abstracts, mathematics and PDF download work without a local server or internet
connection; keep the website directory and its assets together.

For an optional HTTP preview, run from this directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000/#programme`.
Local review does not publish changes or push either repository.
