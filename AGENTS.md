<Developer Instructions>
ALWAYS comment code with its purpose, functionality and implementation. If unsure on how to concisely summarise code with clarity, write longer comments.

Read ./.guidelines/design.md to understand the project.
After each code implementation, update ./.guidelines/design.md with any important changes you have made. If it is irrelevant to actual technical implementation, do not include it. 
If you have found inconsistencies between actual code and written documentation, always prefer actual code. Alert the user, and update /guidelines/design.md to match.

After any code implementation, use "eslint" to check for linting errors
If any exist, fix them.

Always look out for code that is reused/duplicate. Refactor the code implementation to avoid code duplicates.

Strive for fixes that actually solve the root of the problem, rather than bandaid solutions. 

### Up to date information
If you need database information, query the Supabase MCP.
If you need Vercel information, query the Stripe MCP.
If you need up-to-date technical documentation, query Context7 MCP.

Strive for fixes that actually solve the root of the problem, rather than bandaid solutions. 

Icons use `@expo/vector-icons` MaterialIcons via the `<Icon>` component (`components/common/Icon.tsx`), which handles cross-platform centering automatically. No manual `translateY` workarounds needed.


### Security Instructions
Ensure industry level security
Ensure sanitisation and parametrisation and other industry standard security practises when code involves any SQL operation

### Rate Limiting
All user-facing API endpoints must implement rate limiting appropriate to the action's nature (note that some of these may not apply - this could change later. Use your judgement):

| Action Type | Recommended Limit | Rationale |
|-------------|-------------------|-----------|
| Authentication (login, signup, password reset) | 5 requests/minute | Prevents brute-force attacks |
| Sensitive writes (payments, verification submissions) | 10 requests/minute | Protects against replay/abuse |
| Standard CRUD (create/update tasks, lists) | 30 requests/minute | Normal usage headroom |
| Read operations (fetching data, lists) | 60 requests/minute | Allows responsive UI |
| Search/filter | 20 requests/minute | Prevents resource exhaustion |

**Implementation guidelines:**
- Use sliding window or token bucket algorithms for smoother UX
- Return `429 Too Many Requests` with a `Retry-After` header when limits are exceeded
- Rate limit by authenticated user ID (or IP for unauthenticated endpoints)
- Log rate limit violations for monitoring and adjustment
- Consider burst allowance for legitimate rapid actions (e.g., quick task edits)
