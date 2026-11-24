"""Builds public/guides/appeler-application-par-defaut.pdf.

The guide linked from Paramètres > Téléphone and the « Raccourcis » sheet of
Appeler: how to choose, on Windows and on Mac, the app that opens when a
salesperson clicks « Appeler » or a phone number in the CRM (a tel: link).
Brand-neutral on purpose: the same file is served by every agency's CRM.

    python scripts/guides/build-appeler-guide.py
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).resolve().parents[2] / "public" / "guides" / "appeler-application-par-defaut.pdf"

INK = colors.HexColor("#0f172a")
INK_2 = colors.HexColor("#334155")
INK_3 = colors.HexColor("#64748b")
LINE = colors.HexColor("#e2e8f0")
SURFACE = colors.HexColor("#f8fafc")
ACCENT = colors.HexColor("#4338ca")
ACCENT_SOFT = colors.HexColor("#eef2ff")
WIN = colors.HexColor("#0067c0")
WIN_SOFT = colors.HexColor("#e8f1fb")
MAC = colors.HexColor("#1f2937")
MAC_SOFT = colors.HexColor("#f1f5f9")
AMBER_SOFT = colors.HexColor("#fffbeb")
AMBER_LINE = colors.HexColor("#fcd34d")
CODE_BG = colors.HexColor("#0f172a")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
FRAME_PAD = 6  # SimpleDocTemplate's frame padding on each side
CONTENT_W = PAGE_W - 2 * MARGIN - 2 * FRAME_PAD


def style(name, **kw):
    base = dict(fontName="Helvetica", fontSize=10, leading=14.5, textColor=INK_2, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)


KICKER = style("kicker", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=ACCENT)
TITLE = style("title", fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=INK)
LEAD = style("lead", fontSize=11, leading=16, textColor=INK_2)
H2 = style("h2", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=INK)
H3 = style("h3", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=INK)
BODY = style("body")
SMALL = style("small", fontSize=8.5, leading=12, textColor=INK_3)
STEP = style("step", fontSize=10, leading=14.5, textColor=INK_2)
PATH = style("path", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=INK)
CODE = style("code", fontName="Courier", fontSize=8.2, leading=11.5, textColor=colors.HexColor("#e2e8f0"))
CELL = style("cell", fontSize=9, leading=12.5, textColor=INK_2)
CELL_B = style("cellb", fontName="Helvetica-Bold", fontSize=9, leading=12.5, textColor=INK)


class Badge(Flowable):
    """Numbered circle in front of a step."""

    def __init__(self, n, color):
        super().__init__()
        self.n, self.color = str(n), color
        self.width = self.height = 6.2 * mm

    def draw(self):
        r = self.width / 2
        self.canv.setFillColor(self.color)
        self.canv.circle(r, r, r, stroke=0, fill=1)
        self.canv.setFillColor(colors.white)
        self.canv.setFont("Helvetica-Bold", 9)
        self.canv.drawCentredString(r, r - 3.1, self.n)


def b(text):
    return f"<b>{text}</b>"


def box(rows, bg, border=None, pad=10, radius=6, width=CONTENT_W):
    t = Table([[r] for r in rows], colWidths=[width])
    cmds = [
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LEFTPADDING", (0, 0), (-1, -1), pad),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, 0), pad),
        ("BOTTOMPADDING", (0, -1), (-1, -1), pad),
        ("ROUNDEDCORNERS", [radius] * 4),
    ]
    if border:
        cmds.append(("BOX", (0, 0), (-1, -1), 0.8, border))
    t.setStyle(TableStyle(cmds))
    return t


def path(*parts):
    """Menu path shown as a pill: Paramètres › Applications › …"""
    text = '  <font color="#94a3b8">›</font>  '.join(parts)
    p = Paragraph(text, PATH)
    plain = "  ›  ".join(parts)
    w = min(CONTENT_W, stringWidth(plain, "Helvetica-Bold", 9) + 18)
    t = Table([[p]], colWidths=[w])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("ROUNDEDCORNERS", [5] * 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    t.hAlign = "LEFT"
    return t


def steps(items, color):
    rows = [[Badge(i + 1, color), Paragraph(text, STEP)] for i, text in enumerate(items)]
    t = Table(rows, colWidths=[10 * mm, CONTENT_W - 10 * mm])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (1, 0), (1, -1), 5.5),
            ]
        )
    )
    return t


def os_header(label, title, color, soft):
    chip = Paragraph(f'<font color="white"><b>{label}</b></font>', style("chip", fontSize=8, leading=10, textColor=colors.white))
    t = Table([[chip, Paragraph(title, H2)]], colWidths=[24 * mm, CONTENT_W - 24 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), soft),
                ("BACKGROUND", (0, 0), (0, 0), color),
                ("ROUNDEDCORNERS", [6] * 4),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, 0), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


def code(lines):
    # Preformatted keeps real spaces: a command copied from the PDF must paste as-is
    # (non-breaking spaces would break it in the Terminal).
    return box([Preformatted(chr(10).join(lines), CODE)], CODE_BG, pad=9, radius=5, width=CONTENT_W - 10 * mm)


def indent(flowable, left=10 * mm):
    t = Table([[flowable]], colWidths=[CONTENT_W - left])
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    t.hAlign = "RIGHT"
    return t


def footer(canv, doc):
    canv.saveState()
    canv.setStrokeColor(LINE)
    canv.setLineWidth(0.6)
    canv.line(MARGIN + FRAME_PAD, 13 * mm, PAGE_W - MARGIN - FRAME_PAD, 13 * mm)
    canv.setFont("Helvetica", 7.5)
    canv.setFillColor(INK_3)
    canv.drawString(MARGIN + FRAME_PAD, 9 * mm, "Bouton « Appeler » : choisir votre application d'appel  ·  Windows et Mac  ·  novembre 2026")
    canv.drawRightString(PAGE_W - MARGIN - FRAME_PAD, 9 * mm, f"{doc.page}")
    canv.restoreState()


def build():
    s = []

    # ── Intro ────────────────────────────────────────────────────────────────
    s += [
        Paragraph("GUIDE  ·  2 MINUTES  ·  À FAIRE UNE SEULE FOIS", KICKER),
        Spacer(1, 6),
        Paragraph("Le bouton « Appeler » ouvre votre application d'appel", TITLE),
        Spacer(1, 8),
        Paragraph(
            "Quand vous cliquez sur « Appeler » ou sur un numéro dans le CRM, c'est votre ordinateur qui choisit "
            "l'application qui passe l'appel. Si rien ne se passe, ou si FaceTime, Teams ou une autre app s'ouvre à la place "
            "de votre téléphonie (Allo, Onoff, Aircall, Ringover…), suivez la partie qui correspond à votre ordinateur.",
            LEAD,
        ),
        Spacer(1, 14),
        box(
            [
                Paragraph("Avant de commencer", H3),
                Spacer(1, 2),
                Paragraph(
                    f"<b>1.</b>  Installez l'application <b>ordinateur</b> de votre téléphonie (pas seulement le site ou l'extension) "
                    "et connectez-vous à votre compte.",
                    BODY,
                ),
                Paragraph(
                    "<b>2.</b>  Ouvrez-la au moins une fois : c'est à ce moment qu'elle se déclare auprès de l'ordinateur "
                    "et qu'elle apparaît dans les listes ci-dessous.",
                    BODY,
                ),
                Paragraph(
                    "<b>3.</b>  Un numéro vous est attribué dans le CRM (Paramètres › Téléphone) ? Le bouton « Appeler » appelle "
                    "déjà depuis le navigateur. Ce guide sert alors pour les autres numéros cliquables du CRM.",
                    BODY,
                ),
            ],
            ACCENT_SOFT,
            pad=12,
        ),
        Spacer(1, 18),
    ]

    # ── Windows ──────────────────────────────────────────────────────────────
    s += [
        KeepTogether(
            [
                os_header("WINDOWS", "Windows 11", WIN, WIN_SOFT),
                Spacer(1, 10),
                path("Paramètres", "Applications", "Applications par défaut"),
                Spacer(1, 8),
                steps(
                    [
                        f"Ouvrez les {b('Paramètres')} : touches {b('Windows + I')}.",
                        f"Cliquez sur {b('Applications')}, puis sur {b('Applications par défaut')}.",
                        f"Dans la barre de recherche du haut (type de fichier ou de lien), tapez {b('tel')}.",
                        f"Sous le résultat {b('TEL')}, cliquez sur l'application affichée (ou sur {b('Choisir une valeur par défaut')}).",
                        f"Choisissez votre application d'appel dans la liste, puis cliquez sur {b('Définir par défaut')}.",
                    ],
                    WIN,
                ),
                Spacer(1, 4),
                indent(
                    Paragraph(
                        f"Raccourci : touches {b('Windows + R')}, tapez {b('ms-settings:defaultapps')}, puis {b('Entrée')}.",
                        SMALL,
                    )
                ),
            ]
        ),
        Spacer(1, 14),
        KeepTogether(
            [
                Paragraph("Windows 10", H3),
                Spacer(1, 6),
                path("Paramètres", "Applications", "Applications par défaut", "Choisir les applications par défaut par protocole"),
                Spacer(1, 6),
                Paragraph(
                    f"Le lien {b('Choisir les applications par défaut par protocole')} est tout en bas de la page. "
                    f"Trouvez la ligne {b('TEL')}, cliquez sur l'application à droite et choisissez la vôtre.",
                    BODY,
                ),
            ]
        ),
        PageBreak(),
    ]

    # ── Mac ──────────────────────────────────────────────────────────────────
    s += [
        KeepTogether(
            [
                os_header("MAC", "Mac (macOS)", MAC, MAC_SOFT),
                Spacer(1, 8),
                Paragraph(
                    f"Pour connaître votre version : menu {b('Pomme')} › {b('À propos de ce Mac')}. "
                    "Le réglage s'appelle « Réglages par défaut des appels ».",
                    BODY,
                ),
                Spacer(1, 10),
                Paragraph("macOS Tahoe (26) et plus récent : app Téléphone", H3),
                Spacer(1, 6),
                path("Téléphone", "Réglages", "Général", "Réglages par défaut des appels"),
                Spacer(1, 8),
                steps(
                    [
                        f"Ouvrez l'app {b('Téléphone')} (Launchpad, ou {b('Cmd + Espace')} puis « Téléphone »).",
                        f"Dans la barre de menus, cliquez sur {b('Téléphone')} › {b('Réglages')}, puis sur l'onglet {b('Général')}.",
                        f"Dans {b('Réglages par défaut des appels')}, choisissez votre application d'appel.",
                    ],
                    MAC,
                ),
            ]
        ),
        Spacer(1, 12),
        KeepTogether(
            [
                Paragraph("macOS Sequoia (15) et avant : app FaceTime", H3),
                Spacer(1, 6),
                path("FaceTime", "Réglages", "Général", "Réglages par défaut des appels"),
                Spacer(1, 8),
                steps(
                    [
                        f"Ouvrez {b('FaceTime')} et connectez-vous avec votre compte Apple s'il le demande.",
                        f"Dans la barre de menus, cliquez sur {b('FaceTime')} › {b('Réglages')} "
                        f"(ou {b('Préférences')} sur les anciennes versions), puis sur {b('Général')}.",
                        f"Dans {b('Réglages par défaut des appels')}, choisissez votre application d'appel.",
                    ],
                    MAC,
                ),
            ]
        ),
        Spacer(1, 10),
        box(
            [
                Paragraph(
                    "<b>L'option n'apparaît pas ?</b>  Apple ne l'affiche que si votre application d'appel est installée "
                    "(il faut au moins deux apps d'appel sur le Mac) et que vous êtes connecté à votre compte Apple. "
                    "Ouvrez votre app une fois, puis recommencez.",
                    CELL,
                ),
            ],
            AMBER_SOFT,
            border=AMBER_LINE,
            pad=10,
        ),
        Spacer(1, 12),
        KeepTogether(
            [
                Paragraph("Solution de secours (Terminal), si l'option manque toujours", H3),
                Spacer(1, 4),
                Paragraph(
                    "Sur certaines versions de macOS Tahoe, l'option a disparu des réglages. Vous pouvez faire le réglage "
                    f"dans l'app {b('Terminal')}, idéalement avec votre manager :",
                    BODY,
                ),
                Spacer(1, 6),
                steps(
                    [
                        "Trouvez l'identifiant de votre app (remplacez Allo par son nom exact) :",
                    ],
                    MAC,
                ),
                indent(code(["osascript -e 'id of app \"Allo\"'"])),
                Spacer(1, 6),
                Table(
                    [[Badge(2, MAC), Paragraph("Collez cette ligne en remplaçant ID_DE_L_APP par le résultat de l'étape 1 :", STEP)]],
                    colWidths=[10 * mm, CONTENT_W - 10 * mm],
                    style=TableStyle(
                        [
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (1, 0), (1, -1), 5.5),
                        ]
                    ),
                ),
                indent(
                    code(
                        [
                            "osascript -l JavaScript -e 'ObjC.import(\"LaunchServices\");",
                            "  $.LSSetDefaultHandlerForURLScheme(ObjC.wrap(\"tel\"), ObjC.wrap(\"ID_DE_L_APP\"))'",
                        ]
                    )
                ),
                Spacer(1, 4),
                indent(Paragraph("Les deux lignes forment une seule commande : collez-les ensemble. Si le Mac demande une confirmation, acceptez.", SMALL)),
            ]
        ),
        PageBreak(),
    ]

    # ── Browser ──────────────────────────────────────────────────────────────
    browser_rows = [
        [Paragraph("Chrome, Edge", CELL_B), Paragraph(f"Une fenêtre « Ouvrir … ? » s'affiche en haut. Cochez {b('Toujours autoriser…')}, puis cliquez sur {b('Ouvrir')}.", CELL)],
        [Paragraph("Safari", CELL_B), Paragraph(f"Cliquez sur {b('Autoriser')}.", CELL)],
        [Paragraph("Firefox", CELL_B), Paragraph(f"Choisissez votre application, cochez la case pour toujours l'utiliser, puis cliquez sur {b('Ouvrir le lien')}.", CELL)],
    ]
    bt = Table(browser_rows, colWidths=[30 * mm, CONTENT_W - 30 * mm])
    bt.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.6, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    s += [
        KeepTogether(
            [
                Paragraph("Le premier clic dans le navigateur", H2),
                Spacer(1, 4),
                Paragraph("La première fois que vous cliquez sur « Appeler », le navigateur demande l'autorisation d'ouvrir votre application :", BODY),
                Spacer(1, 4),
                bt,
            ]
        ),
        Spacer(1, 14),
        box(
            [
                Paragraph("Testez", H3),
                Spacer(1, 2),
                Paragraph(
                    "Dans le CRM, ouvrez un prospect et cliquez sur « Appeler ». Votre application d'appel s'ouvre avec le numéro "
                    "déjà saisi : c'est réglé. Si ce n'est pas le cas, voyez le tableau ci-dessous.",
                    BODY,
                ),
            ],
            colors.HexColor("#ecfdf5"),
            border=colors.HexColor("#a7f3d0"),
            pad=12,
        ),
        Spacer(1, 18),
    ]

    # ── Troubleshooting ──────────────────────────────────────────────────────
    trouble = [
        ("Rien ne se passe au clic", "Aucune application n'est réglée pour les numéros de téléphone : refaites la partie Windows ou Mac. Regardez aussi si le navigateur affiche une fenêtre d'autorisation en haut de la page."),
        ("FaceTime, Téléphone, Teams ou Mobile connecté s'ouvre", "Une autre application a pris la main : choisissez la vôtre en suivant la partie Windows ou Mac."),
        ("Mon application n'est pas dans la liste", "Installez sa version ordinateur, ouvrez-la une fois, puis recommencez. Toujours absente : elle ne gère pas les numéros cliquables, demandez à son support."),
        ("Le réglage saute après un redémarrage", "Certaines apps (Teams, RingCentral…) se remettent par défaut à leur lancement. Désactivez cette option dans leurs réglages, puis refaites le réglage."),
        ("L'app s'ouvre sans le numéro", "Mettez l'application à jour. En attendant, copiez le numéro depuis la fiche du prospect."),
    ]
    rows = [[Paragraph("Ce qui se passe", CELL_B), Paragraph("Ce qu'il faut faire", CELL_B)]]
    rows += [[Paragraph(a, CELL_B), Paragraph(c, CELL)] for a, c in trouble]
    tt = Table(rows, colWidths=[52 * mm, CONTENT_W - 52 * mm], repeatRows=1)
    tt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
                ("LINEBELOW", (0, 0), (-1, -1), 0.6, LINE),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("ROUNDEDCORNERS", [6] * 4),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    s += [KeepTogether([Paragraph("Ça ne marche pas ?", H2), Spacer(1, 8), tt])]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=16 * mm,
        bottomMargin=20 * mm,
        title="Bouton Appeler : choisir votre application d'appel",
        author="CRM",
        subject="Régler l'application d'appel par défaut sur Windows et Mac",
    )
    doc.build(s, onFirstPage=footer, onLaterPages=footer)
    print(OUT)


if __name__ == "__main__":
    build()
