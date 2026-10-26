import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { Response, SidecarApp } from 'sidecar_sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const app = new SidecarApp();

const readLocal = (name) => readFileSync(join(HERE, name), 'utf8');

// Subscription Quota Cache (5h and weekly limits)
let cachedSubscription = null;
let lastSubscriptionFetchTime = 0;
let isFetchingSubscription = false;
const SUBSCRIPTION_CACHE_TTL = 120_000; // 2 minutes

function resolveAgyCommand() {
  const home = homedir();
  const isWin = process.platform === 'win32';
  const candidates = isWin
    ? [
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe') : null,
        join(home, 'AppData', 'Local', 'agy', 'bin', 'agy.exe'),
        join(home, '.gemini', 'antigravity', 'bin', 'agy.exe'),
      ]
    : [
        join(home, '.local', 'bin', 'agy'),
        join(home, 'bin', 'agy'),
        '/opt/homebrew/bin/agy',
        '/usr/local/bin/agy',
        '/usr/bin/agy',
        join(home, '.gemini', 'antigravity', 'bin', 'agy'),
      ];

  for (const c of candidates) {
    if (c && existsSync(c)) {
      return c;
    }
  }
  return isWin ? 'agy.exe' : 'agy';
}

function getAugmentedEnv() {
  const home = homedir();
  const sep = process.platform === 'win32' ? ';' : ':';
  const extraPaths = process.platform === 'win32'
    ? [
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'agy', 'bin') : null,
        join(home, 'AppData', 'Local', 'agy', 'bin'),
      ]
    : [
        join(home, '.local', 'bin'),
        join(home, 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
      ];

  const validExtras = extraPaths.filter(p => p && existsSync(p));
  const currentPath = process.env.PATH || '';
  const newPath = validExtras.length > 0 ? `${validExtras.join(sep)}${sep}${currentPath}` : currentPath;

  return { ...process.env, PATH: newPath };
}

function fetchSubscriptionUsage() {
  if (isFetchingSubscription) return;
  isFetchingSubscription = true;

  const agyCmd = resolveAgyCommand();
  const args = ['--output-format', 'json', '--print', '/usage'];

  execFile(agyCmd, args, { env: getAugmentedEnv(), timeout: 25000, windowsHide: true }, (error, stdout) => {
    isFetchingSubscription = false;
    if (error) {
      console.warn('Failed to fetch subscription quota via agy:', error.message);
      cachedSubscription = {
        error: 'Subscription quota unavailable (requires agy CLI)',
        updatedAt: new Date().toISOString(),
      };
      return;
    }
    try {
      const parsed = JSON.parse(stdout);
      const groups = parsed?.command?.data?.groups;
      if (Array.isArray(groups)) {
        cachedSubscription = {
          updatedAt: new Date().toISOString(),
          groups: groups.map(g => ({
            name: g.name,
            description: g.description,
            buckets: (g.buckets || []).map(b => ({
              id: b.id,
              name: b.name,
              window: b.window,
              remainingFraction: b.remaining_fraction,
              remainingPercentage: Number(((b.remaining_fraction ?? 0) * 100).toFixed(1)),
              usedPercentage: Number((Math.max(0, 1 - (b.remaining_fraction ?? 0)) * 100).toFixed(1)),
              description: b.description,
              resetTime: b.reset_time,
            })),
          })),
        };
        lastSubscriptionFetchTime = Date.now();
      }
    } catch (e) {
      console.warn('Failed to parse agy usage json:', e.message);
      cachedSubscription = {
        error: 'Unable to parse quota metrics',
        updatedAt: new Date().toISOString(),
      };
    }
  });
}

// Initial fetch on process start
fetchSubscriptionUsage();

// Static routes
app.page('/', () => readLocal('index.html'));
app.page('/app.js', () => readLocal('app.js'));
app.api('/styles.css', () => new Response(readLocal('styles.css'), { contentType: 'text/css' }), 'GET');

// API routes
app.api('/api/context', (data) => {
  const conversationId = data?.conversationId;
  const metrics = getContextMetrics(conversationId);
  metrics.subscription = cachedSubscription;

  if (Date.now() - lastSubscriptionFetchTime > SUBSCRIPTION_CACHE_TTL && !isFetchingSubscription) {
    fetchSubscriptionUsage();
  }
  return metrics;
}, 'GET');

app.api('/api/subscription/refresh', () => {
  fetchSubscriptionUsage();
  return { status: 'refreshing', subscription: cachedSubscription };
}, 'GET');

function formatTokens(num) {
  if (num === 0) return '0';
  if (num >= 1_000_000) {
    const m = (num / 1_000_000).toFixed(1);
    return `${m.endsWith('.0') ? m.slice(0, -2) : m}M`;
  }
  if (num >= 1_000) {
    const k = (num / 1_000).toFixed(1);
    return `${k.endsWith('.0') ? k.slice(0, -2) : k}k`;
  }
  return String(num);
}

function getContextMetrics(conversationId) {
  let modelName = 'Gemini 3.8 Flash (Medium)';
  let capacity = 1_048_576; // 1.0M tokens default

  if (!conversationId) {
    return createEmptyMetrics(modelName, capacity);
  }

  const baseDir = homedir();
  const transcriptCandidates = [
    join(baseDir, '.gemini', 'antigravity', 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl'),
    join(baseDir, '.gemini', 'antigravity', 'brain', conversationId, 'transcript.jsonl'),
  ];

  let transcriptPath = null;
  for (const candidate of transcriptCandidates) {
    if (existsSync(candidate)) {
      transcriptPath = candidate;
      break;
    }
  }

  if (!transcriptPath) {
    return createEmptyMetrics(modelName, capacity);
  }

  let lines = [];
  try {
    const raw = readFileSync(transcriptPath, 'utf8');
    lines = raw.split('\n').filter(Boolean);
  } catch (err) {
    console.error(`Failed reading transcript ${transcriptPath}:`, err.message);
    return createEmptyMetrics(modelName, capacity);
  }

  let userChars = 0;
  let agentChars = 0;
  let toolChars = 0;
  let latestInputTokens = 0;
  let latestCacheTokens = 0;
  let latestOutputTokens = 0;
  let hasTelemetry = false;

  for (const line of lines) {
    try {
      const step = JSON.parse(line);

      // Model detection: only parse genuine system-injected setting events in USER_INPUT
      if (step.type === 'USER_INPUT' && typeof step.content === 'string' && step.content.includes('<USER_SETTINGS_CHANGE>')) {
        const m = step.content.match(/from\s+None\s+to\s+([^\n\r]+?)\.\s*(?:No need|<)/i)
          || step.content.match(/`Model Selection`\s+from\s+.*?\s+to\s+([^\n\r]+?)\.\s*(?:No need|<)/i);
        if (m) {
          const candidate = m[1].trim();
          if (candidate && !candidate.includes('[') && !candidate.includes('\\')) {
            modelName = candidate;
          }
        }
      }

      // Collect characters by type
      if (step.type === 'USER_INPUT') {
        userChars += (step.content || '').length;
      } else if (step.type === 'PLANNER_RESPONSE') {
        agentChars += (step.content || '').length;
        if (step.thinking) {
          agentChars += step.thinking.length;
        }
        if (Array.isArray(step.tool_calls)) {
          for (const tc of step.tool_calls) {
            toolChars += JSON.stringify(tc.args || {}).length;
          }
        }
        if (typeof step.input_tokens === 'number') {
          latestInputTokens = step.input_tokens;
          latestCacheTokens = step.cache_read_tokens || 0;
          latestOutputTokens = step.output_tokens || 0;
          hasTelemetry = true;
        }
      } else if (step.type === 'GENERIC' || step.source === 'MODEL' || step.source === 'SYSTEM') {
        toolChars += (step.content || '').length;
      }
    } catch {
      // Ignore corrupt lines
    }
  }

  if (modelName.toLowerCase().includes('pro')) {
    capacity = 2_097_152;
  }

  let totalUsed = 0;
  let userTokens = 0;
  let agentTokens = 0;
  let toolTokens = 0;
  let systemTokens = 0;
  let awaitingGeneration = false;

  if (hasTelemetry) {
    totalUsed = latestInputTokens + latestCacheTokens + latestOutputTokens;
    const approxUser = Math.round(userChars / 4);
    const approxAgent = Math.round(agentChars / 4);
    const approxTool = Math.round(toolChars / 4);
    const convTotal = approxUser + approxAgent + approxTool;

    if (totalUsed >= convTotal) {
      userTokens = approxUser;
      agentTokens = approxAgent;
      toolTokens = approxTool;
      systemTokens = totalUsed - convTotal;
    } else if (convTotal > 0) {
      const ratio = totalUsed / convTotal;
      userTokens = Math.round(approxUser * ratio);
      agentTokens = Math.round(approxAgent * ratio);
      toolTokens = Math.round(approxTool * ratio);
    }
  } else {
    userTokens = Math.round(userChars / 4);
    totalUsed = userTokens;
    awaitingGeneration = true;
  }

  const freeTokens = Math.max(0, capacity - totalUsed);
  const usedPercentage = ((totalUsed / capacity) * 100);
  const userPct = ((userTokens / capacity) * 100);
  const agentPct = ((agentTokens / capacity) * 100);
  const toolPct = ((toolTokens / capacity) * 100);
  const systemPct = ((systemTokens / capacity) * 100);
  const freePct = ((freeTokens / capacity) * 100);

  return {
    modelName,
    capacity,
    capacityFormatted: formatTokens(capacity),
    totalUsed,
    totalUsedFormatted: formatTokens(totalUsed),
    usedPercentage: Number(usedPercentage.toFixed(1)),
    awaitingGeneration,
    categories: {
      user: { tokens: userTokens, percentage: Number(userPct.toFixed(1)), label: 'User messages' },
      agent: { tokens: agentTokens, percentage: Number(agentPct.toFixed(1)), label: 'Agent responses' },
      tool: { tokens: toolTokens, percentage: Number(toolPct.toFixed(1)), label: 'Tool calls' },
      system: { tokens: systemTokens, percentage: Number(systemPct.toFixed(1)), label: 'System & instructions' },
      free: { tokens: freeTokens, percentage: Number(freePct.toFixed(1)), label: 'Free space' },
    },
  };
}

function createEmptyMetrics(modelName, capacity) {
  return {
    modelName,
    capacity,
    capacityFormatted: formatTokens(capacity),
    totalUsed: 0,
    totalUsedFormatted: '0',
    usedPercentage: 0.0,
    awaitingGeneration: true,
    categories: {
      user: { tokens: 0, percentage: 0.0, label: 'User messages' },
      agent: { tokens: 0, percentage: 0.0, label: 'Agent responses' },
      tool: { tokens: 0, percentage: 0.0, label: 'Tool calls' },
      system: { tokens: 0, percentage: 0.0, label: 'System & instructions' },
      free: { tokens: capacity, percentage: 100.0, label: 'Free space' },
    },
  };
}

app.run();
