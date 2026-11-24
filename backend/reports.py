from collections import Counter
import csv
from html import escape
from io import BytesIO, StringIO

from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate


def csv_report(rows, fields):
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fields, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: "'" + value if isinstance(value, str) and
                         (value.lstrip().startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n")))
                         else value for key, value in row.items()})
    return "\ufeff" + buffer.getvalue()


def pdf_report(incidents):
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    story = [Paragraph("Software incident investigation", styles["Title"]),
             Paragraph(f"{len(incidents)} detected incidents", styles["Normal"])]
    for label, values in (("Severity", Counter(row["severity"] for row in incidents)),
                          ("Probable causes", Counter(row["causes"][0]["title"] for row in incidents))):
        story.append(Paragraph(label, styles["Heading2"]))
        for name, count in values.most_common():
            story.append(Paragraph(f"{escape(name)} ({count})", styles["Normal"]))
    for row in incidents:
        story.append(Paragraph(f'INC-{row["id"]:04d} · {escape(row["category"])}', styles["Heading2"]))
        items = [f'{row["severity"]} · {row["status"]} · {row["service"]}',
                 row["timestamp"] or "Timestamp unavailable", row["message"]]
        for cause in row["causes"]:
            score = f' ({cause["confidence"]:.0%} evidence score)' if cause["confidence"] is not None else ""
            items.extend([f'Probable cause: {cause["title"]}{score}', *cause["evidence"]])
        items.extend(["Recommended actions", *row["recommendations"], "Timeline"])
        items.extend(f'{event["timestamp"] or "Time unavailable"} · {event["service"]} · {event["message"]}'
                     for event in row["timeline"])
        story.extend(Paragraph(escape(item), styles["Normal"]) for item in items)
    SimpleDocTemplate(buffer, title="Software incident investigation").build(story)
    buffer.seek(0)
    return buffer
