const fs = require("fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const crypto = require("crypto");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// ✅ Use your RSS Fusion merged feed
const FEED = "https://www.rss-fusion.com/r/1de9b/b80bb77402f85aa2fd9cc18cd06e3ef51755d4e2eb";

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
async function fetchText(url) {
  try {
    const res = await fetch(url);
    return await res.text();
  } catch (err) {
    console.error(`❌ Fetch failed for ${url}:`, err.message);
    return null;
  }
}

function extractDirectMp3(html) {
  const re = /(https?:\/\/[^\s"'<>]+\.mp3[^\s"'<>]*)/gi;
  const matches = html.match(re);
  return matches ? matches[0] : null;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
(async () => {
  console.log("📡 Fetching RSS Fusion feed...");
  const xml = await fetchText(FEED);

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const items = Array.from(doc.getElementsByTagName("item"));

  console.log(`📦 Total items before filtering: ${items.length}`);

  // Extract publication dates and sort
  const sortedItems = items
    .map(item => {
      const dateNode = item.getElementsByTagName("pubDate")[0];
      const date = dateNode ? new Date(dateNode.textContent.trim()) : new Date(0);
      return { item, date };
    })
    .sort((a, b) => b.date - a.date)
    .slice(0, 100); // LAST 100 EPISODES

  console.log(`🎧 Keeping most recent 100 episodes.`);

  // Build output feed
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

    <itunes:owner>
      <itunes:name>Charles Meyerson</itunes:name>
      <itunes:email>Meyerson@gmail.com</itunes:email>
    </itunes:owner>

    <itunes:image href="https://charlesmeyerson.github.io/cover.jpg" />
`;

  const serializer = new XMLSerializer();

  for (const { item } of sortedItems) {
    const titleNode = item.getElementsByTagName("title")[0];
    const contentNode = item.getElementsByTagName("content:encoded")[0];
    const descNode = item.getElementsByTagName("description")[0];
    const enclosureNode = item.getElementsByTagName("enclosure")[0];

    const title = titleNode ? titleNode.textContent.trim() : "(untitled)";
    console.log(`🎙 Processing: ${title}`);

    const enclosureUrl = enclosureNode ? enclosureNode.getAttribute("url") : null;
    const rawHtml =
      (contentNode && contentNode.textContent) ||
      (descNode && descNode.textContent) ||
      "";

    const contentHtml = decodeHtmlEntities(rawHtml);
    const fallbackMp3 = extractDirectMp3(contentHtml);
    const mp3Url = enclosureUrl || fallbackMp3;

    if (!mp3Url) {
      console.log(`🚫 Skipping "${title}" — no MP3 found.`);
      continue;
    }

    let xmlItem = serializer.serializeToString(item);

    // Remove existing GUID
    xmlItem = xmlItem.replace(/<guid\b[^>]*>[\s\S]*?<\/guid>/gi, "");

    // Insert new GUID
    const guid = crypto.createHash("sha1").update(xmlItem).digest("hex");
    xmlItem = xmlItem.replace(/<title>/i, `<guid isPermaLink="false">${guid}</guid>\n<title>`);

    // Remove existing enclosure
    xmlItem = xmlItem.replace(/<enclosure\b[^>]*\/>/gi, "");

    // Insert new enclosure
    xmlItem = xmlItem.replace(
      /<title>/i,
      `<enclosure url="${mp3Url}" type="audio/mpeg" length="0"/>\n<title>`
    );

    // Wrap description in CDATA
    xmlItem = xmlItem.replace(
      /<description>([\s\S]*?)<\/description>/i,
      (match, inner) => `<description><![CDATA[${inner}]]></description>`
    );

    output += xmlItem + "\n";
  }

  output += `
  </channel>
</rss>`;

  fs.writeFileSync("podcast.xml", output);
  console.log("✅ podcast.xml written successfully.");
})();
