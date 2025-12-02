import { GoogleGenAI } from "@google/genai";
import { Repo, TimeFrame } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are CyberGit, an elite automated AI hunter specializing in finding trending open-source software on GitHub.
Your output must be raw, valid JSON data extracted from live search results.
CRITICAL LANGUAGE RULE: ALL "description" fields MUST be in Simplified Chinese (zh-CN). If the original source is English, you MUST translate the summary into Chinese.
Tone: Cyberpunk, concise, technical.
`;

// Helper: Fetch detailed metadata from GitHub
// Note: Unauthenticated requests are limited to 60/hr.
const fetchRepoDetails = async (name: string): Promise<Partial<Repo> | null> => {
  try {
    const response = await fetch(`https://api.github.com/repos/${name}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (response.status === 404) return null; // Repo doesn't exist
    
    if (response.status === 403 || response.status === 429) {
      console.warn("GitHub API rate limit reached. Proceeding with limited data.");
      return {}; // Return empty object to indicate existence but no metadata
    }

    if (!response.ok) return null;

    const data = await response.json();
    
    return {
      lastPushedAt: data.pushed_at,
      isArchived: data.archived,
      starsCount: data.stargazers_count,
      language: data.language
    };

  } catch (e) {
    console.warn(`Network error checking repo ${name}`, e);
    return {}; // Assume exists on network error
  }
};

export const fetchTrendingRepos = async (timeFrame: TimeFrame): Promise<Repo[]> => {
  const dayMap = {
    '3d': '3',
    '7d': '7',
    '14d': '14'
  };

  const days = dayMap[timeFrame];
  
  // Prompt optimized: Ask for 20 items to allow for 404 filtering buffer
  const prompt = `
    Run a Google Search to find the top 20 specific GitHub repositories that are "trending" or have "skyrocketing stars" in the last ${days} days.
    Look for lists like "GitHub trending [current month]", "top github repos this week", or "fastest growing repos".
    
    CRITICAL: You must extract REAL repository data from the search results. Do not hallucinate.
    
    Format the output as a STRICT JSON ARRAY.
    
    JSON SYNTAX RULES (CRITICAL):
    1. Output ONLY the JSON array. No Markdown, no code blocks, no intro text.
    2. Use double quotes for all keys and string values.
    3. **DO NOT** use double quotes (") INSIDE descriptions. Use single quotes (') instead.
    4. NO trailing commas.
    5. **TRANSLATION**: The "description" value MUST be in Simplified Chinese (简体中文), summarizing the tool's function in under 100 words.
    
    JSON Structure Example:
    [
      {
        "name": "owner/repo",
        "url": "https://github.com/owner/repo",
        "description": "这里必须是简体中文的功能简介，少于100字，不要包含内部双引号...",
        "starsTrend": "+100 stars/day",
        "tags": ["Tag1", "Tag2"]
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.1, 
      },
    });

    let text = response.text || "";
    
    // Step 1: Remove Markdown code blocks
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    // Step 2: Extract the array part only
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1) {
      text = text.substring(firstBracket, lastBracket + 1);
    } else {
      console.warn("No JSON array brackets found in response:", text);
      throw new Error("API响应未包含有效的数据格式");
    }

    // Step 3: Remove trailing commas
    text = text.replace(/,(\s*[\]}])/g, '$1');

    try {
      const allCandidates = JSON.parse(text);
      if (!Array.isArray(allCandidates)) {
        throw new Error("返回数据不是数组格式");
      }

      // Step 4: Validate Repos and merge metadata
      const validRepos: Repo[] = [];
      const TARGET_COUNT = 10;
      
      console.log(`Validating ${allCandidates.length} candidates...`);

      for (const repo of allCandidates) {
        // Stop if we have enough
        if (validRepos.length >= TARGET_COUNT) break;

        // Ensure basic structure
        if (!repo.name || !repo.name.includes('/')) continue;

        // Check against GitHub API and get details
        const details = await fetchRepoDetails(repo.name);
        
        if (details) {
          validRepos.push({
            ...repo,
            ...details // Merge real GitHub data
          } as Repo);
        } else {
          console.warn(`Filtering out dead repo: ${repo.name}`);
        }
      }

      if (validRepos.length === 0) {
        throw new Error("未能找到有效的项目数据 (所有候选项均无法访问)");
      }

      return validRepos;

    } catch (e: any) {
      console.error("JSON Parse/Validation Error:", e);
      // If parsing fails completely, throw generic error
      if (e.message.includes("DATA_CORRUPTION")) throw e;
      throw new Error("数据流解析失败 (DATA_CORRUPTION): " + e.message);
    }

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const generateRepoImage = async (name: string, description: string): Promise<string | null> => {
  try {
    const prompt = `
      Create a cyberpunk abstract header image for a software project named "${name}".
      Project description: "${description}".
      Style requirements: Dark sci-fi background, neon cyan and magenta lights, digital glitch effects, high-tech interface elements.
      No text in the image. Aspect ratio 16:9.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Image Gen Error:", error);
    return null;
  }
};