export default async function handler(req, res) {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;
  const TABLE_ID = 'tblw3OpKVU4PWLBvz';

  if (!AIRTABLE_TOKEN || !BASE_ID) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const formula = `AND(IS_AFTER({BookingDate}, DATEADD(TODAY(), -1, 'days')), IS_BEFORE({BookingDate}, DATEADD(TODAY(), 31, 'days')))`;
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(formula)}&fields%5B%5D=BookingDate&pageSize=100`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'Airtable request failed', details: errText });
    }

    const data = await response.json();
    const counts = {};
    for (const record of data.records || []) {
      const date = record.fields.BookingDate;
      if (!date) continue;
      counts[date] = (counts[date] || 0) + 1;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ counts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
}
