import type { ArxivPaper } from './types';

function escapeBibtexValue(value: string): string {
  return value.replace(/[{}]/g, (ch) => `\\${ch}`).replace(/\s+/g, ' ').trim();
}

export function buildBibtexKey(paper: ArxivPaper): string {
  const firstAuthor = paper.authors[0] || 'unknown';
  const lastName = firstAuthor
    .trim()
    .split(/\s+/)
    .pop()!
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  const year = (paper.published || '').slice(0, 4) || '0000';
  const cleanId = paper.id.replace(/[^a-zA-Z0-9]/g, '');
  return `${lastName || 'arxiv'}${year}_${cleanId}`;
}

export function paperToBibtex(paper: ArxivPaper): string {
  const key = buildBibtexKey(paper);
  const year = (paper.published || '').slice(0, 4) || '2026';
  const monthNum = (paper.published || '').slice(5, 7);
  const authors = paper.authors.join(' and ');

  const lines = [
    `@article{${key},`,
    `  title = {${escapeBibtexValue(paper.title)}},`,
    `  author = {${escapeBibtexValue(authors)}},`,
    `  year = {${year}},`,
  ];

  if (monthNum) {
    lines.push(`  month = {${monthNum}},`);
  }
  lines.push(`  eprint = {${paper.id}},`);
  lines.push(`  archivePrefix = {arXiv},`);
  lines.push(`  primaryClass = {${paper.primaryCategory}},`);
  lines.push(`  url = {${paper.absUrl}},`);

  if (paper.doi) {
    lines.push(`  doi = {${paper.doi}},`);
  }
  if (paper.journalRef) {
    lines.push(`  journal = {${escapeBibtexValue(paper.journalRef)}},`);
  } else {
    lines.push(`  journal = {arXiv preprint arXiv:${paper.id}},`);
  }
  if (paper.abstract) {
    lines.push(`  abstract = {${escapeBibtexValue(paper.abstract)}}`);
  }
  lines.push(`}`);
  return lines.join('\n');
}

export function papersToBibtexCollection(papers: ArxivPaper[]): string {
  return papers.map(paperToBibtex).join('\n\n');
}

export function paperToRis(paper: ArxivPaper): string {
  const year = (paper.published || '').slice(0, 4);
  const dateCompact = (paper.published || '').slice(0, 10).replace(/-/g, '/');
  const lines: string[] = ['TY  - ELEC'];
  lines.push(`TI  - ${paper.title}`);
  for (const author of paper.authors) {
    lines.push(`AU  - ${author}`);
  }
  if (year) lines.push(`PY  - ${year}`);
  if (dateCompact) lines.push(`DA  - ${dateCompact}`);
  lines.push(`AB  - ${paper.abstract}`);
  lines.push(`UR  - ${paper.absUrl}`);
  lines.push(`L1  - ${paper.pdfUrl}`);
  lines.push(`DB  - arXiv`);
  lines.push(`AN  - arXiv:${paper.id}`);
  for (const cat of paper.categories) {
    lines.push(`KW  - ${cat}`);
  }
  if (paper.doi) {
    lines.push(`DO  - ${paper.doi}`);
  }
  if (paper.journalRef) {
    lines.push(`JO  - ${paper.journalRef}`);
  }
  lines.push('ER  - ');
  return lines.join('\n');
}

export function papersToRisCollection(papers: ArxivPaper[]): string {
  return papers.map(paperToRis).join('\n\n');
}

function splitAuthorName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: 'Unknown' };
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
}

export function paperToZoteroItem(
  paper: ArxivPaper,
  collectionKeys: string[] = [],
  extraTags: string[] = []
): Record<string, unknown> {
  const tags = Array.from(new Set([...paper.categories, ...extraTags]))
    .filter(Boolean)
    .map((tag) => ({ tag }));

  return {
    itemType: 'preprint',
    title: paper.title,
    creators: paper.authors.map((name) => {
      const { firstName, lastName } = splitAuthorName(name);
      return {
        creatorType: 'author',
        firstName,
        lastName,
      };
    }),
    abstractNote: paper.abstract,
    genre: 'arXiv Preprint',
    repository: 'arXiv',
    archiveID: `arXiv:${paper.id}`,
    date: (paper.published || '').slice(0, 10),
    url: paper.absUrl,
    DOI: paper.doi || '',
    extra: [
      `arXiv: ${paper.id}`,
      `Primary Category: ${paper.primaryCategory}`,
      paper.journalRef ? `Journal Ref: ${paper.journalRef}` : '',
      `PDF: ${paper.pdfUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
    tags,
    collections: collectionKeys,
  };
}
