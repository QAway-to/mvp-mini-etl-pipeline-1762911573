import etlFallback from '../../../src/mock-data/etl.json';
import { loadUsers, buildMetrics } from '../../../src/lib/randomuser';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const meta = await loadUsers(true);
    const metrics = meta.users.length ? buildMetrics(meta.users) : etlFallback.metrics;

    return res.status(200).json({
      users: meta.users,
      metrics,
      fallbackUsed: meta.fallbackUsed,
      sourceUrl: meta.sourceUrl,
      fetchedAt: meta.fetchedAt
    });
  } catch (error) {
    console.error('[MiniETL] restart handler failed:', error);
    return res.status(500).json({
      message: 'Failed to restart pipeline',
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

