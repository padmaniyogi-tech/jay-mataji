#!/usr/bin/env python3
"""Build the GLOWAMOUR Instagram Business Manual PDF.

Content-preserving conversion of the playbook markdown files into a
professional PDF. All text from the source files is included unchanged
(except one documented glyph substitution: U+2630 -> U+2261, see NOTE).

Sources (in order):
  README.md, glowamour/01..06
Output:
  GLOWAMOUR-Instagram-Manual.pdf

Requires: fpdf2, uharfbuzz, fontTools (preflight only), fonts in pdf_assets/.
"""
import os
import re
import sys

from fontTools.ttLib import TTFont
from fpdf import FPDF
from fpdf.drawing_primitives import DeviceRGB
from fpdf.enums import XPos, YPos
from fpdf.fonts import FontFace

ROOT = "/home/user/jay-mataji"
ASSETS = ROOT + "/pdf_assets"
OUT = ROOT + "/GLOWAMOUR-Instagram-Manual.pdf"

CHAPTERS = [
    ("README.md", "Start Here"),
    ("glowamour/01-profile-setup.md", "Profile Setup"),
    ("glowamour/02-seo-keyword-bank.md", "SEO & Keywords"),
    ("glowamour/03-trust-layout-highlights.md", "Layout & Trust"),
    ("glowamour/04-audience-growth-content.md", "Audience, Algorithm & Content"),
    ("glowamour/05-30-day-content-plan.md", "30-Day Content Plan"),
    ("glowamour/06-analytics-checklist.md", "Analytics & Checklist"),
]

# NOTE (single documented substitution): U+2630 TRIGRAM FOR HEAVEN (hamburger-menu
# icon, 2 occurrences) exists in none of the embedded fonts, so it is rendered as
# U+2261 IDENTICAL TO (triple bar), which looks the same in context ("== Menu").
GLYPH_SUBS = {"\u2630": "\u2261"}

# ---- palette / metrics -------------------------------------------------------
MAROON = (123, 45, 77)
GOLD = (176, 132, 62)
GOLD_LIGHT = (232, 214, 175)
INK = (38, 38, 38)
MUTED = (105, 105, 105)
CODE_BG = (241, 242, 245)
CODE_INK = (148, 34, 70)
LINK_BLUE = (22, 82, 160)
RULE = (210, 210, 210)
TABLE_ALT = (247, 243, 238)

BODY_SIZE = 9.5
BODY_LH = 5.0
CODE_SIZE = 8.0
CODE_LH = 4.4
TABLE_SIZE = 8.5
H1_SIZE = 24
H2_SIZE = 13.5
H3_SIZE = 11.0


# ---- preflight ----------------------------------------------------------------
def load_sources():
    texts = []
    for rel, _ in CHAPTERS:
        p = os.path.join(ROOT, rel)
        t = open(p, encoding="utf-8").read().replace("\r", "")
        for a, b in GLYPH_SUBS.items():
            t = t.replace(a, b)
        texts.append((rel, t))
    return texts


def preflight(texts):
    """Verify every character we will emit is covered by some embedded font."""
    cmaps = {}
    for key, fn in [
        ("sans", "Sans-Regular.ttf"),
        ("sansB", "Sans-Bold.ttf"),
        ("sansI", "SansIt-Regular.ttf"),
        ("sansBI", "SansIt-Bold.ttf"),
        ("mono", "Mono-Regular.ttf"),
        ("monoB", "Mono-Bold.ttf"),
        ("guj", "Guj-Regular.ttf"),
        ("gujB", "Guj-Bold.ttf"),
        ("dev", "Dev-Regular.ttf"),
        ("devB", "Dev-Bold.ttf"),
        ("emoji", "Emoji-Regular.ttf"),
    ]:
        cmaps[key] = TTFont(os.path.join(ASSETS, fn)).getBestCmap()

    universe = set("".join(t for _, t in texts))
    universe.update(["\u00ad", "\u2022", "\u2013"])  # inserted by renderer
    problems = []
    for ch in sorted(universe):
        if ch in ("\n", "\t"):
            continue
        o = ord(ch)
        covered = (
            o in cmaps["sans"]
            or o in cmaps["mono"]
            or o in cmaps["guj"]
            or o in cmaps["dev"]
            or o in cmaps["emoji"]
        )
        if not covered:
            problems.append("U+%04X %r" % (o, ch))
    if problems:
        print("PREFLIGHT FAIL - uncovered chars:", problems)
        sys.exit(1)
    print("preflight: all %d unique chars covered" % len(universe))

    # odd inline-marker counts per paragraph (would toggle style to para end)
    for rel, t in texts:
        for para in re.split(r"\n\s*\n", t):
            if para.strip().startswith("```") or para.strip().startswith("|"):
                continue
            no_code = re.sub(r"`[^`]*`", "", para)
            if no_code.count("**") % 2:
                print("WARN odd ** in %s: %r" % (rel, para[:80]))
            lone = re.sub(r"\*\*", "", no_code)
            if lone.count("*") % 2:
                print("WARN odd * in %s: %r" % (rel, para[:80]))
    # link destinations inventory
    dests = set()
    for rel, t in texts:
        for m in re.finditer(r"\[[^\]]*\]\(([^)]*)\)", t):
            dests.add(m.group(1))
    print("link destinations (%d): %s" % (len(dests), sorted(dests)))


# ---- inline markdown -> segments ----------------------------------------------
class Seg:
    __slots__ = ("text", "b", "i", "code", "link")

    def __init__(self, text, b=False, i=False, code=False, link=None):
        self.text = text
        self.b = b
        self.i = i
        self.code = code
        self.link = link


LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)]*)\)")


def parse_inline(s):
    """Parse **bold**, *italic*, `code`, [text](url), \\escapes into segments."""
    segs = []
    buf = []
    B = [False]
    I = [False]

    def flush():
        if buf:
            segs.append(Seg("".join(buf), b=B[0], i=I[0]))
            buf.clear()

    def parse_label(label, dest):
        for ls in parse_inline(label):
            ls.link = dest
            segs.append(ls)

    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c == "\\" and i + 1 < n:
            buf.append(s[i + 1])
            i += 2
            continue
        if c == "`":
            j = s.find("`", i + 1)
            if j == -1:
                buf.append(c)
                i += 1
                continue
            flush()
            code = s[i + 1 : j].replace("\\|", "|").replace("\\\\", "\\")
            segs.append(Seg(code, b=B[0], i=I[0], code=True))
            i = j + 1
            continue
        if c == "[":
            m = LINK_RE.match(s, i)
            if m:
                flush()
                parse_label(m.group(1), m.group(2))
                i = m.end()
                continue
            buf.append(c)
            i += 1
            continue
        if s.startswith("**", i):
            flush()
            B[0] = not B[0]
            i += 2
            continue
        if c == "*":
            flush()
            I[0] = not I[0]
            i += 1
            continue
        buf.append(c)
        i += 1
    flush()
    return segs


def strip_md(s):
    """Plain-text version (TOC entries, width measurement)."""
    s = re.sub(r"\[([^\]]*)\]\(([^)]*)\)", r"\1", s)
    s = s.replace("**", "").replace("`", "")
    s = s.replace("\\|", "|")
    return s.strip()


SPLIT_CODE = set("/?&=._-+%:")
SPLIT_PROSE = set("?&=_%:")


def _shy_after(tok, i, allowed):
    """Whether a soft hyphen may follow tok[i] (avoid splitting e.g./3.5/-5)."""
    ch = tok[i]
    if ch not in allowed:
        return False
    prev_c = tok[i - 1] if i > 0 else ""
    next_c = tok[i + 1] if i + 1 < len(tok) else ""
    if ch == ".":
        return not next_c.isalnum()  # keep e.g. / 3.5 / glowamour.in whole
    if ch == "-":
        return prev_c.isalnum() and next_c.isalnum()  # well-known may split
    return True


def hyphenate(text, allowed=SPLIT_CODE):
    """Insert soft hyphens so long unbroken tokens (URLs, paths) can wrap."""
    out = []
    for tok in re.split(r"(\s+)", text):
        if re.search(r"\s", tok) or len(tok) <= 14:
            out.append(tok)
            continue
        tok = tok.replace("://", "\u0001")
        buf = []
        for i, ch in enumerate(tok):
            buf.append(ch)
            if _shy_after(tok, i, allowed):
                buf.append("\u00ad")
        out.append("".join(buf).replace("\u0001", "://\u00ad"))
    return "".join(out)


# ---- block parsing --------------------------------------------------------------
LIST_RE = re.compile(r"^(\s*)([-*+]|\d+\.)\s+(.*)$")
HEAD_RE = re.compile(r"^(#{1,4})\s+(.*)$")
HR_RE = re.compile(r"^---+\s*$")
SEP_RE = re.compile(r"^:?-{3,}:?$")


def split_row(line):
    cells = re.split(r"(?<!\\)\|", line.strip().strip("|"))
    return [c.strip().replace("\\|", "|").replace("\\\\", "\\") for c in cells]


def parse_blocks(text):
    lines = text.split("\n")
    blocks = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        if ln.strip().startswith("```"):
            i += 1
            code = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i].expandtabs(4))
                i += 1
            i += 1  # closing fence
            blocks.append(("code", code))
            continue
        m = HEAD_RE.match(ln)
        if m:
            blocks.append(("h", len(m.group(1)), m.group(2).strip()))
            i += 1
            continue
        if HR_RE.match(ln.strip()):
            blocks.append(("hr",))
            i += 1
            continue
        if ln.lstrip().startswith(">"):
            q = []
            while i < len(lines) and lines[i].lstrip().startswith(">"):
                q.append(lines[i].lstrip()[1:].lstrip())
                i += 1
            blocks.append(("quote", " ".join(x for x in q if x != "")))
            continue
        if ln.strip().startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            rows = [r for r in rows if not all(SEP_RE.match(c or "") for c in r)]
            blocks.append(("table", rows))
            continue
        m = LIST_RE.match(ln)
        if m:
            items = []
            while i < len(lines):
                m2 = LIST_RE.match(lines[i])
                if m2:
                    ind = len(m2.group(1).replace("\t", "    "))
                    items.append(
                        (ind, m2.group(2), m2.group(3).strip())
                    )
                    i += 1
                    continue
                # indented continuation line belongs to previous item
                if (
                    items
                    and lines[i].strip()
                    and re.match(r"^\s{2,}\S", lines[i])
                    and not HEAD_RE.match(lines[i])
                    and not lines[i].strip().startswith("|")
                    and not lines[i].lstrip().startswith(">")
                    and not lines[i].strip().startswith("```")
                    and not HR_RE.match(lines[i].strip())
                ):
                    ind, kind, txt = items[-1]
                    items[-1] = (ind, kind, txt + " " + lines[i].strip())
                    i += 1
                    continue
                break
            blocks.append(("list", items))
            continue
        # paragraph
        para = [ln.strip()]
        i += 1
        while i < len(lines) and lines[i].strip():
            if (
                HEAD_RE.match(lines[i])
                or lines[i].strip().startswith("```")
                or HR_RE.match(lines[i].strip())
                or lines[i].lstrip().startswith(">")
                or lines[i].strip().startswith("|")
                or LIST_RE.match(lines[i])
            ):
                break
            para.append(lines[i].strip())
            i += 1
        blocks.append(("para", " ".join(para)))
    return blocks


def cell_for_table(cell):
    """Convert a markdown table cell to fpdf2-markdown (bold/links only)."""
    cell = re.sub(r"\[`([^`]*)`\]\(([^)]*)\)", r"\1", cell)  # [`x`](local) -> x
    cell = re.sub(r"\[([^\]]*)\]\(([^)]*)\)", r"[\1](\2)", cell)
    cell = re.sub(r"`([^`]*)`", r"\1", cell)
    return hyphenate(cell)


# ---- PDF ------------------------------------------------------------------------
class Manual(FPDF):
    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-13)
        self.set_font("sans", "", 7.5)
        self.set_text_color(*MUTED)
        self.cell(
            0,
            5,
            "GLOWAMOUR  |  Instagram Business Manual",
            new_x=XPos.LEFT,
            new_y=YPos.TOP,
        )
        self.set_x(-55)
        self.cell(0, 5, "Page %d of {nb}" % self.page_no(), align="R")


# Two-pass TOC: pass 1 records section positions; pass 2 prints a manual TOC
# with known-final page numbers (avoids fpdf2 placeholder page-gr shifting).
SEC_LOG = None      # pass 1: list to append (level, name, page, y)
SEC_EXPECT = None   # pass 2: iterator of expected (level, name, page)


def note_section(pdf, level, name):
    if SEC_LOG is not None:
        SEC_LOG.append((level, name, pdf.page_no(), pdf.get_y()))
    if SEC_EXPECT is not None:
        exp_level, exp_name, exp_page = next(SEC_EXPECT)
        assert exp_level == level and exp_name == name, (
            "section order drift: %r vs %r" % (exp_name, name))
        assert exp_page == pdf.page_no(), (
            "pagination drift at %r: expected p%d got p%d"
            % (name, exp_page, pdf.page_no()))


def render_manual_toc(pdf, entries, with_links):
    """entries: list of (level, name, page, y). Rendered as normal flow content."""
    pdf.add_page()
    pdf.set_y(24)
    pdf.set_font("sans", "B", 20)
    pdf.set_text_color(*MAROON)
    pdf.cell(0, 10, "Contents", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.8)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + 30, pdf.get_y())
    pdf.ln(7)
    dot_w = pdf.get_string_width(".")
    for level, name, pno, ypos in entries:
        indent = 4 + level * 8
        size = 11 if level == 0 else 9.5
        style = "B" if level == 0 else ""
        color = MAROON if level == 0 else INK
        pdf.set_font("sans", style, size)
        pdf.set_text_color(*color)
        link = None
        if with_links:
            try:
                link = pdf.add_link(y=max(0, ypos - 2), page=pno)
            except Exception:
                link = None
        pdf.set_x(pdf.l_margin + indent)
        name_w = pdf.get_string_width(name)
        num_txt = str(pno)
        num_w = pdf.get_string_width(num_txt)
        avail = pdf.w - pdf.r_margin - (pdf.l_margin + indent) - name_w - num_w - 4
        ndots = max(3, int(avail / dot_w)) if avail > 0 else 3
        line = name + " " + "." * ndots + " " + num_txt
        pdf.cell(
            0, 6.2 if level == 0 else 5.6, line, link=link,
            new_x=XPos.LMARGIN, new_y=YPos.NEXT,
        )
        if level == 0:
            pdf.ln(1.2)


EMOJI_SET = set()  # filled in build(): codepoints rendered with the emoji font
ARROW_TO_MONO = {0x2190, 0x2191, 0x2192, 0x2193, 0x2260, 0x2261}


def _fam_for_char(ch, base_fam):
    o = ord(ch)
    if 0x0A80 <= o <= 0x0AFF:
        return "guj"
    if 0x0900 <= o <= 0x097F:
        return "dev"
    if o in EMOJI_SET:
        return "emoji"
    if o in ARROW_TO_MONO:
        return "mono"
    return base_fam


def _first_word_width(pdf, text, base_fam, size, bold):
    m = re.search(r"\S+", text)
    if not m:
        return 0.0
    total, buf, cur = 0.0, "", None
    for ch in m.group(0):
        f = _fam_for_char(ch, base_fam)
        if f != cur:
            if buf:
                pdf.set_font(cur, "", size)
                total += pdf.get_string_width(buf)
                buf = ""
            cur = f
        buf += ch
    if buf:
        pdf.set_font(cur, "", size)
        total += pdf.get_string_width(buf)
    return total * (1.08 if bold else 1.0)


def emit_segments(pdf, segs, size, color, lh, family="sans", base_b=False, base_i=False):
    for sg in segs:
        if not sg.text:
            continue
        fam = "mono" if sg.code else family
        style = ("B" if (sg.b or base_b) else "") + ("I" if (sg.i or base_i) else "")
        col = color
        link = None
        if sg.link and sg.link.startswith(("http://", "https://")):
            link = sg.link
            col = LINK_BLUE
            style += "U"
        elif sg.code:
            col = CODE_INK
        if sg.code:
            txt = hyphenate(sg.text, SPLIT_CODE)
        elif len(sg.text) > 60:
            txt = hyphenate(sg.text, SPLIT_PROSE)
        else:
            txt = sg.text
        # Guard: never start a segment with a word that cannot fit the
        # remaining line - fpdf2 would force-split it mid-word ("Assumpt|ion").
        if pdf.get_x() > pdf.l_margin + 1:
            need = _first_word_width(pdf, txt, fam, size, "B" in style)
            room = pdf.w - pdf.r_margin - pdf.get_x() - 2 * pdf.c_margin
            if need > room + 0.2:
                pdf.ln(lh)
        pdf.set_font(fam, style, size)
        pdf.set_text_color(*col)
        pdf.write(lh, txt, link=link or "")


def para(pdf, text, size=BODY_SIZE, color=INK, lh=BODY_LH, gap=2.4, family="sans"):
    emit_segments(pdf, parse_inline(text), size, color, lh, family)
    pdf.ln(lh + gap)


def heading(pdf, level, text, chapter_no=None, chapter_total=None):
    if level == 1:
        pdf.add_page()
        note_section(pdf, 0, strip_md(text))
        pdf.set_font("sans", "", 10)
        pdf.set_text_color(*MUTED)
        pdf.cell(
            0, 6, "PART %d OF %d  —  GLOWAMOUR INSTAGRAM MANUAL" % (chapter_no, chapter_total),
            new_x=XPos.LMARGIN, new_y=YPos.NEXT,
        )
        pdf.ln(2)
        pdf.set_text_color(*MAROON)
        pdf.set_font("sans", "B", H1_SIZE)
        emit_segments(pdf, parse_inline(text), H1_SIZE, MAROON, H1_SIZE * 0.55)
        pdf.ln(H1_SIZE * 0.55 + 3)
        pdf.set_draw_color(*GOLD)
        pdf.set_line_width(1.0)
        y = pdf.get_y()
        pdf.line(pdf.l_margin, y, pdf.l_margin + 34, y)
        pdf.ln(6)
        pdf.start_section(strip_md(text), level=0)
        return
    need = 30 if level == 2 else 22
    if pdf.will_page_break(need):
        pdf.add_page()
    if level == 2:
        note_section(pdf, 1, strip_md(text))
        pdf.ln(3)
        pdf.set_text_color(*MAROON)
        emit_segments(pdf, parse_inline(text), H2_SIZE, MAROON, H2_SIZE * 0.52)
        pdf.ln(H2_SIZE * 0.52 + 1.5)
        pdf.set_draw_color(*GOLD_LIGHT)
        pdf.set_line_width(0.5)
        y = pdf.get_y()
        pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
        pdf.ln(3.5)
        pdf.start_section(strip_md(text), level=1)
    else:
        pdf.ln(1.5)
        pdf.set_text_color(60, 60, 60)
        emit_segments(pdf, parse_inline(text), H3_SIZE, (60, 60, 60), H3_SIZE * 0.52)
        pdf.ln(H3_SIZE * 0.52 + 2.5)


def code_block(pdf, code_lines):
    need = len(code_lines) * CODE_LH + 8
    if len(code_lines) <= 8:
        if pdf.will_page_break(need):  # keep small blocks together
            pdf.add_page()
    elif pdf.will_page_break(CODE_LH * 2 + 8):
        pdf.add_page()
    pdf.ln(1)
    lm, rm = pdf.l_margin, pdf.r_margin
    full = pdf.w - lm - rm
    for line in code_lines:
        h = CODE_LH
        if pdf.will_page_break(h + 1):
            pdf.add_page()
        y = pdf.get_y()
        pdf.set_fill_color(*CODE_BG)
        pdf.rect(lm, y, full, h, style="F")
        pdf.set_fill_color(*GOLD)
        pdf.rect(lm, y, 1.6, h, style="F")
        pdf.set_xy(lm + 4.5, y + 0.4)
        if line.strip():
            emit_segments(
                pdf,
                [Seg(line)],
                CODE_SIZE,
                (35, 35, 35),
                h - 0.6,
                family="mono",
            )
        pdf.set_xy(lm, y + h)
    pdf.set_fill_color(255, 255, 255)
    pdf.set_text_color(*INK)
    pdf.ln(3.5)


def quote_block(pdf, text):
    if pdf.will_page_break(26):
        pdf.add_page()
    lm = pdf.l_margin
    pdf.set_left_margin(lm + 9)
    pdf.set_x(lm + 9)
    y0 = pdf.get_y()
    emit_segments(pdf, parse_inline(text), BODY_SIZE, (70, 70, 70), BODY_LH, family="sans")
    # italic styling for quotes: re-emit not needed; set base style via family handling:
    pdf.ln(BODY_LH + 1)
    y1 = pdf.get_y()
    pdf.set_left_margin(lm)
    pdf.set_draw_color(*MAROON)
    pdf.set_line_width(1.1)
    pdf.line(lm + 4, y0, lm + 4, y1 - 1)
    pdf.set_text_color(*INK)
    pdf.ln(2.5)


def list_block(pdf, items):
    lm = pdf.l_margin
    for ind, kind, text in items:
        nested = ind >= 2
        base = lm + (7 if nested else 2)
        if kind in ("-", "*", "+"):
            bullet = "\u2013 " if nested else "\u2022 "
            indent = base + 5
        elif kind == "[ ]" or kind == "[x]":
            bullet = kind + " "
            indent = base + 7
        else:  # ordered "N."
            bullet = kind + " "
            indent = base + 7
        # task-list detection inside unordered text
        if kind in ("-", "*", "+"):
            m = re.match(r"^(\[[ xX]\])\s+(.*)$", text)
            if m:
                bullet = m.group(1) + " "
                text = m.group(2)
                indent = base + 7
        pdf.set_left_margin(indent)
        pdf.set_x(base)
        pdf.set_font("sans", "B", BODY_SIZE)
        pdf.set_text_color(*MAROON)
        pdf.write(BODY_LH, bullet)
        pdf.set_text_color(*INK)
        emit_segments(pdf, parse_inline(text), BODY_SIZE, INK, BODY_LH)
        pdf.ln(BODY_LH + 1.1)
    pdf.set_left_margin(lm)
    pdf.ln(1.5)


def table_block(pdf, rows):
    if not rows:
        return
    if pdf.will_page_break(26):
        pdf.add_page()
    ncols = max(len(r) for r in rows)
    norm = []
    for r in rows:
        r = list(r) + [""] * (ncols - len(r))
        norm.append([cell_for_table(c) for c in r])
    pdf.set_font("sans", "", TABLE_SIZE)
    weights = []
    for ci in range(ncols):
        mx = 0
        for r in norm:
            plain = strip_md(r[ci])
            for word in plain.split():
                mx = max(mx, pdf.get_string_width(word))
            mx = max(mx, min(pdf.get_string_width(plain), 95))
        weights.append(max(18.0, mx + 5))
    pdf.set_draw_color(*RULE)
    pdf.set_text_color(*INK)
    pdf.set_fill_color(255, 255, 255)
    pdf.set_font("sans", "", TABLE_SIZE)
    with pdf.table(
        first_row_as_headings=True,
        markdown=True,
        col_widths=weights,
        width=pdf.w - pdf.l_margin - pdf.r_margin,
        text_align="LEFT",
        v_align="TOP",
        line_height=TABLE_SIZE * 0.52,
        padding=1.8,
        headings_style=FontFace(
            emphasis="BOLD",
            color=DeviceRGB(1, 1, 1),
            fill_color=DeviceRGB(*(c / 255 for c in MAROON)),
            size_pt=TABLE_SIZE + 0.5,
        ),
        cell_fill_color=DeviceRGB(*(c / 255 for c in TABLE_ALT)),
        cell_fill_mode="EVEN_ROWS",
    ) as table:
        for row_data in norm:
            row = table.row()
            for cell in row_data:
                row.cell(cell)
    pdf.ln(3.5)


def build_cover(pdf):
    pdf.add_page()
    # top band
    pdf.set_fill_color(*MAROON)
    pdf.rect(0, 0, 210, 46, style="F")
    pdf.set_fill_color(*GOLD)
    pdf.rect(0, 46, 210, 2.2, style="F")
    pdf.set_xy(18, 12)
    pdf.set_font("sans", "B", 13)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 7, "GLOWAMOUR  •  SKINCARE  •  INDIA", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(18)
    pdf.set_font("sans", "", 9.5)
    pdf.set_text_color(*GOLD_LIGHT)
    pdf.cell(0, 6, "Night Cream  •  Kesar Goti Soap (coming soon)  •  Gujarat / Ahmedabad")
    pdf.set_y(62)
    pdf.set_x(18)
    pdf.set_font("sans", "", 12)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 7, "THE COMPLETE PLAYBOOK, PRINT-READY", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(18)
    pdf.set_font("sans", "B", 34)
    pdf.set_text_color(*MAROON)
    pdf.multi_cell(0, 13, "Instagram\nBusiness Manual", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(1.1)
    pdf.line(18, pdf.get_y(), 52, pdf.get_y())
    pdf.ln(6)
    pdf.set_x(18)
    pdf.set_font("sans", "", 10.5)
    pdf.set_text_color(*INK)
    pdf.multi_cell(
        150,
        5.6,
        "Profile setup  •  SEO keyword system  •  Trust-building layout  •  "
        "Audience plan  •  Algorithm-based growth  •  30-day content plan  •  "
        "Analytics & implementation checklists.",
        new_x=XPos.LMARGIN, new_y=YPos.NEXT,
    )
    pdf.ln(6)
    # inside box
    y0 = pdf.get_y()
    pdf.set_fill_color(*TABLE_ALT)
    pdf.set_font("sans", "", 9.5)
    lines = [
        "Inside:  7 parts  •  Ready-to-copy usernames, display names & bios",
        "Keyword banks (English + Hinglish + Gujarati)  •  Hashtag sets",
        "Pinned posts & 9 Story Highlights  •  30-day post calendar with hooks",
        "Diagnosis tables  •  Prioritized checklists with [ ] boxes",
    ]
    box_h = 10 + len(lines) * 5.4
    pdf.rect(18, y0, 174, box_h, style="F")
    pdf.set_fill_color(*GOLD)
    pdf.rect(18, y0, 1.8, box_h, style="F")
    pdf.set_xy(24, y0 + 5)
    pdf.set_text_color(*INK)
    for ln in lines:
        pdf.set_x(24)
        pdf.cell(0, 5.4, ln, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_y(y0 + box_h + 8)
    pdf.set_x(18)
    pdf.set_font("sans", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        174,
        5.2,
        "Prepared 19 October 2026 from the GLOWAMOUR Instagram Playbook repository "
        "(README + parts 01–06). Content preserved in full; organized here with a "
        "table of contents and print-friendly layout.\n"
        "No fake claims. No guaranteed followers, reach, or sales — only current "
        "Instagram guidance and practical steps you can implement yourself.",
        new_x=XPos.LMARGIN, new_y=YPos.NEXT,
    )


def make_pdf():
    pdf = Manual("P", "mm", "A4")
    pdf.set_margins(18, 17, 18)
    pdf.set_auto_page_break(True, 20)
    pdf.set_display_mode("default", "continuous")
    pdf.set_title("GLOWAMOUR - Instagram Business Manual")
    pdf.set_author("GLOWAMOUR")
    pdf.set_subject("Complete Instagram business profile strategy: setup, SEO, trust, audience, algorithm growth, content plan, analytics, checklists")
    pdf.set_creator("GLOWAMOUR Playbook -> PDF (fpdf2)")
    pdf.set_keywords("GLOWAMOUR, Instagram, skincare, night cream, SEO, Ahmedabad, Gujarat")

    pdf.add_font("sans", "", ASSETS + "/Sans-Regular.ttf")
    pdf.add_font("sans", "B", ASSETS + "/Sans-Bold.ttf")
    pdf.add_font("sans", "I", ASSETS + "/SansIt-Regular.ttf")
    pdf.add_font("sans", "BI", ASSETS + "/SansIt-Bold.ttf")
    pdf.add_font("mono", "", ASSETS + "/Mono-Regular.ttf")
    pdf.add_font("mono", "B", ASSETS + "/Mono-Bold.ttf")
    pdf.add_font("guj", "", ASSETS + "/Guj-Regular.ttf")
    pdf.add_font("guj", "B", ASSETS + "/Guj-Bold.ttf")
    pdf.add_font("dev", "", ASSETS + "/Dev-Regular.ttf")
    pdf.add_font("dev", "B", ASSETS + "/Dev-Bold.ttf")
    pdf.add_font("emoji", "", ASSETS + "/Emoji-Regular.ttf")
    pdf.set_fallback_fonts(["guj", "dev", "mono", "emoji"], exact_match=False)
    pdf.set_text_shaping(True)
    pdf.MARKDOWN_LINK_COLOR = DeviceRGB(*(c / 255 for c in LINK_BLUE))
    try:
        pdf.MARKDOWN_LINK_UNDERLINE = True
    except Exception:
        pass
    pdf.alias_nb_pages("{nb}")
    return pdf


def render_chapters(pdf, texts):
    total = len(texts)
    for idx, ((rel, text), (_, _part)) in enumerate(zip(texts, CHAPTERS), start=1):
        blocks = parse_blocks(text)
        for b in blocks:
            kind = b[0]
            if kind == "h":
                _, level, htext = b
                if level == 1:
                    heading(pdf, 1, htext, chapter_no=idx, chapter_total=total)
                else:
                    heading(pdf, level, htext)
            elif kind == "para":
                para(pdf, b[1])
            elif kind == "code":
                code_block(pdf, b[1])
            elif kind == "quote":
                quote_block(pdf, b[1])
            elif kind == "list":
                list_block(pdf, b[1])
            elif kind == "table":
                table_block(pdf, b[1])
            elif kind == "hr":
                pdf.ln(2)
                pdf.set_draw_color(*RULE)
                pdf.set_line_width(0.4)
                y = pdf.get_y()
                pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
                pdf.ln(4)

def build():
    global SEC_LOG, SEC_EXPECT, EMOJI_SET
    texts = load_sources()
    preflight(texts)
    EMOJI_SET = set(
        TTFont(os.path.join(ASSETS, "Emoji-Regular.ttf")).getBestCmap()
    )

    # Pass 1: record section positions (cover + chapters, no TOC).
    pdf1 = make_pdf()
    build_cover(pdf1)
    SEC_LOG = []
    render_chapters(pdf1, texts)
    sections = list(SEC_LOG)
    SEC_LOG = None
    pass1_pages = pdf1.pages_count
    print("pass 1: %d pages, %d toc entries" % (pass1_pages, len(sections)))

    # Scratch: measure TOC page count (stable regardless of page numbers).
    scratch = make_pdf()
    dummy = [(lv, nm, 99, 20.0) for lv, nm, pg, yy in sections]
    render_manual_toc(scratch, dummy, with_links=False)
    toc_pages = scratch.pages_count
    print("toc pages: %d" % toc_pages)

    # Pass 2: cover + TOC + chapters; content shifts by toc_pages.
    final = [(lv, nm, pg + toc_pages, yy) for lv, nm, pg, yy in sections]
    pdf = make_pdf()
    build_cover(pdf)
    render_manual_toc(pdf, final, with_links=True)
    assert pdf.page_no() == 1 + toc_pages, (
        "TOC used %d pages, expected %d" % (pdf.page_no() - 1, toc_pages))
    SEC_EXPECT = iter([(lv, nm, pg) for lv, nm, pg, yy in final])
    render_chapters(pdf, texts)
    SEC_EXPECT = None
    assert pdf.pages_count == pass1_pages + toc_pages, (
        "page drift: pass1=%d toc=%d final=%d"
        % (pass1_pages, toc_pages, pdf.pages_count))

    pdf.output(OUT)
    print("wrote %s (%d bytes, %d pages)" % (OUT, os.path.getsize(OUT), pdf.pages_count))


if __name__ == "__main__":
    build()
