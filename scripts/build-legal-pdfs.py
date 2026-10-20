"""Generate legal PDFs from the private, versioned content source."""
from pathlib import Path
import json
from html import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4

ROOT = Path(__file__).resolve().parents[1]
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='AtlasTitle', fontName='Helvetica-Bold', fontSize=24, leading=29, textColor=HexColor('#162a46'), spaceAfter=16))
styles.add(ParagraphStyle(name='AtlasHeading', fontName='Helvetica-Bold', fontSize=12, leading=16, spaceBefore=14, spaceAfter=6, keepWithNext=True, textColor=HexColor('#175bb5')))
styles.add(ParagraphStyle(name='AtlasBody', fontName='Helvetica', fontSize=10, leading=15, spaceAfter=6))
styles.add(ParagraphStyle(name='AtlasMeta', fontName='Helvetica', fontSize=9, leading=13, textColor=HexColor('#526174'), spaceAfter=12))
def footer(canvas, doc):
    canvas.saveState(); canvas.setFont('Helvetica',8); canvas.setFillColor(HexColor('#526174'))
    canvas.drawString(44,30,'Atlas Software & Diseño | atlasdeveloperar@gmail.com')
    canvas.drawRightString(A4[0]-44,30,str(doc.page)); canvas.restoreState()
for document in json.loads((ROOT / 'scripts/legal-content.json').read_text(encoding='utf-8')):
    story = [Paragraph('Atlas Software &amp; Diseño', styles['AtlasHeading']), Paragraph(document['title'], styles['AtlasTitle']), Paragraph('Vigente desde el 20 de octubre de 2026 | Versión 1.0', styles['AtlasMeta'])]
    for tag, text in document['blocks']:
        story.append(Paragraph(escape(text), styles['AtlasHeading' if tag == 'h2' else 'AtlasBody']))
    if document['slug'] == 'politicas-privacidad': story += [Spacer(1,12), Paragraph('Referencia oficial: <link href="https://www.argentina.gob.ar/aaip/datospersonales/derechos" color="#175bb5">Derechos sobre datos personales - AAIP</link>', styles['AtlasMeta'])]
    out = ROOT / 'output/pdf' / (document['slug'] + '-atlas.pdf')
    out.parent.mkdir(parents=True, exist_ok=True)
    SimpleDocTemplate(str(out), pagesize=A4, rightMargin=44, leftMargin=44, topMargin=40, bottomMargin=52, title=document['title'] + ' - Atlas Software & Diseño', author='Atlas Software & Diseño').build(story, onFirstPage=footer, onLaterPages=footer)
    print(out)
