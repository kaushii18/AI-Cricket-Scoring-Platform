const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

class MatchArchiveImportError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

function createMatchStore(filePath) {
    function readMatches() {
        let contents;
        try {
            contents = fs.readFileSync(filePath, "utf8");
        } catch (error) {
            if (error.code === "ENOENT") {
                return [];
            }

            throw new Error(`Unable to read match archive at ${filePath}.`, {
                cause: error
            });
        }

        let matches;
        try {
            matches = JSON.parse(contents);
        } catch (error) {
            throw new Error(
                `Match archive at ${filePath} contains invalid JSON; no data was changed.`,
                { cause: error }
            );
        }

        if (!Array.isArray(matches)) {
            throw new Error(
                `Match archive at ${filePath} must contain a JSON array; no data was changed.`
            );
        }

        return matches;
    }

    function saveMatches(matches) {
        if (!Array.isArray(matches)) {
            throw new TypeError("Match archive data must be an array.");
        }

        const directory = path.dirname(filePath);
        const temporaryPath = path.join(
            directory,
            `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
        );

        fs.mkdirSync(directory, { recursive: true });

        try {
            fs.writeFileSync(
                temporaryPath,
                JSON.stringify(matches, null, 2),
                { encoding: "utf8", flag: "wx" }
            );
            fs.renameSync(temporaryPath, filePath);
        } catch (error) {
            try {
                fs.unlinkSync(temporaryPath);
            } catch (cleanupError) {
                if (cleanupError.code !== "ENOENT") {
                    throw new AggregateError(
                        [error, cleanupError],
                        `Unable to save or clean up the match archive at ${filePath}.`
                    );
                }
            }

            throw new Error(`Unable to save match archive at ${filePath}.`, {
                cause: error
            });
        }
    }

    return Object.freeze({ readMatches, saveMatches });
}

function mergeImportedMatches(existingMatches, importedMatches) {
    if (!Array.isArray(existingMatches)) {
        throw new TypeError("Existing match archive data must be an array.");
    }

    if (!Array.isArray(importedMatches) || importedMatches.length === 0) {
        throw new MatchArchiveImportError(
            "The import must contain at least one match."
        );
    }

    const importedIds = new Set();
    for (const match of importedMatches) {
        const hasTeams = match?.teams &&
            typeof match.teams === "object" &&
            ["team1", "team2"].every((teamKey) => {
                const team = match.teams[teamKey];
                return team &&
                    typeof team === "object" &&
                    !Array.isArray(team) &&
                    Array.isArray(team.players);
            });
        const isValidMatch = match &&
            typeof match === "object" &&
            !Array.isArray(match) &&
            typeof match.id === "string" &&
            match.id.trim().length > 0 &&
            typeof match.team1 === "string" &&
            match.team1.trim().length > 0 &&
            typeof match.team2 === "string" &&
            match.team2.trim().length > 0 &&
            hasTeams &&
            Array.isArray(match.balls);

        if (!isValidMatch) {
            throw new MatchArchiveImportError(
                "Every imported match must include an ID, two teams, player lists, and ball history."
            );
        }

        if (importedIds.has(match.id)) {
            throw new MatchArchiveImportError(
                `The import contains duplicate match ID "${match.id}".`
            );
        }
        importedIds.add(match.id);
    }

    const existingIds = new Set(
        existingMatches
            .map((match) => match?.id)
            .filter((id) => typeof id === "string")
    );
    const conflictingIds = [...importedIds].filter((id) => existingIds.has(id));
    if (conflictingIds.length > 0) {
        throw new MatchArchiveImportError(
            `Import stopped because ${conflictingIds.length} match ID(s) already exist. Existing matches were not changed.`,
            409
        );
    }

    return {
        matches: [...importedMatches, ...existingMatches],
        importedCount: importedMatches.length
    };
}

module.exports = {
    createMatchStore,
    MatchArchiveImportError,
    mergeImportedMatches
};
