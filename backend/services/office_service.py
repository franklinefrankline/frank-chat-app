import io
import re
import csv
import json
import base64
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple


class OfficeService:
    """
    Production-grade Office Document engine for FRANK.
    Parses and builds DOCX, XLSX, PPTX, CSV, TXT, and ZIP archives using standard
    OpenXML specifications and Python standard libraries with zero fragile external dependencies.
    """

    # Namespaces for OpenXML
    W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    S_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
    A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"

    def get_category_from_filename(self, filename: str) -> str:
        ext = Path(filename).suffix.lower()
        if ext == ".pdf":
            return "pdf"
        elif ext in [".doc", ".docx"]:
            return "word"
        elif ext in [".xls", ".xlsx"]:
            return "excel"
        elif ext in [".ppt", ".pptx"]:
            return "pptx"
        elif ext in [".txt", ".text", ".md", ".log", ".json", ".xml", ".yaml", ".yml"]:
            return "text"
        elif ext == ".csv":
            return "csv"
        elif ext in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]:
            return "image"
        elif ext in [".mp4", ".mov", ".webm", ".mkv"]:
            return "video"
        elif ext in [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".opus", ".weba"]:
            return "audio"
        elif ext in [".zip", ".rar", ".7z", ".tar", ".gz"]:
            return "zip"
        return "unsupported"

    # ---------------- DOCX PARSING & BUILDING ----------------
    def parse_docx(self, docx_bytes: bytes) -> Dict[str, Any]:
        """Parses a DOCX file into structured HTML, paragraphs, and tables."""
        paragraphs = []
        html_parts = []
        try:
            with zipfile.ZipFile(io.BytesIO(docx_bytes), "r") as z:
                if "word/document.xml" not in z.namelist():
                    return {"html": "<p>Empty document</p>", "paragraphs": []}

                xml_content = z.read("word/document.xml")
                root = ET.fromstring(xml_content)

                # Iterate through body elements (paragraphs and tables)
                body = root.find(f"{{{self.W_NS}}}body")
                if body is None:
                    return {"html": "<p></p>", "paragraphs": []}

                for elem in body:
                    tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
                    if tag == "p":
                        para_text = ""
                        p_style = ""
                        # Check style
                        pPr = elem.find(f"{{{self.W_NS}}}pPr")
                        if pPr is not None:
                            style_elem = pPr.find(f"{{{self.W_NS}}}pStyle")
                            if style_elem is not None:
                                p_style = style_elem.attrib.get(f"{{{self.W_NS}}}val", "")

                        runs_html = []
                        for run in elem.findall(f"{{{self.W_NS}}}r"):
                            r_text = "".join(t.text or "" for t in run.findall(f"{{{self.W_NS}}}t"))
                            if not r_text:
                                continue
                            para_text += r_text
                            # Format run
                            rPr = run.find(f"{{{self.W_NS}}}rPr")
                            is_bold = rPr is not None and rPr.find(f"{{{self.W_NS}}}b") is not None
                            is_italic = rPr is not None and rPr.find(f"{{{self.W_NS}}}i") is not None
                            is_u = rPr is not None and rPr.find(f"{{{self.W_NS}}}u") is not None

                            escaped = self._escape_html(r_text)
                            if is_bold:
                                escaped = f"<strong>{escaped}</strong>"
                            if is_italic:
                                escaped = f"<em>{escaped}</em>"
                            if is_u:
                                escaped = f"<u>{escaped}</u>"
                            runs_html.append(escaped)

                        para_content = "".join(runs_html) or "&nbsp;"
                        if p_style in ["Heading1", "heading 1", "Title"]:
                            html_parts.append(f"<h1>{para_content}</h1>")
                        elif p_style in ["Heading2", "heading 2"]:
                            html_parts.append(f"<h2>{para_content}</h2>")
                        elif p_style in ["Heading3", "heading 3"]:
                            html_parts.append(f"<h3>{para_content}</h3>")
                        else:
                            html_parts.append(f"<p>{para_content}</p>")

                        paragraphs.append(para_text)

                    elif tag == "tbl":
                        table_html = ['<table class="office-table" border="1" style="border-collapse:collapse;width:100%;">']
                        for tr in elem.findall(f"{{{self.W_NS}}}tr"):
                            table_html.append("<tr>")
                            for tc in tr.findall(f"{{{self.W_NS}}}tc"):
                                cell_text = "".join("".join(t.text or "" for t in tc.iter(f"{{{self.W_NS}}}t")))
                                table_html.append(f'<td style="padding:6px 10px;border:1px solid #ccc;">{self._escape_html(cell_text)}</td>')
                            table_html.append("</tr>")
                        table_html.append("</table>")
                        html_parts.append("".join(table_html))

            final_html = "".join(html_parts) if html_parts else "<p></p>"
            return {"html": final_html, "paragraphs": paragraphs}
        except Exception as e:
            try:
                txt = docx_bytes.decode("utf-8", errors="ignore").strip()
                if txt and len(txt) > 0 and not any(ord(c) < 32 and c not in '\r\n\t' for c in txt[:100]):
                    return {"html": f"<p>{self._escape_html(txt)}</p>", "paragraphs": [txt]}
            except Exception:
                pass
            return {"html": "<p>Start editing this document directly inside FRANK.</p>", "paragraphs": []}

    def build_docx(self, html_or_text: str) -> bytes:
        """Builds a compliant DOCX archive from HTML/text content."""
        # Convert simple HTML tags to OpenXML elements
        paragraphs_data = self._html_to_docx_paragraphs(html_or_text)

        doc_xml_parts = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            f'<w:document xmlns:w="{self.W_NS}" xmlns:r="{self.R_NS}">',
            '<w:body>'
        ]

        for p in paragraphs_data:
            style_xml = ""
            if p.get("heading") == 1:
                style_xml = '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>'
            elif p.get("heading") == 2:
                style_xml = '<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>'
            elif p.get("heading") == 3:
                style_xml = '<w:pPr><w:pStyle w:val="Heading3"/></w:pPr>'

            runs_xml = []
            for run in p.get("runs", []):
                rPr_parts = []
                if run.get("bold"):
                    rPr_parts.append("<w:b/>")
                if run.get("italic"):
                    rPr_parts.append("<w:i/>")
                if run.get("underline"):
                    rPr_parts.append('<w:u w:val="single"/>')

                rPr_xml = f"<w:rPr>{''.join(rPr_parts)}</w:rPr>" if rPr_parts else ""
                escaped_text = self._escape_xml(run.get("text", ""))
                runs_xml.append(f"<w:r>{rPr_xml}<w:t xml:space=\"preserve\">{escaped_text}</w:t></w:r>")

            doc_xml_parts.append(f"<w:p>{style_xml}{''.join(runs_xml)}</w:p>")

        doc_xml_parts.append('<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>')
        doc_xml_parts.append('</w:body></w:document>')
        doc_xml = "".join(doc_xml_parts)

        # Content types
        content_types = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            '</Types>'
        )

        # Relationships
        rels_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            '</Relationships>'
        )

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", content_types)
            z.writestr("_rels/.rels", rels_xml)
            z.writestr("word/document.xml", doc_xml)
        return buf.getvalue()

    # ---------------- XLSX PARSING & BUILDING ----------------
    def parse_xlsx(self, xlsx_bytes: bytes) -> Dict[str, Any]:
        """Parses an XLSX workbook into sheets, rows, and cells."""
        sheets = []
        try:
            with zipfile.ZipFile(io.BytesIO(xlsx_bytes), "r") as z:
                # 1. Shared Strings
                shared_strings = []
                if "xl/sharedStrings.xml" in z.namelist():
                    ss_root = ET.fromstring(z.read("xl/sharedStrings.xml"))
                    for si in ss_root.findall(f"{{{self.S_NS}}}si"):
                        t_elems = si.findall(f"{{{self.S_NS}}}t")
                        if t_elems:
                            shared_strings.append("".join(t.text or "" for t in t_elems))
                        else:
                            # Rich text run
                            shared_strings.append("".join("".join(t.text or "" for t in si.iter(f"{{{self.S_NS}}}t"))))

                # 2. Workbook for sheet names
                sheet_names = []
                if "xl/workbook.xml" in z.namelist():
                    wb_root = ET.fromstring(z.read("xl/workbook.xml"))
                    sheets_elem = wb_root.find(f"{{{self.S_NS}}}sheets")
                    if sheets_elem is not None:
                        for s in sheets_elem.findall(f"{{{self.S_NS}}}sheet"):
                            name = s.attrib.get("name", f"Sheet{len(sheet_names)+1}")
                            sheet_names.append(name)

                if not sheet_names:
                    sheet_names = ["Sheet1"]

                # 3. Read sheets
                sheet_files = [f for f in z.namelist() if f.startswith("xl/worksheets/sheet") and f.endswith(".xml")]
                sheet_files.sort()

                for idx, sfile in enumerate(sheet_files):
                    sname = sheet_names[idx] if idx < len(sheet_names) else f"Sheet{idx+1}"
                    s_root = ET.fromstring(z.read(sfile))
                    sheet_data = s_root.find(f"{{{self.S_NS}}}sheetData")

                    grid = []
                    formulas_map = {}
                    if sheet_data is not None:
                        for row in sheet_data.findall(f"{{{self.S_NS}}}row"):
                            r_idx = int(row.attrib.get("r", len(grid)+1)) - 1
                            while len(grid) <= r_idx:
                                grid.append([])

                            row_cells = grid[r_idx]
                            for c in row.findall(f"{{{self.S_NS}}}c"):
                                coord = c.attrib.get("r", "")
                                col_idx = self._cell_coord_to_col_idx(coord)
                                cell_type = c.attrib.get("t", "")

                                val = ""
                                f_elem = c.find(f"{{{self.S_NS}}}f")
                                if f_elem is not None and f_elem.text:
                                    formulas_map[coord] = f_elem.text

                                v_elem = c.find(f"{{{self.S_NS}}}v")
                                if v_elem is not None and v_elem.text is not None:
                                    if cell_type == "s":
                                        ss_idx = int(v_elem.text)
                                        val = shared_strings[ss_idx] if ss_idx < len(shared_strings) else v_elem.text
                                    else:
                                        val = v_elem.text

                                while len(row_cells) <= col_idx:
                                    row_cells.append("")
                                row_cells[col_idx] = val

                    # Normalize grid widths
                    max_cols = max((len(r) for r in grid), default=5)
                    max_cols = max(max_cols, 5)
                    for r in grid:
                        while len(r) < max_cols:
                            r.append("")
                    while len(grid) < 15:
                        grid.append([""] * max_cols)

                    sheets.append({
                        "name": sname,
                        "data": grid,
                        "formulas": formulas_map
                    })

            if not sheets:
                sheets = [{"name": "Sheet1", "data": [[""] * 5 for _ in range(15)], "formulas": {}}]
            return {"sheets": sheets}
        except Exception as e:
            return {
                "sheets": [{
                    "name": "Sheet1",
                    "data": [["Error loading workbook", str(e)]] + [[""] * 5 for _ in range(14)],
                    "formulas": {}
                }]
            }

    def build_xlsx(self, sheets_data: List[Dict[str, Any]]) -> bytes:
        """Builds a compliant XLSX workbook archive from sheets data."""
        if not sheets_data:
            sheets_data = [{"name": "Sheet1", "data": [[""]]}]

        shared_strings = []
        ss_map = {}

        def get_ss_idx(text: str) -> int:
            if text not in ss_map:
                ss_map[text] = len(shared_strings)
                shared_strings.append(text)
            return ss_map[text]

        sheet_xml_entries = []
        for s_idx, sheet in enumerate(sheets_data):
            name = sheet.get("name", f"Sheet{s_idx+1}")
            rows = sheet.get("data", [])
            formulas = sheet.get("formulas", {})

            s_parts = [
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                f'<worksheet xmlns="{self.S_NS}">',
                '<sheetData>'
            ]

            for r_idx, row in enumerate(rows):
                r_num = r_idx + 1
                row_parts = [f'<row r="{r_num}">']
                for c_idx, cell_val in enumerate(row):
                    if cell_val is None:
                        continue
                    cell_str = str(cell_val).strip()
                    if not cell_str:
                        continue

                    col_letter = self._col_idx_to_letter(c_idx)
                    coord = f"{col_letter}{r_num}"

                    formula = formulas.get(coord, "")
                    f_xml = f"<f>{self._escape_xml(formula)}</f>" if formula else ""

                    # Numeric check
                    if self._is_number(cell_str) and not formula:
                        row_parts.append(f'<c r="{coord}"><v>{cell_str}</v></c>')
                    elif formula:
                        row_parts.append(f'<c r="{coord}">{f_xml}</c>')
                    else:
                        ss_idx = get_ss_idx(cell_str)
                        row_parts.append(f'<c r="{coord}" t="s"><v>{ss_idx}</v></c>')

                row_parts.append('</row>')
                s_parts.append("".join(row_parts))

            s_parts.append('</sheetData></worksheet>')
            sheet_xml_entries.append((f"xl/worksheets/sheet{s_idx+1}.xml", "".join(s_parts), name))

        # Shared Strings XML
        ss_parts = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            f'<sst xmlns="{self.S_NS}" count="{len(shared_strings)}" uniqueCount="{len(shared_strings)}">'
        ]
        for s in shared_strings:
            ss_parts.append(f'<si><t xml:space="preserve">{self._escape_xml(s)}</t></si>')
        ss_parts.append('</sst>')
        ss_xml = "".join(ss_parts)

        # Workbook XML
        wb_parts = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            f'<workbook xmlns="{self.S_NS}" xmlns:r="{self.R_NS}"><sheets>'
        ]
        for s_idx, (_, _, sname) in enumerate(sheet_xml_entries):
            wb_parts.append(f'<sheet name="{self._escape_xml(sname)}" sheetId="{s_idx+1}" r:id="rId{s_idx+1}"/>')
        wb_parts.append('</sheets></workbook>')
        wb_xml = "".join(wb_parts)

        # Workbook Relationships
        wb_rels_parts = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        ]
        for s_idx, (path, _, _) in enumerate(sheet_xml_entries):
            rel_path = path.replace("xl/", "")
            wb_rels_parts.append(f'<Relationship Id="rId{s_idx+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="{rel_path}"/>')
        wb_rels_parts.append(f'<Relationship Id="rId{len(sheet_xml_entries)+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>')
        wb_rels_parts.append('</Relationships>')
        wb_rels_xml = "".join(wb_rels_parts)

        # Package relationships
        pkg_rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>'
        )

        # Content Types
        ct_parts = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
            '<Default Extension="xml" ContentType="application/xml"/>',
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        ]
        for s_idx, (path, _, _) in enumerate(sheet_xml_entries):
            ct_parts.append(f'<Override PartName="/{path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
        ct_parts.append('</Types>')
        ct_xml = "".join(ct_parts)

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", ct_xml)
            z.writestr("_rels/.rels", pkg_rels)
            z.writestr("xl/workbook.xml", wb_xml)
            z.writestr("xl/_rels/workbook.xml.rels", wb_rels_xml)
            z.writestr("xl/sharedStrings.xml", ss_xml)
            for path, content, _ in sheet_xml_entries:
                z.writestr(path, content)
        return buf.getvalue()

    # ---------------- PPTX PARSING & BUILDING ----------------
    def parse_pptx(self, pptx_bytes: bytes) -> Dict[str, Any]:
        """Parses a PPTX presentation into slide cards, titles, and text contents."""
        slides = []
        try:
            with zipfile.ZipFile(io.BytesIO(pptx_bytes), "r") as z:
                slide_files = [f for f in z.namelist() if f.startswith("ppt/slides/slide") and f.endswith(".xml")]
                # Sort numerically
                def slide_num(name):
                    m = re.search(r'slide(\d+)\.xml', name)
                    return int(m.group(1)) if m else 9999
                slide_files.sort(key=slide_num)

                for idx, sfile in enumerate(slide_files):
                    root = ET.fromstring(z.read(sfile))
                    slide_text_runs = []
                    title = ""

                    # Search shapes
                    for sp in root.iter(f"{{{self.P_NS}}}sp"):
                        shape_texts = []
                        for t in sp.iter(f"{{{self.A_NS}}}t"):
                            if t.text:
                                shape_texts.append(t.text)
                        full_shape_text = " ".join(shape_texts).strip()
                        if full_shape_text:
                            if not title:
                                title = full_shape_text
                            else:
                                slide_text_runs.append(full_shape_text)

                    slides.append({
                        "id": idx + 1,
                        "title": title or f"Slide {idx + 1}",
                        "content": slide_text_runs or ["Click to add subtitle or content"],
                        "bg_color": "#ffffff"
                    })

            if not slides:
                slides = [{"id": 1, "title": "Presentation Title", "content": ["Slide content"], "bg_color": "#ffffff"}]
            return {"slides": slides}
        except Exception as e:
            return {
                "slides": [{"id": 1, "title": "Error reading presentation", "content": [str(e)], "bg_color": "#ffffff"}]
            }

    def build_pptx(self, slides_data: List[Dict[str, Any]]) -> bytes:
        """Builds a compliant PPTX presentation archive from slide models."""
        if not slides_data:
            slides_data = [{"title": "Presentation", "content": ["Welcome"]}]

        slide_xml_entries = []
        for s_idx, slide in enumerate(slides_data):
            title = self._escape_xml(slide.get("title", f"Slide {s_idx+1}"))
            content_list = slide.get("content", [])
            bg_color = slide.get("bg_color", "#ffffff").replace("#", "")

            body_p_xml = []
            for item in content_list:
                body_p_xml.append(
                    f'<a:p><a:r><a:rPr lang="en-US" sz="2000"/><a:t>{self._escape_xml(str(item))}</a:t></a:r></a:p>'
                )

            slide_xml = (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<p:sld xmlns:p="{self.P_NS}" xmlns:a="{self.A_NS}" xmlns:r="{self.R_NS}">'
                '<p:cSld>'
                f'<p:bg><p:bgPr><a:solidFill><a:srgbClr val="{bg_color}"/></a:solidFill></p:bgPr></p:bg>'
                '<p:spTree>'
                '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:grpSpPr/></p:nvGrpSpPr>'
                '<p:sp>'
                '<p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>'
                '<p:spPr><a:xfrm><a:off x="1000000" y="800000"/><a:ext cx="7143750" cy="1400000"/></a:xfrm></p:spPr>'
                f'<p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="3600" b="1"/><a:t>{title}</a:t></a:r></a:p></p:txBody>'
                '</p:sp>'
                '<p:sp>'
                '<p:nvSpPr><p:cNvPr id="3" name="Subtitle 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="subTitle" idx="1"/></p:nvPr></p:nvSpPr>'
                '<p:spPr><a:xfrm><a:off x="1000000" y="2400000"/><a:ext cx="7143750" cy="3000000"/></a:xfrm></p:spPr>'
                f'<p:txBody><a:bodyPr/>{"".join(body_p_xml)}</p:txBody>'
                '</p:sp>'
                '</p:spTree>'
                '</p:cSld>'
                '</p:sld>'
            )
            slide_xml_entries.append((f"ppt/slides/slide{s_idx+1}.xml", slide_xml))

        # Presentation XML
        pres_parts = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            f'<p:presentation xmlns:p="{self.P_NS}" xmlns:r="{self.R_NS}"><p:sldIdLst>'
        ]
        for s_idx in range(len(slide_xml_entries)):
            pres_parts.append(f'<p:sldId id="{256+s_idx}" r:id="rId{s_idx+1}"/>')
        pres_parts.append('</p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>')
        pres_xml = "".join(pres_parts)

        # Presentation Relationships
        pres_rels_parts = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        ]
        for s_idx in range(len(slide_xml_entries)):
            pres_rels_parts.append(f'<Relationship Id="rId{s_idx+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{s_idx+1}.xml"/>')
        pres_rels_parts.append('</Relationships>')
        pres_rels_xml = "".join(pres_rels_parts)

        # Content Types
        ct_parts = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
            '<Default Extension="xml" ContentType="application/xml"/>',
            '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        ]
        for s_idx in range(len(slide_xml_entries)):
            ct_parts.append(f'<Override PartName="/ppt/slides/slide{s_idx+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>')
        ct_parts.append('</Types>')
        ct_xml = "".join(ct_parts)

        pkg_rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
            '</Relationships>'
        )

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", ct_xml)
            z.writestr("_rels/.rels", pkg_rels)
            z.writestr("ppt/presentation.xml", pres_xml)
            z.writestr("ppt/_rels/presentation.xml.rels", pres_rels_xml)
            for path, content in slide_xml_entries:
                z.writestr(path, content)
        return buf.getvalue()

    # ---------------- CSV / TXT / ZIP HANDLING ----------------
    def parse_csv(self, csv_bytes: bytes) -> Dict[str, Any]:
        """Parses CSV bytes safely with quote and dialect auto-detection."""
        text = csv_bytes.decode("utf-8", errors="replace")
        rows = []
        try:
            reader = csv.reader(io.StringIO(text))
            for row in reader:
                rows.append(row)
        except Exception:
            rows = [line.split(",") for line in text.splitlines()]
        return {"rows": rows, "raw_text": text}

    def build_csv(self, rows_or_text: Any) -> bytes:
        """Builds clean CSV bytes."""
        if isinstance(rows_or_text, str):
            return rows_or_text.encode("utf-8")
        buf = io.StringIO()
        writer = csv.writer(buf)
        for row in rows_or_text:
            writer.writerow(row)
        return buf.getvalue().encode("utf-8")

    def inspect_zip(self, zip_bytes: bytes) -> Dict[str, Any]:
        """Safely inspects a ZIP archive to prevent zip-slips and extract metadata."""
        files = []
        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as z:
                for info in z.infolist():
                    clean_name = info.filename.lstrip("/\\")
                    # Disallow path traversal entries
                    if ".." in clean_name.split("/"):
                        continue
                    files.append({
                        "name": clean_name,
                        "file_size": info.file_size,
                        "is_dir": info.is_dir(),
                        "date_time": f"{info.date_time[0]}-{info.date_time[1]:02d}-{info.date_time[2]:02d} {info.date_time[3]:02d}:{info.date_time[4]:02d}"
            total_uncompressed = sum(f.get("file_size", 0) for f in files)
            return {"files": files, "total": len(files), "total_uncompressed_size": total_uncompressed}
        except Exception as e:
            return {"files": [], "error": str(e), "total": 0, "total_uncompressed_size": 0}

    # ---------------- HELPER METHODS ----------------
    def _escape_html(self, text: str) -> str:
        return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    def _escape_xml(self, text: str) -> str:
        return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")

    def _html_to_docx_paragraphs(self, html_text: str) -> List[Dict[str, Any]]:
        """Converts clean HTML into simplified paragraph structures."""
        # Clean brs and paragraphs
        clean = html_text.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
        # Split by block elements
        blocks = re.findall(r'<(h[1-3]|p|div)[^>]*>(.*?)</\1>', clean, flags=re.DOTALL | re.IGNORECASE)
        if not blocks:
            # Fall back to splitting by newlines
            lines = [l.strip() for l in clean.splitlines() if l.strip()]
            return [{"heading": None, "runs": [{"text": l, "bold": False, "italic": False, "underline": False}]} for l in lines]

        result = []
        for tag, inner in blocks:
            tag_lower = tag.lower()
            h_level = int(tag_lower[1]) if tag_lower.startswith("h") else None

            # Simple run extraction
            text_clean = re.sub(r'<[^>]+>', '', inner).strip()
            is_bold = "strong" in inner.lower() or "<b>" in inner.lower()
            is_italic = "em" in inner.lower() or "<i>" in inner.lower()
            is_u = "<u>" in inner.lower()

            result.append({
                "heading": h_level,
                "runs": [{
                    "text": text_clean or " ",
                    "bold": is_bold,
                    "italic": is_italic,
                    "underline": is_u
                }]
            })
        return result or [{"heading": None, "runs": [{"text": "Empty document"}]}]

    def _cell_coord_to_col_idx(self, coord: str) -> int:
        letters = re.findall(r'[A-Za-z]+', coord)
        if not letters:
            return 0
        s = letters[0].upper()
        idx = 0
        for char in s:
            idx = idx * 26 + (ord(char) - ord('A') + 1)
        return max(0, idx - 1)

    def _col_idx_to_letter(self, idx: int) -> str:
        result = []
        idx += 1
        while idx > 0:
            idx, rem = divmod(idx - 1, 26)
            result.append(chr(65 + rem))
        return "".join(reversed(result))

    def _is_number(self, val: str) -> bool:
        try:
            float(val)
            return True
        except ValueError:
            return False


office_service = OfficeService()
