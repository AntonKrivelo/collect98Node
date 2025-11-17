const express = require('express');
const router = express.Router();
const { Dropbox } = require('dropbox');
// const { v4: uuidv4 } = require('uuid');

router.post('/upload-json', async (req, res) => {
  try {
    const data = req.body;

    const ticket = {
      ...data,
      created_at: new Date().toISOString(),
      id: uuidv4(),
    };

    const filename = `ticket-${Date.now()}-${ticket.id.slice(0, 6)}.json`;
    const folder = process.env.DROPBOX_FOLDER || '/SupportTickets';
    const path = `${folder}/${filename}`;

    const buffer = Buffer.from(JSON.stringify(ticket, null, 2), 'utf-8');

    const dbx = new Dropbox({
      accessToken: process.env.DROPBOX_ACCESS_TOKEN,
    });

    await dbx.filesUpload({
      path,
      contents: buffer,
      mode: 'add',
      autorename: true,
    });

    res.json({ ok: true, file: path });
  } catch (err) {
    console.error('Dropbox Upload Error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
