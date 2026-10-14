const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
const {
    createMatchStore,
    mergeImportedMatches
} = require("./match-store");

let directory;
let archivePath;
let store;

beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "cricpulse-match-store-"));
    archivePath = path.join(directory, "matches.json");
    store = createMatchStore(archivePath);
});

afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
});

test("reads an empty archive when no archive exists yet", () => {
    assert.deepEqual(store.readMatches(), []);
});

test("writes complete archives through a readable JSON file", () => {
    const matches = [{ id: "match-1", balls: [{ runs: 4 }] }];

    store.saveMatches(matches);

    assert.deepEqual(store.readMatches(), matches);
    assert.deepEqual(fs.readdirSync(directory), ["matches.json"]);
});

test("atomically replaces an existing archive with the complete new state", () => {
    store.saveMatches([{ id: "old-match" }]);

    store.saveMatches([{ id: "new-match" }]);

    assert.deepEqual(store.readMatches(), [{ id: "new-match" }]);
    assert.deepEqual(fs.readdirSync(directory), ["matches.json"]);
});

test("does not treat malformed archive data as an empty match list", () => {
    fs.writeFileSync(archivePath, "{ incomplete", "utf8");

    assert.throws(store.readMatches, /invalid JSON; no data was changed/);
    assert.equal(fs.readFileSync(archivePath, "utf8"), "{ incomplete");
});

test("rejects valid JSON that is not an archive array", () => {
    fs.writeFileSync(archivePath, JSON.stringify({ matches: [] }), "utf8");

    assert.throws(store.readMatches, /must contain a JSON array/);
    assert.equal(
        fs.readFileSync(archivePath, "utf8"),
        JSON.stringify({ matches: [] })
    );
});

test("preserves the existing archive when an atomic replacement fails", () => {
    fs.mkdirSync(archivePath);

    assert.throws(() => store.saveMatches([{ id: "new-match" }]));
    assert.equal(fs.statSync(archivePath).isDirectory(), true);
    assert.deepEqual(fs.readdirSync(directory), ["matches.json"]);
});

test("rejects non-array values before saving", () => {
    assert.throws(() => store.saveMatches({ id: "not-an-archive" }), TypeError);
    assert.deepEqual(fs.readdirSync(directory), []);
});

function createMatch(id) {
    return {
        id,
        team1: "Falcons",
        team2: "Tigers",
        teams: {
            team1: { players: [] },
            team2: { players: [] }
        },
        balls: []
    };
}

test("imports new matches additively and leaves existing records intact", () => {
    const existing = createMatch("saved-match");
    const imported = createMatch("imported-match");

    const result = mergeImportedMatches([existing], [imported]);

    assert.deepEqual(result, {
        matches: [imported, existing],
        importedCount: 1
    });
    assert.deepEqual(existing, createMatch("saved-match"));
});

test("rejects imports that could overwrite an existing match", () => {
    const existing = createMatch("same-match");
    const imported = { ...createMatch("same-match"), result: "different data" };

    assert.throws(
        () => mergeImportedMatches([existing], [imported]),
        { message: /Existing matches were not changed/, statusCode: 409 }
    );
    assert.deepEqual(existing, createMatch("same-match"));
});

test("rejects malformed and duplicate imported matches", () => {
    assert.throws(
        () => mergeImportedMatches([], [{ id: "incomplete" }]),
        /must include an ID, two teams/
    );
    assert.throws(
        () => mergeImportedMatches([], [createMatch("duplicate"), createMatch("duplicate")]),
        /duplicate match ID/
    );
});
