const { GoogleGenerativeAI } = require('@google/generative-ai');
const core = require('@actions/core');
const { parseComment } = require('./comment-parser');
const { getConfig } = require('./config');

class GeminiClient {
  constructor(apiKey, modelName) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        // eslint-disable-next-line camelcase
        response_mime_type: 'application/json'
      }
    });
  }

  async reviewFiles(filteredFiles, prDetails) {
    const review = [];
    for (const file of filteredFiles) {
      core.info(`Analyzing ${file.newPath}`);
      try {
        const fileComments = await this.generateFileComments(file, prDetails);
        review.push(...fileComments);
      } catch (error) {
        core.error(`Failed to process ${file.newPath}: ${error}`);
      }
    }
    return review;
  }

  async generateFileComments(file, pr) {
    const DELAY = 1000;
    const comments = [];

    for (const hunk of file.hunks) {
      await new Promise((resolve) => setTimeout(resolve, DELAY));

      try {
        const hunkContent = this.formatDiffForPrompt(hunk.changes);
        core.debug(`Hunk content: \n${hunkContent}\n`);

        const { toneResponse, languageReview } = getConfig();
        const prompt = this.buildPrompt(
          file.newPath,
          pr,
          hunkContent,
          languageReview,
          toneResponse,
          hunk.globalPositionStart,
          hunk.globalPositionEnd
        );

        core.debug(`Prompt: \n${prompt}\n`);
        const aiResponse = await this.model.generateContent(prompt);
        const parsedResponse = parseComment(aiResponse);

        const hunkComments = this.createComments(
          file.newPath,
          hunk,
          parsedResponse
        );

        comments.push(...hunkComments);

        core.debug(`Processed hunk in ${file.newPath} (lines ${hunk.newStart}-${hunk.newStart + hunk.newLines - 1})`);
      } catch (error) {
        core.error(`Error processing hunk in ${file.newPath}: ${error}`);
      }
    }
    return comments;
  }

  createComments(filePath, hunk, aiComments) {
    return aiComments
      .filter(({ position }) => {
        const lineNum = Number(position);
        return !isNaN(lineNum) && lineNum >= 1 && lineNum <= hunk.newLines;
      })
      .map(({ position, comment, }) => {
        const changeIndex = position - 1;
        const change = hunk.changes[changeIndex];

        if (!change || !change.globalPosition) {
          core.warning(`Invalid position ${position} in hunk (max ${hunk.newLines})`);
          return null;
        }

        if (!change.newLineNumber) {
          core.warning(`Position ${position} refers to deleted code`);
          return null;
        }

        return {
          path: filePath,
          position: change.globalPosition,
          body: comment
        };
      })
      .filter((comment) => comment !== null);
  }

  formatDiffForPrompt(changes) {
    return changes
      .map((change) => {
        if (change.type === 'insert') {
          return `${change.globalPosition}. + ${change.content}`;
        } else if (change.type === 'delete') {
          return `${change.globalPosition}. - ${change.content}`;
        } else {
          return `${change.globalPosition}.  ${change.content}`;
        }
      })
      .join('\n');
  }

  buildPrompt(fileName, pr, diffContent, languageReview = 'english', toneResponse = 'professional', globalPositionStart, globalPositionEnd) {
    if (!fileName || !diffContent) {
      throw new Error('Required parameters missing: fileName and diffContent are mandatory');
    }

    if (!Number.isInteger(globalPositionStart) || !Number.isInteger(globalPositionEnd) || globalPositionStart < 1 || globalPositionEnd < globalPositionStart) {
      throw new Error(`Invalid position range: ${globalPositionStart}-${globalPositionEnd}`);
    }

    return `You are SenpAI, a senior code reviewer. Your task is reviewing pull requests.
INSTRUCTION:
  1. [IMPORTANT] Provide comments in STRICT JSON format: {"comments": [{ "position": <${globalPositionStart}-${globalPositionEnd}>, "comment": "<markdown>","severity": "<critical|high|medium|low>" }]}
  2. [IMPORTANT] Provide comments ONLY for lines of code that contain new additions or have a "+" prefix.
  3. If there are no improvements needed, the "comments" array should be empty.
  
RULES:
  1. LANGUAGE: ${languageReview}, TONE: ${toneResponse}
  2. PRIORITY CRITERIA:
    - Security risks (immediate danger)
    - Critical bugs (data loss/corruption)
    - Performance bottlenecks (>100ms impact)
    - Maintenance hazards (error handling)
    - Architectural flaws (scalability)
  3. AVOID:
    - Style nitpicks (unless security-related)
    - Documentation suggestions
    - Theoretical optimizations

    EXAMPLE:
    {"comments": [{"position": 2, "comment": "Potential SQL injection vulnerability. Use parameterized queries.","severity": "critical"}]}
    
DIFF CONTEXT:
PR Title: ${pr.title || 'Untitled'}
${pr.body ? `PR Description: ${pr.body}` : ''}

FILE: ${fileName}
DIFF HUNK:
\`\`\`diff
${diffContent}
\`\`\`


Respond ONLY with valid JSON.`;
  }
}

module.exports = GeminiClient;