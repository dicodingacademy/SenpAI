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
        const diffContent = hunk.changes.map((c) => c.content).join('\n');
        const { toneResponse, languageReview } = getConfig();
        const prompt = this.buildPrompt(
          file.newPath,
          pr,
          diffContent,
          languageReview,
          toneResponse,
          hunk.newLines
        );

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
    const MAX_COMMENTS_PER_HUNK = 3;

    return aiComments
      .filter((comment) => {
        if (!comment.severity) {
          core.debug(`Comment missing severity: ${JSON.stringify(comment)}`);
          return false;
        }

        const validSeverities = new Set(['critical', 'high', 'medium']);
        const isSevere = validSeverities.has(comment.severity.toLowerCase());

        if (!isSevere) {
          core.debug(`Filtered out low-severity comment: ${comment.severity}`);
        }

        return isSevere;
      })
      .sort((a, b) => {
        const severityOrder = { critical: 1, high: 2, medium: 3 };
        return severityOrder[a.severity.toLowerCase()] - severityOrder[b.severity.toLowerCase()];
      })
      .slice(0, MAX_COMMENTS_PER_HUNK)
      .map(({ line, comment }) => {
        const lineNumber = Number(line);

        if (
          Number.isNaN(lineNumber) ||
              lineNumber < 1 ||
              lineNumber > hunk.newLines
        ) {
          core.warning(`Invalid line ${line} in ${filePath}. Valid range 1-${hunk.newLines}`);
          return null;
        }

        const change = hunk.changes.find((c) => c.newLineNumber === (hunk.newStart + lineNumber - 1));

        if (!change) {
          core.warning(`Could not find position for line ${lineNumber} in ${filePath}`);
          return null;
        }

        return {
          path: filePath,
          position: change.position,
          body: comment
        };
      })
      .filter((comment) => comment !== null);
  }

  buildPrompt(fileName, pr, diffContent, languageReview = 'english', toneResponse = 'professional', hunkNewLines) {
    if (!fileName || !diffContent || !hunkNewLines) {
      throw new Error('Required parameters missing: fileName, diffContent, and chunkLines are mandatory');
    }

    if (!Number.isInteger(hunkNewLines) || hunkNewLines <= 0) {
      throw new Error('chunkLines must be a positive integer');
    }

    const priorityCriteria = [
      '1. Security risks (immediate danger)',
      '2. Critical bugs (data loss/corruption)',
      '3. Performance bottlenecks (>100ms impact)',
      '4. Maintenance hazards (error handling)',
      '5. Architectural flaws (scalability)'
    ].join('\n    ');

    return `You are SenpAI, a senior code reviewer. Provide MAX 3 URGENT comments in STRICT JSON:
    {
      "comments": [
        {
          "line": <1-${hunkNewLines}>,
          "comment": "<markdown>",
          "severity": "<critical|high|medium|low>"
        }
      ]
    }
    
    RULES:
    1. LANGUAGE: ${languageReview}, TONE: ${toneResponse}
    2. RULES FOR LINE NUMBERS:
        - Line numbers MUST be relative to the hunk start
        - First line after @@ header is line 1
        - Maximum line number is ${hunkNewLines}
        - NEVER use absolute file line numbers
    3. PRIORITY CRITERIA:
        ${priorityCriteria}
    4. REQUIRED IMPACT ANALYSIS:
      - Include concrete performance metrics
      - Specify security exploit scenarios
      - Quantify maintenance costs
    5. AVOID:
      - Style nitpicks (unless security-related)
      - Documentation suggestions
      - Theoretical optimizations

    EXAMPLE:
    {
      "comments": [
        {
          "line": 2,
          "comment": "Potential SQL injection vulnerability. Use parameterized queries.",
          "severity": "critical"
        }
      ]
    }
    
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