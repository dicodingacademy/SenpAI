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
      core.info(`Analyzing ${file.path}`);
      try {
        const fileComments = await this.generateFileComments(file, prDetails);
        review.push(...fileComments);
      } catch (error) {
        core.error(`Failed to process ${file.path}: ${error}`);
      }
    }
    return review;
  }

  async generateFileComments(file, pr) {
    const DELAY = 1000;
    const comments = [];

    for (const [index, chunk] of file.chunks.entries()) {
      await new Promise((resolve) => setTimeout(resolve, DELAY));

      try {
        const diffContent = chunk.content.join('\n');
        const { toneResponse, languageReview } = getConfig();
        const prompt = this.buildPrompt(
          file.path,
          pr,
          diffContent,
          languageReview,
          toneResponse,
          chunk.newLines
        );

        const aiResponse = await this.model.generateContent(prompt);
        const parsedResponse = parseComment(aiResponse);

        const chunkComments = this.createComments(
          file.path,
          chunk,
          parsedResponse
        );

        comments.push(...chunkComments);

        core.debug(`Processed chunk ${index + 1} in ${file.path}`);
      } catch (error) {
        core.error(`Error processing chunk ${index + 1} in ${file.path}: ${error}`);
      }
    }

    return comments;
  }

  createComments(filePath, chunk, aiComments) {
    return aiComments
      .map(({ line, comment }) => {
        const lineNumber = Number(line);
        if (
          Number.isNaN(lineNumber) ||
              lineNumber < 1 ||
              lineNumber > chunk.newLines
        ) {
          core.warning(`Invalid line ${line} in ${filePath}. Valid range 1-${chunk.newLines}`);
          return null;
        }

        return {
          path: filePath,
          line: chunk.newStart + lineNumber - 1,
          body: comment
        };
      })
      .filter((comment) => comment !== null);
  }

  buildPrompt(fileName, pr, diffContent, languageReview, toneResponse, chunkLines) {
    return `You are SenpAI, a senior programmer AI. Analyze this code diff and provide feedback in STRICT JSON format:
            {
              "comments": [
                {
                  "line":  <1-${chunkLines}>,
                  "comment": "<markdown_formatted_feedback>"
                }
              ]
            }
            
            Rules:
            1. Response with ${languageReview || 'english'} with ${toneResponse} tone. 
            2. Provide comments and suggestions ONLY if there is something to improve, otherwise "comments" should be an empty array.
            3. Line numbers MUST be between 1-${chunkLines}
            4. Focus on:
               - Security vulnerabilities
               - Performance optimizations
               - Code quality issues
               - Architectural improvements
            5. Avoid:
               - Style nitpicks
               - Comment suggestions
               - Unsubstantiated claims
            
            PR Title: ${pr.title}
            PR Description: ${pr.body || 'No description provided'}
            
            File: ${fileName}
            Diff:
            \`\`\`diff
            ${diffContent}
            \`\`\`
            
            ONLY respond with valid JSON. No extra text.`;
  }
}

module.exports = GeminiClient;