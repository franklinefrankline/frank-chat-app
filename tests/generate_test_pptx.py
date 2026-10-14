import os
import zipfile
import io

os.makedirs('tests/fixtures', exist_ok=True)

# 1x1 transparent/colored PNG
SAMPLE_PNG = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x10\x00\x00\x00\x10\x08\x02\x00\x00\x00'
    b'\x90\x91h6\x00\x00\x00\x1cIDATx\x9cc\xfc\xff\xff?\x03\x130\x12\x80\xb8\x80\x81\xb8\x80'
    b'\x81\xb8\x80\x81\x00\x00\x81\xcd\x04\xb9k\xd5\xc6\xe1\x00\x00\x00\x00IEND\xaeB`\x82'
)

def xml_escape(s):
    if not s:
        return ''
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;').replace("'", '&apos;')

def create_pptx(filename, slides_data, slide_w=12192000, slide_h=6858000):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        # [Content_Types].xml
        ct = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'''
        for idx in range(1, len(slides_data) + 1):
            ct += f'<Override PartName="/ppt/slides/slide{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        ct += '</Types>'
        z.writestr('[Content_Types].xml', ct)

        # _rels/.rels
        z.writestr('_rels/.rels', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>''')

        # ppt/presentation.xml
        sld_ids = ''.join([f'<p:sldId id="{255 + idx}" r:id="rId{idx}"/>' for idx in range(1, len(slides_data) + 1)])
        z.writestr('ppt/presentation.xml', f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>{sld_ids}</p:sldIdLst>
  <p:sldSz cx="{slide_w}" cy="{slide_h}"/>
</p:presentation>''')

        # ppt/_rels/presentation.xml.rels
        pres_rels = ''.join([f'<Relationship Id="rId{idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{idx}.xml"/>' for idx in range(1, len(slides_data) + 1)])
        z.writestr('ppt/_rels/presentation.xml.rels', f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {pres_rels}
</Relationships>''')

        # Store media if any slide has image
        has_any_image = any(bool(sdata.get('images')) for sdata in slides_data)
        if has_any_image:
            z.writestr('ppt/media/image1.png', SAMPLE_PNG)

        # Slides
        for idx, sdata in enumerate(slides_data, 1):
            title = sdata.get('title')
            shapes = sdata.get('shapes', [])
            tables = sdata.get('tables', [])
            images = sdata.get('images', [])
            trans_xml = sdata.get('transition_xml', '')
            timing_xml = sdata.get('timing_xml', '')
            bg_color = sdata.get('bg_color')

            sp_tree_xml = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:grpSpPr/></p:nvGrpSpPr>'

            spid_counter = 2

            # Title shape (if present)
            if title is not None and title != '':
                sp_tree_xml += f'''
<p:sp>
  <p:nvSpPr><p:cNvPr id="{spid_counter}" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="800000" y="600000"/><a:ext cx="10000000" cy="1100000"/></a:xfrm></p:spPr>
  <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="3200" b="1"/><a:t>{xml_escape(title)}</a:t></a:r></a:p></p:txBody>
</p:sp>'''
                spid_counter += 1

            # Extra Shapes
            for shp in shapes:
                x = shp.get('x', 800000)
                y = shp.get('y', 2000000)
                w = shp.get('w', 9000000)
                h = shp.get('h', 1000000)
                text = shp.get('text', '')
                sp_id = shp.get('id', spid_counter)
                spid_counter += 1

                fill_xml = ''
                if shp.get('bg_color'):
                    fill_xml = f'<a:solidFill><a:srgbClr val="{shp["bg_color"]}"/></a:solidFill>'

                ln_xml = ''
                if shp.get('border_color'):
                    border_w = shp.get('border_w', 25400)
                    ln_xml = f'<a:ln w="{border_w}"><a:solidFill><a:srgbClr val="{shp["border_color"]}"/></a:solidFill></a:ln>'

                font_sz = shp.get('font_size', 2000)
                bold_attr = ' b="1"' if shp.get('bold') else ''
                color_xml = f'<a:solidFill><a:srgbClr val="{shp["color"]}"/></a:solidFill>' if shp.get('color') else ''

                text_xml = ''
                if text:
                    text_xml = f'<p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="{font_sz}"{bold_attr}>{color_xml}</a:rPr><a:t>{xml_escape(text)}</a:t></a:r></a:p></p:txBody>'

                sp_tree_xml += f'''
<p:sp>
  <p:nvSpPr><p:cNvPr id="{sp_id}" name="Shape {sp_id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm>{fill_xml}{ln_xml}</p:spPr>
  {text_xml}
</p:sp>'''

            # Tables
            for tbl in tables:
                tx = tbl.get('x', 800000)
                ty = tbl.get('y', 2200000)
                tw = tbl.get('w', 9600000)
                th = tbl.get('h', 3000000)
                rows_data = tbl.get('rows', [])
                gfid = spid_counter
                spid_counter += 1

                cols_count = len(rows_data[0]) if rows_data else 1
                col_w = int(tw / cols_count)
                grid_xml = ''.join([f'<a:gridCol w="{col_w}"/>' for _ in range(cols_count)])

                rows_xml = ''
                for r in rows_data:
                    cells_xml = ''
                    for c in r:
                        ctext = c.get('text', '')
                        cbg = c.get('bg')
                        cbold = ' b="1"' if c.get('bold') else ''
                        bg_xml = f'<a:tcPr><a:solidFill><a:srgbClr val="{cbg}"/></a:solidFill></a:tcPr>' if cbg else '<a:tcPr/>'
                        cells_xml += f'<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:rPr{cbold}/><a:t>{xml_escape(ctext)}</a:t></a:r></a:p></a:txBody>{bg_xml}</a:tc>'
                    rows_xml += f'<a:tr h="500000">{cells_xml}</a:tr>'

                sp_tree_xml += f'''
<p:graphicFrame>
  <p:nvGraphicFramePr><p:cNvPr id="{gfid}" name="Table {gfid}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
  <p:xfrm><a:off x="{tx}" y="{ty}"/><a:ext cx="{tw}" cy="{th}"/></p:xfrm>
  <a:graphic>
    <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
      <a:tbl>
        <a:tblPr/><a:tblGrid>{grid_xml}</a:tblGrid>
        {rows_xml}
      </a:tbl>
    </a:graphicData>
  </a:graphic>
</p:graphicFrame>'''

            # Images
            slide_rels = ''
            if images:
                for img in images:
                    ix = img.get('x', 800000)
                    iy = img.get('y', 2200000)
                    iw = img.get('w', 4000000)
                    ih = img.get('h', 3000000)
                    img_id = spid_counter
                    spid_counter += 1

                    sp_tree_xml += f'''
<p:pic>
  <p:nvPicPr><p:cNvPr id="{img_id}" name="Picture {img_id}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
  <p:blipFill><a:blip r:embed="rIdImg1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
  <p:spPr><a:xfrm><a:off x="{ix}" y="{iy}"/><a:ext cx="{iw}" cy="{ih}"/></a:xfrm></p:spPr>
</p:pic>'''
                slide_rels = '<Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>'

            bg_xml = ''
            if bg_color:
                bg_xml = f'<p:bg><p:bgPr><a:solidFill><a:srgbClr val="{bg_color}"/></a:solidFill></p:bgPr></p:bg>'

            slide_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    {bg_xml}
    <p:spTree>{sp_tree_xml}</p:spTree>
  </p:cSld>
  {trans_xml}
  {timing_xml}
</p:sld>'''
            z.writestr(f'ppt/slides/slide{idx}.xml', slide_xml)
            z.writestr(f'ppt/slides/_rels/slide{idx}.xml.rels', f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {slide_rels}
</Relationships>''')

    filepath = f'tests/fixtures/{filename}'
    with open(filepath, 'wb') as f:
        f.write(buf.getvalue())
    print(f'Generated {filepath} ({len(buf.getvalue())} bytes)')


# 1. Basic presentation
create_pptx('1_basic_presentation.pptx', [
    {'title': 'Basic Slide 1', 'shapes': [{'text': 'First point', 'y': 2200000}, {'text': 'Second point', 'y': 3400000}]},
    {'title': 'Basic Slide 2', 'shapes': [{'text': 'Overview data', 'y': 2200000}, {'text': 'Summary details', 'y': 3400000}]}
])

# 2. Slide transitions (push, wipe, zoom)
create_pptx('2_transitions_presentation.pptx', [
    {'title': 'Push Slide 1', 'transition_xml': '<p:transition><p:push dir="l"/></p:transition>', 'shapes': [{'text': 'Slide with push transition'}]},
    {'title': 'Wipe Slide 2', 'transition_xml': '<p:transition><p:wipe/></p:transition>', 'shapes': [{'text': 'Slide with wipe transition'}]},
    {'title': 'Zoom Slide 3', 'transition_xml': '<p:transition><p:zoom/></p:transition>', 'shapes': [{'text': 'Slide with zoom transition'}]}
])

# 3. Object animations with on-click steps
create_pptx('3_animations_presentation.pptx', [
    {
        'title': 'Animated Features',
        'shapes': [
            {'id': 10, 'text': 'Feature 1: Real-time sync', 'y': 2200000},
            {'id': 11, 'text': 'Feature 2: Office collaboration', 'y': 3200000},
            {'id': 12, 'text': 'Feature 3: Enterprise security', 'y': 4200000}
        ],
        'timing_xml': '''<p:timing>
  <p:tnLst>
    <p:cTn id="1" nodeType="mainSeq">
      <p:childTnLst>
        <p:cTn id="2" dur="500" nodeType="clickEffect"><p:stCondLst><p:cond evt="onClick"/></p:stCondLst><p:animEffect transition="in" type="fly" filter="bottom"/><p:tgtEl><p:spTgt spid="10"/></p:tgtEl></p:cTn>
        <p:cTn id="3" dur="500" nodeType="clickEffect"><p:stCondLst><p:cond evt="onClick"/></p:stCondLst><p:animEffect transition="in" type="fade"/><p:tgtEl><p:spTgt spid="11"/></p:tgtEl></p:cTn>
        <p:cTn id="4" dur="500" nodeType="clickEffect"><p:stCondLst><p:cond evt="onClick"/></p:stCondLst><p:animEffect transition="in" type="zoom"/><p:tgtEl><p:spTgt spid="12"/></p:tgtEl></p:cTn>
      </p:childTnLst>
    </p:cTn>
  </p:tnLst>
</p:timing>'''
    },
    {'title': 'Conclusion Slide', 'shapes': [{'text': 'Thank you for watching!'}]}
])

# 4. Automatic slide advancement
create_pptx('4_autoadvance_presentation.pptx', [
    {'title': 'Auto Slide 1 (2.5s)', 'transition_xml': '<p:transition advTm="2500"><p:fade/></p:transition>', 'shapes': [{'text': 'Advances automatically after 2.5 seconds'}]},
    {'title': 'Auto Slide 2 (2.5s)', 'transition_xml': '<p:transition advTm="2500"><p:fade/></p:transition>', 'shapes': [{'text': 'Second auto-advanced slide'}]}
])

# 5. Multi-slide rich presentation with 10 slides (specifically testing slides 1, 7, 8, 9, 10)
create_pptx('multi_slide_presentation.pptx', [
    # Slide 1: Welcome & Executive Summary
    {
        'title': 'FRANK Platform Executive Overview',
        'bg_color': 'FFFDF8',
        'shapes': [
            {'text': '• End-to-end encrypted messaging & document sharing', 'y': 2000000, 'w': 9000000, 'h': 600000, 'font_size': 2000},
            {'text': '• Native in-chat Office viewers: PDF, DOCX, XLSX, PPTX', 'y': 2800000, 'w': 9000000, 'h': 600000, 'font_size': 2000},
            {'text': 'Sandstone Design System v2.0', 'x': 800000, 'y': 3800000, 'w': 4500000, 'h': 700000, 'bg_color': 'F7EFE3', 'border_color': 'B86B3D', 'border_w': 25400, 'bold': True}
        ]
    },
    # Slide 2: Security & Architecture
    {
        'title': 'Zero-Knowledge Security Architecture',
        'shapes': [
            {'text': '1. AES-256-GCM symmetric message payload encryption', 'y': 2000000, 'w': 9500000, 'h': 600000},
            {'text': '2. Ephemeral session tokens with automatic revocation', 'y': 2700000, 'w': 9500000, 'h': 600000},
            {'text': '3. Cryptographic document integrity hashes', 'y': 3400000, 'w': 9500000, 'h': 600000}
        ]
    },
    # Slide 3: Unified Chat & Workspaces
    {
        'title': 'Collaborative Office Workspaces',
        'shapes': [
            {'text': 'Spreadsheet Grid with Full Formula Engine', 'x': 800000, 'y': 2000000, 'w': 5000000, 'h': 800000, 'bg_color': 'E0F2FE', 'border_color': '0284C7'},
            {'text': 'Word Document Viewer with Page Break Rendering', 'x': 800000, 'y': 3000000, 'w': 5000000, 'h': 800000, 'bg_color': 'DCFCE7', 'border_color': '16A34A'}
        ]
    },
    # Slide 4: Real Table Data
    {
        'title': 'Quarterly Benchmark Results',
        'tables': [
            {
                'x': 800000, 'y': 2000000, 'w': 9500000, 'h': 2400000,
                'rows': [
                    [{'text': 'Metric', 'bg': 'EFE1CE', 'bold': True}, {'text': 'Q3 Target', 'bg': 'EFE1CE', 'bold': True}, {'text': 'Q3 Actual', 'bg': 'EFE1CE', 'bold': True}],
                    [{'text': 'Latency (p95)', 'bg': 'FFFFFF'}, {'text': '< 150ms', 'bg': 'FFFFFF'}, {'text': '88ms', 'bg': 'FFFFFF', 'bold': True}],
                    [{'text': 'Viewer Render', 'bg': 'FAF5EE'}, {'text': '< 400ms', 'bg': 'FAF5EE'}, {'text': '210ms', 'bg': 'FAF5EE', 'bold': True}]
                ]
            }
        ]
    },
    # Slide 5: Embedded Graphic Diagram
    {
        'title': 'Topology Architecture Diagram',
        'images': [
            {'x': 800000, 'y': 2000000, 'w': 5000000, 'h': 3000000}
        ],
        'shapes': [
            {'text': 'Figure 5.1: Decentralized Node Routing Architecture', 'x': 800000, 'y': 5200000, 'w': 7000000, 'h': 400000, 'font_size': 1400}
        ]
    },
    # Slide 6: Animated Points
    {
        'title': 'Sequential Processing Pipeline',
        'shapes': [
            {'id': 21, 'text': 'Stage 1: Ingest document binary stream', 'y': 2000000},
            {'id': 22, 'text': 'Stage 2: Parse OpenXML geometries & slides', 'y': 2800000},
            {'id': 23, 'text': 'Stage 3: Render responsive SVG & CSS layout', 'y': 3600000}
        ]
    },
    # Slide 7: Technical Specifications
    {
        'title': 'Slide 7: Technical Specifications',
        'bg_color': 'F8FAFC',
        'shapes': [
            {'text': 'Browser Compatibility: Chromium 90+, Safari 14+, Firefox 88+', 'y': 2000000, 'w': 9500000, 'h': 500000, 'bold': True},
            {'text': 'Aspect Ratio Support: Standard 4:3 and Widescreen 16:9 native stages', 'y': 2600000, 'w': 9500000, 'h': 500000},
            {'text': 'Memory Footprint: < 35MB heap overhead with DOM recycling', 'y': 3200000, 'w': 9500000, 'h': 500000},
            {'text': 'Spec Status: Production Validated', 'x': 800000, 'y': 4200000, 'w': 3800000, 'h': 600000, 'bg_color': 'DBEAFE', 'border_color': '2563EB', 'bold': True}
        ]
    },
    # Slide 8: Financial Projections
    {
        'title': 'Slide 8: Financial Projections & Margins',
        'bg_color': 'FFFDF8',
        'tables': [
            {
                'x': 800000, 'y': 2000000, 'w': 9500000, 'h': 2400000,
                'rows': [
                    [{'text': 'Revenue Stream', 'bg': 'FDE68A', 'bold': True}, {'text': 'FY26', 'bg': 'FDE68A', 'bold': True}, {'text': 'FY27 (Proj)', 'bg': 'FDE68A', 'bold': True}],
                    [{'text': 'Enterprise SaaS', 'bg': 'FFFFFF'}, {'text': '$4.2M', 'bg': 'FFFFFF'}, {'text': '$8.9M', 'bg': 'FFFFFF', 'bold': True}],
                    [{'text': 'Government Cloud', 'bg': 'FEF3C7'}, {'text': '$2.1M', 'bg': 'FEF3C7'}, {'text': '$5.4M', 'bg': 'FEF3C7', 'bold': True}]
                ]
            }
        ],
        'shapes': [
            {'text': 'Target Gross Margin: 84.5% (EBITDA Positive)', 'x': 800000, 'y': 4800000, 'w': 6000000, 'h': 500000, 'bg_color': 'D1FAE5', 'bold': True}
        ]
    },
    # Slide 9: Strategic Roadmap
    {
        'title': 'Slide 9: Global Deployment Roadmap',
        'bg_color': 'F7EFE3',
        'shapes': [
            {'text': 'Q1 2026: APAC Enterprise Rollout & Multi-Region Clusters', 'x': 800000, 'y': 2000000, 'w': 9000000, 'h': 600000, 'bg_color': 'FFFFFF', 'border_color': 'B86B3D'},
            {'text': 'Q2 2026: Offline PWA Office Caching & Sync Protocol', 'x': 800000, 'y': 2800000, 'w': 9000000, 'h': 600000, 'bg_color': 'FFFFFF', 'border_color': 'B86B3D'},
            {'text': 'Q3 2026: AI Copilot & Voice Document Generation', 'x': 800000, 'y': 3600000, 'w': 9000000, 'h': 600000, 'bg_color': 'FFFFFF', 'border_color': 'B86B3D'}
        ]
    },
    # Slide 10: Clean Blank Slide (Genuine Blank Slide for testing requirement 1)
    {
        'title': None,
        'bg_color': 'FFFFFF',
        'shapes': []
    }
])

try:
    import openpyxl
    wb = openpyxl.Workbook()
    ws1 = wb.active
    ws1.title = "Q4 Financials"
    # Add headers A through AZ
    for col_idx in range(1, 53):
        col_letter = openpyxl.utils.get_column_letter(col_idx)
        ws1.cell(row=1, column=col_idx, value=f"Column_{col_letter}")
        for row_idx in range(2, 60):
            ws1.cell(row=row_idx, column=col_idx, value=f"Val_{col_letter}_{row_idx}")

    ws2 = wb.create_sheet(title="Regional Breakdown")
    for col_idx in range(1, 40):
        col_letter = openpyxl.utils.get_column_letter(col_idx)
        ws2.cell(row=1, column=col_idx, value=f"Region_{col_letter}")
        for row_idx in range(2, 40):
            ws2.cell(row=row_idx, column=col_idx, value=row_idx * col_idx)

    wb.save('tests/fixtures/multi_column_sheet.xlsx')
    print('Generated tests/fixtures/multi_column_sheet.xlsx with 52 columns!')
except ImportError:
    pass

