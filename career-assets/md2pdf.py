# -*- coding: utf-8 -*-
"""Minimal, dependency-light Markdown -> PDF converter for one-page case studies.
Usage: python md2pdf.py input.md output.pdf "Optional Footer"
"""
import sys
import markdown
from xhtml2pdf import pisa

CSS = """
@page { size: A4; margin: 1.25cm 1.6cm 1.1cm 1.6cm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 8.7pt; color: #1d1d1f; line-height: 1.28; }
h1 { font-size: 15.5pt; color: #0a3d62; margin: 0 0 2pt 0; border-bottom: 2px solid #0a3d62; padding-bottom: 3pt; }
h2 { font-size: 10.3pt; color: #0a3d62; margin: 8pt 0 2pt 0; }
h3 { font-size: 9.2pt; color: #1f5f8b; margin: 6pt 0 2pt 0; }
p { margin: 2.5pt 0; }
strong { color: #0a3d62; }
hr { border: none; border-top: 1px solid #c8d0d8; margin: 5pt 0; }
ul { margin: 2.5pt 0 2.5pt 0; }
li { margin: 1pt 0; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0; font-size: 8.2pt; }
th { background-color: #0a3d62; color: #ffffff; text-align: left; padding: 3pt 6pt; }
td { border-bottom: 1px solid #d7dee5; padding: 2.5pt 6pt; }
code { font-family: Courier, monospace; font-size: 8.2pt; background-color: #eef2f5; color: #0a3d62; padding: 0 2px; }
blockquote { color: #4a5560; font-style: italic; border-left: 3px solid #9fb3c4; margin: 6pt 0; padding: 2pt 0 2pt 9pt; }
"""

def convert(md_path, pdf_path, footer=""):
    with open(md_path, "r", encoding="utf-8") as f:
        text = f.read()
    body = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    foot = f'<div style="margin-top:10pt;font-size:7.5pt;color:#8a96a3;">{footer}</div>' if footer else ""
    html = f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}{foot}</body></html>"
    with open(pdf_path, "wb") as out:
        result = pisa.CreatePDF(html, dest=out, encoding="utf-8")
    if result.err:
        raise SystemExit(f"PDF generation failed for {pdf_path}")
    print(f"OK -> {pdf_path}")

if __name__ == "__main__":
    md_in, pdf_out = sys.argv[1], sys.argv[2]
    footer = sys.argv[3] if len(sys.argv) > 3 else ""
    convert(md_in, pdf_out, footer)
