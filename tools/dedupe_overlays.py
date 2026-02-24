from pathlib import Path
import re

path = Path("app/templates/index.html")
html = path.read_text(encoding="utf-8")

def keep_last_section(html, section_id):
    # Match <section ... id="X"> ... </section>
    pattern = re.compile(
        rf'(<section\b[^>]*\bid="{section_id}"[\s\S]*?</section>)',
        re.IGNORECASE
    )
    matches = list(pattern.finditer(html))

    if len(matches) <= 1:
        return html  # nothing to dedupe

    # Keep only the last one
    last = matches[-1].group(1)

    # Remove all occurrences
    html = pattern.sub("", html)

    # Reinsert the last one at the end (before </body>)
    html = re.sub(
        r'</body>',
        f'\n\n{last}\n\n</body>',
        html,
        flags=re.IGNORECASE
    )

    return html

html = keep_last_section(html, "checkout")
html = keep_last_section(html, "sponsor-interest")

path.write_text(html.strip() + "\n", encoding="utf-8")

print("✔ Deduped overlays: checkout + sponsor-interest")

