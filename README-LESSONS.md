# Lessons feature rollback

On 2026-10-08 the owner requested the previous reader interface without Moje lekcje or Moje zwroty. Those screens, recording code and lesson APIs were removed. The difficulty filter, news home, ChatGPT authentication and per-user vocabulary remain.

The applied 0001 lessons migration and schema history are deliberately retained. The inactive lessons table preserves any saved data and is ignored by the active Worker. Do not delete it or change applied SQL/snapshots when rolling back. The previous implementation remains available in Git history (PR #5) and Site version 8.

Planned replacement: comprehension questions under the opened article and an AI voice conversation about that article. These are not implemented yet. Real AI requires a configured server-side model API connection.

Development: Node 24, npm ci, npm run build, npm test. Future migrations: npm run db:generate.
