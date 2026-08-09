export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = process.env.AIRTABLE_BASE_ID;
  const TABLE_ID = 'tblw3OpKVU4PWLBvz';

  if (!AIRTABLE_TOKEN || !BASE_ID) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const { name, contact, date } = req.body || {};

  if (!name || !contact || !date) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // Простая проверка формата даты YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  try {
    // Проверяем текущее количество записей на эту дату
    const formula = `{BookingDate} = '${date}'`;
    const checkUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(formula)}`;
    const checkRes = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (!checkRes.ok) {
      const errText = await checkRes.text();
      return res.status(502).json({ error: 'Airtable check failed', details: errText });
    }

    const checkData = await checkRes.json();
    const existingCount = (checkData.records || []).length;

    if (existingCount >= 3) {
      return res.status(409).json({ error: 'full', message: 'Все места на эту дату уже заняты' });
    }

    const nextSlot = String(existingCount + 1);

    const createRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          Name: String(name).slice(0, 200),
          Contact: String(contact).slice(0, 200),
          Product: 'Hook Audit Free',
          BookingDate: date,
          Slot: nextSlot,
          PaymentStatus: 'Free'
        }
      })
    });

    if (!createRes.ok) {
      const errData = await createRes.text();
      return res.status(502).json({ error: 'Airtable create failed', details: errData });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, slot: nextSlot });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
