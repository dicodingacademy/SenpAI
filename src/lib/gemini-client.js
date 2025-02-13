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
    return aiComments
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

        return {
          path: filePath,
          line: hunk.newStart + lineNumber - 1,
          body: comment
        };
      })
      .filter((comment) => comment !== null);
  }

  buildPrompt(fileName, pr, diffContent, languageReview = 'english', toneResponse = 'professional', chunkLines) {
    if (!fileName || !diffContent || !chunkLines) {
      throw new Error('Required parameters missing: fileName, diffContent, and chunkLines are mandatory');
    }

    if (!Number.isInteger(chunkLines) || chunkLines <= 0) {
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
          "line": <1-${chunkLines}>,
          "comment": "<markdown>",
          "severity": "<critical|high|medium>"
        }
      ]
    }
    
    RULES:
    1. Language: ${languageReview}, Tone: ${toneResponse}
    2. Line numbers REFERENCE NEW CODE ONLY
    3. Priority order:
        ${priorityCriteria}
    4. REQUIRED IMPACT ANALYSIS:
      - Include concrete performance metrics
      - Specify security exploit scenarios
      - Quantify maintenance costs
    5. AVOID:
      - Style nitpicks (unless security-related)
      - Documentation suggestions
      - Theoretical optimizations
    
    CRITICAL CONTEXT:
    PR Title: ${pr.title || 'Untitled'}
    ${pr.body ? `PR Desc: ${pr.body}` : ''}
    
    CODE DIFF (${fileName}):
    \`\`\`diff
    ${diffContent}
    \`\`\`
    
    Respond ONLY with valid JSON.`;
  }
}

module.exports = GeminiClient;