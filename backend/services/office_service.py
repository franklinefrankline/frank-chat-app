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
        """
        Parses a DOCX file into structured HTML, paragraphs, and tables,
        preserving headings, formatting runs, alignments, lists, page breaks, tables, and media.
        """
        paragraphs = []
        html_parts = []
        try:
            with zipfile.ZipFile(io.BytesIO(docx_bytes), "r") as z:
                if "word/document.xml" not in z.namelist():
                    return {"html": "<p>Empty document</p>", "paragraphs": []}

                # 1. Parse media relationships if present
                image_rels = {}
                if "word/_rels/document.xml.rels" in z.namelist():
                    try:
                        rels_root = ET.fromstring(z.read("word/_rels/document.xml.rels"))
                        for rel in rels_root.findall(f"{{{self.R_NS}}}Relationship") or rels_root.findall(".//Relationship"):
                            r_id = rel.attrib.get("Id")
                            r_type = rel.attrib.get("Type", "")
                            r_target = rel.attrib.get("Target", "")
                            if "image" in r_type.lower() or r_target.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg')):
                                target_path = "word/" + r_target.lstrip("/")
                                if target_path in z.namelist():
                                    img_bytes = z.read(target_path)
                                    ext = Path(target_path).suffix.lstrip(".").lower()
                                    if ext == "jpg":
                                        ext = "jpeg"
                                    mime = f"image/{ext}"
                                    b64 = base64.b64encode(img_bytes).decode("ascii")
                                    image_rels[r_id] = f"data:{mime};base64,{b64}"
                    except Exception as e:
                        print(f"Docx rels parse note: {e}")

                xml_content = z.read("word/document.xml")
                root = ET.fromstring(xml_content)

                body = root.find(f"{{{self.W_NS}}}body")
                if body is None:
                    return {"html": "<p></p>", "paragraphs": []}

                def parse_run(run_elem) -> str:
                    # Check for image drawing inside run
                    if image_rels:
                        blip = run_elem.find(f".//{{{self.A_NS}}}blip")
                        if blip is not None:
                            embed_id = blip.attrib.get(f"{{{self.R_NS}}}embed")
                            if embed_id and embed_id in image_rels:
                                return f'<img src="{image_rels[embed_id]}" alt="Document Image" style="max-width:100%;height:auto;margin:12px 0;border-radius:6px;display:block;" />'

                    r_text = "".join(t.text or "" for t in run_elem.findall(f"{{{self.W_NS}}}t"))
                    if not r_text:
                        # Check for break
                        br_elem = run_elem.find(f"{{{self.W_NS}}}br")
                        if br_elem is not None:
                            if br_elem.attrib.get(f"{{{self.W_NS}}}type") == "page":
                                return '<div class="word-page-break"><span class="word-page-break-tag">Page Break</span></div>'
                            return "<br>"
                        return ""

                    para_text_builder.append(r_text)
                    rPr = run_elem.find(f"{{{self.W_NS}}}rPr")
                    escaped = self._escape_html(r_text)

                    if rPr is not None:
                        if rPr.find(f"{{{self.W_NS}}}b") is not None:
                            escaped = f"<strong>{escaped}</strong>"
                        if rPr.find(f"{{{self.W_NS}}}i") is not None:
                            escaped = f"<em>{escaped}</em>"
                        if rPr.find(f"{{{self.W_NS}}}u") is not None:
                            escaped = f"<u>{escaped}</u>"
                        if rPr.find(f"{{{self.W_NS}}}strike") is not None:
                            escaped = f"<s>{escaped}</s>"
                        
                        sz = rPr.find(f"{{{self.W_NS}}}sz")
                        if sz is not None:
                            sz_val = sz.attrib.get(f"{{{self.W_NS}}}val")
                            if sz_val and sz_val.isdigit():
                                pt = int(sz_val) // 2
                                escaped = f'<span style="font-size:{pt}pt;">{escaped}</span>'

                        rFonts = rPr.find(f"{{{self.W_NS}}}rFonts")
                        if rFonts is not None:
                            font_ascii = rFonts.attrib.get(f"{{{self.W_NS}}}ascii")
                            if font_ascii:
                                escaped = f'<span style="font-family:{font_ascii};">{escaped}</span>'

                        vert = rPr.find(f"{{{self.W_NS}}}vertAlign")
                        if vert is not None:
                            val = vert.attrib.get(f"{{{self.W_NS}}}val")
                            if val == "superscript":
                                escaped = f"<sup>{escaped}</sup>"
                            elif val == "subscript":
                                escaped = f"<sub>{escaped}</sub>"

                        col = rPr.find(f"{{{self.W_NS}}}color")
                        if col is not None:
                            hex_col = col.attrib.get(f"{{{self.W_NS}}}val")
                            if hex_col and hex_col != "auto":
                                escaped = f'<span style="color:#{hex_col};">{escaped}</span>'

                        hl = rPr.find(f"{{{self.W_NS}}}highlight")
                        if hl is not None:
                            hl_val = hl.attrib.get(f"{{{self.W_NS}}}val")
                            if hl_val:
                                escaped = f'<mark style="background-color:{hl_val};padding:0 2px;">{escaped}</mark>'

                    return escaped

                for elem in body:
                    tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
                    if tag == "p":
                        # Check for page break in paragraph
                        br_page = elem.find(f".//{{{self.W_NS}}}br[@{{{self.W_NS}}}type='page']")
                        if br_page is not None:
                            html_parts.append('<div class="word-page-break"><span class="word-page-break-tag">Page Break</span></div>')
                            continue

                        para_text_builder = []
                        p_style = ""
                        align = None

                        pPr = elem.find(f"{{{self.W_NS}}}pPr")
                        if pPr is not None:
                            style_elem = pPr.find(f"{{{self.W_NS}}}pStyle")
                            if style_elem is not None:
                                p_style = style_elem.attrib.get(f"{{{self.W_NS}}}val", "")
                            jc_elem = pPr.find(f"{{{self.W_NS}}}jc")
                            if jc_elem is not None:
                                align = jc_elem.attrib.get(f"{{{self.W_NS}}}val", "")
                                if align == "both":
                                    align = "justify"

                        runs_html = []
                        for child in elem:
                            ctag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                            if ctag == "r":
                                runs_html.append(parse_run(child))
                            elif ctag == "hyperlink":
                                link_runs = []
                                for r in child.findall(f"{{{self.W_NS}}}r"):
                                    link_runs.append(parse_run(r))
                                runs_html.append(f'<a href="#">{"".join(link_runs)}</a>')

                        para_content = "".join(runs_html) or "&nbsp;"
                        para_text = "".join(para_text_builder)

                        style_attr = f' style="text-align:{align};"' if align else ""
                        if p_style in ["Title", "title"]:
                            html_parts.append(f'<p class="doc-title"{style_attr}>{para_content}</p>')
                        elif p_style in ["Subtitle", "subtitle"]:
                            html_parts.append(f'<p class="doc-subtitle"{style_attr}>{para_content}</p>')
                        elif p_style in ["Quote", "quote", "IntenseQuote"]:
                            html_parts.append(f'<blockquote class="doc-quote"{style_attr}>{para_content}</blockquote>')
                        elif p_style in ["Heading1", "heading 1"]:
                            html_parts.append(f"<h1{style_attr}>{para_content}</h1>")
                        elif p_style in ["Heading2", "heading 2"]:
                            html_parts.append(f"<h2{style_attr}>{para_content}</h2>")
                        elif p_style in ["Heading3", "heading 3"]:
                            html_parts.append(f"<h3{style_attr}>{para_content}</h3>")
                        elif p_style in ["Heading4", "heading 4"]:
                            html_parts.append(f"<h4{style_attr}>{para_content}</h4>")
                        elif p_style in ["Heading5", "heading 5"]:
                            html_parts.append(f"<h5{style_attr}>{para_content}</h5>")
                        elif p_style in ["Heading6", "heading 6"]:
                            html_parts.append(f"<h6{style_attr}>{para_content}</h6>")
                        elif p_style in ["ListBullet", "ListBullet2", "ListBullet3"] or elem.find(f"{{{self.W_NS}}}pPr/{{{self.W_NS}}}numPr") is not None:
                            html_parts.append(f'<p class="word-list-bullet"{style_attr}>• {para_content}</p>')
                        else:
                            html_parts.append(f"<p{style_attr}>{para_content}</p>")

                        paragraphs.append(para_text)

                    elif tag == "tbl":
                        table_html = ['<table class="office-table" border="1" style="border-collapse:collapse;width:100%;margin:16px 0;">']
                        for tr in elem.findall(f"{{{self.W_NS}}}tr"):
                            table_html.append("<tr>")
                            for tc in tr.findall(f"{{{self.W_NS}}}tc"):
                                cell_paras = []
                                for p in tc.findall(f"{{{self.W_NS}}}p"):
                                    runs_h = []
                                    para_text_builder = []
                                    for r in p.findall(f"{{{self.W_NS}}}r"):
                                        runs_h.append(parse_run(r))
                                    cell_paras.append("".join(runs_h) or "&nbsp;")
                                cell_content = "<br>".join(cell_paras) if cell_paras else "&nbsp;"
                                table_html.append(f'<td style="padding:8px 12px;border:1px solid #D8C5AA;">{cell_content}</td>')
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

    def build_docx(self, html_or_text: str, page_options: Optional[Dict[str, Any]] = None) -> bytes:
        """
        Builds a compliant DOCX archive from HTML/text content,
        preserving headings, formatting runs, alignments, tables, images, and page breaks.
        """
        from html.parser import HTMLParser

        class _DocxHTMLParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.blocks = []
                self.current_block = None
                self.active_styles = {
                    "bold": 0, "italic": 0, "underline": 0, "strike": 0,
                    "sub": 0, "sup": 0, "link": None, "color": None, "bg": None
                }
                self.current_table = None
                self.current_row = None
                self.current_cell = None
                self.list_stack = []
                self.skip_depth = 0
                self.span_style_stack = []
                self.font_style_stack = []

            def handle_starttag(self, tag, attrs):
                attrs_dict = dict(attrs)
                tag_lower = tag.lower()
                style_attr = attrs_dict.get("style", "")
                align = None
                if "text-align" in style_attr:
                    m = re.search(r'text-align\s*:\s*([a-zA-Z]+)', style_attr)
                    if m:
                        align = m.group(1).lower()

                if self.skip_depth > 0:
                    self.skip_depth += 1
                    return

                is_page_break = (
                    "word-page-break" in attrs_dict.get("class", "")
                    or "page-break-after" in style_attr
                    or "page-break-before" in style_attr
                )
                if is_page_break:
                    self._close_block()
                    self.blocks.append({"type": "page_break"})
                    self.skip_depth = 1
                    return

                cls = attrs_dict.get("class", "")
                if tag_lower in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                    self._close_block()
                    h_num = int(tag_lower[1])
                    self.current_block = {"type": "heading", "level": h_num, "align": align, "runs": []}
                elif tag_lower == "blockquote" or "doc-quote" in cls or "doc-intense-quote" in cls:
                    self._close_block()
                    self.current_block = {"type": "quote", "align": align, "runs": []}
                elif "doc-title" in cls:
                    self._close_block()
                    self.current_block = {"type": "title", "align": align, "runs": []}
                elif "doc-subtitle" in cls:
                    self._close_block()
                    self.current_block = {"type": "subtitle", "align": align, "runs": []}
                elif tag_lower in ["p", "div"]:
                    self._close_block()
                    self.current_block = {"type": "paragraph", "align": align, "runs": []}
                elif tag_lower == "hr":
                    self._close_block()
                    self.blocks.append({"type": "page_break" if "page-break" in style_attr else "horizontal_rule"})
                elif tag_lower in ["ul", "ol"]:
                    self.list_stack.append(tag_lower)
                elif tag_lower == "li":
                    self._close_block()
                    list_type = self.list_stack[-1] if self.list_stack else "ul"
                    self.current_block = {"type": "list_item", "list_type": list_type, "align": align, "runs": []}
                elif tag_lower == "table":
                    self._close_block()
                    self.current_table = {"type": "table", "rows": []}
                    self.blocks.append(self.current_table)
                elif tag_lower == "tr":
                    if self.current_table is not None:
                        self.current_row = []
                        self.current_table["rows"].append(self.current_row)
                elif tag_lower in ["td", "th"]:
                    if self.current_row is not None:
                        self.current_cell = {"is_header": tag_lower == "th", "blocks": []}
                        self.current_row.append(self.current_cell)
                elif tag_lower in ["strong", "b"]:
                    self.active_styles["bold"] += 1
                elif tag_lower in ["em", "i"]:
                    self.active_styles["italic"] += 1
                elif tag_lower == "u":
                    self.active_styles["underline"] += 1
                elif tag_lower in ["s", "strike", "del"]:
                    self.active_styles["strike"] += 1
                elif tag_lower == "sub":
                    self.active_styles["sub"] += 1
                elif tag_lower == "sup":
                    self.active_styles["sup"] += 1
                elif tag_lower == "a":
                    self.active_styles["link"] = attrs_dict.get("href", "")
                elif tag_lower == "span":
                    span_style = {}
                    if "font-size" in style_attr:
                        m_sz = re.search(r'font-size\s*:\s*(\d+)pt', style_attr)
                        if m_sz:
                            span_style["size"] = int(m_sz.group(1))
                    if "color" in style_attr:
                        m_col = re.search(r'color\s*:\s*#?([0-9a-fA-F]{3,6})', style_attr)
                        if m_col:
                            span_style["color"] = m_col.group(1)
                    if "font-family" in style_attr:
                        m_f = re.search(r'font-family\s*:\s*([^;]+)', style_attr)
                        if m_f:
                            span_style["font"] = m_f.group(1).strip().strip("'\"")
                    if "font-weight" in style_attr and ("bold" in style_attr or "700" in style_attr):
                        self.active_styles["bold"] += 1
                        span_style["bold_added"] = True
                    self.span_style_stack.append(span_style)
                elif tag_lower == "font":
                    font_style = {}
                    if "color" in attrs_dict:
                        font_style["color"] = attrs_dict["color"].replace("#", "")
                    if "face" in attrs_dict:
                        font_style["font"] = attrs_dict["face"].strip()
                    self.font_style_stack.append(font_style)
                elif tag_lower == "img":
                    src = attrs_dict.get("src", "")
                    if src:
                        if self.current_block is None:
                            self.current_block = {"type": "paragraph", "align": align, "runs": []}
                        self.current_block["runs"].append({
                            "type": "image",
                            "src": src,
                            "alt": attrs_dict.get("alt", "Image")
                        })

            def handle_endtag(self, tag):
                tag_lower = tag.lower()
                if self.skip_depth > 0:
                    self.skip_depth -= 1
                    return

                if tag_lower in ["h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "li", "blockquote"]:
                    self._close_block()
                elif tag_lower in ["ul", "ol"]:
                    if self.list_stack:
                        self.list_stack.pop()
                elif tag_lower == "table":
                    self.current_table = None
                elif tag_lower == "tr":
                    self.current_row = None
                elif tag_lower in ["td", "th"]:
                    self._close_block()
                    self.current_cell = None
                elif tag_lower in ["strong", "b"]:
                    self.active_styles["bold"] = max(0, self.active_styles["bold"] - 1)
                elif tag_lower in ["em", "i"]:
                    self.active_styles["italic"] = max(0, self.active_styles["italic"] - 1)
                elif tag_lower == "u":
                    self.active_styles["underline"] = max(0, self.active_styles["underline"] - 1)
                elif tag_lower in ["s", "strike", "del"]:
                    self.active_styles["strike"] = max(0, self.active_styles["strike"] - 1)
                elif tag_lower == "sub":
                    self.active_styles["sub"] = max(0, self.active_styles["sub"] - 1)
                elif tag_lower == "sup":
                    self.active_styles["sup"] = max(0, self.active_styles["sup"] - 1)
                elif tag_lower == "a":
                    self.active_styles["link"] = None
                elif tag_lower == "span":
                    if self.span_style_stack:
                        popped = self.span_style_stack.pop()
                        if popped.get("bold_added"):
                            self.active_styles["bold"] = max(0, self.active_styles["bold"] - 1)
                elif tag_lower == "font":
                    if self.font_style_stack:
                        self.font_style_stack.pop()

            def handle_data(self, data):
                if self.skip_depth > 0 or not data:
                    return
                if self.current_block is None:
                    if not data.strip():
                        return
                    self.current_block = {"type": "paragraph", "align": None, "runs": []}

                cur_color = None
                cur_size = None
                cur_font = None
                for s in self.span_style_stack:
                    if "color" in s: cur_color = s["color"]
                    if "size" in s: cur_size = s["size"]
                    if "font" in s: cur_font = s["font"]
                for f in self.font_style_stack:
                    if "color" in f: cur_color = f["color"]
                    if "font" in f: cur_font = f["font"]

                run = {
                    "type": "text",
                    "text": data,
                    "bold": self.active_styles["bold"] > 0,
                    "italic": self.active_styles["italic"] > 0,
                    "underline": self.active_styles["underline"] > 0,
                    "strike": self.active_styles["strike"] > 0,
                    "sub": self.active_styles["sub"] > 0,
                    "sup": self.active_styles["sup"] > 0,
                    "link": self.active_styles["link"],
                    "color": cur_color,
                    "size": cur_size,
                    "font": cur_font
                }
                self.current_block["runs"].append(run)

            def _close_block(self):
                if self.current_block is not None:
                    if self.current_cell is not None:
                        self.current_cell["blocks"].append(self.current_block)
                    else:
                        self.blocks.append(self.current_block)
                    self.current_block = None

        parser = _DocxHTMLParser()
        parser.feed(html_or_text or "<p></p>")
        parser._close_block()
        blocks = parser.blocks or [{"type": "paragraph", "align": None, "runs": [{"type": "text", "text": " "}]}]

        # Prepare images and relationships
        images_to_pack = {} # filename -> bytes
        rels_list = [
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        ]
        doc_rels = []

        def render_runs(runs: List[Dict[str, Any]]) -> str:
            rx = []
            for r in runs:
                if r.get("type") == "image":
                    src = r.get("src", "")
                    if src.startswith("data:image/") and ";base64," in src:
                        try:
                            meta_part, b64_part = src.split(";base64,", 1)
                            mime = meta_part.split(":")[1]
                            ext = mime.split("/")[1].lower()
                            if ext == "jpeg":
                                ext = "jpg"
                            img_idx = len(images_to_pack) + 1
                            img_name = f"image{img_idx}.{ext}"
                            img_bytes = base64.b64decode(b64_part)
                            images_to_pack[f"word/media/{img_name}"] = img_bytes

                            rid = f"rIdImg{img_idx}"
                            doc_rels.append(f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{img_name}"/>')

                            # Drawing XML for image
                            drawing_xml = (
                                f'<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
                                f'<wp:extent cx="5400000" cy="3600000"/>'
                                f'<wp:docPr id="{img_idx}" name="{img_name}"/>'
                                f'<a:graphic xmlns:a="{self.A_NS}">'
                                f'<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
                                f'<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
                                f'<pic:nvPicPr><pic:cNvPr id="{img_idx}" name="{img_name}"/><pic:cNvPicPr/></pic:nvPicPr>'
                                f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
                                f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5400000" cy="3600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
                                f'</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>'
                            )
                            rx.append(f"<w:r>{drawing_xml}</w:r>")
                            continue
                        except Exception as e:
                            print(f"Image packing error: {e}")

                rPr = []
                if r.get("bold"): rPr.append("<w:b/>")
                if r.get("italic"): rPr.append("<w:i/>")
                if r.get("underline"): rPr.append('<w:u w:val="single"/>')
                if r.get("strike"): rPr.append('<w:strike/>')
                if r.get("sub"): rPr.append('<w:vertAlign w:val="subscript"/>')
                if r.get("sup"): rPr.append('<w:vertAlign w:val="superscript"/>')
                if r.get("size"):
                    half_pts = int(r["size"]) * 2
                    rPr.append(f'<w:sz w:val="{half_pts}"/>')
                if r.get("color"):
                    clean_hex = r["color"].replace("#", "")
                    if len(clean_hex) in (3, 6):
                        if len(clean_hex) == 3:
                            clean_hex = "".join(c * 2 for c in clean_hex)
                        rPr.append(f'<w:color w:val="{clean_hex.upper()}"/>')
                if r.get("font"):
                    clean_font = r["font"].strip().strip("'\"")
                    rPr.append(f'<w:rFonts w:ascii="{clean_font}" w:hAnsi="{clean_font}"/>')
                rPr_xml = f"<w:rPr>{''.join(rPr)}</w:rPr>" if rPr else ""
                t_xml = self._escape_xml(r.get("text", ""))
                rx.append(f'<w:r>{rPr_xml}<w:t xml:space="preserve">{t_xml}</w:t></w:r>')
            return "".join(rx)

        def render_block(b: Dict[str, Any]) -> str:
            btype = b.get("type")
            if btype == "page_break":
                return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
            elif btype == "horizontal_rule":
                return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D8C5AA"/></w:pBdr></w:pPr></w:p>'
            elif btype in ["paragraph", "heading", "list_item", "title", "subtitle", "quote"]:
                pPr_items = []
                if btype == "heading":
                    lvl = b.get("level", 1)
                    pPr_items.append(f'<w:pStyle w:val="Heading{lvl}"/>')
                elif btype == "title":
                    pPr_items.append('<w:pStyle w:val="Title"/>')
                elif btype == "subtitle":
                    pPr_items.append('<w:pStyle w:val="Subtitle"/>')
                elif btype == "quote":
                    pPr_items.append('<w:pStyle w:val="Quote"/>')
                elif btype == "list_item":
                    pPr_items.append('<w:pStyle w:val="ListBullet"/>')

                align = b.get("align")
                if align in ["center", "right"]:
                    pPr_items.append(f'<w:jc w:val="{align}"/>')
                elif align in ["justify", "both"]:
                    pPr_items.append('<w:jc w:val="both"/>')

                pPr_xml = f"<w:pPr>{''.join(pPr_items)}</w:pPr>" if pPr_items else ""
                runs_xml = render_runs(b.get("runs", []))
                return f"<w:p>{pPr_xml}{runs_xml}</w:p>"
            elif btype == "table":
                tbl_xml = [
                    '<w:tbl>',
                    '<w:tblPr>',
                    '<w:tblW w:w="5000" w:type="pct"/>',
                    '<w:tblBorders>',
                    '<w:top w:val="single" w:sz="4" w:space="0" w:color="D8C5AA"/>',
                    '<w:left w:val="single" w:sz="4" w:space="0" w:color="D8C5AA"/>',
                    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D8C5AA"/>',
                    '<w:right w:val="single" w:sz="4" w:space="0" w:color="D8C5AA"/>',
                    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="D8C5AA"/>',
                    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="D8C5AA"/>',
                    '</w:tblBorders>',
                    '</w:tblPr>'
                ]
                for row in b.get("rows", []):
                    tbl_xml.append('<w:tr>')
                    for cell in row:
                        tbl_xml.append('<w:tc><w:tcPr><w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>')
                        if cell.get("blocks"):
                            for cb in cell["blocks"]:
                                tbl_xml.append(render_block(cb))
                        else:
                            tbl_xml.append('<w:p/>')
                        tbl_xml.append('</w:tc>')
                    tbl_xml.append('</w:tr>')
                tbl_xml.append('</w:tbl>')
                return "".join(tbl_xml)
            return ""

        body_elements = []
        for b in blocks:
            body_elements.append(render_block(b))

        # Page options (A4 default: 11906 x 16838 dxa)
        pg_w = "11906"
        pg_h = "16838"
        orient = "portrait"
        if page_options:
            if page_options.get("pageSize") == "letter":
                pg_w, pg_h = "12240", "15840"
            if page_options.get("orientation") == "landscape":
                pg_w, pg_h = pg_h, pg_w
                orient = "landscape"

        orient_attr = ' w:orient="landscape"' if orient == "landscape" else ""
        sect_pr = f'<w:sectPr><w:pgSz w:w="{pg_w}" w:h="{pg_h}"{orient_attr}/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>'

        doc_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<w:document xmlns:w="{self.W_NS}" xmlns:r="{self.R_NS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="{self.A_NS}" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            f'<w:body>{"".join(body_elements)}{sect_pr}</w:body></w:document>'
        )

        content_types = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
            '<Default Extension="xml" ContentType="application/xml"/>',
            '<Default Extension="png" ContentType="image/png"/>',
            '<Default Extension="jpg" ContentType="image/jpeg"/>',
            '<Default Extension="jpeg" ContentType="image/jpeg"/>',
            '<Default Extension="gif" ContentType="image/gif"/>',
            '<Default Extension="webp" ContentType="image/webp"/>',
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
            '</Types>'
        ]

        doc_rels_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{"".join(doc_rels)}</Relationships>'
        )

        package_rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{"".join(rels_list)}</Relationships>'
        )

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", "".join(content_types))
            z.writestr("_rels/.rels", package_rels)
            z.writestr("word/document.xml", doc_xml)
            if doc_rels:
                z.writestr("word/_rels/document.xml.rels", doc_rels_xml)
            for img_path, img_data in images_to_pack.items():
                z.writestr(img_path, img_data)

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

    def build_xlsx(self, sheets_data: Any) -> bytes:
        """Builds a compliant XLSX workbook archive from sheets data."""
        if not sheets_data:
            sheets_data = [{"name": "Sheet1", "data": [[""]]}]
        elif isinstance(sheets_data, dict):
            normalized = []
            for sname, sval in sheets_data.items():
                if isinstance(sval, dict):
                    normalized.append({
                        "name": sname,
                        "data": sval.get("data", []),
                        "formulas": sval.get("formulas", {})
                    })
                elif isinstance(sval, list):
                    normalized.append({
                        "name": sname,
                        "data": sval,
                        "formulas": {}
                    })
            sheets_data = normalized or [{"name": "Sheet1", "data": [[""]]}]

        shared_strings = []
        ss_map = {}

        def get_ss_idx(text: str) -> int:
            if text not in ss_map:
                ss_map[text] = len(shared_strings)
                shared_strings.append(text)
            return ss_map[text]

        sheet_xml_entries = []
        for s_idx, sheet in enumerate(sheets_data):
            if isinstance(sheet, str):
                sheet = {"name": sheet, "data": []}
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
                    evaluated_val = None
                    if not formula and cell_str.startswith("="):
                        formula = cell_str[1:].strip()
                    elif formula and cell_str and cell_str != f"={formula}" and cell_str != formula:
                        evaluated_val = cell_str

                    f_xml = f"<f>{self._escape_xml(formula)}</f>" if formula else ""

                    # Numeric check
                    if self._is_number(cell_str) and not formula:
                        row_parts.append(f'<c r="{coord}"><v>{cell_str}</v></c>')
                    elif formula:
                        # Write formula and evaluated value if available
                        val_to_write = evaluated_val if evaluated_val is not None else (cell_str if not cell_str.startswith("=") else "")
                        if val_to_write:
                            if self._is_number(val_to_write):
                                row_parts.append(f'<c r="{coord}">{f_xml}<v>{val_to_write}</v></c>')
                            else:
                                ss_idx = get_ss_idx(val_to_write)
                                row_parts.append(f'<c r="{coord}" t="s">{f_xml}<v>{ss_idx}</v></c>')
                        else:
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
                    })
            total_uncompressed = sum(f.get("file_size", 0) for f in files)
            return {"files": files, "total": len(files), "total_uncompressed_size": total_uncompressed}
        except Exception as e:
            return {"files": [], "error": str(e), "total": 0, "total_uncompressed_size": 0}

    # ---------------- HELPER METHODS ----------------
    def _escape_html(self, text: str) -> str:
        import html
        # Unescape any pre-existing entities first so they are never double-escaped into &amp;amp;
        raw = html.unescape(text or "")
        return html.escape(raw)

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
