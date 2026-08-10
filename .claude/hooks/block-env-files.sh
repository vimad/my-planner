#!/usr/bin/env bash
# PreToolUse hook: blocks Claude from reading .env files (Read/Grep file args,
# and Bash commands that reference one), to prevent real secrets from ending
# up in the conversation/context. .env.example/.sample/.template are allowed
# since those are meant to be committed and read.
set -euo pipefail

input="$(cat)"
tool_name="$(jq -r '.tool_name // empty' <<<"$input")"

deny() {
  local reason="$1"
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

is_blocked_env_path() {
  local base
  base="$(basename -- "$1")"
  case "$base" in
    .env.example|.env.sample|.env.template|.env.dist) return 1 ;;
    .env|.env.*) return 0 ;;
    *) return 1 ;;
  esac
}

case "$tool_name" in
  Read|NotebookEdit)
    file_path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
    if [[ -n "$file_path" ]] && is_blocked_env_path "$file_path"; then
      deny "Reading .env files is blocked by a project hook to prevent secret leakage ($file_path)."
    fi
    ;;
  Grep)
    grep_path="$(jq -r '.tool_input.path // empty' <<<"$input")"
    if [[ -n "$grep_path" ]] && is_blocked_env_path "$grep_path"; then
      deny "Searching .env files is blocked by a project hook to prevent secret leakage ($grep_path)."
    fi
    ;;
  Bash)
    command="$(jq -r '.tool_input.command // empty' <<<"$input")"
    env_pattern=$'(^|[ \t/"\x27])\\.env(\\.[A-Za-z0-9_.-]+)?([ \t/"\x27`;|&<>)]|$)'
    allowed_pattern=$'\\.env\\.(example|sample|template|dist)([ \t/"\x27`;|&<>)]|$)'
    # Only block commands that can actually surface file *content* (cat, grep, an
    # editor, a scripting interpreter, input redirection, etc.) - plain existence
    # checks like `ls`/`find`/`stat`/`test -f` are left alone.
    read_verb_pattern=$'(^|[|;&\x27"(] *|&&[ \t]*)(cat|less|more|head|tail|bat|vim?|nvim|nano|emacs|pico|sed|g?awk|e?grep|fgrep|rg|strings|xxd|od|hexdump|base64|source|python[0-9.]*|node|deno|bun|ruby|perl|php|jq|yq|scp|rsync|curl|wget|tar|zip|gzip|diff|cmp|dd|pbcopy|xclip|xsel|eval|\\.)([ \t]|$)'
    redirect_in_pattern=$'<[ \t]*[\x27"]?\\.env'
    if [[ "$command" =~ $env_pattern ]] && [[ ! "$command" =~ $allowed_pattern ]]; then
      if [[ "$command" =~ $read_verb_pattern ]] || [[ "$command" =~ $redirect_in_pattern ]]; then
        deny "This command appears to read a .env file's contents. That's blocked by a project hook to prevent secret leakage."
      fi
    fi
    ;;
esac

exit 0
