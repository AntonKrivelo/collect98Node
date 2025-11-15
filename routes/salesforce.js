const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const jsforce = require('jsforce');

const {
  SF_CLIENT_ID,
  SF_CLIENT_SECRET,
  SF_REDIRECT_URI,
  SF_LOGIN_URL = 'https://login.salesforce.com',
} = process.env;

let savedToken = null;

router.get('/salesforce/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    if (error) return res.status(400).send(error_description || error);
    if (!code) return res.status(400).send('Missing code');

    const codeVerifier = req.cookies?.sf_code_verifier;
    if (!codeVerifier)
      return res.status(400).send('Missing code_verifier (PKCE). Set cookie before auth.');

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', SF_CLIENT_ID);
    if (SF_CLIENT_SECRET) params.append('client_secret', SF_CLIENT_SECRET);
    params.append('redirect_uri', SF_REDIRECT_URI);
    params.append('code_verifier', codeVerifier);

    const tokenRes = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok)
      return res.status(500).json({ error: 'Token exchange failed', details: tokenJson });

    savedToken = {
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      instance_url: tokenJson.instance_url,
      raw: tokenJson,
    };

    res.clearCookie('sf_code_verifier', { path: '/' });
    res.send('Salesforce connected. You can close this window.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Salesforce callback error');
  }
});

router.post('/api/salesforce/create', async (req, res) => {
  try {
    if (!savedToken) return res.status(400).json({ error: 'Connect Salesforce first via OAuth' });

    const { name, email, company, jobTitle, phone, notes } = req.body;

    if (!email || !company)
      return res.status(400).json({ error: 'Email and company are required' });

    const conn = new jsforce.Connection({
      instanceUrl: savedToken.instance_url,
      accessToken: savedToken.access_token,
      oauth2: new jsforce.OAuth2({
        loginUrl: SF_LOGIN_URL,
        clientId: SF_CLIENT_ID,
        clientSecret: SF_CLIENT_SECRET,
        redirectUri: SF_REDIRECT_URI,
      }),
    });

    router.get('/api/salesforce/health', (req, res) => {
      res.json({
        ok: true,
        hasToken: !!savedToken,
      });
    });

    const accountRes = await conn.sobject('Account').create({ Name: company });
    const contactRes = await conn.sobject('Contact').create({
      FirstName: name.split(' ')[0] || name,
      LastName: name.split(' ').slice(1).join('') || 'Unknown',
      Email: email,
      Phone: phone || '',
      Title: jobTitle || '',
      Description: notes || '',
      AccountId: accountRes.id,
    });

    res.json({ accountId: accountRes.id, contactId: contactRes.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Salesforce create error' });
  }
});

module.exports = router;
