export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/list') {
      const prefix = String(url.searchParams.get('prefix') || '');
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 1000), 1), 1000);
      const include = [];
      let cursor = url.searchParams.get('cursor') || undefined;
      const page = await env.BUCKET.list({ prefix, limit, cursor, include });
      return Response.json({
        objects: (page.objects || []).map((item) => ({
          key: item.key,
          size: item.size,
          uploaded: item.uploaded,
          etag: item.etag
        })),
        truncated: !!page.truncated,
        cursor: page.cursor || ''
      });
    }

    if (url.pathname === '/delete' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      const keys = Array.isArray(payload.keys) ? payload.keys.map((item) => String(item || '').trim()).filter(Boolean) : [];
      if (keys.length === 0) {
        return Response.json({ success: false, error: 'No keys provided' }, { status: 400 });
      }
      await env.BUCKET.delete(keys);
      return Response.json({ success: true, deleted: keys.length, keys });
    }

    return Response.json({ success: false, error: 'Not found' }, { status: 404 });
  }
};