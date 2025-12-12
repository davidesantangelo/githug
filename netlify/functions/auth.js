/**
 * Netlify Function: GitHub OAuth code -> token exchange
 * Endpoint: /.netlify/functions/auth
 */
export async function handler(event) {
  // CORS headers for local dev and production
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight FIRST
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let code;
  try {
    const body = JSON.parse(event.body || '{}');
    code = body.code;
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  if (!code) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing code parameter' }),
    };
  }

  const clientId = process.env.GITHUG_SERVER_CLIENT_ID;
  const clientSecret = process.env.GITHUG_SERVER_CLIENT_SECRET;
  const redirectUri = process.env.GITHUG_SERVER_REDIRECT_URI || 'http://localhost:5173/callback';

  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server missing GitHub OAuth credentials' }),
    };
  }

  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await response.json();

    if (data.error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: data.error, error_description: data.error_description }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        access_token: data.access_token,
        token_type: data.token_type,
        scope: data.scope,
      }),
    };
  } catch (err) {
    console.error('GitHub token exchange failed:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Token exchange failed' }),
    };
  }
}
