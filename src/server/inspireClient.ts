import { buildArxivAuthorSearchClause, parseArxivAtomFeed } from '../shared/arxiv';
import {
  buildAuthorExternalUrls,
  buildInspireJobsUrl,
  buildInspireLiteratureUrl,
  doesInspireAuthorMatchName,
  parseInspireJobsResponse,
  parseInspireLiteratureResponse,
} from '../shared/inspire';
import type {
  AuthorResolution,
  InspireJobsParams,
  InspireJobsResult,
  InspireLiteratureParams,
  InspireLiteratureResult,
} from '../shared/types';
import { dnsAwareRequest, getDnsServersForTarget } from './dnsHttp';
import { readConfig } from './storage';

const USER_AGENT = 'arXivLab-Workstation/1.1 (https://inspirehep.net)';

export async function searchInspireLiterature(
  params: InspireLiteratureParams
): Promise<InspireLiteratureResult> {
  const queryUrl = buildInspireLiteratureUrl(params);
  const cfg = await readConfig();
  const dnsServers = getDnsServersForTarget(cfg.network, 'arxiv');

  const res = await dnsAwareRequest(queryUrl, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    timeoutMs: 18000,
    dnsServers,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`INSPIRE-HEP API responded with HTTP ${res.status} ${res.statusText}`);
  }

  return parseInspireLiteratureResponse(res.json<Record<string, unknown>>(), queryUrl);
}

export async function searchInspireJobs(
  params: InspireJobsParams
): Promise<InspireJobsResult> {
  const queryUrl = buildInspireJobsUrl(params);
  const cfg = await readConfig();
  const dnsServers = getDnsServersForTarget(cfg.network, 'arxiv');

  const res = await dnsAwareRequest(queryUrl, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    timeoutMs: 18000,
    dnsServers,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`INSPIRE-HEP Jobs API responded with HTTP ${res.status} ${res.statusText}`);
  }

  return parseInspireJobsResponse(res.json<Record<string, unknown>>(), queryUrl);
}

export async function lookupInspireMetadataForArxiv(arxivId: string): Promise<{
  documentTypes: string[];
  inspireId?: string;
  inspireUrl?: string;
  citationCount?: number;
  texkey?: string;
} | null> {
  const cleanId = arxivId.replace(/^arXiv:/i, '').replace(/v\d+$/i, '').trim();
  if (!cleanId || cleanId.startsWith('inspire:')) return null;

  try {
    const cfg = await readConfig();
    const dnsServers = getDnsServersForTarget(cfg.network, 'arxiv');
    const url = `https://inspirehep.net/api/literature?q=${encodeURIComponent(
      `eprint ${cleanId}`
    )}&size=1&fields=document_type,citation_count,texkeys,control_number`;

    const res = await dnsAwareRequest(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      timeoutMs: 4500,
      dnsServers,
    });

    if (res.status < 200 || res.status >= 300) return null;
    const data = res.json<{
      hits?: {
        hits?: Array<{
          id?: string;
          metadata?: {
            document_type?: string[];
            citation_count?: number;
            texkeys?: string[];
          };
        }>;
      };
    }>();

    const hit = data.hits?.hits?.[0];
    if (!hit) return null;
    const meta = hit.metadata || {};
    return {
      documentTypes: Array.isArray(meta.document_type) ? meta.document_type : [],
      inspireId: hit.id,
      inspireUrl: hit.id ? `https://inspirehep.net/literature/${hit.id}` : undefined,
      citationCount: typeof meta.citation_count === 'number' ? meta.citation_count : undefined,
      texkey: Array.isArray(meta.texkeys) ? meta.texkeys[0] : undefined,
    };
  } catch {
    return null;
  }
}

export async function resolveAuthorProfiles(
  rawName: string,
  knownInspireRecid?: string
): Promise<AuthorResolution> {
  const name = rawName.trim();
  const baseUrls = buildAuthorExternalUrls(name, knownInspireRecid);
  const cfg = await readConfig();
  const dnsServers = getDnsServersForTarget(cfg.network, 'arxiv');

  let inspireUrl: string | null = null;
  let inspireRecid = knownInspireRecid?.trim() || undefined;
  let inspireAffiliation: string | undefined;
  let inspireOrcid: string | undefined;
  let inspireCategories: string[] | undefined;

  let arxivPaperCount = 0;
  let arxivSamplePapers: Array<{ id: string; title: string; published: string }> = [];

  const inspirePromise = (async () => {
    try {
      const targetUrl = inspireRecid
        ? `https://inspirehep.net/api/authors/${encodeURIComponent(inspireRecid)}`
        : `https://inspirehep.net/api/authors?q=${encodeURIComponent(name)}&size=5`;
      const res = await dnsAwareRequest(targetUrl, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeoutMs: 6000,
        dnsServers,
      });
      if (res.status < 200 || res.status >= 300) return;

      const json = res.json<Record<string, unknown>>();
      const hit = inspireRecid
        ? (json as { id?: string; metadata?: Record<string, unknown> })
        : (
            (json.hits as { hits?: Array<{ id?: string; metadata?: Record<string, unknown> }> })
              ?.hits || []
          ).find((candidate) =>
            doesInspireAuthorMatchName(name, (candidate.metadata || {}) as Record<string, unknown>)
          );

      if (!hit?.id) return;
      const meta = (hit.metadata || {}) as Record<string, unknown>;
      inspireRecid = String(hit.id);
      inspireUrl = `https://inspirehep.net/authors/${inspireRecid}`;

      const positions = Array.isArray(meta.positions)
        ? (meta.positions as Array<{ institution?: string; current?: boolean }>)
        : [];
      const currentPos = positions.find((p) => p.current) || positions[0];
      inspireAffiliation = currentPos?.institution;

      const ids = Array.isArray(meta.ids)
        ? (meta.ids as Array<{ schema?: string; value?: string }>)
        : [];
      inspireOrcid = ids.find((i) => i.schema === 'ORCID')?.value;

      if (Array.isArray(meta.arxiv_categories)) {
        inspireCategories = (meta.arxiv_categories as string[]).slice(0, 4);
      }
    } catch {
      // Non-fatal
    }
  })();

  const arxivPromise = (async () => {
    try {
      const authorClause = buildArxivAuthorSearchClause(name);
      if (!authorClause) return;
      const arxivApiUrl = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
        authorClause
      )}&max_results=3&sortBy=submittedDate&sortOrder=descending`;
      const res = await dnsAwareRequest(arxivApiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/atom+xml, application/xml, text/xml',
        },
        timeoutMs: 6000,
        dnsServers,
      });
      if (res.status < 200 || res.status >= 300) return;
      const parsed = parseArxivAtomFeed(res.text(), arxivApiUrl);
      arxivPaperCount = parsed.totalResults || parsed.papers.length;
      arxivSamplePapers = parsed.papers.slice(0, 3).map((p) => ({
        id: p.id,
        title: p.title,
        published: p.published,
      }));
    } catch {
      // Non-fatal
    }
  })();

  await Promise.all([inspirePromise, arxivPromise]);

  return {
    name,
    arxivUrl: baseUrls.arxivUrl,
    arxivPaperCount,
    arxivSamplePapers,
    inspireUrl,
    inspireRecid,
    inspireAffiliation,
    inspireOrcid,
    inspireCategories,
    googleScholarUrl: baseUrls.googleScholarUrl,
    hasDirectPage: Boolean(inspireUrl || arxivPaperCount > 0),
  };
}
