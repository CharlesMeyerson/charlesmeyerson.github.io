const fs = require("fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const crypto = require("crypto");

// Node 18+ fetch in CommonJS
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Source feeds
const FEED1 = "https://feeds.feedburner.com/meyersonstrategy/podcasts";
const FEED2 = "https://feeds.feedburner.com/chicagopublicsquare/podcasts";

// --- Basic HTML fetch ---
async function fetchText(url) {
  try {
    const res = await fetch(url);
    return await res.text();
  } catch {
    return null;
  }
}

// --- Direct MP3 extraction ---
function extractDirectMp3(html) {
  const mp3Regex = /(https?:\/\/[^\s"'<>]+\.mp3[^\s"'<>]*)/gi;
  const matches = html.match(mp3Regex);
  return matches ? matches[0] : null;
}

// --- <audio> / <source> tags ---
function extractFromAudioTags(html) {
  const audioRegex = /<(audio|source)[^>]+src="([^"]+\.mp3[^"]*)"/gi;
  let match;
  while ((match = audioRegex.exec(html))) {
    return match[2];
  }
  return null;
}

// --- <a href="...mp3"> links ---
function extractFromLinks(html) {
  const linkRegex = /<a[^>]+href="([^"]+\.mp3[^"]*)"/gi;
  let match;
  while ((match = linkRegex.exec(html))) {
    return match[1];
  }
  return null;
}

// --- Archive.org item URL detection ---
function extractArchiveItemUrl(html) {
  const re = /https:\/\/archive\.org\/details\/[^\s"'<>]+/gi;
  const matches = html.match(re);
  return matches ? matches[0] : null;
}

// --- Extract MP3 from Archive.org item page ---
async function extractMp3FromArchiveItem(itemUrl) {
  const html = await fetchText(itemUrl);
  if (!html) return null;

  // Archive.org pages often contain direct MP3 links
  const mp3 =
    extractDirectMp3(html) ||
    extractFromAudioTags(html) ||
    extractFromLinks(html);

  return mp3;
}

// --- Main MP3 extraction pipeline ---
async function extractMp3FromPost(postHtml) {
  // 1. Direct MP3s in the blog post itself
  let mp3 =
    extractDirectMp3(postHtml) ||
    extractFromAudioTags(postHtml) ||
    extractFromLinks(postHtml);

  if (mp3) return mp3;

  // 2. Archive.org item links in the blog post
  const archiveItemUrl = extractArchiveItemUrl(postHtml);
  if (archiveItemUrl) {
    const archiveMp3 = await extractMp3FromArchiveItem(archiveItemUrl);
    if (archiveMp3) return archiveMp3;
  }

  // Strict Option A: skip if still no MP3
  return null;
}

// --- Fetch RSS feed ---
async function fetchFeed(url) {
  const text = await fetchText(url);
  return text || "";
}

// --- Main script ---
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
    const postHtml = await fetchText(postUrl);
    if (!postHtml) continue;

    const mp3Url = await extractMp3FromPost(postHtml);
    if (!mp3Url) continue; // strict: only episodes with real MP3s

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
