"""Build a click-to-copy prompt page from docs/facility-art-prompts.md.

    python scripts/build-prompt-page.py

Writes "Zv2 prompts.html" to the Desktop by default. Generated from the markdown
rather than written by hand, so the page cannot drift from the canonical prompts --
rerun it after editing the doc.
"""

import argparse
import html
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, "docs", "facility-art-prompts.md")
DEFAULT_OUT = os.path.join(os.path.expanduser("~"), "Desktop", "Zv2 prompts.html")

SECTION = re.compile(r"^### (.+?)$", re.M)
FENCE = re.compile(r"```\n(.*?)```", re.S)


def parse(md):
    """Yield (heading, note, prompt) for every section carrying a fenced prompt."""
    marks = list(SECTION.finditer(md))
    for i, m in enumerate(marks):
        body = md[m.end():marks[i + 1].start() if i + 1 < len(marks) else len(md)]
        fence = FENCE.search(body)
        if not fence:
            continue
        note = body[:fence.start()].strip()
        note = re.sub(r"\s+", " ", re.sub(r"[`*]", "", note))
        yield m.group(1).strip(), note, fence.group(1).strip()


PAGE = """<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zv2 facility prompts</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin:0; padding:28px clamp(14px,4vw,48px) 80px; background:#141815; color:#e6e0cf;
         font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif; }}
  h1 {{ margin:0 0 4px; font-size:23px; color:#f2e6c4; }}
  .sub {{ color:#9b937f; font-size:13px; margin-bottom:22px; }}
  .settings {{ border:1px solid #3d4a3f; background:#1b221d; padding:12px 15px; margin-bottom:26px;
               font-size:13px; color:#bcc7bb; }}
  .settings b {{ color:#e2d9b8; }}
  .card {{ border:1px solid #39423a; background:#191f1b; margin-bottom:14px; }}
  .card > header {{ display:flex; gap:12px; align-items:baseline; justify-content:space-between;
                    padding:11px 14px; border-bottom:1px solid #2c332d; }}
  .card h2 {{ margin:0; font-size:15px; color:#f0e3bd; font-weight:600; }}
  .note {{ color:#a08f6d; font-size:12px; padding:9px 14px 0; }}
  button {{ border:1px solid #7d6a38; background:#3f3722; color:#f2ddaa; font:600 12px system-ui;
            padding:7px 14px; cursor:pointer; white-space:nowrap; }}
  button:hover {{ background:#54492c; }}
  button.done {{ border-color:#4d7d51; background:#25401f; color:#bfe4ba; }}
  pre {{ margin:0; padding:12px 14px; white-space:pre-wrap; word-break:break-word;
         font:12px/1.5 ui-monospace,Consolas,monospace; color:#b9c3b6; max-height:8.5em;
         overflow:hidden; position:relative; }}
  pre.open {{ max-height:none; }}
  .more {{ display:block; width:100%; text-align:left; border:0; border-top:1px solid #2c332d;
           background:#161c18; color:#7f8a7d; padding:6px 14px; font-size:11px; }}
</style>
<h1>Zv2 facility prompts</h1>
<div class="sub">{count} prompts &middot; generated from docs/facility-art-prompts.md &middot; {stamp}</div>
<div class="settings">
  <b>Firefly:</b> model FLUX.2 [pro] &middot; aspect Square (1:1) &middot; 20 credits per generate.<br>
  <b>Reference images:</b> leave EMPTY unless a card says otherwise &mdash; it carries subject as
  well as style, which is what made life support a copy of the headquarters.<br>
  <b>After generating:</b> download raw, no editing, no background removal. Drop into
  <code>Desktop\\Zv2 sprites</code> named after the facility number, e.g. <code>17-2.jpg</code>.
</div>
{cards}
<script>
  function copy(text, btn) {{
    const done = () => {{ const t = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('done');
      setTimeout(() => {{ btn.textContent = t; btn.classList.remove('done'); }}, 1400); }};
    // file:// is not a secure context in every browser, so keep the legacy path.
    if (navigator.clipboard && window.isSecureContext) {{
      navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
    }} else fallback(text, done);
  }}
  function fallback(text, done) {{
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try {{ document.execCommand('copy'); done(); }} finally {{ ta.remove(); }}
  }}
  document.addEventListener('click', (e) => {{
    const b = e.target.closest('[data-copy]');
    if (b) return copy(document.getElementById(b.dataset.copy).textContent, b);
    const m = e.target.closest('.more');
    if (m) {{ const pre = m.previousElementSibling; pre.classList.toggle('open');
      m.textContent = pre.classList.contains('open') ? 'show less' : 'show full prompt'; }}
  }});
</script>
"""

CARD = """<section class="card">
  <header><h2>{title}</h2><button data-copy="p{i}">Copy prompt</button></header>
  {note}<pre id="p{i}">{prompt}</pre>
  <button class="more">show full prompt</button>
</section>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--stamp", default="", help="date shown in the header")
    args = ap.parse_args()

    with open(args.src, encoding="utf-8") as fh:
        md = fh.read()

    cards, count = [], 0
    for i, (title, note, prompt) in enumerate(parse(md)):
        note_html = f'<div class="note">{html.escape(note)}</div>' if note else ""
        cards.append(CARD.format(i=i, title=html.escape(title), note=note_html,
                                 prompt=html.escape(prompt)))
        count += 1

    page = PAGE.format(count=count, stamp=html.escape(args.stamp), cards="".join(cards))
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(page)
    print(f"wrote {args.out} ({count} prompts, {len(page)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
