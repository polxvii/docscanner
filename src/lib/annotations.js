// Light annotation helpers (no heavy deps) so screens can import them without
// pulling in jsPDF/html2canvas from the exporter.

/** Annotations that should render on a given page. Pure. */
export function applicableAnnotations(doc, page) {
  return (doc.annotations || []).filter(
    (a) => a.scope === 'document' || a.pageId === page.id
  );
}
