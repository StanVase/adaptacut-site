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

  const { name, contact, date, topic } = req.body || {};

  if (!name || !contact || !date || !topic) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // Простая проверка формата даты YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  const contactNorm = String(contact).trim().toLowerCase().replace(/'/g, "\\'");
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  try {
    // Проверяем, не использовал ли этот контакт или этот IP бесплатный продукт раньше
    const dupParts = [`LOWER({Contact}) = '${contactNorm}'`];
    if (ip !== 'unknown') {
      dupParts.push(`{IP} = '${ip}'`);
    }
    const dupFormula = `AND({Product} = 'Hook Audit Free', OR(${dupParts.join(', ')}))`;
    const dupUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(dupFormula)}&maxRecords=1`;
    const dupRes = await fetch(dupUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (dupRes.ok) {
      const dupData = await dupRes.json();
      if ((dupData.records || []).length > 0) {
        return res.status(403).json({ error: 'already_used', message: 'Бесплатный аудит уже был использован с этого контакта или устройства' });
      }
    }

    // Проверяем текущее количество записей на эту дату
    const formula = `IS_SAME({BookingDate}, '${date}', 'day')`;
    const checkUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(formula)}`;
    const checkRes = await fetch(checkUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (!checkRes.ok) {
      const errText = await checkRes.text();
      console.error('Airtable check failed:', checkRes.status, errText);
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
          PaymentStatus: 'Free',
          IP: ip,
          Topic: String(topic).slice(0, 500)
        }
      })
    });

    if (!createRes.ok) {
      const errData = await createRes.text();
      console.error('Airtable create failed:', createRes.status, errData);
      return res.status(502).json({ error: 'Airtable create failed', details: errData });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, slot: nextSlot });
  } catch (err) {
    console.error('Book handler crashed:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
