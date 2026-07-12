export function normalizeCatalogName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function slugifyCatalogName(value: string): string {
  return normalizeCatalogName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatCatalogLabel(value: string): string {
  const withoutPdf = value.replace(/\.pdf$/i, '');
  const normalized = withoutPdf
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) {
        return word;
      }

      if (/^[A-Z0-9]+$/.test(word) && word.length <= 4) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
