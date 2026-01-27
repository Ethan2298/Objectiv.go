/**
 * Agent Backend Server
 *
 * Express server using direct Anthropic API with streaming.
 * Implements agentic loop with tool execution.
 */

import express from 'express';
import cors from 'cors';
import { tools, toolHandlers } from './tools.mjs';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// System prompt for the agent
const SYSTEM_PROMPT = `You are an AI assistant for Layer, a goal and note-taking application. You can help users manage their notes using the available tools.

Available capabilities:
- List, view, create, and delete notes
- Edit notes: append_to_note (add to end), replace_note_block (change specific block), delete_note_blocks (remove blocks), update_note (full rewrite)
- Open notes or URLs in new browser tabs

For edits, prefer targeted tools over full rewrites:
- Adding content? Use append_to_note
- Changing one section? Use replace_note_block (need block index from get_note)
- Removing content? Use delete_note_blocks
- Major restructure? Use update_note with full blocks array

When creating or updating notes, use Editor.js block format. The note's "name" field is the title - do NOT duplicate it as a header block in the content. Start content with section headers or paragraphs, not the main title.

Block types:
- header: { type: "header", data: { text: "Title", level: 2 } }
- paragraph: { type: "paragraph", data: { text: "Content here" } }
- list: { type: "list", data: { style: "unordered", items: [{ content: "Item 1", items: [] }, { content: "Item 2", items: [] }] } }
- checklist: { type: "checklist", data: { items: [{ text: "Task", checked: false }] } }
- quote: { type: "quote", data: { text: "Quote text", caption: "Author" } }
- code: { type: "code", data: { code: "const x = 1;" } }
- delimiter: { type: "delimiter", data: {} }

EXAMPLE 1 - Meeting Notes:
[
  { "type": "header", "data": { "text": "Q1 Planning Meeting", "level": 2 } },
  { "type": "paragraph", "data": { "text": "Meeting held on January 15th with the product team." } },
  { "type": "header", "data": { "text": "Key Decisions", "level": 3 } },
  { "type": "list", "data": { "style": "unordered", "items": [{ "content": "Launch beta by March 1st", "items": [] }, { "content": "Hire two engineers", "items": [] }] } },
  { "type": "header", "data": { "text": "Action Items", "level": 3 } },
  { "type": "checklist", "data": { "items": [{ "text": "Draft hiring plan", "checked": false }, { "text": "Create migration guide", "checked": false }] } }
]

EXAMPLE 2 - Recipe:
[
  { "type": "header", "data": { "text": "Ingredients", "level": 2 } },
  { "type": "list", "data": { "style": "unordered", "items": [{ "content": "2 cups flour", "items": [] }, { "content": "1 cup sugar", "items": [] }, { "content": "3 eggs", "items": [] }] } },
  { "type": "header", "data": { "text": "Instructions", "level": 2 } },
  { "type": "list", "data": { "style": "ordered", "items": [{ "content": "Preheat oven to 350°F", "items": [] }, { "content": "Mix dry ingredients", "items": [] }, { "content": "Bake for 25 minutes", "items": [] }] } }
]

EXAMPLE 3 - Research Notes:
[
  { "type": "header", "data": { "text": "Overview", "level": 2 } },
  { "type": "paragraph", "data": { "text": "Machine learning is a subset of AI focused on systems that learn from data." } },
  { "type": "header", "data": { "text": "Key Concepts", "level": 2 } },
  { "type": "list", "data": { "style": "unordered", "items": [{ "content": "Supervised learning", "items": [] }, { "content": "Unsupervised learning", "items": [] }, { "content": "Reinforcement learning", "items": [] }] } },
  { "type": "quote", "data": { "text": "ML creates systems that improve through experience.", "caption": "Tom Mitchell" } }
]

When the user asks about their notes, use list_notes and get_note tools.
Be helpful and concise.`;

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Parse streaming response from Anthropic API
 * Forwards text deltas to the client and collects tool use blocks
 */
async function parseStreamingResponse(response, res) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const toolUses = [];
  let currentToolUse = null;
  let inputJsonBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);

        switch (event.type) {
          case 'content_block_start':
            if (event.content_block?.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                input: {}
              };
              inputJsonBuffer = '';
            }
            break;

          case 'content_block_delta':
            if (event.delta?.type === 'text_delta') {
              const chunk = event.delta.text;
              text += chunk;
              // Send text delta to frontend for streaming display
              res.write(`data: ${JSON.stringify({ type: 'text_delta', text: chunk })}\n\n`);
            } else if (event.delta?.type === 'input_json_delta') {
              // Accumulate tool input JSON
              inputJsonBuffer += event.delta.partial_json;
            }
            break;

          case 'content_block_stop':
            if (currentToolUse) {
              // Parse accumulated JSON input
              try {
                currentToolUse.input = inputJsonBuffer ? JSON.parse(inputJsonBuffer) : {};
              } catch {
                currentToolUse.input = {};
              }
              toolUses.push(currentToolUse);
              currentToolUse = null;
              inputJsonBuffer = '';
            }
            break;

          case 'message_stop':
            // Message complete
            break;

          case 'error':
            throw new Error(event.error?.message || 'API error');
        }
      } catch (parseError) {
        if (parseError.message !== 'API error') {
          console.warn('Failed to parse SSE event:', data);
        } else {
          throw parseError;
        }
      }
    }
  }

  return { text, toolUses };
}

/**
 * Build content blocks for assistant message
 */
function buildContentBlocks(text, toolUses) {
  const content = [];

  if (text) {
    content.push({ type: 'text', text });
  }

  for (const toolUse of toolUses) {
    content.push({
      type: 'tool_use',
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input
    });
  }

  return content;
}

/**
 * Handle agent request with streaming and tool execution loop
 */
async function handleAgentRequest(prompt, conversationHistory, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'ANTHROPIC_API_KEY not configured' })}\n\n`);
    return;
  }

  // Build messages array from conversation history
  const apiMessages = [];

  // Add conversation history
  for (const msg of conversationHistory) {
    apiMessages.push({
      role: msg.role,
      content: msg.content
    });
  }

  // Add current user message
  apiMessages.push({ role: 'user', content: prompt });

  // Agentic loop - continue until no more tool calls
  let turnCount = 0;
  const maxTurns = 10;

  while (turnCount < maxTurns) {
    turnCount++;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5-20251101',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
          tools,
          stream: true
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Anthropic API error:', response.status, errorBody);
        res.write(`data: ${JSON.stringify({ type: 'error', message: `API error: ${response.status}` })}\n\n`);
        return;
      }

      // Parse streaming response
      const { text, toolUses } = await parseStreamingResponse(response, res);

      // Add assistant message to history
      const assistantContent = buildContentBlocks(text, toolUses);
      apiMessages.push({ role: 'assistant', content: assistantContent });

      // If no tool use, we're done
      if (toolUses.length === 0) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        return;
      }

      // Execute tools and collect results
      const toolResults = [];

      for (const toolUse of toolUses) {
        // Notify frontend about tool use
        res.write(`data: ${JSON.stringify({
          type: 'tool_use',
          tool: { id: toolUse.id, name: toolUse.name, input: toolUse.input }
        })}\n\n`);

        // Execute the tool
        const handler = toolHandlers[toolUse.name];
        let result;

        if (handler) {
          try {
            result = await handler(toolUse.input);
          } catch (toolError) {
            result = `Error executing tool: ${toolError.message}`;
          }
        } else {
          result = `Unknown tool: ${toolUse.name}`;
        }

        // Send tool result to frontend
        res.write(`data: ${JSON.stringify({
          type: 'tool_result',
          id: toolUse.id,
          result
        })}\n\n`);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result
        });
      }

      // Add tool results to messages for next turn
      apiMessages.push({ role: 'user', content: toolResults });

    } catch (error) {
      console.error('Agent loop error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      return;
    }
  }

  // Max turns reached
  res.write(`data: ${JSON.stringify({ type: 'error', message: 'Max turns reached' })}\n\n`);
}

// Agent endpoint with SSE streaming
app.post('/api/agent', async (req, res) => {
  const { prompt, conversationHistory = [] } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    await handleAgentRequest(prompt, conversationHistory, res);
  } catch (error) {
    console.error('Agent error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
  }

  res.end();
});

// Start server
app.listen(PORT, () => {
  console.log(`Agent server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET  /api/health - Health check`);
  console.log(`  POST /api/agent  - Agent chat (SSE streaming)`);
});
