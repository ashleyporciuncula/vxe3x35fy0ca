// Dual Brainstorm relay: reads a public IMDb list and returns its title IDs.
//
//   GET https://<your-worker>.workers.dev/?list=ls055592025
//   -> { "list": "ls055592025", "ids": ["tt0111161", ...], "source": "page" }
//
// It only accepts IMDb list IDs, so it can't be used as a general proxy.
// Nothing is stored or cached: every request reads the list fresh.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const MAX_PAGES = 10;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function unique(list) {
  return [...new Set(list)];
}

// --- Way 1: the list page, which carries its items in a __NEXT_DATA__ block ---
function idsFromPage(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  let scope = html;
  if (m) {
    const at = m[1].indexOf("titleListItemSearch");
    scope = at >= 0 ? m[1].slice(at) : m[1];
  }
  return unique(scope.match(/tt\d{7,9}/g) || []);
}

async function fromPage(listId) {
  const base = `https://www.imdb.com/list/${listId}/`;
  let all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(page === 1 ? base : `${base}?page=${page}`, { headers: BROWSER_HEADERS });
    if (res.status !== 200) {
      if (page === 1) throw new Error(`list page answered ${res.status}`);
      break;
    }
    const ids = idsFromPage(await res.text());
    const fresh = ids.filter((id) => !all.includes(id));
    if (!fresh.length) break;
    all = all.concat(fresh);
    if (ids.length < 100) break; // a short page is the last page
  }
  if (!all.length) throw new Error("no titles on the list page");
  return all;
}

// --- Way 2: IMDb's data API, the one imdb.com itself uses ---
const QUERY = `query ($id: ID!, $after: String) {
  list(id: $id) {
    items(first: 250, after: $after) {
      edges { listItem { ... on Title { id } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

async function fromApi(listId) {
  let all = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch("https://api.graphql.imdb.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": BROWSER_HEADERS["User-Agent"],
        "x-imdb-client-name": "imdb-web-next",
      },
      body: JSON.stringify({ query: QUERY, variables: { id: listId, after } }),
    });
    if (!res.ok) throw new Error(`data API answered ${res.status}`);
    const data = await res.json();
    const items = data?.data?.list?.items;
    if (!items) throw new Error("data API returned no list");
    all = all.concat(items.edges.map((e) => e?.listItem?.id).filter(Boolean));
    if (!items.pageInfo?.hasNextPage) break;
    after = items.pageInfo.endCursor;
  }
  if (!all.length) throw new Error("data API returned an empty list");
  return unique(all);
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "GET") return json({ error: "Use GET" }, 405);

    const listId = new URL(request.url).searchParams.get("list") || "";
    if (!/^ls\d{6,12}$/.test(listId)) {
      return json({ error: "Add ?list=ls… with an IMDb list ID, e.g. ?list=ls055592025" }, 400);
    }

    const problems = [];
    for (const [source, read] of [["page", fromPage], ["api", fromApi]]) {
      try {
        const ids = await read(listId);
        return json({ list: listId, ids, source });
      } catch (err) {
        problems.push(`${source}: ${err.message}`);
      }
    }
    return json({ list: listId, error: "IMDb wouldn't give up this list. Is it public?", details: problems }, 502);
  },
};
