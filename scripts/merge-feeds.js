// scripts/merge-feeds.js
// Clean, safe, double-quote-only feed merger for Charles Meyerson Interviews

const fs = require("fs");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const crypto = require("crypto");

// Load both source feeds
const feed1 = fs.readFileSync("feed1.xml", "utf8");
const feed2 = fs.readFileSync("feed2.xml", "utf8");

// Parse XML
const parser = new DOMParser();
const doc1 = parser.parseFromString(feed1, "text/xml");
const doc2 = parser.parseFromString(feed2, "text/xml");

// Extract <item> nodes
const items1 = Array.from(doc1.getElementsByTagName("item"));
const items2 = Array.from(doc2.getElementsByTagName("item"));

// Merge items
const allItems = [...items1, ...items2];

// Sort by pubDate descending
allItems.sort((a, b) => {
  const da = new Date(a.getElementsByTagName("pubDate")[0]?.textContent || 0);
  const db = new Date(b.getElementsByTagName("pubDate")[0]?.textContent || 0);
  return db - da;
});

// Build new RSS document
let output = "";
output += "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
output += "<rss version=\"2.0\" xmlns:itunes=\"http://www.itunes.com/dtds/podcast-1.0.dtd\" xmlns:atom=\"http://www.w3.org/2005/Atom\">\n";
output += "  <channel>\n";
output += "    <title>Charlie Meyerson Interviews</title>\n";
output += "    <link>https://charlesmeyerson.github.io/podcast.xml</link>\n";
output += "    <atom:link href=\"https://charlesmeyerson.github.io/podcast.xml\" rel=\"self\" type=\"application/rss+xml\" />\n";
output += "    <link rel=\"hub\" href=\"https://pubsubhubbub.appspot.com/\" />\n";
output += "    <description>A curated collection of interviews and conversations by journalist Charles Meyerson.</description>\n";
output += "    <language>en-us</language>\n";
output += "    <copyright>2026 Charles Meyerson</copyright>\n";
output += "    <itunes:author>Charles Meyerson</itunes:author>\n";
output += "    <itunes:owner>\n";
output += "      <itunes:name>Charles Meyerson</itunes:name>\n";
output += "      <itunes:email>Meyerson@gmail.com</itunes:email>\n";
output += "    </itunes:owner>\n";
output += "    <itunes:image href=\"https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhViJz7eAAy3Axe4cOf6Wr70aavqYU4dJZjfGg8g20wQHjO4s_AV675bT4Bv2Xlo2aGJ5OHp3DjxRVq9pVR0_QJV_MCElPVWSZ1K8XzsmnxQhshns7PEIbghcvAnYK5Id_OYLP4qwloZ2n3SPw88W_UoP_SROfevVPElIJhLBp2twfR3FEmBOzw/s1600/meyerson-strategy-logo2.png\" />\n";
output += "    <itunes:category text=\"News\"><itunes:category text=\"Interviews\" /></itunes:category>\n";
output += "    <itunes:explicit>false</itunes:explicit>\n";

// Process each item
allItems.forEach((item, index) => {
  const serializer = new XMLSerializer();
  let xml = serializer.serializeToString(item);
  // Remove any existing GUIDs from the source feed
xml = xml.replace(/<guid[\s\S]*?<\/guid>/g, "");


  // Extract link
  const linkMatch = xml.match(/<link>([^<]+)<\/link>/);
  const link = linkMatch ? linkMatch[1] : "";

  // GUID
  const guid = crypto.createHash("sha1").update(link).digest("hex");
  xml = xml.replace("<item>", `<item>\n<guid isPermaLink="false">${guid}</guid>`);

  // Duration placeholder
  xml = xml.replace("</pubDate>", "</pubDate>\n<itunes:duration>00:30:00</itunes:duration>");

  // Enclosure
  xml = xml.replace("</link>", `</link>\n<enclosure url="${link}" type="audio/mpeg" />`);

  // Episode number
  const ep = String(index + 1).padStart(3, "0");
  xml = xml.replace("</link>", `</link>\n<itunes:episode>${ep}</itunes:episode>`);

  // Summary cleanup
  const descMatch = xml.match(/<description>([\s\S]*?)<\/description>/);
  if (descMatch) {
    const clean = descMatch[1].replace(/<[^>]+>/g, "");
    xml = xml.replace(descMatch[0], `<description>${clean}</description>\n<itunes:summary>${clean}</itunes:summary>`);
  }

  // Keywords
  const titleMatch = xml.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    const title = titleMatch[1];
    xml = xml.replace("</description>", `</description>\n<itunes:keywords>${title}, interviews, journalism</itunes:keywords>`);
  }

  output += xml + "\n";
});

output += "  </channel>\n";
output += "</rss>\n";

// Write final feed
fs.writeFileSync("podcast.xml", output, "utf8");
console.log("podcast.xml generated successfully");
