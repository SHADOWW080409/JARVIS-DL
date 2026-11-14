// Web research via the Tavily search API.
async function search(query, key, max = 5) {
  if (!key) throw new Error('Add a Tavily API key (free tier at tavily.com) in settings to enable web research.');
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: max, include_answer: true }),
  });
  if (!r.ok) throw new Error(`Tavily error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return {
    answer: d.answer || '',
    results: (d.results || []).map((x) => ({ title: x.title, url: x.url, content: x.content })),
  };
}

module.exports = { search };
