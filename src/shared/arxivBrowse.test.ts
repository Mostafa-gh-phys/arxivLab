import assert from 'node:assert/strict';
import test from 'node:test';
import { buildArxivBrowseUrl, parseArxivBrowseHtml } from './arxivBrowse';

test('buildArxivBrowseUrl builds /new, /recent, and /current URLs cleanly', () => {
  assert.equal(buildArxivBrowseUrl('hep-th', 'new'), 'https://arxiv.org/list/hep-th/new');
  assert.equal(
    buildArxivBrowseUrl('cs.AI', 'recent', 50),
    'https://arxiv.org/list/cs.AI/recent?skip=0&show=50'
  );
  assert.equal(
    buildArxivBrowseUrl('hep-th', 'current', 100),
    'https://arxiv.org/list/hep-th/current?skip=0&show=100'
  );
});

test('parseArxivBrowseHtml extracts mailing date, sections, titles, authors, categories, and abstracts', () => {
  const sampleHtml = `
    <h3>Showing new listings for Friday, 13 November 2026</h3>
    <div class='paging'>Total of 179 entries</div>
    <dl id='articles'>
      <h3>New submissions (showing 1 of 1 entries)</h3>
      <dt>
        <a name='item1'>[1]</a>
        <a href="/abs/2611.14612" title="Abstract" id="2611.14612">arXiv:2611.14612</a>
        [<a href="/pdf/2611.14612">pdf</a>, <a href="https://arxiv.org/html/2611.14612v1">html</a>]
      </dt>
      <dd>
        <div class='meta'>
          <div class='list-title mathjax'><span class='descriptor'>Title:</span> Nonlocal Total Derivatives &amp; Symmetries</div>
          <div class='list-authors'><a href="/a">Carlos Heredia</a>, <a href="/b">Jane Doe</a></div>
          <div class='list-comments mathjax'><span class='descriptor'>Comments:</span> 21 pages</div>
          <div class='list-subjects'><span class='descriptor'>Subjects:</span>
            <span class="primary-subject">High Energy Physics - Theory (hep-th)</span>; Mathematical Physics (math-ph)
          </div>
          <p class='mathjax'>We study total time derivatives in nonlocal mechanics.</p>
        </div>
      </dd>
      <h3>Cross submissions (showing 1 of 1 entries)</h3>
      <dt>
        <a name='item2'>[2]</a>
        <a href="/abs/2611.15000" title="Abstract" id="2611.15000">arXiv:2611.15000</a>
      </dt>
      <dd>
        <div class='meta'>
          <div class='list-title mathjax'><span class='descriptor'>Title:</span> Holographic Duals</div>
          <div class='list-authors'><a href="/c">Alice Smith</a></div>
          <div class='list-subjects'><span class='descriptor'>Subjects:</span>
            <span class="primary-subject">General Relativity and Quantum Cosmology (gr-qc)</span>; High Energy Physics - Theory (hep-th)
          </div>
          <p class='mathjax'>Cross-listed holographic study.</p>
        </div>
      </dd>
    </dl>
  `;

  const parsed = parseArxivBrowseHtml(sampleHtml, {
    category: 'hep-th',
    mode: 'new',
    queryUrl: 'https://arxiv.org/list/hep-th/new',
  });

  assert.equal(parsed.totalResults, 179);
  assert.equal(parsed.browseMeta?.mailingLabel, 'Friday, 13 November 2026');
  assert.equal(parsed.papers.length, 2);

  assert.equal(parsed.papers[0].id, '2611.14612');
  assert.equal(parsed.papers[0].versionedId, '2611.14612v1');
  assert.equal(parsed.papers[0].title, 'Nonlocal Total Derivatives & Symmetries');
  assert.deepEqual(parsed.papers[0].authors, ['Carlos Heredia', 'Jane Doe']);
  assert.equal(parsed.papers[0].primaryCategory, 'hep-th');
  assert.deepEqual(parsed.papers[0].categories, ['hep-th', 'math-ph']);
  assert.equal(parsed.papers[0].comment, '21 pages');
  assert.equal(parsed.papers[0].listingSection, 'new');
  assert.equal(parsed.papers[0].abstract, 'We study total time derivatives in nonlocal mechanics.');

  assert.equal(parsed.papers[1].id, '2611.15000');
  assert.equal(parsed.papers[1].primaryCategory, 'gr-qc');
  assert.equal(parsed.papers[1].listingSection, 'cross');
});
