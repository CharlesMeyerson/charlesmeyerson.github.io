const fs = require("fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const crypto = require("crypto");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const FEED1 = "https://feeds.feedburner.com/meyersonstrategy/podcasts";
const FEED2 = "https://feeds.feedburner.com/chicagopublicsquare/podcasts";

// ------------------------------------------------------------
// HTML ENTITY DECODER (FeedBurner escapes <content:encoded>)
// ------------------------------------------------------------
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
// BASIC HELPERS
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

function extractArchiveItemUrl(html) {
  const re = /https:\/\/archive\.org\/(?:details|embed)\/[^\s"'<>]+/gi;
  const matches = html.match(re);
  return matches ? matches[0] : null;
}

function extractPodbeanUrl(html) {
  const re = /https:\/\/www\.podbean\.com\/ep\/[^\s"'<>]+/gi;
  const matches = html.match(re);
  return matches ? matches[0] : null;
}

// ------------------------------------------------------------
// HOST-SPECIFIC EXTRACTION
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// MASTER EXTRACTION PIPELINE
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// FEED FETCHING
// ------------------------------------------------------------
async function fetchFeed(url) {
  console.log(`📡 Fetching feed: ${url}`);
  const text = await fetchText(url);
  return text || "";
}

// ------------------------------------------------------------
// MAIN SCRIPT
// ------------------------------------------------------------
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

    const rawHtml =
      (contentNode && contentNode.textContent) ||
      (descNode && descNode.textContent) ||
      "";

    const contentHtml = decodeHtmlEntities(rawHtml);

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

  // IMPORTANT: write to repo root, not parent directory
  fs.writeFileSync("podcast.xml", output);
  console.log("✅ podcast.xml written successfully.");
})();
