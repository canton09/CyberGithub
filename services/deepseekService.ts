import { Repo, TimeFrame } from "../types";
import { fetchRepoDetails } from "./geminiService";

// Security: API Keys are loaded from Environment Variables to prevent source code leakage.
// Please configure DEEPSEEK_API_KEY in your project's .env file or deployment settings.
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-reasoner";

export const fetchDeepSeekTrendingRepos = async (timeFrame: TimeFrame): Promise<Repo[]> => {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("配置错误: 未找到 DEEPSEEK_API_KEY 环境变量。为了安全起见，请在环境配置中设置您的密钥，不要直接硬编码在源码中。");
  }

  const dayMap = {
    '3d': '3',
    '7d': '7',
    '14d': '14'
  };

  const days = dayMap[timeFrame];

  const prompt = `
    Task: Identify 20 trending GitHub repositories from the last ${days} days. 
    Focus on projects with rapidly growing stars or high developer interest.
    Since you cannot browse the live web, use your internal knowledge cutoff or infer based on evergreen popular projects or known rising stars in the tech scene.
    
    CRITICAL OUTPUT FORMAT:
    Provide ONLY a valid JSON array. Do not output any thinking process outside the specific reasoning tags (if applicable) and do not output markdown code blocks.
    
    JSON Fields required:
    - name: "owner/repo" (e.g. "facebook/react")
    - url: "https://github.com/owner/repo"
    - description: Simplified Chinese summary (<100 words).
    - starsTrend: Estimated trend (e.g. "+200 stars/day")
    - tags: Array of strings.

    JSON Syntax Strict Rules:
    1. No trailing commas.
    2. No double quotes inside descriptions.
    3. Output must be strictly valid JSON [ ... ].
    
    Example:
    [
      {
        "name": "owner/repo",
        "url": "https://github.com/owner/repo",
        "description": "简短的中文介绍...",
        "starsTrend": "High",
        "tags": ["AI", "Tool"]
      }
    ]
  `;

  try {
    const response = await fetch(DEEPSEEK_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a professional tech trend analyst. Output JSON only. All descriptions in Simplified Chinese."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || "";

    // DeepSeek R1 (reasoner) might include <think>...</think> blocks. We need to remove them.
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Clean Markdown
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    // Extract JSON Array
    const firstBracket = content.indexOf('[');
    const lastBracket = content.lastIndexOf(']');

    if (firstBracket === -1 || lastBracket === -1) {
      console.warn("Raw DeepSeek Output:", content);
      throw new Error("DeepSeek 响应未包含有效 JSON 数组");
    }

    const jsonStr = content.substring(firstBracket, lastBracket + 1);
    
    // Parse
    let allCandidates: any[] = [];
    try {
      allCandidates = JSON.parse(jsonStr);
    } catch (e) {
      // Try to remove trailing commas which might be common
      const fixedJson = jsonStr.replace(/,(\s*[\]}])/g, '$1');
      allCandidates = JSON.parse(fixedJson);
    }

    if (!Array.isArray(allCandidates)) {
      throw new Error("DeepSeek 返回数据格式错误 (非数组)");
    }

    // Validate with GitHub API (Shared Logic)
    const validRepos: Repo[] = [];
    const TARGET_COUNT = 10;

    console.log(`[DeepSeek] Validating ${allCandidates.length} candidates...`);

    for (const repo of allCandidates) {
      if (validRepos.length >= TARGET_COUNT) break;
      if (!repo.name) continue;

      let cleanName = repo.name
          .replace(/^https?:\/\/github\.com\//, '')
          .replace(/\.git$/, '')
          .trim();
      
      if (cleanName.endsWith('/')) cleanName = cleanName.slice(0, -1);
      if (!cleanName.includes('/')) continue;

      const details = await fetchRepoDetails(cleanName);

      if (details) {
        validRepos.push({
          ...repo,
          name: cleanName,
          ...details
        } as Repo);
      } else {
        console.warn(`[DeepSeek] Filtering out invalid repo: ${cleanName}`);
      }
    }

    if (validRepos.length === 0) {
        throw new Error("DeepSeek 生成的项目均无法验证有效性。");
    }

    return validRepos;

  } catch (error: any) {
    console.error("DeepSeek Service Error:", error);
    throw error;
  }
};