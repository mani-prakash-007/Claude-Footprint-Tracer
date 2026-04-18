export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  user_prompt?: string;
  agent_id?: string;
  agent_type?: string;
}

export interface HookOutput {
  continue?: boolean;
  suppressOutput?: boolean;
}
