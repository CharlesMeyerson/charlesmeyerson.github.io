Run node scripts/merge-feeds.js
/home/runner/work/charlesmeyerson.github.io/charlesmeyerson.github.io/scripts/merge-feeds.js:135



SyntaxError: Unexpected end of input
    at wrapSafe (node:internal/modules/cjs/loader:1713:18)
    at Module._compile (node:internal/modules/cjs/loader:1755:20)
    at Object..js (node:internal/modules/cjs/loader:1913:10)
    at Module.load (node:internal/modules/cjs/loader:1505:32)
    at Function._load (node:internal/modules/cjs/loader:1309:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:254:19)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
    at node:internal/main/run_main_module:36:49

Node.js v22.22.3
Error: Process completed with exit code 1.

// -------------------- HOST-SPECIFIC EXTRACTION --------------------

async function extractMp3FromArchiveItem(itemUrl) {
  console.log(`🔍 Fetching Archive.org item: ${itemUrl}`);
  const html = await fetchText(itemUrl);
  if (!html) return null;

  const mp3 = extractDirectMp3(html);
  if (mp3) console.log(`✅ Found MP3 on Archive.org: ${mp3}`);
  return mp3;
}

async function extractMp3FromPodbean(itemUrl) {
  console.log(`🔍 Fetching PodBean episode: ${itemUrl}`);
  const html = await fetchText(itemUrl);
  if (!html) return null;

  const mp3 = extractDirectMp3(html);
  if (mp3) console.log(`✅ Found MP3 on PodBean: ${mp3}`);
  return mp3;
}

// -------------------- MASTER EXTRACTION PIPELINE --------------------

async function extractMp3FromItemContent(contentHtml) {
  // 1️⃣ Direct MP3s
  let mp3 = extractDirectMp3(contentHtml);
  if (mp3) {
    console.log(`✅ Direct MP3 found: ${mp3}`);
    return mp3;
  }

  // 2️⃣ Archive.org
  const archiveUrl = extractArchiveItemUrl(contentHtml);
  if (archiveUrl) {
    const archiveMp3 = await extractMp3FromArchiveItem(archiveUrl);
    if (archiveMp3) return archiveMp3;
  }

  // 3️⃣ PodBean
  const podbeanUrl = extractPodbeanUrl(contentHtml);
  if (podbeanUrl) {
    const podbeanMp3 = await extractMp3FromPodbean(podbeanUrl);
    if (podbeanMp3) return podbeanMp3;
  }

  console.log("⚠️ No MP3 found in item content.");
  return null;
}

// -------------------- FEED FETCHING --------------------

async function fetchFeed(url) {
  console.log(`📡 Fetching feed: ${url}`);
  const text = await fetchText(url);
  return text || "";
}

// -------------------- MAIN SCRIPT --------------------

(async () => {
  const xml1 = await fetchFeed(FEED1);
  const xml2 = await fetchFeed(FEED2);

  const parser = new DOMParser();
  const doc1 = parser.parseFromString(xml1, "text/xml");
  const doc2 = parser.parseFromString(xml2, "text/xml");

  const items1 = Array.from(doc1.getElementsByTagName("item"));
  const items2 = Array.from(doc2.getElementsByTagName("item"));
  const allItems = [...items1, ...items2];

  let output = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Charlie Meyerson Interviews</title>
    <link>https://charlesmeyerson.github.io/podcast.xml</link>
    <atom:link href="https://charlesmeyerson.github.io/podcast.xml" rel="self" type="application/rss+xml" />
    <description>A curated collection of interviews and conversations by journalist Charles Meyerson.</description>
    <language>en-us</language>
    <itunes:author>Charles Meyerson</itunes:author>
    <itunes:explicit>false</itunes:explicit>
`;

   for (const item of allItems) {
    const titleNode = item.getElementsByTagName("title")[0];
    const contentNode = item.getElementsByTagName("content:encoded")[0];
    const descNode = item.getElementsByTagName("description")[0];

    const title = titleNode ? titleNode.textContent.trim() : "(untitled)";
    console.log(`\n🎙 Processing: ${title}`);

    const contentHtml =
      (contentNode && contentNode.textContent) ||
      (descNode && descNode.textContent) ||
      "";

    const mp3Url = await extractMp3FromItemContent(contentHtml);
    if (!mp3Url) {
      console.log(`🚫 Skipping "${title}" — no MP3 found.`);
      continue;
    }

    const serializer = new XMLSerializer();
    let xml = serializer.serializeToString(item);

    xml = xml.replace(/<guid\b[^>]*>[\s\S]*?<\/guid>/gi, "");
    const guid = crypto.createHash("sha1").update(xml).digest("hex");
    xml = xml.replace(/<title>/i, `<guid isPermaLink="false">${guid}</guid>\n<title>`);

    xml = xml.replace(/<enclosure\b[^>]*\/>/gi, "");
    xml = xml.replace(/<title>/i, `<enclosure url="${mp3Url}" type="audio/mpeg" length="0"/>\n<title>`);

    output += xml + "\n";
  }

  output += `
  </channel>
</rss>`;

  fs.writeFileSync("../podcast.xml", output);
  console.log("✅ podcast.xml written successfully.");
})();
