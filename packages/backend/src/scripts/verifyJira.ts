// One-time, read-only verification pass against the real Jira instance —
// see .scratch/sprint-jira-integration/issues/11-jira-api-client-config-verification.md.
// Run with `pnpm --filter backend verify:jira` after populating
// JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN in packages/backend/.env. Prints
// only non-secret facts (board id, field id, permission check) — never the
// token itself. See packages/backend/README.md for the recorded results.
import 'dotenv/config'
import { findCustomField, listSprints, resolveBoard, searchJql, searchUsers } from '../services/jiraClient.ts'

const PROJECT_KEY = 'WOSMVP'
const BOARD_NAME = 'Odyssey'

async function main() {
  console.log(`Resolving board "${BOARD_NAME}" for project ${PROJECT_KEY}...`)
  const board = await resolveBoard(PROJECT_KEY, BOARD_NAME)
  console.log('  ->', board ? `id=${board.id} name=${JSON.stringify(board.name)} type=${board.type}` : 'no board found')

  if (board) {
    console.log('Listing sprints on that board...')
    const sprints = await listSprints(board.id, ['active', 'future', 'closed'])
    console.log(`  -> ${sprints.length} sprint(s), states: ${[...new Set(sprints.map((s) => s.state))].join(', ')}`)
  }

  console.log('Looking up the "Stream" custom field...')
  const streamFields = await findCustomField('Stream')
  if (streamFields.length === 0) {
    console.log('  -> no field named "Stream" found')
  } else {
    for (const field of streamFields) {
      console.log(`  -> id=${field.id} name=${JSON.stringify(field.name)} schema=${JSON.stringify(field.schema)}`)
    }
  }

  console.log('Smoke-testing /search/jql (bounded query: assignee = currentUser())...')
  const issues = await searchJql('assignee = currentUser()', ['summary', 'status'])
  console.log(`  -> responded OK, ${issues.length} issue(s) currently assigned to this token's account`)

  console.log('Checking the "Browse users and groups" permission via /user/search...')
  const users = await searchUsers('a')
  console.log(users === null ? '  -> unavailable (403) — no "Browse users and groups" permission' : `  -> available — ${users.length} result(s)`)
}

main().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
