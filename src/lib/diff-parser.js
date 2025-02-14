const { parse } = require('gitdiff-parser');
const core = require('@actions/core');

function parseGitDiff(diffText) {
  try {
    const parsed = parse(diffText);

    return parsed.map((file) => {
      let globalPositionCounter = 0;
      let isFirstHunk = true;

      file.hunks = file.hunks.map((hunk) => {
        if (!isFirstHunk) {
          globalPositionCounter += 1;
        } else {
          isFirstHunk = false;
        }

        const hunkStart = globalPositionCounter + 1;
        hunk.changes = hunk.changes.map((change) => {
          globalPositionCounter++;
          return {
            ...change,
            globalPosition: globalPositionCounter
          };
        });
        const hunkEnd = globalPositionCounter;

        hunk.globalPositionStart = hunkStart;
        hunk.globalPositionEnd = hunkEnd;

        return hunk;
      });

      return file;
    });

  } catch (error) {
    core.error(`Failed to parse diff: ${error.message}`);
    return [];
  }
}

module.exports = { parseGitDiff };