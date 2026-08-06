// Light annotation helpers (no heavy deps) so screens can import them without
// pulling in jsPDF/html2canvas from the exporter.

/**
 * Annotations that should render on a given page. Pure.
 * Scope: 'document' (all pages) | 'pages' (a specific set via pageIds) |
 * 'page' (this page only, via pageId — legacy default).
 */
export function applicableAnnotations(doc, page) {
  return (doc.annotations || []).filter(
    (a) =>
      a.scope === 'document' ||
      (a.scope === 'pages' &&
        Array.isArray(a.pageIds) &&
        a.pageIds.includes(page.id)) ||
      a.pageId === page.id
  );
}
