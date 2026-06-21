const fs = require("fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const crypto = require("crypto");

// Working fetch for Node.js 18–22 in CommonJS
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Source feeds
const FEED1 = "https://feeds.feedburner.com/meyersonstrategy/podcasts";
const FEED2 = "https://feeds.feedburner.com/chicagopublicsquare/podcasts";

// Extract direct MP3 URLs from HTML
function extractMp3FromHtml(html) {
  const mp3Regex = /(https?:\/\/[^\s"'<>]+\.mp3)/gi;
  const matches = html.match(mp3Regex);
  return matches ? matches[0] : null;
}

async function fetchFeed(url) {
  const res = await fetch(url);
  return await res.text();
}

async function fetchPostHtml(url) {
  try {
    const res = await fetch(url);
    return await res.text();
  } catch {
    return null;
  }
}

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
    const linkNode = item.getElementsByTagName("link")[0];
    const pubDateNode = item.getElementsByTagName("pubDate")[0];

    if (!titleNode || !linkNode || !pubDateNode) continue;

    const postUrl = linkNode.textContent.trim();
    const postHtml = await fetchPostHtml(postUrl);
    if (!postHtml) continue;

    // Extract MP3 from the actual blog post HTML
    const mp3Url = extractMp3FromHtml(postHtml);
    if (!mp3Url) continue; // Option A strict: skip if no MP3

    const serializer = new XMLSerializer();
    let xml = serializer.serializeToString(item);

    // Remove existing GUIDs
    xml = xml.replace(/<guid\b[^>]*>[\s\S]*?<\/guid>/gi, "");

    // Insert new GUID
    const guid = crypto.createHash("sha1").update(xml).digest("hex");
    xml = xml.replace(
      /<title>/i,
      `<guid isPermaLink="false">${guid}</guid>\n<title>`
    );

    // Remove existing enclosures
    xml = xml.replace(/<enclosure\b[^>]*\/>/gi, "");

    // Insert enclosure
    xml = xml.replace(
      /<title>/i,
      `<enclosure url="${mp3Url}" type="audio/mpeg" length="0"/>\n<title>`
    );

    output += xml + "\n";
  }

  output += `
  </channel>
</rss>`;

  // Write to repo root
  fs.writeFileSync("../podcast.xml", output);
})();
