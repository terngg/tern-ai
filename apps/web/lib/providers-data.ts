import { preferences } from "./storage.js";

export type ProviderCategory =
  | "oauth"
  | "free"
  | "api_key"
  | "compatible"
  | "custom";

export type ProviderStatus =
  | "connected"
  | "disconnected"
  | "error"
  | "quota_low"
  | "disabled";

export type ProviderAuthType = "oauth" | "api_key" | "free" | "custom";

export interface ProviderConnection {
  id: string;
  providerId: string;
  name: string;
  status: ProviderStatus;
  apiKey?: string;
  accountEmail?: string;
  lastCheckedAt?: string;
  latencyMs?: number;
  models?: string[];
  enabled: boolean;
  endpointUrl?: string;
  customHeaders?: Record<string, string>;
  notes?: string;
  isPrimary?: boolean;
}

export interface ProviderItem {
  id: string;
  name: string;
  slug: string;
  category: ProviderCategory;
  description: string;
  icon?: string;
  brandColor?: string;
  status: ProviderStatus;
  connectionCount: number;
  badges: string[];
  connections: ProviderConnection[];
  supportsCustomModels?: boolean;
  defaultEndpoint?: string;
  authType: ProviderAuthType;
  docsUrl?: string;
  recommendedModel?: string;
  availableModels?: string[];
  isCustom?: boolean;
}

export const INITIAL_PROVIDERS: ProviderItem[] = [
  // A. OAuth Providers (7)
  {
    id: "claude-code",
    name: "Claude Code",
    slug: "claude-code",
    category: "oauth",
    authType: "oauth",
    description: "Anthropic Claude Code CLI token and agent runtime routing.",
    brandColor: "#D97706",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Code", "Agent", "Tools"],
    connections: [],
    docsUrl: "https://docs.anthropic.com/en/docs/agents-and-tools/claude-code",
    recommendedModel: "claude-3-7-sonnet-20250219",
    availableModels: [
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
  },
  {
    id: "antigravity",
    name: "Antigravity",
    slug: "antigravity",
    category: "oauth",
    authType: "oauth",
    description: "Google Antigravity next-generation autonomous coding platform.",
    brandColor: "#3B82F6",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Agent", "IDE", "Google"],
    connections: [],
    docsUrl: "https://antigravity.google",
    recommendedModel: "gemini-2.5-flash",
    availableModels: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
    ],
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    slug: "openai-codex",
    category: "oauth",
    authType: "oauth",
    description: "OpenAI developer authentication and coding engine access.",
    brandColor: "#10B981",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Code", "Autocomplete", "OpenAI"],
    connections: [],
    docsUrl: "https://platform.openai.com",
    recommendedModel: "gpt-4o",
    availableModels: ["gpt-4o", "gpt-4o-mini", "o1-mini", "o3-mini"],
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    slug: "github-copilot",
    category: "oauth",
    authType: "oauth",
    description: "GitHub Copilot Chat and inline completion bridge.",
    brandColor: "#8B5CF6",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Code", "Enterprise", "GitHub"],
    connections: [],
    docsUrl: "https://github.com/features/copilot",
    recommendedModel: "copilot-chat-gpt4o",
    availableModels: [
      "copilot-chat-gpt4o",
      "copilot-claude-3.5-sonnet",
      "copilot-o1",
    ],
  },
  {
    id: "cursor-ide",
    name: "Cursor IDE",
    slug: "cursor-ide",
    category: "oauth",
    authType: "oauth",
    description: "Cursor local session integration with fast token streaming.",
    brandColor: "#6366F1",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Code", "Editor", "Composer"],
    connections: [],
    docsUrl: "https://cursor.com",
    recommendedModel: "cursor-fast-sonnet",
    availableModels: [
      "cursor-fast-sonnet",
      "cursor-small",
      "cursor-gpt-4o",
    ],
  },
  {
    id: "kilo-code",
    name: "Kilo Code",
    slug: "kilo-code",
    category: "oauth",
    authType: "oauth",
    description: "Kilo Code collaborative developer router with community tier.",
    brandColor: "#EC4899",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Code", "Free Tier", "Dev"],
    connections: [],
    docsUrl: "https://kilocode.ai",
    recommendedModel: "kilo-code-fast",
    availableModels: ["kilo-code-fast", "kilo-code-reasoning"],
  },
  {
    id: "cline",
    name: "Cline",
    slug: "cline",
    category: "oauth",
    authType: "oauth",
    description: "Autonomous CLI and IDE agent gateway with multi-file edit capabilities.",
    brandColor: "#14B8A6",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Agent", "Tools", "VS Code"],
    connections: [],
    docsUrl: "https://github.com/cline/cline",
    recommendedModel: "claude-3-7-sonnet",
    availableModels: ["claude-3-7-sonnet", "deepseek-coder-v2", "gpt-4o"],
  },

  // B. Free Providers (4)
  {
    id: "iflow-ai",
    name: "iFlow AI",
    slug: "iflow-ai",
    category: "free",
    authType: "free",
    description: "High-throughput free tier router with low latency for daily coding.",
    brandColor: "#06B6D4",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Free", "Chat", "Code"],
    connections: [],
    docsUrl: "https://iflow.work",
    recommendedModel: "iflow-fast",
    availableModels: ["iflow-fast", "iflow-code"],
  },
  {
    id: "qwen-code",
    name: "Qwen Code",
    slug: "qwen-code",
    category: "free",
    authType: "free",
    description: "Alibaba Qwen 2.5 Coder open zero-cost developer endpoint.",
    brandColor: "#F59E0B",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Free", "Code", "Fast"],
    connections: [],
    docsUrl: "https://github.com/QwenLM/Qwen2.5-Coder",
    recommendedModel: "qwen2.5-coder-32b",
    availableModels: [
      "qwen2.5-coder-32b",
      "qwen2.5-coder-14b",
      "qwen2.5-coder-7b",
    ],
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    slug: "gemini-cli",
    category: "free",
    authType: "free",
    description: "Google Gemini developer command-line interface complimentary tier.",
    brandColor: "#38BDF8",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Free", "CLI", "Google"],
    connections: [],
    docsUrl: "https://ai.google.dev",
    recommendedModel: "gemini-2.0-flash-exp",
    availableModels: ["gemini-2.0-flash-exp", "gemini-1.5-flash"],
  },
  {
    id: "kiro-ai",
    name: "Kiro AI",
    slug: "kiro-ai",
    category: "free",
    authType: "free",
    description: "Kiro community distributed proxy pool router for developer fallbacks.",
    brandColor: "#A855F7",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Free", "Router", "Community"],
    connections: [],
    docsUrl: "https://kiro.ai",
    recommendedModel: "kiro-router-free",
    availableModels: ["kiro-router-free", "kiro-fallback-fast"],
  },

  // C. API Key Providers (28)
  {
    id: "openrouter",
    name: "OpenRouter",
    slug: "openrouter",
    category: "api_key",
    authType: "api_key",
    description: "Universal model aggregator supporting 300+ models with smart fallbacks.",
    brandColor: "#60A5FA",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Multi-Model", "Router", "Tools"],
    connections: [],
    docsUrl: "https://openrouter.ai/docs",
    recommendedModel: "openrouter/free",
    availableModels: [
      "openrouter/free",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat",
      "anthropic/claude-3.5-sonnet",
    ],
  },
  {
    id: "glm-coding",
    name: "GLM Coding",
    slug: "glm-coding",
    category: "api_key",
    authType: "api_key",
    description: "Zhipu AI GLM-4 Code-specialized API with high code syntax fidelity.",
    brandColor: "#3B82F6",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Code", "GLM-4", "Zhipu AI"],
    connections: [],
    docsUrl: "https://bigmodel.cn",
    recommendedModel: "glm-4-coder",
    availableModels: ["glm-4-coder", "glm-4-plus", "glm-4-air"],
  },
  {
    id: "glm-china",
    name: "GLM (China)",
    slug: "glm-china",
    category: "api_key",
    authType: "api_key",
    description: "Zhipu AI China domestic mainland region API gateway.",
    brandColor: "#2563EB",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Chat", "CN Mainland", "Zhipu AI"],
    connections: [],
    docsUrl: "https://open.bigmodel.cn",
    recommendedModel: "glm-4-plus",
    availableModels: ["glm-4-plus", "glm-4-flash", "glm-4-long"],
  },
  {
    id: "kimi",
    name: "Kimi",
    slug: "kimi",
    category: "api_key",
    authType: "api_key",
    description: "Moonshot AI Kimi with up to 2 million tokens context window.",
    brandColor: "#10B981",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Moonshot", "2M Context", "Search"],
    connections: [],
    docsUrl: "https://platform.moonshot.cn",
    recommendedModel: "moonshot-v1-128k",
    availableModels: [
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k",
    ],
  },
  {
    id: "minimax-coding",
    name: "Minimax Coding",
    slug: "minimax-coding",
    category: "api_key",
    authType: "api_key",
    description: "MiniMax abab 6.5 coding specialist endpoint with rapid token generation.",
    brandColor: "#F97316",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Code", "abab 6.5", "Fast"],
    connections: [],
    docsUrl: "https://api.minimax.chat",
    recommendedModel: "abab6.5s-chat",
    availableModels: ["abab6.5s-chat", "abab6.5t-chat"],
  },
  {
    id: "minimax-china",
    name: "Minimax (China)",
    slug: "minimax-china",
    category: "api_key",
    authType: "api_key",
    description: "MiniMax domestic China high-concurrency gateway for enterprise users.",
    brandColor: "#EA580C",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Chat", "Voice", "China Region"],
    connections: [],
    docsUrl: "https://api.minimax.chat",
    recommendedModel: "abab6.5s-chat",
    availableModels: ["abab6.5s-chat", "abab6.5-chat"],
  },
  {
    id: "alibaba",
    name: "Alibaba",
    slug: "alibaba",
    category: "api_key",
    authType: "api_key",
    description: "Alibaba Cloud Bailian Model Studio with Qwen flagship models.",
    brandColor: "#FF6A00",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Qwen", "Bailian", "Alibaba Cloud"],
    connections: [],
    docsUrl: "https://bailian.console.aliyun.com",
    recommendedModel: "qwen-max-latest",
    availableModels: ["qwen-max-latest", "qwen-plus", "qwen-turbo"],
  },
  {
    id: "alibaba-intl",
    name: "Alibaba Intl",
    slug: "alibaba-intl",
    category: "api_key",
    authType: "api_key",
    description: "Alibaba International Cloud endpoint for global regions with low latency.",
    brandColor: "#F59E0B",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Qwen-Max", "Global", "Low Latency"],
    connections: [],
    docsUrl: "https://alibabacloud.com/product/model-studio",
    recommendedModel: "qwen-plus",
    availableModels: ["qwen-max", "qwen-plus", "qwen-turbo"],
  },
  {
    id: "openai",
    name: "OpenAI",
    slug: "openai",
    category: "api_key",
    authType: "api_key",
    description: "Official OpenAI direct API for GPT-4o, o1, and o3-mini reasoning models.",
    brandColor: "#10A37F",
    status: "disconnected",
    connectionCount: 0,
    badges: ["GPT-4o", "o1/o3", "Reasoning"],
    connections: [],
    docsUrl: "https://platform.openai.com/docs",
    recommendedModel: "gpt-4o",
    availableModels: [
      "gpt-4o",
      "gpt-4o-mini",
      "o1",
      "o1-mini",
      "o3-mini",
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    slug: "anthropic",
    category: "api_key",
    authType: "api_key",
    description: "Direct Anthropic API with Claude 3.7 Sonnet Hybrid Thinking mode.",
    brandColor: "#D97706",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Claude 3.7", "Sonnet", "Thinking"],
    connections: [],
    docsUrl: "https://docs.anthropic.com",
    recommendedModel: "claude-3-7-sonnet-20250219",
    availableModels: [
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    slug: "gemini",
    category: "api_key",
    authType: "api_key",
    description: "Google Gemini Developer API with Flash, Pro, Vision, and 2M token context.",
    brandColor: "#818CF8",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Gemini 2.5", "Vision", "2M Tokens"],
    connections: [],
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    recommendedModel: "gemini-2.5-flash",
    availableModels: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-1.5-pro",
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    slug: "deepseek",
    category: "api_key",
    authType: "api_key",
    description: "DeepSeek official endpoint for DeepSeek-V3 and DeepSeek-R1 reasoning.",
    brandColor: "#4F46E5",
    status: "disconnected",
    connectionCount: 0,
    badges: ["DeepSeek-V3", "R1", "Reasoning"],
    connections: [],
    docsUrl: "https://platform.deepseek.com/api-docs",
    recommendedModel: "deepseek-chat",
    availableModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "groq",
    name: "Groq",
    slug: "groq",
    category: "api_key",
    authType: "api_key",
    description: "Groq LPU hardware inference engine with ultra-fast instant streaming.",
    brandColor: "#F43F5E",
    status: "disconnected",
    connectionCount: 0,
    badges: ["LPU Chip", "800 T/s", "Ultra-Fast"],
    connections: [],
    docsUrl: "https://console.groq.com/docs",
    recommendedModel: "llama-3.3-70b-versatile",
    availableModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "mixtral-8x7b-32768",
    ],
  },
  {
    id: "xai-grok",
    name: "xAI (Grok)",
    slug: "xai-grok",
    category: "api_key",
    authType: "api_key",
    description: "xAI official API with Grok-2 and Grok-3 real-time knowledge endpoints.",
    brandColor: "#FFFFFF",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Grok-2", "Grok-3", "Search"],
    connections: [],
    docsUrl: "https://docs.x.ai",
    recommendedModel: "grok-2-1212",
    availableModels: ["grok-2-1212", "grok-2-vision-1212", "grok-beta"],
  },
  {
    id: "mistral",
    name: "Mistral",
    slug: "mistral",
    category: "api_key",
    authType: "api_key",
    description: "Mistral AI platform with Codestral and Mistral Large frontier models.",
    brandColor: "#F97316",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Mistral Large", "Codestral", "Le Chat"],
    connections: [],
    docsUrl: "https://docs.mistral.ai",
    recommendedModel: "codestral-latest",
    availableModels: [
      "codestral-latest",
      "mistral-large-latest",
      "mistral-small-latest",
    ],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    slug: "perplexity",
    category: "api_key",
    authType: "api_key",
    description: "Perplexity AI API with real-time web search integration and citation synthesis.",
    brandColor: "#20B2AA",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Sonar", "Live Search", "Citations"],
    connections: [],
    docsUrl: "https://docs.perplexity.ai",
    recommendedModel: "sonar-pro",
    availableModels: ["sonar-pro", "sonar", "sonar-reasoning"],
  },
  {
    id: "together-ai",
    name: "Together AI",
    slug: "together-ai",
    category: "api_key",
    authType: "api_key",
    description: "High-throughput serverless open-source model inference engine.",
    brandColor: "#0EA5E9",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Open Weights", "Llama 3.3", "Inference"],
    connections: [],
    docsUrl: "https://docs.together.ai",
    recommendedModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    availableModels: [
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "Qwen/Qwen2.5-Coder-32B-Instruct",
    ],
  },
  {
    id: "fireworks-ai",
    name: "Fireworks AI",
    slug: "fireworks-ai",
    category: "api_key",
    authType: "api_key",
    description: "Fireworks AI low-latency inference optimized for structured outputs.",
    brandColor: "#EC4899",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Function Call", "Fast", "JSON Mode"],
    connections: [],
    docsUrl: "https://docs.fireworks.ai",
    recommendedModel: "accounts/fireworks/models/llama-v3p1-70b-instruct",
    availableModels: [
      "accounts/fireworks/models/llama-v3p1-70b-instruct",
      "accounts/fireworks/models/qwen2p5-coder-32b-instruct",
    ],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    slug: "cerebras",
    category: "api_key",
    authType: "api_key",
    description: "Cerebras CS-3 wafer-scale engine with world-record generation speed.",
    brandColor: "#EF4444",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Wafer-Scale", "2100 T/s", "Llama 3.3"],
    connections: [],
    docsUrl: "https://inference-docs.cerebras.net",
    recommendedModel: "llama3.1-70b",
    availableModels: ["llama3.1-70b", "llama3.1-8b"],
  },
  {
    id: "cohere",
    name: "Cohere",
    slug: "cohere",
    category: "api_key",
    authType: "api_key",
    description: "Cohere Command R+ and Embed for production enterprise RAG workflows.",
    brandColor: "#34D399",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Command R+", "RAG", "Enterprise"],
    connections: [],
    docsUrl: "https://docs.cohere.com",
    recommendedModel: "command-r-plus-08-2024",
    availableModels: ["command-r-plus-08-2024", "command-r-08-2024"],
  },
  {
    id: "nvidia-nim",
    name: "NVIDIA NIM",
    slug: "nvidia-nim",
    category: "api_key",
    authType: "api_key",
    description: "NVIDIA Inference Microservice optimized containers on GPU cloud.",
    brandColor: "#76B900",
    status: "disconnected",
    connectionCount: 0,
    badges: ["NVIDIA Cloud", "CUDA", "Optimized"],
    connections: [],
    docsUrl: "https://build.nvidia.com",
    recommendedModel: "meta/llama-3.3-70b-instruct",
    availableModels: [
      "meta/llama-3.3-70b-instruct",
      "deepseek-ai/deepseek-r1",
    ],
  },
  {
    id: "nebius-ai",
    name: "Nebius AI",
    slug: "nebius-ai",
    category: "api_key",
    authType: "api_key",
    description: "Nebius AI Studio enterprise H100 GPU compute infrastructure.",
    brandColor: "#8B5CF6",
    status: "disconnected",
    connectionCount: 0,
    badges: ["H100 Cluster", "Inference", "Europe"],
    connections: [],
    docsUrl: "https://nebius.ai/docs",
    recommendedModel: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    availableModels: ["meta-llama/Meta-Llama-3.1-70B-Instruct"],
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    slug: "siliconflow",
    category: "api_key",
    authType: "api_key",
    description: "SiliconCloud high-speed inference engine for open-source LLMs in Asia.",
    brandColor: "#6366F1",
    status: "disconnected",
    connectionCount: 0,
    badges: ["China Hub", "Fast", "SiliconCloud"],
    connections: [],
    docsUrl: "https://docs.siliconflow.cn",
    recommendedModel: "deepseek-ai/DeepSeek-V3",
    availableModels: [
      "deepseek-ai/DeepSeek-V3",
      "deepseek-ai/DeepSeek-R1",
      "Qwen/Qwen2.5-Coder-32B-Instruct",
    ],
  },
  {
    id: "hyperbolic",
    name: "Hyperbolic",
    slug: "hyperbolic",
    category: "api_key",
    authType: "api_key",
    description: "Hyperbolic open-access decentralized GPU inference network.",
    brandColor: "#A855F7",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Decentralized", "Affordable", "GPU"],
    connections: [],
    docsUrl: "https://docs.hyperbolic.xyz",
    recommendedModel: "meta-llama/Meta-Llama-3.1-70B-Instruct",
    availableModels: ["meta-llama/Meta-Llama-3.1-70B-Instruct"],
  },
  {
    id: "deepgram",
    name: "Deepgram",
    slug: "deepgram",
    category: "api_key",
    authType: "api_key",
    description: "Deepgram real-time speech-to-text, audio intelligence and voice synthesis.",
    brandColor: "#10B981",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Voice-to-Text", "Nova-2", "Streaming"],
    connections: [],
    docsUrl: "https://developers.deepgram.com",
    recommendedModel: "nova-2",
    availableModels: ["nova-2", "whisper-cloud"],
  },
  {
    id: "assemblyai",
    name: "AssemblyAI",
    slug: "assemblyai",
    category: "api_key",
    authType: "api_key",
    description: "AssemblyAI speech recognition and audio analysis platform for developers.",
    brandColor: "#2563EB",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Speech AI", "Lemur", "Audio"],
    connections: [],
    docsUrl: "https://www.assemblyai.com/docs",
    recommendedModel: "conformer-2",
    availableModels: ["conformer-2", "lemur"],
  },
  {
    id: "nanobanana",
    name: "NanoBanana",
    slug: "nanobanana",
    category: "api_key",
    authType: "api_key",
    description: "NanoBanana ultra-low cost developer proxy and micro-model router.",
    brandColor: "#EAB308",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Budget", "High-Throughput", "Micro"],
    connections: [],
    docsUrl: "https://nanobanana.com",
    recommendedModel: "nb-coder-flash",
    availableModels: ["nb-coder-flash", "nb-general-small"],
  },
  {
    id: "chutes-ai",
    name: "Chutes AI",
    slug: "chutes-ai",
    category: "api_key",
    authType: "api_key",
    description: "Chutes AI decentralized serverless GPU compute and open weight runtime.",
    brandColor: "#14B8A6",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Serverless", "Decentralized", "Chutes"],
    connections: [],
    docsUrl: "https://chutes.ai/docs",
    recommendedModel: "chutes-deepseek-r1",
    availableModels: ["chutes-deepseek-r1", "chutes-llama-3.3-70b"],
  },

  // D. Compatible / Custom Providers (2 default templates)
  {
    id: "openai-compatible",
    name: "OpenAI Compatible",
    slug: "openai-compatible",
    category: "compatible",
    authType: "custom",
    description: "Standard OpenAI /v1 endpoint (Ollama, LM Studio, vLLM, LiteLLM, OneAPI).",
    brandColor: "#10A37F",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Standard /v1", "Ollama", "vLLM", "LocalAI"],
    connections: [],
    supportsCustomModels: true,
    defaultEndpoint: "http://localhost:11434/v1",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    recommendedModel: "llama3.2",
    availableModels: ["llama3.2", "qwen2.5-coder", "mistral-nemo"],
  },
  {
    id: "anthropic-compatible",
    name: "Anthropic Compatible",
    slug: "anthropic-compatible",
    category: "compatible",
    authType: "custom",
    description: "Standard Anthropic /v1/messages endpoint (Claude Proxy, AWS Bedrock Gateway).",
    brandColor: "#D97706",
    status: "disconnected",
    connectionCount: 0,
    badges: ["Anthropic /v1", "Claude Proxy", "Bedrock"],
    connections: [],
    supportsCustomModels: true,
    defaultEndpoint: "https://api.anthropic.com/v1",
    docsUrl: "https://docs.anthropic.com/en/api/getting-started",
    recommendedModel: "claude-3-5-sonnet",
    availableModels: ["claude-3-5-sonnet", "claude-3-7-sonnet"],
  },
];

export const STORAGE_KEY_CONNECTIONS = "tern_router_connections_v1";
export const STORAGE_KEY_CUSTOM_PROVIDERS = "tern_router_custom_providers_v1";

/**
 * Load connections and custom providers from preferences.
 * Seamlessly merges existing Gemini and OpenRouter keys if present.
 */
export async function loadProvidersWithState(
  rememberedKeys?: { gemini?: string; openrouter?: string },
): Promise<ProviderItem[]> {
  try {
    const [storedConnections, storedCustomProviders] = await Promise.all([
      preferences.get<Record<string, ProviderConnection[]>>(
        STORAGE_KEY_CONNECTIONS,
      ),
      preferences.get<ProviderItem[]>(STORAGE_KEY_CUSTOM_PROVIDERS),
    ]);

    const connectionMap = storedConnections || {};
    const customList = Array.isArray(storedCustomProviders)
      ? storedCustomProviders
      : [];

    const allBase = [...INITIAL_PROVIDERS, ...customList];

    return allBase.map((p) => {
      const connections = connectionMap[p.id] ? [...connectionMap[p.id]] : [];

      // Auto-populate Gemini connection if key is remembered or provided
      if (p.id === "gemini" && rememberedKeys?.gemini && connections.length === 0) {
        connections.push({
          id: `conn-gemini-default`,
          providerId: "gemini",
          name: "Default Gemini Key",
          status: "connected",
          apiKey: rememberedKeys.gemini,
          lastCheckedAt: new Date().toISOString(),
          latencyMs: 142,
          models: p.availableModels,
          enabled: true,
          isPrimary: true,
        });
      }

      // Auto-populate OpenRouter connection if key is remembered or provided
      if (
        p.id === "openrouter" &&
        rememberedKeys?.openrouter &&
        connections.length === 0
      ) {
        connections.push({
          id: `conn-openrouter-default`,
          providerId: "openrouter",
          name: "Default OpenRouter Key",
          status: "connected",
          apiKey: rememberedKeys.openrouter,
          lastCheckedAt: new Date().toISOString(),
          latencyMs: 185,
          models: p.availableModels,
          enabled: true,
          isPrimary: true,
        });
      }

      const activeConns = connections.filter((c) => c.enabled);
      let calculatedStatus: ProviderStatus = "disconnected";
      if (activeConns.some((c) => c.status === "connected")) {
        calculatedStatus = "connected";
      } else if (activeConns.some((c) => c.status === "quota_low")) {
        calculatedStatus = "quota_low";
      } else if (activeConns.some((c) => c.status === "error")) {
        calculatedStatus = "error";
      } else if (connections.length > 0 && !connections.some((c) => c.enabled)) {
        calculatedStatus = "disabled";
      }

      return {
        ...p,
        connections,
        connectionCount: connections.filter((c) => c.status === "connected" && c.enabled).length,
        status: calculatedStatus,
      };
    });
  } catch {
    return INITIAL_PROVIDERS;
  }
}

/**
 * Persist connections to local browser preference store.
 */
export async function saveConnections(
  providerId: string,
  connections: ProviderConnection[],
): Promise<void> {
  const current =
    (await preferences.get<Record<string, ProviderConnection[]>>(
      STORAGE_KEY_CONNECTIONS,
    )) || {};
  current[providerId] = connections;
  await preferences.put(STORAGE_KEY_CONNECTIONS, current);
}

/**
 * Persist custom providers.
 */
export async function saveCustomProviders(
  customProviders: ProviderItem[],
): Promise<void> {
  await preferences.put(STORAGE_KEY_CUSTOM_PROVIDERS, customProviders);
}
