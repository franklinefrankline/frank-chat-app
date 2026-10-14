import io
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger("document_extractor")


def extract_text_from_file(file_path: Path, filename: str, mime_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Extracts readable text from supported document types (PDF, DOCX/DOC, TXT, CSV, MD, JSON).
    Preserves page information for PDFs where possible.
    Returns:
        {
            "filename": str,
            "text": str,
            "pages": [{"page": int, "text": str}],
            "page_count": int,
            "has_readable_text": bool
        }
    """
    if not file_path.exists():
        raise ValueError(f"File not found on server: {filename}")

    ext = file_path.suffix.lower()
    if not ext and filename:
        ext = Path(filename).suffix.lower()

    extracted_pages: List[Dict[str, Any]] = []
    full_text = ""

    try:
        # 1. PDF Documents
        if ext == ".pdf" or (mime_type and "pdf" in mime_type.lower()):
            has_pypdf = False
            try:
                from pypdf import PdfReader
                has_pypdf = True
            except ImportError:
                try:
                    from PyPDF2 import PdfReader
                    has_pypdf = True
                except ImportError:
                    has_pypdf = False

            if has_pypdf:
                try:
                    reader = PdfReader(str(file_path))
                    page_count = len(reader.pages)
                    for idx, page in enumerate(reader.pages):
                        page_text = page.extract_text() or ""
                        cleaned_text = page_text.strip()
                        if cleaned_text:
                            extracted_pages.append({
                                "page": idx + 1,
                                "text": cleaned_text
                            })
                    if extracted_pages:
                        full_text = "\n\n".join(
                            f"[Page {p['page']}]\n{p['text']}" for p in extracted_pages
                        )
                    return {
                        "filename": filename,
                        "text": full_text.strip(),
                        "pages": extracted_pages,
                        "page_count": max(page_count, 1),
                        "has_readable_text": bool(full_text.strip()),
                    }
                except Exception as pdf_err:
                    logger.warning(f"pypdf reader error: {pdf_err}, falling back to stream scanner")

            # Fallback pure-Python text extraction from PDF stream objects
            raw_pdf = file_path.read_bytes()
            # Search for text enclosed between BT and ET operators or literal parentheses
            text_chunks = re.findall(rb'\((.*?)\)\s*Tj', raw_pdf)
            if not text_chunks:
                text_chunks = re.findall(rb'\[(.*?)\]\s*TJ', raw_pdf)
            decoded_text = " ".join(
                c.decode("latin-1", errors="ignore").strip()
                for c in text_chunks
                if len(c.strip()) > 1
            )
            if not decoded_text.strip():
                # Extract any readable ASCII/Latin-1 strings of length >= 4
                words = re.findall(rb'[A-Za-z0-9 ,.\-:;\'"?!]{4,}', raw_pdf)
                decoded_text = " ".join(w.decode("latin-1", errors="ignore") for w in words[:200])

            has_readable = bool(decoded_text.strip())
            return {
                "filename": filename,
                "text": decoded_text.strip(),
                "pages": [{"page": 1, "text": decoded_text.strip()}] if has_readable else [],
                "page_count": 1,
                "has_readable_text": has_readable,
            }

        # 2. Word Documents (DOCX / OpenXML) - Pure standard library zipfile + XML
        elif ext in (".docx", ".doc") or (mime_type and "word" in mime_type.lower()):
            raw_bytes = file_path.read_bytes()
            paragraphs: List[str] = []
            try:
                with zipfile.ZipFile(io.BytesIO(raw_bytes), "r") as z:
                    if "word/document.xml" in z.namelist():
                        xml_content = z.read("word/document.xml")
                        root = ET.fromstring(xml_content)
                        # OpenXML w:p is paragraph, w:t is text node
                        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                        for p_elem in root.findall(".//w:p", ns):
                            texts = [t.text for t in p_elem.findall(".//w:t", ns) if t.text]
                            if texts:
                                p_text = "".join(texts).strip()
                                if p_text:
                                    paragraphs.append(p_text)
            except Exception as docx_err:
                logger.warning(f"DOCX OpenXML parser error: {docx_err}")
                # Resilient fallback for plain text / test docx or binary DOC files
                try:
                    words = re.findall(rb'[A-Za-z0-9 ,.\-:;\'"?!]{4,}', raw_bytes)
                    text_fallback = " ".join(w.decode("latin-1", errors="ignore").strip() for w in words[:400] if len(w.strip()) > 3)
                    if text_fallback.strip():
                        paragraphs.append(text_fallback.strip())
                except Exception:
                    pass

            full_text = "\n\n".join(paragraphs)
            return {
                "filename": filename,
                "text": full_text.strip(),
                "pages": [{"page": 1, "text": full_text.strip()}] if full_text.strip() else [],
                "page_count": 1,
                "has_readable_text": bool(full_text.strip()),
            }

        # 3. Excel Spreadsheets (XLSX, XLSM, XLTX, XLS) - Pure standard library zipfile + XML
        elif ext in (".xlsx", ".xlsm", ".xltx") or (mime_type and any(m in mime_type.lower() for m in ["spreadsheet", "excel", "sheet"])):
            raw_bytes = file_path.read_bytes()
            extracted_cells: List[str] = []
            try:
                with zipfile.ZipFile(io.BytesIO(raw_bytes), "r") as z:
                    shared_strings: List[str] = []
                    if "xl/sharedStrings.xml" in z.namelist():
                        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
                        for elem in root.iter():
                            if elem.tag.endswith("t") and elem.text:
                                shared_strings.append(elem.text.strip())

                    # Also extract sheet row data
                    sheet_names = [n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")]
                    for s_name in sheet_names[:5]:  # Up to first 5 sheets
                        s_root = ET.fromstring(z.read(s_name))
                        for row in s_root.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"):
                            row_texts = []
                            for c in row.findall(".//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                                t_attr = c.get("t")
                                v_elem = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                                if v_elem is not None and v_elem.text:
                                    val = v_elem.text.strip()
                                    if t_attr == "s" and val.isdigit() and int(val) < len(shared_strings):
                                        row_texts.append(shared_strings[int(val)])
                                    else:
                                        row_texts.append(val)
                            if row_texts:
                                extracted_cells.append(" | ".join(row_texts))

                    if not extracted_cells and shared_strings:
                        extracted_cells = shared_strings
            except Exception as xlsx_err:
                logger.warning(f"XLSX OpenXML parser error: {xlsx_err}")
                # Fallback for plain text or binary excel spreadsheets
                try:
                    words = re.findall(rb'[A-Za-z0-9 ,.\-:;\'"?!]{4,}', raw_bytes)
                    text_fallback = " ".join(w.decode("latin-1", errors="ignore").strip() for w in words[:400] if len(w.strip()) > 3)
                    if text_fallback.strip():
                        extracted_cells.append(text_fallback.strip())
                except Exception:
                    pass

            full_text = "\n".join(extracted_cells)
            has_readable = bool(full_text.strip())
            return {
                "filename": filename,
                "text": full_text.strip(),
                "pages": [{"page": 1, "text": full_text.strip()}] if has_readable else [],
                "page_count": 1,
                "has_readable_text": has_readable,
            }

        elif ext == ".xls" or (mime_type and "excel" in mime_type.lower() and ext != ".xlsx"):
            # Older binary XLS or TSV/HTML disguised as XLS
            raw_bytes = file_path.read_bytes()
            words = re.findall(rb'[A-Za-z0-9 ,.\-:;\'"?!]{4,}', raw_bytes)
            decoded_text = " ".join(w.decode("latin-1", errors="ignore") for w in words[:400])
            has_readable = bool(decoded_text.strip())
            return {
                "filename": filename,
                "text": decoded_text.strip(),
                "pages": [{"page": 1, "text": decoded_text.strip()}] if has_readable else [],
                "page_count": 1,
                "has_readable_text": has_readable,
            }

        # 4. Plain Text, Markdown, CSV, JSON, Log files
        elif ext in (".txt", ".md", ".log", ".json", ".csv", ".xml", ".yaml", ".yml") or (mime_type and any(m in mime_type.lower() for m in ["text", "json", "csv"])):
            raw_bytes = file_path.read_bytes()
            try:
                full_text = raw_bytes.decode("utf-8")
            except UnicodeDecodeError:
                full_text = raw_bytes.decode("latin-1", errors="replace")

            return {
                "filename": filename,
                "text": full_text.strip(),
                "pages": [{"page": 1, "text": full_text.strip()}] if full_text.strip() else [],
                "page_count": 1,
                "has_readable_text": bool(full_text.strip()),
            }

        # 4. Fallback Generic
        else:
            raw_bytes = file_path.read_bytes()
            try:
                full_text = raw_bytes.decode("utf-8")
            except Exception:
                full_text = raw_bytes.decode("latin-1", errors="ignore")

            return {
                "filename": filename,
                "text": full_text.strip(),
                "pages": [{"page": 1, "text": full_text.strip()}] if full_text.strip() else [],
                "page_count": 1,
                "has_readable_text": bool(full_text.strip()),
            }

    except Exception as exc:
        logger.error(f"Failed to extract document text from {filename}: {exc}")
        return {
            "filename": filename,
            "text": "",
            "pages": [],
            "page_count": 1,
            "has_readable_text": False
        }
