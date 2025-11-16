const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const jsforce = require('jsforce');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const authenticate = require('../middleware/authenticate');

const {
  SF_CLIENT_ID,
  SF_CLIENT_SECRET,
  SF_REDIRECT_URI,
  SF_LOGIN_URL = 'https://login.salesforce.com',
  PORT = 4000,
} = process.env;

let savedToken = null;

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

function generateCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(64));
}

function generateCodeChallenge(verifier) {
  return base64UrlEncode(sha256(Buffer.from(verifier)));
}

router.use(cookieParser());

async function refreshAccessToken() {
  if (!savedToken?.refresh_token) {
    throw new Error('No refresh token available');
  }
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('client_id', SF_CLIENT_ID);
  if (SF_CLIENT_SECRET) params.append('client_secret', SF_CLIENT_SECRET);
  params.append('refresh_token', savedToken.refresh_token);

  const tokenRes = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error('Refresh token failed', tokenJson);
    throw new Error('Refresh token failed: ' + JSON.stringify(tokenJson));
  }

  savedToken.access_token = tokenJson.access_token;
  if (tokenJson.refresh_token) savedToken.refresh_token = tokenJson.refresh_token;
  savedToken.instance_url = tokenJson.instance_url || savedToken.instance_url;
  savedToken.issued_at = tokenJson.issued_at;
  savedToken.raw = tokenJson;
  console.log('Access token refreshed');
}

router.get('/salesforce/auth', (req, res) => {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    res.cookie('sf_code_verifier', codeVerifier, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 5 * 60 * 1000,
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: SF_CLIENT_ID,
      redirect_uri: SF_REDIRECT_URI,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: crypto.randomUUID(),
    });

    const authUrl = `${SF_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`;
    console.log('Redirecting to Salesforce auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (err) {
    console.error('Error in /salesforce/auth', err);
    res.status(500).send('Auth start error');
  }
});

router.get('/salesforce/callback', async (req, res) => {
  try {
    console.log('CALLBACK HIT', req.query);
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
    console.log('TOKEN RESPONSE:', tokenJson);

    if (!tokenRes.ok) {
      return res.status(500).json({ error: 'Token exchange failed', details: tokenJson });
    }

    savedToken = {
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      instance_url: tokenJson.instance_url,
      issued_at: tokenJson.issued_at,
      raw: tokenJson,
    };

    res.clearCookie('sf_code_verifier', { path: '/' });

    res.send('Salesforce connected. You can close this window.');
  } catch (err) {
    console.error('Salesforce callback error', err);
    res.status(500).send('Salesforce callback error');
  }
});

router.post('/api/salesforce/create', express.json(), async (req, res) => {
  try {
    if (!savedToken) return res.status(400).json({ error: 'Connect Salesforce first via OAuth' });
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized: user not found in token' });
    }

    const doCreate = async () => {
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

      const { name, email, company, jobTitle, phone, notes } = req.body;

      if (!email || !company) {
        return res.status(400).json({ error: 'Email and company are required' });
      }

      const accountRes = await conn.sobject('Account').create({ Name: company });

      const names = (name || '').trim().split(/\s+/);
      const firstName = names[0] || '';
      const lastName = names.slice(1).join(' ') || 'Unknown';

      const contactRes = await conn.sobject('Contact').create({
        FirstName: firstName,
        LastName: lastName,
        Email: email,
        Phone: phone || '',
        Title: jobTitle || '',
        Description: notes || '',
        AccountId: accountRes.id,
      });

      const result = {
        accountId: accountRes.id,
        contactId: contactRes.id,
      };

      await client.query(
        `
          UPDATE users
          SET salesforce_integration = $1
          WHERE id = $2
        `,
        [result, req.user.id],
      );

      return result;
    };

    try {
      const result = await doCreate();
      return res.json(result);
    } catch (err) {
      console.error('Create error first attempt', err);
      const statusCode = err && err.statusCode;

      if (
        statusCode === 401 ||
        /INVALID_SESSION_ID|INVALID_ACCESS_TOKEN/i.test(err.message || '')
      ) {
        try {
          await refreshAccessToken();
          const result = await doCreate();
          return res.json(result);
        } catch (err2) {
          console.error('Retry after refresh failed', err2);
          return res.status(500).json({
            error: 'Salesforce create error after refresh',
            details: err2.message || err2,
          });
        }
      }

      return res.status(500).json({ error: err.message || 'Salesforce create error' });
    }
  } catch (err) {
    console.error('Salesforce create error top', err);
    res.status(500).json({ error: err.message || 'Salesforce create error' });
  }
});

router.get('/api/salesforce/verify', async (req, res) => {
  try {
    if (!savedToken) {
      return res.status(400).json({ error: 'Connect Salesforce first via OAuth' });
    }

    const { accountId, contactId } = req.query;

    if (!accountId && !contactId) {
      return res.status(400).json({ error: 'accountId or contactId required' });
    }

    const conn = new jsforce.Connection({
      instanceUrl: savedToken.instance_url,
      accessToken: savedToken.access_token,
    });

    const result = {};

    if (accountId) {
      try {
        const account = await conn.sobject('Account').retrieve(accountId);
        result.account = account;
      } catch (e) {
        result.account = { error: 'Not found', details: e.message };
      }
    }
    if (contactId) {
      try {
        const contact = await conn.sobject('Contact').retrieve(contactId);
        result.contact = contact;
      } catch (e) {
        result.contact = { error: 'Not found', details: e.message };
      }
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Salesforce verify error' });
  }
});

module.exports = router;
