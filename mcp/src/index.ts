#!/usr/bin/env node
/**
 * Objectiv MCP Server
 *
 * Read-only MCP server for accessing Objectiv goal tracking data.
 * Provides tools to list and view objectives, priorities, and steps.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// Supabase configuration (matches main app)
const SUPABASE_URL = "https://uajcwhcfrcqqpgvvfrpz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhamN3aGNmcmNxcXBndnZmcnB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwNjg2MDYsImV4cCI6MjA4MzY0NDYwNn0.1K6ttNixMSs_QW-_UiWmlB56AXxxt1W2oZKm_ewzxnI";

// Types
interface Priority {
  id: string;
  name: string;
  description: string;
}

interface Step {
  id: string;
  name: string;
  loggedAt: string;
  orderNumber: number;
  status: "pending" | "active" | "paused" | "completed";
  elapsed: number;
  startedAt: string | null;
  completedAt: string | null;
}

interface NextStep {
  text: string;
  elapsedSeconds: number;
}

interface Objective {
  id: string;
  name: string;
  description: string;
  priorities: Priority[];
  steps: Step[];
  nextStep: NextStep | null;
  createdAt: string;
  updatedAt: string;
}

// Supabase client
let supabase: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

// Data access functions
async function loadAllObjectives(): Promise<Objective[]> {
  const client = getClient();

  const { data, error } = await client
    .from("objectives")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load objectives: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name || "",
    description: row.description || "",
    priorities: row.priorities || [],
    steps: row.steps || [],
    nextStep: row.next_step || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function getObjectiveById(id: string): Promise<Objective | null> {
  const client = getClient();

  const { data, error } = await client
    .from("objectives")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    throw new Error(`Failed to load objective: ${error.message}`);
  }

  return {
    id: data.id,
    name: data.name || "",
    description: data.description || "",
    priorities: data.priorities || [],
    steps: data.steps || [],
    nextStep: data.next_step || null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// Helper functions
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Create MCP server
const server = new McpServer({
  name: "objectiv-mcp-server",
  version: "1.0.0",
});

// Input schemas
const ListObjectivesSchema = z.object({
  include_steps: z.boolean()
    .default(false)
    .describe("Include step details in the response"),
}).strict();

const GetObjectiveSchema = z.object({
  id: z.string()
    .min(1, "Objective ID is required")
    .describe("The UUID of the objective to retrieve"),
}).strict();

// Register tools
server.registerTool(
  "objectiv_list_objectives",
  {
    title: "List Objectives",
    description: `List all objectives in Objectiv with summary information.

Returns a list of all objectives including their name, description,
number of priorities, number of steps, and active step if any.

Args:
  - include_steps (boolean): Include step details in response (default: false)

Returns:
  Array of objectives with:
  - id: Objective UUID
  - name: Objective title
  - description: Objective description
  - priorityCount: Number of priorities
  - stepCount: Number of logged steps
  - totalTimeSpent: Total elapsed time across all steps
  - nextStep: Current in-progress step (if any)
  - steps: Array of steps (if include_steps is true)`,
    inputSchema: ListObjectivesSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    try {
      const objectives = await loadAllObjectives();

      const result = objectives.map((obj) => {
        const totalTime = obj.steps.reduce((sum, s) => sum + (s.elapsed || 0), 0);

        const summary: Record<string, unknown> = {
          id: obj.id,
          name: obj.name,
          description: obj.description,
          priorityCount: obj.priorities.length,
          stepCount: obj.steps.length,
          totalTimeSpent: formatDuration(totalTime),
          nextStep: obj.nextStep ? obj.nextStep.text : null,
        };

        if (params.include_steps) {
          summary.steps = obj.steps;
        }

        return summary;
      });

      const output = {
        count: result.length,
        objectives: result,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  }
);

server.registerTool(
  "objectiv_get_objective",
  {
    title: "Get Objective",
    description: `Get full details of a single objective by ID.

Returns complete objective data including all priorities and steps.

Args:
  - id (string): The UUID of the objective

Returns:
  Complete objective with:
  - id, name, description
  - createdAt, updatedAt timestamps
  - priorities: Array of {id, name, description}
  - steps: Array of {id, name, status, elapsed, loggedAt, completedAt}
  - nextStep: Current in-progress step (if any)
  - stats: Summary statistics (totalTime, completedSteps, etc.)`,
    inputSchema: GetObjectiveSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    try {
      const objective = await getObjectiveById(params.id);

      if (!objective) {
        return {
          content: [{
            type: "text",
            text: `Error: Objective not found with ID '${params.id}'`
          }],
        };
      }

      const totalTime = objective.steps.reduce((sum, s) => sum + (s.elapsed || 0), 0);
      const completedSteps = objective.steps.filter((s) => s.status === "completed").length;

      const output = {
        ...objective,
        stats: {
          totalTimeSpent: formatDuration(totalTime),
          totalTimeSeconds: totalTime,
          totalSteps: objective.steps.length,
          completedSteps,
          pendingSteps: objective.steps.length - completedSteps,
          priorityCount: objective.priorities.length,
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  }
);

server.registerTool(
  "objectiv_get_stats",
  {
    title: "Get Statistics",
    description: `Get aggregate statistics across all objectives.

Returns summary metrics about your objectives, priorities, and time tracking.

Returns:
  - totalObjectives: Number of objectives
  - totalPriorities: Sum of priorities across all objectives
  - totalSteps: Sum of all logged steps
  - totalTimeSpent: Formatted total time
  - objectivesByActivity: Objectives sorted by recent activity`,
    inputSchema: z.object({}).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    try {
      const objectives = await loadAllObjectives();

      let totalPriorities = 0;
      let totalSteps = 0;
      let totalTime = 0;

      for (const obj of objectives) {
        totalPriorities += obj.priorities.length;
        totalSteps += obj.steps.length;
        totalTime += obj.steps.reduce((sum, s) => sum + (s.elapsed || 0), 0);
      }

      // Sort by most recently updated
      const byActivity = [...objectives]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5)
        .map((obj) => ({
          id: obj.id,
          name: obj.name,
          updatedAt: obj.updatedAt,
          hasActiveStep: obj.nextStep !== null,
        }));

      const output = {
        totalObjectives: objectives.length,
        totalPriorities,
        totalSteps,
        totalTimeSpent: formatDuration(totalTime),
        totalTimeSeconds: totalTime,
        recentlyActive: byActivity,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
      };
    }
  }
);

// Run server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Objectiv MCP server running via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
