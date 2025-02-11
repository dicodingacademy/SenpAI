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
    const comments = [];

    for (const [index, chunk] of file.chunks.entries()) {
      try {
        const diffContent = chunk.content.join('\n');
        const { toneResponse, languageReview } = getConfig();
        const prompt = this.buildPrompt(file.path, pr, diffContent, languageReview, toneResponse);
        const aiResponse = await this.model.generateContent(prompt);
        const parsedResponse = parseComment(aiResponse);

        if (parsedResponse.length > 0) {
          parsedResponse.forEach(({ line, comment }) => {
            comments.push({
              path: file.path,
              line: chunk.newStart + line - 1,
              body: comment
            });
          });

          core.info(`Found ${parsedResponse.length} issues in ${file.path}`);
        } else {
          core.info(`No issues found in ${file.path}`);
        }

        core.debug(`Processed chunk ${index + 1} in ${file.path}`);
      } catch (error) {
        core.error(`Error processing chunk ${index + 1} in ${file.path}: ${error}`);
      }
    }

    return comments;
  }

  buildPrompt(fileName, pr, diffContent, languageReview, toneResponse) {
    return `You are SenpAI, a senior programmer AI. Analyze this code diff and provide feedback in STRICT JSON format:
            {
              "comments": [
                {
                  "line": <line_number>,
                  "comment": "<markdown_formatted_feedback>"
                }
              ]
            }
            
            Rules:
            1. Response with ${languageReview || 'english'} with ${toneResponse} tone. 
            2. Only include comments if there are actual issues to address
            3. Focus on:
               - Security vulnerabilities
               - Performance optimizations
               - Code quality issues
               - Architectural improvements
            4. Avoid:
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