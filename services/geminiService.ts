import { GoogleGenAI } from "@google/genai";
import { Repo, TimeFrame } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are CyberGit, an elite automated AI hunter specializing in finding trending open-source software on GitHub.
Your output must be raw, valid JSON data extracted from live search results.
Language: Simplified Chinese (zh-CN) for all descriptions.
Tone: Cyberpunk, concise, technical.
`;

export const fetchTrendingRepos = async (timeFrame: TimeFrame): Promise<Repo[]> => {
  const dayMap = {
    '3d': '3',
    '7d': '7',
    '14d': '14'
  };

  const days = dayMap[timeFrame];
  
  // Prompt optimized for strict JSON generation
  const prompt = `
    Run a Google Search to find the top 10 specific GitHub repositories that are "trending" or have "skyrocketing stars" in the last ${days} days.
    Look for lists like "GitHub trending [current month]", "top github repos this week", or "fastest growing repos".
    
    CRITICAL: You must extract REAL repository data from the search results. Do not hallucinate.
    
    Format the output as a STRICT JSON ARRAY.
    Rules:
    1. Do NOT wrap in markdown code blocks. Just return the raw JSON string.
    2. Do NOT include comments (like // or /* */) in the JSON.
    3. Ensure all strings are properly escaped.
    4. "name" must be in "owner/repo" format.
    
    JSON Structure Example:
    [
      {
        "name": "owner/repo",
        "url": "https://github.com/owner/repo",
        "description": "项目简介...",
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
    
    // Cleaner 1: Remove Markdown code blocks
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    // Cleaner 2: Attempt to find the array brackets if there is extra text
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1) {
      text = text.substring(firstBracket, lastBracket + 1);
    }

    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data as Repo[];
      }
      throw new Error("返回数据不是数组格式");
    } catch (e) {
      console.error("JSON Parse Error:", e);
      console.log("Faulty Text:", text);
      // Fallback: Try to strip trailing commas which is a common LLM JSON error
      try {
        const fixedText = text.replace(/,(\s*[\]}])/g, '$1');
        const data = JSON.parse(fixedText);
        if (Array.isArray(data)) return data as Repo[];
      } catch (e2) {
         throw new Error("数据流解析失败 (DATA_CORRUPTION): 格式错误");
      }
      throw new Error("数据流解析失败 (DATA_CORRUPTION)");
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};