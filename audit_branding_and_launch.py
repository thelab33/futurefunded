import os
import re

CHECKLIST = """
<!--
💎 What’s Left Before “Go Live” (UI/UX & CSS Only):
1. LOGO: Fix logo src in Flask/Jinja context to use the actual file you want.
2. Accessibility Sweep: Focus order, contrast, skiplinks, ARIA for all controls.
3. Responsive Regression Test: All layouts/cards/images look perfect on iPhone/Android/tablet/desktop.
4. “Powered by” Badge: Subtle, classy SaaS credit in the footer or drawer.
5. PWA Real-World Test: Add to home screen, confirm icons/splash/manifest.
6. Visual QA: No overflow, no bleed, all tokens/theme variants render.
-->
"""

LOGO_VARS = ['_org_logo', '_ff_logo', 'org_logo', 'ff_logo']
BRAND_KEYWORDS = ['FutureFunded', 'futurefunded', 'Connect ATX Elite']

def find_template_files(root='templates'):
    for dirpath, dirs, files in os.walk(root):
        for fname in files:
            if fname.endswith('.html'):
                yield os.path.join(dirpath, fname)

def audit_branding(template_path):
    with open(template_path, encoding='utf-8') as f:
        content = f.read()
    results = {'missing_logo': False, 'missing_brand': False}
    # Look for logo variables in <img> tags
    has_logo = any(re.search(r'src="\{\{\s*' + v + r'\s*\|?[^}]*\}\}"', content) for v in LOGO_VARS)
    # Look for branding keyword
    has_brand = any(b in content for b in BRAND_KEYWORDS)
    if not has_logo:
        results['missing_logo'] = True
    if not has_brand:
        results['missing_brand'] = True
    return results

def insert_checklist_comment(template_path):
    with open(template_path, encoding='utf-8') as f:
        content = f.read()
    if CHECKLIST.strip() not in content:
        # Add at the very top
        with open(template_path, 'w', encoding='utf-8') as f:
            f.write(CHECKLIST.strip() + '\n' + content)

def main(root='templates', insert_checklist=True):
    summary = []
    for tfile in find_template_files(root):
        audit = audit_branding(tfile)
        if insert_checklist:
            insert_checklist_comment(tfile)
        if audit['missing_logo'] or audit['missing_brand']:
            summary.append((tfile, audit))
    # Print a quick summary
    if summary:
        print("\nBranding issues found in these template files:")
        for fname, result in summary:
            print(f"- {fname}: "
                  f"{'MISSING LOGO' if result['missing_logo'] else ''} "
                  f"{'MISSING BRAND' if result['missing_brand'] else ''}")
        print("\n⚡️ Protip: Edit those files to insert your brand logo and 'FutureFunded' wherever needed!")
    else:
        print("✅ All templates look correctly branded. (Logo + FutureFunded detected everywhere!)")

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Audit templates for branding/logo and UI launch readiness.")
    parser.add_argument('--root', type=str, default='templates', help="Templates root directory")
    parser.add_argument('--skip-checklist', action='store_true', help="Skip inserting launch checklist as comment")
    args = parser.parse_args()
    main(root=args.root, insert_checklist=not args.skip_checklist)
