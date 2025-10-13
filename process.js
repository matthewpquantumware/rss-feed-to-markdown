const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const sanitize = require('sanitize-filename');
const TurndownService = require('turndown');
const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
const jsdom = require("jsdom");
const { JSDOM } = jsdom;


// Pull human text out of strings/arrays/common parser objects
function extractText(v, depth = 0) {
  if (v == null || depth > 4) return '';

  // Already a string/number/bool
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }

  // Arrays: take first meaningful piece (or join if you prefer)
  if (Array.isArray(v)) {
    // Try first non-empty after extraction
    for (const item of v) {
      const s = extractText(item, depth + 1).trim();
      if (s) return s;
    }
    return '';
  }

  // Objects: common feed/parser shapes
  if (typeof v === 'object') {
    // Try well-known keys in order
    const candidates = [
      v.value, v.text, v._, v.title, v.content, v['#text']
    ];

    for (const c of candidates) {
      const s = extractText(c, depth + 1).trim();
      if (s) return s;
    }

    // Last resort: look for the first primitive-ish field
    for (const k of Object.keys(v)) {
      const s = extractText(v[k], depth + 1).trim();
      if (s) return s;
    }
    return '';
  }

  // Fallback
  return '';
}


// Normalize whitespace
const norm = (v) => extractText(v).replace(/\s+/g, ' ').trim();

// Fetch the RSS feed
async function fetchAndParseFeed(feedUrl) {
  const response = await axios.get(feedUrl);
  const feedXml = response.data;
  return parseStringPromise(feedXml);
}

// Process the feed entries and generate Markdown files
const generateMarkdown = (template, entry, category) => {
  const id = entry['yt:videoId']?.[0] || entry['id']?.[0] || entry.guid?.[0]?.['_'] || entry.guid?.[0] || '';
  const date = entry.published?.[0] || entry.pubDate?.[0] || entry.updated?.[0] || '';
  const pubdate = entry.published?.[0] || entry.pubDate?.[0] || '';
  const link = entry.link?.[0]?.$?.href || entry.link?.[0] || '';
  //const title = entry.title?.[0]?.replace(/[^\w\s-]/g, '') || '';
  const title = String(Array.isArray(entry?.title) ? entry.title[0] : entry?.title ?? '').replace(/[^\p{L}\p{N}\s-]/gu, '');
  const content = entry.description?.[0] || entry['media:group']?.[0]?.['media:description']?.[0] || entry.content?.[0]?.['_'] || '';
  const markdown = new TurndownService({codeBlockStyle: 'fenced', fenced: '```', bulletListMarker: '-'}).turndown(content);
  const description = entry.summary?.[0] || content.replace(/(["':^]+)/gi, "").split(" ").splice(0, 50).join(" ") || '';
  const author = entry.author?.[0]?.name?.[0] || entry['author']?.[0]?.name?.[0] || entry['dc:creator']?.[0] || 'Unknown Author';
  const video = entry['media:group']?.[0]?.['media:content']?.[0]?.$?.url || '';
  const image = entry['media:group']?.[0]?.['media:thumbnail']?.[0]?.$.url || entry['media:thumbnail']?.[0]?.$.url || '';
  const images = (entry['enclosure'] || entry['media:content'])?.filter(e => imageTypes.includes(e.$['type']))?.map(e => e.$.url) ||  [];
  const categories = category.concat(entry.category) || [];
  const views = entry['media:group']?.[0]?.['media:community']?.[0]?.['media:statistics']?.[0]?.$.views || '';
  const rating = entry['media:group']?.[0]?.['media:community']?.[0]?.['media:starRating']?.[0]?.$.average || '';
  const dom = new JSDOM(content);
  const thumbnail = (entry['enclosure'] || entry['media:content'])?.filter(e => imageTypes.includes(e.$['type']))?.map(e => e.$.url) || dom.window.document.querySelector("img").src || '';
  try{dom.window.document.querySelector("figure").remove();}catch{  }
  const textmd =new TurndownService({codeBlockStyle: 'fenced', fenced: '```', bulletListMarker: '-'}).turndown(dom.window.document) || '';
    



// Safer token replacement loop
let output = String(template);
const fields = {
  '[ID]': id,
  '[DATE]': date,
  '[LINK]': link,
  '[TITLE]': norm(title),               // <-- no more [object Object]
  '[DESCRIPTION]': norm(description),
  '[CONTENT]': extractText(content),
  '[MARKDOWN]': extractText(markdown),
  '[AUTHOR]': extractText(author),
  '[VIDEO]': extractText(video),
  '[IMAGE]': extractText(image),
  '[IMAGES]': Array.isArray(images) ? images.map(extractText).filter(Boolean).join(',') : extractText(images),
  '[CATEGORIES]': Array.isArray(categories) ? categories.map(extractText).filter(Boolean).join(',') : extractText(categories),
  '[VIEWS]': extractText(views),
  '[RATING]': extractText(rating),
  '[ENCLOSURE]': extractText(thumbnail),
  '[PUBDATE]': extractText(pubdate),
  '[TEXTMD]': extractText(textmd),
};

for (const [token, value] of Object.entries(fields)) {
  output = output.replaceAll(token, value ?? '');
}
  

  return { output, date, title };
}

function saveMarkdown(outputDir, date, title, markdown, overwrite) {
  const formattedDate = date ? new Date(date).toISOString().split('T')[0] : '';
  const slug = sanitize(`${formattedDate}-${title.toLowerCase().replace(/\s+/g, '-')}`).substring(0, 50);
  const fileName = `${slug}.md`;
  const filePath = path.join(outputDir, fileName);

  //fs.writeFileSync(filePath, markdown);
  fs.access(filePath, fs.F_OK, (err) => {
    if (err || overwrite) {
      //File does not Exist or Overwrite File
      fs.writeFileSync(filePath, markdown);
      return
    }})


  return filePath;
}

module.exports = { fetchAndParseFeed, generateMarkdown, saveMarkdown };
