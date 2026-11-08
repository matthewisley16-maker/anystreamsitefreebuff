// Embeds the sound effects in index.html as base64 data URIs.
// The page has to work from a single file: file:// in the APK, inside the
// Electron asar, and in the preview server, which only serves index.html.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const target = path.join(root, "index.html");
const sounds = [
  ["openSound", "audio/open.mp3"],
  ["tapSound", "audio/tap.mp3"]
];

let html = fs.readFileSync(target, "utf8");

for (const [id, file] of sounds) {
  const bytes = fs.readFileSync(path.join(root, file));
  const uri = "data:audio/mpeg;base64," + bytes.toString("base64");
  const tagPattern = new RegExp('<audio id="' + id + '"[^>]*>');
  if (!tagPattern.test(html)) {
    throw new Error('index.html has no <audio id="' + id + '"> tag');
  }
  html = html.replace(tagPattern, (tag) => {
    const withoutSrc = tag.replace(/\ssrc="[^"]*"/, "");
    return withoutSrc.replace(/\s*>$/, ' src="' + uri + '">');
  });
  console.log("inlined " + file + " (" + bytes.length + " bytes)");
}

fs.writeFileSync(target, html);
console.log("index.html is now " + html.length + " bytes");
