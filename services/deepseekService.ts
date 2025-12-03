import { Repo, TimeFrame } from "../types";
import { fetchRepoDetails } from "./geminiService";

// Security: API Keys are managed via user input (LocalStorage) only.
// Removed process.env fallback to ensure no keys are in source/build.
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat"; // Updated to V3 (user requested V3.2, mapping to standard chat endpoint)

export const validateDeepSeekKey = async (apiKey: string): Promise<boolean> => {
    if (!apiKey) return false;
    try {
        const response = await fetch(DEEPSEEK_BASE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: DEEPSEEK_MODEL,
                messages: [
                    { role: "user", content: "ping" }
                ],
                max_tokens: 1
            })
        });
        return response.ok;
    } catch (e) {
        console.error("DeepSeek Validation Failed:", e);
        return false;
    }
};

export const fetchDeepSeekTrendingRepos = async (timeFrame: TimeFrame, userApiKey?: string): Promise<Repo[]> => {
  // Strict: Only accept User Input (LocalStorage)
  const apiKey = userApiKey;

  if (!apiKey) {
    throw new Error("未检测到 API Key。请点击上方的 'KEY' 按钮并在设置中输入您的 DeepSeek API Key。");
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
    - description: Simplified Chinese summary (strictly 80-100 characters), detailing core features & benefits.
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
        "description": "这是一个非常强大的开源工具，它提供了自动化部署、实时监控以及智能分析功能。该项目采用Rust编写，性能极高，特别适合处理大规模并发请求，是当前DevOps领域的热门选择。",
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
        "Authorization": `Bearer ${apiKey}`
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

    if (response.status === 401) {
       throw new Error("DeepSeek API 鉴权失败。请检查您的 API Key 是否正确。");
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DeepSeek API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    let content = message?.content || "";
    
    // DeepSeek V3 usually does not return reasoning_content, but we check anyway
    const reasoning = message?.reasoning_content;
    if (reasoning) {
        console.log("【DeepSeek Thinking Process】\n", reasoning);
    }

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