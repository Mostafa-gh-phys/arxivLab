import { normalizeArxivId } from './arxiv';
import type { ArxivBrowseMode, ArxivPaper, ArxivSearchResult } from './types';

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripTagsAndNormalize(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildArxivBrowseUrl(
  category: string,
  mode: ArxivBrowseMode,
  showCount = 100
): string {
  const cleanCat = (category || 'hep-th').trim() || 'hep-th';
  const encodedCat = encodeURIComponent(cleanCat);
  const safeShow = Math.min(250, Math.max(25, showCount));
  if (mode === 'new') {
    return `https://arxiv.org/list/${encodedCat}/new`;
  }
  return `https://arxiv.org/list/${encodedCat}/${mode}?skip=0&show=${safeShow}`;
}

function parseMailingDateIso(label: string): string {
  const parsed = Date.parse(label);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function detectSectionFromHeading(
  headingText: string
): { section?: 'new' | 'cross' | 'replacement'; dateLabel?: string } {
  const clean = stripTagsAndNormalize(headingText);
  if (/^New submissions/i.test(clean)) {
    return { section: 'new' };
  }
  if (/^Cross[- ]?(?:submissions|lists)/i.test(clean)) {
    return { section: 'cross' };
  }
  if (/^Replacement/i.test(clean)) {
    return { section: 'replacement' };
  }
  const showingMatch = clean.match(/^Showing new listings for (.+)$/i);
  if (showingMatch) {
    return { dateLabel: showingMatch[1].trim() };
  }
  const recentDayMatch = clean.match(
    /^((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i
  );
  if (recentDayMatch) {
    return { dateLabel: recentDayMatch[1].trim() };
  }
  return {};
}

export function parseArxivBrowseHtml(
  html: string,
  options: {
    category: string;
    mode: ArxivBrowseMode;
    queryUrl: string;
  }
): ArxivSearchResult {
  const pagingMatch = html.match(/Total of\s+([\d,]+)\s+entries/i);
  const totalFromPaging = pagingMatch ? Number(pagingMatch[1].replace(/,/g, '')) : 0;

  let mailingLabel: string | undefined;
  let currentDateIso = new Date().toISOString();
  let currentSection: 'new' | 'cross' | 'replacement' | undefined =
    options.mode === 'new' ? 'new' : undefined;

  const papers: ArxivPaper[] = [];

  // Scan H3 headings and <dt>...</dt>...<dd>...</dd> entry pairs in document order
  const tokenRegex =
    /<h3[^>]*>([\s\S]*?)<\/h3>|<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[1] !== undefined) {
      const info = detectSectionFromHeading(match[1]);
      if (info.section) {
        currentSection = info.section;
      }
      if (info.dateLabel) {
        if (!mailingLabel) mailingLabel = info.dateLabel;
        currentDateIso = parseMailingDateIso(info.dateLabel);
      }
      continue;
    }

    const dtHtml = match[2] || '';
    const ddHtml = match[3] || '';

    const absHrefMatch = dtHtml.match(/href\s*=\s*["']\/abs\/([^"']+)["']/i);
    const idTextMatch = dtHtml.match(/id\s*=\s*["']([^"']+)["']/i);
    const rawId = absHrefMatch?.[1] || idTextMatch?.[1] || '';
    const id = normalizeArxivId(rawId);
    if (!id) continue;

    const htmlLinkMatch = dtHtml.match(
      /href\s*=\s*["']https?:\/\/arxiv\.org\/html\/([^"']+)["']/i
    );
    const versionedId = htmlLinkMatch?.[1] || `${id}v1`;

    // Title
    const titleBlock = ddHtml.match(
      /<div[^>]*class=["'][^"']*list-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    const title = titleBlock
      ? stripTagsAndNormalize(
          titleBlock[1].replace(/<span[^>]*class=["']descriptor["'][^>]*>[\s\S]*?<\/span>/i, '')
        )
      : '';
    if (!title) continue;

    // Authors
    const authorsBlock = ddHtml.match(
      /<div[^>]*class=["'][^"']*list-authors[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    const authors: string[] = [];
    if (authorsBlock) {
      const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
      let aMatch: RegExpExecArray | null;
      while ((aMatch = linkRegex.exec(authorsBlock[1])) !== null) {
        const name = stripTagsAndNormalize(aMatch[1]);
        if (name) authors.push(name);
      }
    }

    // Comments
    const commentsBlock = ddHtml.match(
      /<div[^>]*class=["'][^"']*list-comments[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    const comment = commentsBlock
      ? stripTagsAndNormalize(
          commentsBlock[1].replace(/<span[^>]*class=["']descriptor["'][^>]*>[\s\S]*?<\/span>/i, '')
        ) || undefined
      : undefined;

    // Journal-ref
    const jrefBlock = ddHtml.match(
      /<div[^>]*class=["'][^"']*list-jref[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    const journalRef = jrefBlock
      ? stripTagsAndNormalize(
          jrefBlock[1].replace(/<span[^>]*class=["']descriptor["'][^>]*>[\s\S]*?<\/span>/i, '')
        ) || undefined
      : undefined;

    // Subjects -> e.g. "(hep-th); Mathematical Physics (math-ph)"
    const subjectsBlock = ddHtml.match(
      /<div[^>]*class=["'][^"']*list-subjects[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    );
    const categories: string[] = [];
    let primaryCategory = options.category;
    if (subjectsBlock) {
      const primaryMatch = subjectsBlock[1].match(
        /<span[^>]*class=["']primary-subject["'][^>]*>[\s\S]*?\(([a-z-]+(?:\.[A-Za-z-]+)?)\)[\s\S]*?<\/span>/i
      );
      if (primaryMatch?.[1]) {
        primaryCategory = primaryMatch[1];
      }
      const codeRegex = /\(([a-z-]+(?:\.[A-Za-z-]+)?)\)/g;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = codeRegex.exec(stripTagsAndNormalize(subjectsBlock[1]))) !== null) {
        if (!categories.includes(cMatch[1])) {
          categories.push(cMatch[1]);
        }
      }
    }
    if (categories.length === 0) {
      categories.push(primaryCategory);
    }

    // Inline abstract (present on /new pages)
    const abstractMatch = ddHtml.match(/<p[^>]*class=["'][^"']*mathjax[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    const abstract = abstractMatch ? stripTagsAndNormalize(abstractMatch[1]) : '';

    papers.push({
      id,
      versionedId,
      title,
      authors,
      abstract,
      primaryCategory,
      categories,
      published: currentDateIso,
      updated: currentDateIso,
      pdfUrl: `https://arxiv.org/pdf/${id}`,
      absUrl: `https://arxiv.org/abs/${id}`,
      htmlUrl: `https://arxiv.org/html/${versionedId}`,
      journalRef,
      comment,
      listingSection: currentSection,
    });
  }

  return {
    papers,
    totalResults: totalFromPaging > 0 ? totalFromPaging : papers.length,
    startIndex: 0,
    itemsPerPage: papers.length,
    queryUrl: options.queryUrl,
    fetchedAt: new Date().toISOString(),
    browseMeta: {
      mode: options.mode,
      category: options.category,
      mailingLabel,
    },
  };
}
