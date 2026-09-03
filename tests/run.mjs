import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const match = html.match(/<script id="core"[^>]*>([\s\S]*?)<\/script>/);
assert(match, "index.html must contain <script id=\"core\">");

const context = {
  Blob,
  TextEncoder,
  TextDecoder,
  URL,
  console,
  setTimeout,
  clearTimeout,
};
vm.createContext(context);
vm.runInContext(match[1], context, { filename: "index.html#core" });

const {
  parseSong,
  parseSetlist,
  buildInitialMapping,
  createWorkingSong,
  setStepLanguage,
  updateMapping,
  moveStep,
  duplicateStep,
  removeStep,
  addStep,
  serializeSong,
  buildProject,
  validateSetlistForExport,
  buildExportEntries,
  crc32,
  createZipBytes,
} = context.LyricsTool ?? {};

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("parses a Hungarian-only song", () => {
  const song = parseSong(
    "dal.txt",
    "Magyar cím\n\n--------------------------------\n\nVerse 1\nElső sor\nMásodik sor\n\nChorus\nRefrén",
  );
  assert.equal(song.id, "dal");
  assert.equal(song.titleHu, "Magyar cím");
  assert.equal(song.titleEn, null);
  assert.deepEqual(
    plain(song.hu.map(({ label, body }) => ({ label, body }))),
    [
      { label: "Verse 1", body: "Első sor\nMásodik sor" },
      { label: "Chorus", body: "Refrén" },
    ],
  );
  assert.equal(song.en.length, 0);
});

test("parses bilingual labels with colons and blank lines inside sections", () => {
  const song = parseSong(
    "ketnyelvu.txt",
    [
      "Magyar / English",
      "",
      "--------------------------------",
      "",
      "Verse 1",
      "Első rész",
      "",
      "Második rész",
      "",
      "--------------------------------",
      "",
      "Verse 1:",
      "First part",
      "",
      "Second part",
    ].join("\r\n"),
  );
  assert.equal(song.titleEn, "English");
  assert.equal(song.hu[0].body, "Első rész\n\nMásodik rész");
  assert.equal(song.en[0].label, "Verse 1");
  assert.equal(song.en[0].body, "First part\n\nSecond part");
});

test("keeps changed repeated labels as separate occurrences", () => {
  const song = parseSong(
    "valtozat.txt",
    "Cím\n\n--------\n\nChorus\nElső\n\nChorus\nMásodik",
  );
  assert.equal(song.hu.length, 2);
  assert.notEqual(song.hu[0].key, song.hu[1].key);
  assert.equal(song.hu[1].body, "Második");
});

test("rejects lyric content before the first section", () => {
  assert.throws(
    () => parseSong("rossz.txt", "Cím\n\n--------\n\nárva dalszöveg"),
    /before the first section/i,
  );
});

test("parses setlists while preserving order and duplicates", () => {
  const setlist = parseSetlist(
    "chicago.txt",
    "# nyitó\n\nfirst.txt\nsecond.txt\nfirst.txt\n",
  );
  assert.equal(setlist.id, "chicago");
  assert.deepEqual(
    plain(setlist.entries.map(({ filename, line }) => ({ filename, line }))),
    [
      { filename: "first.txt", line: 3 },
      { filename: "second.txt", line: 4 },
      { filename: "first.txt", line: 5 },
    ],
  );
});

test("rejects unsafe setlist entries", () => {
  assert.throws(
    () => parseSetlist("bad.txt", "../song.txt"),
    /invalid song filename/i,
  );
});

test("maps exact repeated section labels", () => {
  const song = parseSong(
    "mapped.txt",
    "HU / EN\n\n--------\n\nVerse 1\nH1\n\nChorus\nHC\n\nChorus\nHC\n\n--------\n\nVerse 1\nE1\n\nChorus\nEC",
  );
  const mapping = buildInitialMapping(song);
  assert.equal(mapping.get(song.hu[0].key), song.en[0].key);
  assert.equal(mapping.get(song.hu[1].key), song.en[1].key);
  assert.equal(mapping.get(song.hu[2].key), song.en[1].key);
});

test("aligns numbered and positionally renamed bilingual sections", () => {
  const song = parseSong(
    "aligned.txt",
    [
      "HU / EN",
      "",
      "--------",
      "",
      "Verse 1",
      "HV",
      "",
      "Chorus",
      "HC",
      "",
      "Chorus",
      "Hungarian bridge mislabeled as chorus",
      "",
      "Ending",
      "HE",
      "",
      "--------",
      "",
      "Verse 1:",
      "EV",
      "",
      "Chorus 1",
      "EC",
      "",
      "Bridge 1",
      "EB",
      "",
      "Ending",
      "EE",
    ].join("\n"),
  );
  const mapping = buildInitialMapping(song);
  assert.equal(mapping.get(song.hu[0].key), song.en[0].key);
  assert.equal(mapping.get(song.hu[1].key), song.en[1].key);
  assert.equal(mapping.get(song.hu[2].key), song.en[2].key);
  assert.equal(mapping.get(song.hu[3].key), song.en[3].key);
});

test("edits roadmap and corrected mappings in memory", () => {
  const parsed = parseSong(
    "edit.txt",
    "HU / EN\n\n--------\n\nVerse 1\nH1\n\nChorus\nHC\n\n--------\n\nVerse 1\nE1\n\nBridge\nEB",
  );
  let song = createWorkingSong(parsed);
  song = updateMapping(song, parsed.hu[1].key, null);
  assert.throws(() => setStepLanguage(song, 1, "en"), /not mapped/i);
  song = updateMapping(song, parsed.hu[1].key, parsed.en[1].key);
  song = setStepLanguage(song, 1, "en");
  song = duplicateStep(song, 1);
  song = moveStep(song, 2, -1);
  song = removeStep(song, 2);
  song = addStep(song, parsed.hu[0].key);
  assert.deepEqual(
    plain(
      song.roadmap.map(({ sourceKey, language }) => ({
        sourceKey,
        language,
      })),
    ),
    [
      { sourceKey: parsed.hu[0].key, language: "hu" },
      { sourceKey: parsed.hu[1].key, language: "en" },
      { sourceKey: parsed.hu[0].key, language: "hu" },
    ],
  );
});

test("serializes only roadmap-selected languages", () => {
  const parsed = parseSong(
    "mixed.txt",
    "Magyar / English\n\n--------\n\nVerse 1\nMagyar vers\n\nChorus\nMagyar refrén\n\n--------\n\nVerse 1\nEnglish verse\n\nChorus\nEnglish chorus",
  );
  let song = createWorkingSong(parsed);
  song = setStepLanguage(song, 1, "en");
  assert.equal(
    serializeSong(song),
    "Magyar / English\n\nVerse 1\nMagyar vers\n\nChorus\nEnglish chorus\n",
  );
});

test("calculates standard CRC-32", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("creates a UTF-8 ZIP with two entries", () => {
  const zip = createZipBytes([
    { name: "teszt/01-á.txt", data: new TextEncoder().encode("egy") },
    { name: "teszt/02-b.txt", data: new TextEncoder().encode("kettő") },
  ]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800);
  const eocdOffset = zip.length - 22;
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50);
  assert.equal(view.getUint16(eocdOffset + 10, true), 2);
});

test("builds working project state and reports unresolved songs", () => {
  const project = buildProject(
    [
      {
        filename: "known.txt",
        text: "Ismert\n\n--------\n\nVerse\nSzöveg",
      },
    ],
    [
      {
        filename: "set.txt",
        text: "known.txt\nmissing.txt\n",
      },
    ],
  );
  assert.equal(project.songs.size, 1);
  assert.equal(project.setlists.size, 1);
  assert.equal(project.errors.length, 1);
  assert.match(project.errors[0], /set\.txt:2.*missing\.txt/i);
  assert.equal(project.songs.get("known.txt").roadmap.length, 1);
});

test("builds numbered mixed-language export entries", () => {
  const parsed = parseSong(
    "mixed.txt",
    "Magyar / English\n\n--------\n\nVerse\nMagyar\n\n--------\n\nVerse\nEnglish",
  );
  const working = setStepLanguage(createWorkingSong(parsed), 0, "en");
  const setlist = parseSetlist("tour.txt", "mixed.txt\nmixed.txt\n");
  const entries = buildExportEntries(
    setlist,
    new Map([["mixed.txt", working]]),
  );
  assert.deepEqual(
    plain(entries.map(({ name }) => name)),
    ["tour/01-mixed.txt", "tour/02-mixed.txt"],
  );
  assert.match(new TextDecoder().decode(entries[0].data), /Verse\nEnglish/);
  assert.doesNotMatch(
    new TextDecoder().decode(entries[0].data),
    /Verse\nMagyar/,
  );
});

test("validates every setlist song before enabling export", () => {
  const parsed = parseSong(
    "known.txt",
    "Ismert\n\n--------\n\nVerse\nSzöveg",
  );
  const emptyRoadmap = { ...createWorkingSong(parsed), roadmap: [] };
  const setlist = parseSetlist("tour.txt", "known.txt\nmissing.txt\n");
  const errors = validateSetlistForExport(
    setlist,
    new Map([["known.txt", emptyRoadmap]]),
  );
  assert.equal(errors.length, 2);
  assert.match(errors[0], /known\.txt.*roadmap is empty/i);
  assert.match(errors[1], /tour\.txt:2.*missing\.txt/i);
});

test("parses every repository song and resolves every setlist entry", async () => {
  const root = new URL("../", import.meta.url);
  const songFilenames = (await readdir(new URL("plaintext/", root))).filter(
    (name) => name.endsWith(".txt"),
  );
  const songs = new Map();
  for (const filename of songFilenames) {
    const text = await readFile(new URL(`plaintext/${filename}`, root), "utf8");
    songs.set(filename, parseSong(filename, text));
  }

  const setlistFilenames = (await readdir(new URL("setlists/", root))).filter(
    (name) => name.endsWith(".txt"),
  );
  let entryCount = 0;
  for (const filename of setlistFilenames) {
    const text = await readFile(new URL(`setlists/${filename}`, root), "utf8");
    const setlist = parseSetlist(filename, text);
    for (const entry of setlist.entries) {
      assert(songs.has(entry.filename), `${filename}:${entry.line} is unresolved`);
      entryCount += 1;
    }
  }

  assert.equal(songs.size, 62);
  assert.equal(setlistFilenames.length, 8);
  assert.equal(entryCount, 92);
});

let failures = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

console.log(`\n${tests.length - failures}/${tests.length} tests passed`);
process.exitCode = failures === 0 ? 0 : 1;
