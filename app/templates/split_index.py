from pathlib import Path
import re

src = Path("index.html")
text = src.read_text(encoding="utf-8")

# 1) HEAD: <!doctype html> ... </head>
head_end = text.lower().find("</head>")
if head_end == -1:
    raise SystemExit("Could not find </head> in index.html")
head_end += len("</head>")
head = text[:head_end].rstrip() + "\n"

# 2) BODY: <body ...> ... </body>  (we'll remove the LAST <script>...</script> from it)
body_match = re.search(r"<body\b[^>]*>.*?</body\s*>", text, flags=re.IGNORECASE | re.DOTALL)
if not body_match:
    raise SystemExit("Could not find <body>...</body> in index.html")
body = body_match.group(0)

# 3) SCRIPT: choose the LAST <script>...</script> in the entire document (to avoid Stripe.js in <head>)
scripts = list(re.finditer(r"<script\b[^>]*>.*?</script\s*>", text, flags=re.IGNORECASE | re.DOTALL))
if not scripts:
    raise SystemExit("Could not find any <script>...</script> blocks in index.html")
last_script = scripts[-1].group(0)

# Remove the last script from inside the body (if it exists there)
pos = body.rfind(last_script)
if pos == -1:
    # Fallback: remove the last <script>...</script> that appears inside <body> by matching from the right
    inner_scripts = list(re.finditer(r"<script\b[^>]*>.*?</script\s*>", body, flags=re.IGNORECASE | re.DOTALL))
    if not inner_scripts:
        raise SystemExit("Could not find a <script>...</script> block inside <body>.")
    last_script = inner_scripts[-1].group(0)
    pos = body.rfind(last_script)

body_no_script = (
    body[:pos].rstrip()
    + "\n\n    <!-- PASTE Message 3/3 (<script> → </script>) RIGHT HERE -->\n\n"
    + body[pos + len(last_script):].lstrip()
)

# Add any trailing content after </body> (like </html>) into the body chunk so the recombined paste is complete
tail = text[body_match.end():].strip()
if tail:
    body_no_script = body_no_script.rstrip() + "\n" + tail + "\n"

Path("01-head.html").write_text(head, encoding="utf-8")
Path("02-body.html").write_text(body_no_script.rstrip() + "\n", encoding="utf-8")
Path("03-script.html").write_text(last_script.rstrip() + "\n", encoding="utf-8")

print("Wrote: 01-head.html, 02-body.html, 03-script.html")

